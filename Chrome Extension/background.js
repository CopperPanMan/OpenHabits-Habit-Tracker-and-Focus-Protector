const DEFAULTS = {
  blockedDomains: ['youtube.com', 'instagram.com', 'reddit.com', 'facebook.com'],
  unlockedUntil: 0,
  illegalUnlockWait: 0,
  legitimateUnlockWait: 0,
  lockoutsServerUrl: '',
  metricLogKey: 'record_metric',
  notificationsEnabled: true
};

const UNLOCK_WINDOWS = {
  illegal: {
    minWaitMs: 30 * 1000,
    maxWaitMs: 5 * 60 * 1000,
    grantedMs: 10 * 60 * 1000,
    metricID: 'illegal_unlock'
  },
  legitimate: {
    minWaitMs: 60 * 1000,
    maxWaitMs: 5 * 60 * 1000,
    grantedMs: 20 * 60 * 1000,
    metricID: 'legitimate_unlock'
  }
};

const SERVER_DECISION_KEYS = ['app_closer_v2', 'app_closer'];

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
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading' || !tab.url) {
    return;
  }

  if (!isHttpUrl(tab.url)) {
    return;
  }

  const cfg = await getConfig();
  const blockedMatch = matchBlockedDomain(tab.url, cfg.blockedDomains);
  if (!blockedMatch) {
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

  const serverDecision = await queryServerBlockDecision(cfg);
  if (serverDecision.allowed) {
    return;
  }

  const message = serverDecision.message || `Blocked ${blockedMatch}.`;
  const redirect = chrome.runtime.getURL(`blocked.html?target=${encodeURIComponent(tab.url)}&message=${encodeURIComponent(message)}`);
  await chrome.tabs.update(tabId, { url: redirect });
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
  const rules = UNLOCK_WINDOWS[type];
  const elapsed = now - lastWait;

  if (!lastWait || elapsed > rules.maxWaitMs) {
    await chrome.storage.local.set({ [waitKey]: now });
    notify(type === 'illegal'
      ? '30s timer started. You will lose 10 points if you continue.'
      : '60s timer started for legitimate unlock.');
    return { ok: true, status: 'timer_started', waitSeconds: Math.ceil(rules.minWaitMs / 1000) };
  }

  if (elapsed < rules.minWaitMs) {
    return {
      ok: true,
      status: 'too_early',
      remainingSeconds: Math.ceil((rules.minWaitMs - elapsed) / 1000)
    };
  }

  const unlockedUntil = now + rules.grantedMs;
  await chrome.storage.local.set({
    unlockedUntil,
    [waitKey]: 0
  });

  if (type === 'illegal') {
    notify('10 points deducted. 10 minute unlock granted.');
  } else {
    notify('Legitimate unlock granted for 20 minutes.');
  }

  await sendMetricIfConfigured(rules.metricID, cfg);

  if (targetUrl && sender && sender.tab && sender.tab.id) {
    await chrome.tabs.update(sender.tab.id, { url: targetUrl });
  }

  return {
    ok: true,
    status: 'unlock_granted',
    unlockedUntil
  };
}

async function saveOptions(payload) {
  const blockedDomains = parseDomainList(payload.blockedDomains);

  await chrome.storage.local.set({
    blockedDomains,
    lockoutsServerUrl: String(payload.lockoutsServerUrl || '').trim(),
    metricLogKey: String(payload.metricLogKey || '').trim() || DEFAULTS.metricLogKey,
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

async function queryServerBlockDecision(cfg) {
  if (!cfg.lockoutsServerUrl) {
    return { allowed: false, message: 'Blocked by local rules.' };
  }

  const decisionKeys = getServerDecisionKeys(cfg.lockoutsServerUrl);
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

function getServerDecisionKeys(serverUrl) {
  try {
    const parsedUrl = new URL(serverUrl);
    const configuredKey = parseServerKeyParam(parsedUrl.searchParams.get('key'));
    if (!configuredKey) {
      return SERVER_DECISION_KEYS;
    }

    return [configuredKey].concat(
      SERVER_DECISION_KEYS.filter((decisionKey) => decisionKey !== configuredKey)
    );
  } catch (error) {
    return SERVER_DECISION_KEYS;
  }
}

function parseServerKeyParam(rawKey) {
  if (typeof rawKey !== 'string') {
    return '';
  }

  const trimmed = rawKey.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'string' ? parsed.trim() : '';
  } catch (error) {
    return trimmed;
  }
}

async function fetchServerDecisionForKey(cfg, decisionKey) {
  try {
    const url = new URL(cfg.lockoutsServerUrl);
    url.searchParams.set('key', JSON.stringify(decisionKey));
    const response = await fetch(url.toString());
    if (!response.ok) {
      return { allowed: false, message: '', shouldFallback: true };
    }

    const contentType = response.headers.get('content-type') || '';
    const bodyText = await response.text();
    if (!contentType.includes('application/json')) {
      if (looksLikeUnsupportedKeyResponse(bodyText, decisionKey)) {
        return { allowed: false, message: '', shouldFallback: true };
      }

      return { allowed: false, message: '', shouldFallback: false };
    }

    const data = JSON.parse(bodyText);
    if (data && data.status === 'allowed') {
      return { allowed: true, message: '', shouldFallback: false };
    }

    const message = data && data.ui && typeof data.ui.message === 'string' ? data.ui.message : '';
    return { allowed: false, message, shouldFallback: false };
  } catch (error) {
    return { allowed: false, message: '', shouldFallback: decisionKey !== 'app_closer' };
  }
}

function looksLikeUnsupportedKeyResponse(bodyText, decisionKey) {
  if (typeof bodyText !== 'string') {
    return false;
  }

  const normalized = bodyText.trim();
  return normalized === `Unsupported key: ${decisionKey}`;
}

async function sendMetricIfConfigured(metricID, cfg) {
  if (!cfg.lockoutsServerUrl || !metricID) {
    return;
  }

  try {
    const url = new URL(cfg.lockoutsServerUrl);
    url.searchParams.set('key', JSON.stringify(cfg.metricLogKey || DEFAULTS.metricLogKey));
    url.searchParams.set('metrics', JSON.stringify([[metricID]]));
    await fetch(url.toString());
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
