// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: code;
// Local-only runtime. HTTP, notifications, menus, Jomo, and Calendar remain in Shortcuts.
const OPENHABITS_RUNTIME_VERSION = '1.0.0';
const OPENHABITS_CLIENT_VERSION = 1;
const UNLOCK_RULES = {
  legitimate_unlock: { waitSeconds: 60, durationMinutes: 20 },
  penalty_unlock: { waitSeconds: 30, durationMinutes: 10 },
};

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function parseObject(value, label) {
  if (typeof value === 'string') value = JSON.parse(value);
  if (!isObject(value)) throw new Error(`${label} must be a JSON dictionary.`);
  return value;
}
function dateMillis(value) {
  if (typeof value !== 'string' || !value.trim()) return NaN;
  return Date.parse(value);
}
function offsetMinutes(offset) {
  const match = /^([+-])(\d{2})(\d{2})$/.exec(String(offset));
  if (!match || +match[2] > 23 || +match[3] > 59) throw new Error('Invalid RFC 2822 timezone offset.');
  return (match[1] === '-' ? -1 : 1) * (+match[2] * 60 + +match[3]);
}
function currentOffset(now) {
  const minutes = -now.getTimezoneOffset();
  return `${minutes < 0 ? '-' : '+'}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}${String(Math.abs(minutes) % 60).padStart(2, '0')}`;
}
function sameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function resolveShortcutsRoot(fm) {
  let root;
  try { root = fm.bookmarkedPath('Shortcuts'); } catch (_) {}
  if (!root && typeof FileManager.bookmarkedPath === 'function') {
    try { root = FileManager.bookmarkedPath('Shortcuts'); } catch (_) {}
  }
  if (typeof root !== 'string' || !root.trim()) throw new Error('Missing Scriptable file bookmark "Shortcuts". Select iCloud Drive/Shortcuts.');
  return root;
}
function createStorage() {
  const fm = FileManager.iCloud();
  const root = resolveShortcutsRoot(fm);
  const directory = ['OpenHabits', 'OpenHabits Metrics'].reduce((path, part) => fm.joinPath(path, part), root);
  const pathFor = name => fm.joinPath(directory, name);
  return {
    read(name) {
      const path = pathFor(name);
      if (!fm.fileExists(path)) return null;
      // Never wait for an iCloud download inside the short Scriptable execution budget.
      if (typeof fm.isFileDownloaded === 'function' && !fm.isFileDownloaded(path)) {
        throw new Error(`${name} is not downloaded. Download it in Files before retrying.`);
      }
      const text = fm.readString(path);
      if (!text.trim()) return null;
      return JSON.parse(text);
    },
    write(name, value) {
      if (!fm.fileExists(directory)) fm.createDirectory(directory, true);
      fm.writeString(pathFor(name), JSON.stringify(value));
    },
  };
}
function loadUnlockState(storage, now) {
  const state = storage.read('lockouts.json');
  if (state) {
    if (!Number.isFinite(dateMillis(state.unlockedUntil)) || !Number.isFinite(dateMillis(state.unlockWait)) || typeof state.unlockType !== 'string') {
      throw new Error('Invalid lockouts.json. Entry remains blocked; repair the state file before retrying.');
    }
    return state;
  }
  const past = new Date(now.getTime() - 60000).toISOString();
  const initial = { unlockedUntil: past, unlockWait: past, unlockType: '' };
  storage.write('lockouts.json', initial);
  return initial;
}
function processAppOpen(storage, now) {
  const state = loadUnlockState(storage, now);
  const remaining = dateMillis(state.unlockedUntil) - now.getTime();
  if (remaining > 0) {
    const remainingMinutes = Math.ceil(remaining / 60000);
    return { action: 'active_unlock', remainingMinutes, unlockedUntil: state.unlockedUntil,
      notification: `Unlocked for ${remainingMinutes} more ${remainingMinutes === 1 ? 'minute' : 'minutes'}.` };
  }
  const rule = Object.prototype.hasOwnProperty.call(UNLOCK_RULES, state.unlockType) ? UNLOCK_RULES[state.unlockType] : null;
  const elapsed = now.getTime() - dateMillis(state.unlockWait);
  // An expired attempt falls through WITHOUT clearing its fields. Early reopening resets the wait.
  if (!rule || elapsed > 300000) return { action: 'evaluate_lockout' };
  if (elapsed < rule.waitSeconds * 1000) {
    state.unlockWait = now.toISOString();
    storage.write('lockouts.json', state);
    return { action: 'too_early', unlockType: state.unlockType, waitSeconds: rule.waitSeconds,
      notification: `Early entry reset the timer. Wait ${rule.waitSeconds} seconds before reopening the app.` };
  }
  const unlockType = state.unlockType;
  state.unlockedUntil = new Date(now.getTime() + rule.durationMinutes * 60000).toISOString();
  state.unlockType = '';
  storage.write('lockouts.json', state);
  const time = new Date(state.unlockedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return { action: 'unlock_granted', unlockType, unlockedUntil: state.unlockedUntil,
    durationMinutes: rule.durationMinutes, calendarUnlockMinutes: rule.durationMinutes,
    logScreenTimeLockOff: unlockType === 'penalty_unlock',
    notification: `${unlockType === 'penalty_unlock' ? '10 points deducted. ' : ''}Unlocked until ${time}.` };
}
function beginUnlock(storage, now, data) {
  if (!Object.prototype.hasOwnProperty.call(UNLOCK_RULES, data.type)) throw new Error('Unknown unlock type.');
  const state = loadUnlockState(storage, now);
  state.unlockType = data.type;
  state.unlockWait = now.toISOString();
  storage.write('lockouts.json', state);
  const waitSeconds = UNLOCK_RULES[data.type].waitSeconds;
  return { action: 'unlock_started', unlockType: data.type, waitSeconds, validForSeconds: 300,
    notification: data.type === 'penalty_unlock'
      ? `${waitSeconds}s timer started. You will lose 10pts by continuing.\nValid for 5 minutes. Attempting early entry will reset the timer.`
      : `${waitSeconds}s timer started for legitimate unlock.\nValid for 5 minutes. Attempting early entry will reset the timer.` };
}
function validateCache(raw) {
  const cache = parseObject(raw, 'Cache response');
  if (cache.ok !== true || cache.schemaVersion !== 'lockouts_cache_v1' || !Number.isFinite(dateMillis(cache.lastUpdated)) ||
      !isObject(cache.config) || !isObject(cache.metricState) || !isObject(cache.metricState.allByID) || !isObject(cache.virtualDay)) {
    throw new Error('Response is not a successful lockouts_cache_v1 snapshot.');
  }
  if (cache.virtualDay.timezoneOffsetRFC2822 !== '') offsetMinutes(cache.virtualDay.timezoneOffsetRFC2822);
  return cache;
}
function prepareCacheUpdate(storage, now, data) {
  // A missing/malformed cache is recoverable by fetching; unreadable iCloud data is not overwritten.
  let cache;
  try { cache = storage.read('lockoutCache.json'); }
  catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  let valid = false;
  try { validateCache(cache); valid = true; } catch (_) {}
  const input = data.input;
  const hasInput = input !== undefined && input !== null && input !== '';
  const force = data.mode === 'force' || input === 'fetch_new_cache';
  const offset = currentOffset(now);
  const cachedOffset = cache?.virtualDay?.timezoneOffsetRFC2822;
  const lastUpdated = valid ? dateMillis(cache.lastUpdated) : NaN;
  const age = now.getTime() - lastUpdated;
  const fresh = valid && age >= 0 && age <= 5 * 3600000 && sameLocalDay(new Date(lastUpdated), now) && cachedOffset === offset;
  if (fresh && hasInput && !force) {
    const response = parseObject(input, 'Metric response');
    if (response.ok === false || !Array.isArray(response.metricsByID)) throw new Error('Metric response must contain metricsByID.');
    let updated = false;
    for (const item of response.metricsByID) {
      if (!isObject(item) || typeof item.metricID !== 'string' || !Object.prototype.hasOwnProperty.call(cache.metricState.allByID, item.metricID)) continue;
      const entry = cache.metricState.allByID[item.metricID];
      // Zero and false are valid values. Missing/null/empty values do not erase state.
      if (!isObject(entry) || item.value === undefined || item.value === null || item.value === '') continue;
      if (String(entry.value) !== String(item.value)) { entry.value = item.value; updated = true; }
    }
    if (updated) storage.write('lockoutCache.json', cache);
    // A local patch deliberately does not change snapshot age.
    return { action: 'done', updated, reason: 'patched_cache' };
  }
  // Preserve the original throttle even for force requests and timezone changes.
  if (valid && age >= 0 && age <= 15000) return { action: 'done', updated: false, reason: 'refreshed_within_15_seconds' };
  const settings = storage.read('settings.json');
  if (!settings || typeof settings.webAppId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(settings.webAppId) ||
      typeof settings.openHabitsSecret !== 'string' || !settings.openHabitsSecret.trim()) {
    throw new Error('OpenHabits settings missing or invalid. Please run Insights and follow setup.');
  }
  // Apps Script in this repository requires POST JSON. Never put the secret in a URL.
  const clientNow = new Date(now.getTime() + offsetMinutes(offset) * 60000).toUTCString().replace('GMT', offset);
  const body = { key: 'config_snapshot', secret: settings.openHabitsSecret, clientNow };
  // Use the server's clientNow offset path: its IANA path returns an empty cached offset.
  // This keeps subsequent cached-offset comparisons meaningful.
  const result = { action: 'fetch', updated: false, runCalendarAlarmEngine: true,
    url: `https://script.google.com/macros/s/${settings.webAppId}/exec`, method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body };
  if (valid && cachedOffset && cachedOffset !== offset) {
    const hours = (offsetMinutes(cachedOffset) - offsetMinutes(offset)) / 60;
    result.timezoneChanged = true;
    result.oldOffset = cachedOffset;
    result.newOffset = offset;
    result.timeDifferenceHours = hours;
    result.notification = `OpenHabits updating cache for new timezone (UTC ${offset}, ${hours >= 0 ? '+' : ''}${hours}h).`;
  }
  return result;
}
function commitCacheRefresh(storage, data) {
  let cache;
  try { cache = validateCache(data.response); }
  catch (_) {
    // Retain the last known cache. Do not echo raw HTML/JSON that could contain credentials.
    return { ok: false, action: 'refresh_failed', updated: false,
      notification: 'Error: unable to access Google Drive at this time. The response was not a valid OpenHabits cache. Previous cache retained.' };
  }
  storage.write('lockoutCache.json', cache);
  // updated retains the old Shortcut's patch-only meaning; refreshed is explicit.
  return { action: 'done', updated: false, refreshed: true };
}
function dispatch(request, storage, now) {
  request = parseObject(request, 'Runtime request');
  if (request.clientVersion !== undefined && request.clientVersion !== OPENHABITS_CLIENT_VERSION) throw new Error('Unsupported runtime clientVersion. Reinstall the matching Shortcut and runtime.');
  const data = request.data === undefined ? {} : parseObject(request.data, 'Request data');
  let result;
  switch (request.operation) {
    case 'lockouts.processAppOpen': result = processAppOpen(storage, now); break;
    case 'lockouts.beginUnlock': result = beginUnlock(storage, now, data); break;
    case 'lockouts.prepareCacheUpdate': result = prepareCacheUpdate(storage, now, data); break;
    case 'lockouts.commitCacheRefresh': result = commitCacheRefresh(storage, data); break;
    default: throw new Error('Unknown OpenHabits Runtime operation.');
  }
  return { ok: true, ...result, runtimeVersion: OPENHABITS_RUNTIME_VERSION };
}
async function main() {
  let result;
  try {
    // Validate the envelope before touching storage. No Date/offset overrides in the production API.
    const request = parseObject(args.shortcutParameter, 'Runtime request');
    result = dispatch(request, createStorage(), new Date());
  } catch (error) {
    result = { ok: false, action: 'error', updated: false, runtimeVersion: OPENHABITS_RUNTIME_VERSION,
      notification: `OpenHabits: ${error.message || String(error)}` };
  }
  Script.setShortcutOutput(result);
  Script.complete();
}
await main();
