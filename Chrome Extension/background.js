const DEFAULTS = {
  blockedDomains: ['youtube.com', 'instagram.com', 'reddit.com', 'facebook.com'],
  unlockedUntil: 0,
  illegalUnlockWait: 0,
  legitimateUnlockWait: 0,
  illegalUnlockWaitSeconds: 30,
  legitimateUnlockWaitSeconds: 60,
  lockoutsServerUrl: '',
  lockoutsSecret: '',
  metricLogKey: 'record_metric_iOS',
  startTimerMetricID: '',
  stopTimerMetricID: '',
  illegalUnlockMetricID: '',
  screenTimeLoggingEnabled: false,
  notificationsEnabled: true
};

const UNLOCK_WINDOWS = {
  illegal: {
    maxWaitMs: 5 * 60 * 1000,
    grantedMs: 10 * 60 * 1000,
    metricID: 'illegal_unlock',
    defaultWaitSeconds: 30
  },
  legitimate: {
    maxWaitMs: 5 * 60 * 1000,
    grantedMs: 20 * 60 * 1000,
    metricID: 'legitimate_unlock',
    defaultWaitSeconds: 60
  }
};

const SERVER_DECISION_KEYS = ['app_closer_v2'];
const ACTIVE_SESSION_KEYS = ['activeScreenTimeSession', 'sessionCandidateToken'];

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const patch = {};

  Object.keys(DEFAULTS).forEach((key) => {
    if (existing[key] === undefined) {
      patch[key] = DEFAULTS[key];
    }
  });

  if (Object.keys(patch).length > 0) {
    await chrome.storage.local.set(patch);
  }

  await ensureUnlockedUntilExists();
  await ensureScreenTimeStateExists();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!tab.url || changeInfo.status !== 'loading') {
    return;
  }

  await handlePotentialSessionTransition(tabId, tab, { reason: 'tab_updated' });
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await getTabSafe(tabId);
  await handlePotentialSessionTransition(tabId, tab, { reason: 'tab_activated' });
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await endScreenTimeSessionIfNeeded({ reason: 'tab_removed', tabId });
  await clearSessionCandidateIfMatches(tabId);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await endScreenTimeSessionIfNeeded({ reason: 'window_blurred' });
    return;
  }

  const activeTab = await getCurrentActiveTab();
  await handlePotentialSessionTransition(activeTab ? activeTab.id : null, activeTab, { reason: 'window_focused' });
});

chrome.idle.onStateChanged.addListener(async () => {
  const activeTab = await getCurrentActiveTab();
  await handlePotentialSessionTransition(activeTab ? activeTab.id : null, activeTab, { reason: 'idle_state_changed' });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    sendResponse({ ok: false, error: 'Invalid message.' });
    return false;
  }

  if (message.action === 'attempt_unlock') {
    handleUnlockAttempt(message.type, message.targetUrl, sender)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.action === 'save_options') {
    saveOptions(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.action === 'get_options') {
    getConfig()
      .then((cfg) => sendResponse({ ok: true, cfg }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.action === 'get_unlock_state') {
    getUnlockState()
      .then((unlockState) => sendResponse({ ok: true, unlockState }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  sendResponse({ ok: false, error: 'Unknown action.' });
  return false;
});

async function handleUnlockAttempt(type, targetUrl, sender) {
  if (!UNLOCK_WINDOWS[type]) {
    return { ok: false, error: 'Unknown unlock type.' };
  }

  const cfg = await getConfig();
  const now = Date.now();
  const waitKey = type === 'illegal' ? 'illegalUnlockWait' : 'legitimateUnlockWait';
  const lastWait = Number(cfg[waitKey] || 0);
  const rules = getUnlockRules(type, cfg);
  const elapsed = now - lastWait;

  if (!lastWait || elapsed > rules.maxWaitMs) {
    await chrome.storage.local.set({ [waitKey]: now });
    notify(type === 'illegal'
      ? `${rules.waitSeconds}s timer started for illegal unlock.`
      : `${rules.waitSeconds}s timer started for legitimate unlock.`);
    return {
      ok: true,
      status: 'timer_started',
      waitSeconds: rules.waitSeconds,
      extraMessage: getIllegalUnlockReminder(type, cfg)
    };
  }

  if (elapsed < rules.minWaitMs) {
    const previousRemainingSeconds = Math.ceil((rules.minWaitMs - elapsed) / 1000);
    await chrome.storage.local.set({ [waitKey]: now });
    return {
      ok: true,
      status: 'too_early',
      remainingSeconds: rules.waitSeconds,
      previousRemainingSeconds,
      timerWasReset: true,
      extraMessage: getIllegalUnlockReminder(type, cfg)
    };
  }

  const unlockedUntil = now + rules.grantedMs;
  await chrome.storage.local.set({
    unlockedUntil,
    [waitKey]: 0
  });

  if (type === 'illegal') {
    notify('Illegal unlock granted for 10 minutes.');
  } else {
    notify('Legitimate unlock granted for 20 minutes.');
  }

  await sendMetricIfConfigured(rules.metricID, cfg);

  const illegalUnlockMetricID = String(cfg.illegalUnlockMetricID || '').trim();
  if (type === 'illegal' && illegalUnlockMetricID) {
    await sendMetricIfConfigured(illegalUnlockMetricID, cfg);
  }

  if (targetUrl && sender && sender.tab && sender.tab.id) {
    await chrome.tabs.update(sender.tab.id, { url: targetUrl });
  }

  return {
    ok: true,
    status: 'unlock_granted',
    unlockedUntil
  };
}


function getIllegalUnlockReminder(type, cfg) {
  const illegalUnlockMetricID = String(cfg.illegalUnlockMetricID || '').trim();
  if (type !== 'illegal' || !illegalUnlockMetricID) {
    return '';
  }

  return `[${illegalUnlockMetricID}] will be sent upon entry! Think carefully.`;
}

async function getUnlockState() {
  const cfg = await getConfig();
  const now = Date.now();

  return {
    illegal: getWaitStateForType('illegal', cfg, now),
    legitimate: getWaitStateForType('legitimate', cfg, now),
    waitSecondsByType: {
      illegal: getUnlockRules('illegal', cfg).waitSeconds,
      legitimate: getUnlockRules('legitimate', cfg).waitSeconds
    }
  };
}

function getWaitStateForType(type, cfg, now) {
  const waitKey = type === 'illegal' ? 'illegalUnlockWait' : 'legitimateUnlockWait';
  const lastWait = Number(cfg[waitKey] || 0);
  const rules = getUnlockRules(type, cfg);

  if (!lastWait) {
    return { isActive: false, remainingSeconds: 0 };
  }

  const elapsed = now - lastWait;
  if (elapsed > rules.maxWaitMs) {
    return { isActive: false, remainingSeconds: 0 };
  }

  const remainingMs = Math.max(rules.minWaitMs - elapsed, 0);
  return {
    isActive: true,
    remainingSeconds: Math.ceil(remainingMs / 1000)
  };
}


function getUnlockRules(type, cfg) {
  const baseRules = UNLOCK_WINDOWS[type];
  const waitSeconds = type === 'illegal'
    ? parseUnlockWaitSeconds(cfg && cfg.illegalUnlockWaitSeconds, baseRules.defaultWaitSeconds)
    : parseUnlockWaitSeconds(cfg && cfg.legitimateUnlockWaitSeconds, baseRules.defaultWaitSeconds);

  return {
    ...baseRules,
    waitSeconds,
    minWaitMs: waitSeconds * 1000
  };
}

function parseUnlockWaitSeconds(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const rounded = Math.round(parsed);
  if (rounded < 1) {
    return fallback;
  }

  return rounded;
}
async function saveOptions(payload) {
  const blockedDomains = parseDomainList(payload.blockedDomains);

  await chrome.storage.local.set({
    blockedDomains,
    lockoutsServerUrl: String(payload.lockoutsServerUrl || '').trim(),
    lockoutsSecret: String(payload.lockoutsSecret || '').trim(),
    metricLogKey: String(payload.metricLogKey || '').trim() || DEFAULTS.metricLogKey,
    startTimerMetricID: String(payload.startTimerMetricID || '').trim(),
    stopTimerMetricID: String(payload.stopTimerMetricID || '').trim(),
    illegalUnlockMetricID: String(payload.illegalUnlockMetricID || '').trim(),
    illegalUnlockWaitSeconds: parseUnlockWaitSeconds(payload.illegalUnlockWaitSeconds, UNLOCK_WINDOWS.illegal.defaultWaitSeconds),
    legitimateUnlockWaitSeconds: parseUnlockWaitSeconds(payload.legitimateUnlockWaitSeconds, UNLOCK_WINDOWS.legitimate.defaultWaitSeconds),
    screenTimeLoggingEnabled: Boolean(payload.screenTimeLoggingEnabled),
    notificationsEnabled: Boolean(payload.notificationsEnabled)
  });
}

function parseDomainList(raw) {
  if (!raw) {
    return [];
  }

  const parsed = String(raw)
    .split(/\n|,/) 
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((domain) => domain.replace(/^https?:\/\//, '').replace(/\/$/, ''));

  return Array.from(new Set(parsed));
}

async function getConfig() {
  const cfg = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return {
    ...DEFAULTS,
    ...cfg,
    blockedDomains: Array.isArray(cfg.blockedDomains) ? cfg.blockedDomains : DEFAULTS.blockedDomains
  };
}

function matchBlockedDomain(url, blockedDomains) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (blockedDomains || []).find((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch (error) {
    return null;
  }
}

function isHttpUrl(url) {
  return url.startsWith('http://') || url.startsWith('https://');
}

async function ensureUnlockedUntilExists() {
  const { unlockedUntil } = await chrome.storage.local.get(['unlockedUntil']);
  if (!unlockedUntil) {
    const now = Date.now();
    await chrome.storage.local.set({ unlockedUntil: now });
    return now;
  }
  return Number(unlockedUntil);
}

async function ensureScreenTimeStateExists() {
  const existing = await chrome.storage.local.get(ACTIVE_SESSION_KEYS);
  const patch = {};

  if (existing.activeScreenTimeSession === undefined) {
    patch.activeScreenTimeSession = null;
  }

  if (existing.sessionCandidateToken === undefined) {
    patch.sessionCandidateToken = 0;
  }

  if (Object.keys(patch).length > 0) {
    await chrome.storage.local.set(patch);
  }
}

async function handlePotentialSessionTransition(tabId, tab, details) {
  const cfg = await getConfig();
  const effectiveTab = tab || await getTabSafe(tabId);

  if (await shouldKeepCurrentSession(cfg, effectiveTab)) {
    return;
  }

  await endScreenTimeSessionIfNeeded({ reason: (details && details.reason) || 'transition', tabId: effectiveTab && effectiveTab.id }, cfg);

  if (!effectiveTab || !isTrackedDistractingTab(effectiveTab, cfg)) {
    await clearSessionCandidateIfMatches(effectiveTab && effectiveTab.id);
    return;
  }

  const now = Date.now();
  const unlockedUntil = await ensureUnlockedUntilExists();
  if (now < unlockedUntil) {
    const remainingMin = Math.ceil((unlockedUntil - now) / 60000);
    notify(`Lockouts: ${remainingMin}m remaining in current unlock session.`);
    await sendMetricIfConfigured('session_active', cfg);
    return;
  }

  const stableBeforeDecision = await isStableActiveTab(effectiveTab.id, cfg);
  if (!stableBeforeDecision) {
    return;
  }

  const candidateToken = await createSessionCandidate(effectiveTab.id, effectiveTab.url);
  const serverDecision = await queryServerBlockDecision(cfg);
  const tabStillStable = await isStableCandidateStillCurrent(candidateToken, effectiveTab.id, effectiveTab.url, cfg);

  if (!tabStillStable) {
    return;
  }

  if (!serverDecision.allowed) {
    const message = serverDecision.message || `Blocked ${matchBlockedDomain(effectiveTab.url, cfg.blockedDomains)}.`;
    const redirect = chrome.runtime.getURL(`blocked.html?target=${encodeURIComponent(effectiveTab.url)}&message=${encodeURIComponent(message)}`);
    await chrome.tabs.update(effectiveTab.id, { url: redirect });
    await clearSessionCandidate(candidateToken);
    return;
  }

  await startScreenTimeSessionIfEligible(effectiveTab, cfg, candidateToken);
}

async function shouldKeepCurrentSession(cfg, tab) {
  const session = await getActiveScreenTimeSession();
  if (!session) {
    return false;
  }

  if (!cfg.screenTimeLoggingEnabled) {
    return false;
  }

  return isSameTrackedSessionTab(session, tab) && await isStableActiveTab(session.tabId, cfg);
}

function isSameTrackedSessionTab(session, tab) {
  if (!session || !tab) {
    return false;
  }

  return session.tabId === tab.id && session.url === tab.url;
}

async function getActiveScreenTimeSession() {
  const { activeScreenTimeSession } = await chrome.storage.local.get(['activeScreenTimeSession']);
  return activeScreenTimeSession || null;
}

async function createSessionCandidate(tabId, url) {
  const { sessionCandidateToken } = await chrome.storage.local.get(['sessionCandidateToken']);
  const nextToken = Number(sessionCandidateToken || 0) + 1;
  await chrome.storage.local.set({
    sessionCandidateToken: nextToken,
    pendingScreenTimeCandidate: { token: nextToken, tabId, url }
  });
  return nextToken;
}

async function clearSessionCandidate(token) {
  const { pendingScreenTimeCandidate } = await chrome.storage.local.get(['pendingScreenTimeCandidate']);
  if (!pendingScreenTimeCandidate || pendingScreenTimeCandidate.token !== token) {
    return;
  }
  await chrome.storage.local.remove(['pendingScreenTimeCandidate']);
}

async function clearSessionCandidateIfMatches(tabId) {
  const { pendingScreenTimeCandidate } = await chrome.storage.local.get(['pendingScreenTimeCandidate']);
  if (!pendingScreenTimeCandidate || pendingScreenTimeCandidate.tabId !== tabId) {
    return;
  }
  await chrome.storage.local.remove(['pendingScreenTimeCandidate']);
}

async function isStableCandidateStillCurrent(candidateToken, tabId, url, cfg) {
  const { pendingScreenTimeCandidate } = await chrome.storage.local.get(['pendingScreenTimeCandidate']);
  if (!pendingScreenTimeCandidate || pendingScreenTimeCandidate.token !== candidateToken) {
    return false;
  }

  if (pendingScreenTimeCandidate.tabId !== tabId || pendingScreenTimeCandidate.url !== url) {
    return false;
  }

  return isStableActiveTab(tabId, cfg);
}

async function startScreenTimeSessionIfEligible(tab, cfg, candidateToken) {
  await clearSessionCandidate(candidateToken);

  if (!cfg.screenTimeLoggingEnabled || !cfg.startTimerMetricID) {
    return;
  }

  if (!await isStableActiveTab(tab.id, cfg)) {
    return;
  }

  const session = {
    tabId: tab.id,
    windowId: tab.windowId,
    url: tab.url,
    startedAt: Date.now()
  };

  await chrome.storage.local.set({ activeScreenTimeSession: session });
  await sendMetricIfConfigured(cfg.startTimerMetricID, cfg);
}

async function endScreenTimeSessionIfNeeded(details, cfgOverride) {
  const session = await getActiveScreenTimeSession();
  if (!session) {
    return;
  }

  const cfg = cfgOverride || await getConfig();
  await chrome.storage.local.set({ activeScreenTimeSession: null });

  if (!cfg.screenTimeLoggingEnabled || !cfg.stopTimerMetricID) {
    return;
  }

  await sendMetricIfConfigured(cfg.stopTimerMetricID, cfg);
}

function isTrackedDistractingTab(tab, cfg) {
  if (!tab || !tab.url || !isHttpUrl(tab.url)) {
    return false;
  }

  return Boolean(matchBlockedDomain(tab.url, cfg.blockedDomains));
}

async function getCurrentActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs && tabs.length ? tabs[0] : null;
}

async function getTabSafe(tabId) {
  if (tabId == null) {
    return null;
  }

  try {
    return await chrome.tabs.get(tabId);
  } catch (error) {
    return null;
  }
}

async function isStableActiveTab(tabId, cfg) {
  if (tabId == null) {
    return false;
  }

  const [tab, idleState, lastFocused] = await Promise.all([
    getTabSafe(tabId),
    chrome.idle.queryState(60),
    chrome.windows.getLastFocused()
  ]);

  if (!tab || !tab.active || !tab.windowId || lastFocused.id !== tab.windowId || !lastFocused.focused) {
    return false;
  }

  if (idleState !== 'active') {
    return false;
  }

  return isTrackedDistractingTab(tab, cfg);
}

async function queryServerBlockDecision(cfg) {
  if (!cfg.lockoutsServerUrl) {
    return { allowed: false, message: 'Blocked by local rules.' };
  }

  const decisionKeys = getServerDecisionKeys();
  for (const decisionKey of decisionKeys) {
    const result = await fetchServerDecisionForKey(cfg, decisionKey);
    if (!result.shouldFallback) {
      return {
        allowed: result.allowed,
        message: result.message
      };
    }
  }

  return { allowed: false, message: '' };
}

function getServerDecisionKeys() {
  return SERVER_DECISION_KEYS;
}

async function postServerJson(cfg, key, data) {
  const payload = {
    key,
    data,
    secret: cfg.lockoutsSecret || ''
  };

  const headers = {
    'Content-Type': 'application/json'
  };

  if (cfg.lockoutsSecret) {
    headers['OpenHabits-Secret'] = cfg.lockoutsSecret;
  }

  return fetch(cfg.lockoutsServerUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
}

async function fetchServerDecisionForKey(cfg, decisionKey) {
  try {
    const response = await postServerJson(cfg, decisionKey, null);
    if (!response.ok) {
      return { allowed: false, message: '', shouldFallback: false };
    }

    const contentType = response.headers.get('content-type') || '';
    const bodyText = await response.text();
    if (!contentType.includes('application/json')) {
      return { allowed: false, message: '', shouldFallback: false };
    }

    const data = JSON.parse(bodyText);
    if (data && data.status === 'allowed') {
      return { allowed: true, message: '', shouldFallback: false };
    }

    const message = data && data.ui && typeof data.ui.message === 'string' ? data.ui.message : '';
    return { allowed: false, message, shouldFallback: false };
  } catch (error) {
    return { allowed: false, message: '', shouldFallback: false };
  }
}

async function sendMetricIfConfigured(metricID, cfg) {
  if (!cfg.lockoutsServerUrl || !metricID) {
    return;
  }

  try {
    await postServerJson(cfg, cfg.metricLogKey || DEFAULTS.metricLogKey, [[metricID]]);
  } catch (error) {
    // best effort metric logging
  }
}

async function notify(message) {
  const { notificationsEnabled } = await chrome.storage.local.get(['notificationsEnabled']);
  if (notificationsEnabled === false) {
    return;
  }

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6B2g0AAAAASUVORK5CYII=',
    title: 'Lockouts Client',
    message
  });
}
