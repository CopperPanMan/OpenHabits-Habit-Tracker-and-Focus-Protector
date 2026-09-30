const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../OpenHabits Runtime.js'), 'utf8');
const context = vm.createContext({ Date, Intl, FileManager: {} });
vm.runInContext(source.replace(/await main\(\);\s*$/, ''), context);
const now = new Date('2026-09-30T16:00:00Z');
const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
function store(files = {}) {
  return { files: clone(files), writes: [], read(name) { return clone(this.files[name]); },
    write(name, value) { this.files[name] = clone(value); this.writes.push(name); } };
}
function run(operation, storage, data = {}, at = now) {
  return context.dispatch({ operation: `lockouts.${operation}`, clientVersion: 1, data }, storage, at);
}
function cache(age = 60000, offset = context.currentOffset(now)) {
  return { ok: true, schemaVersion: 'lockouts_cache_v1', lastUpdated: new Date(+now - age).toISOString(), config: {},
    virtualDay: { timezoneOffsetRFC2822: offset }, metricState: { allByID: { a: { value: 1 }, b: { value: 2 } } } };
}
const settings = { webAppId: 'test-deployment', openHabitsSecret: 'secret with ?&' };
test('initialization and active unlock precedence', () => {
  const s = store();
  assert.equal(run('processAppOpen', s).action, 'evaluate_lockout');
  assert.equal(s.writes.length, 1);
  s.files['lockouts.json'].unlockedUntil = new Date(+now + 61000).toISOString();
  assert.equal(run('processAppOpen', s).remainingMinutes, 2);
});
for (const [type, wait, duration] of [['penalty_unlock', 30, 10], ['legitimate_unlock', 60, 20]]) {
  test(`${type}: early entry resets, exact wait grants, repeat does not grant again`, () => {
    const s = store();
    assert.equal(run('beginUnlock', s, { type }).waitSeconds, wait);
    assert.equal(run('processAppOpen', s, {}, new Date(+now + 15000)).action, 'too_early');
    assert.equal(s.files['lockouts.json'].unlockWait, new Date(+now + 15000).toISOString());
    const granted = run('processAppOpen', s, {}, new Date(+now + 15000 + wait * 1000));
    assert.equal(granted.action, 'unlock_granted');
    assert.equal(granted.durationMinutes, duration);
    assert.equal(granted.logScreenTimeLockOff, type === 'penalty_unlock');
    assert.equal(run('processAppOpen', s, {}, new Date(+now + 16000 + wait * 1000)).action, 'active_unlock');
    assert.equal(s.files['lockouts.json'].unlockType, '');
  });
  test(`${type}: exact five minutes valid, older attempts fall through untouched`, () => {
    const s = store(); run('beginUnlock', s, { type });
    const before = clone(s.files); const writes = s.writes.length;
    assert.equal(run('processAppOpen', s, {}, new Date(+now + 300001)).action, 'evaluate_lockout');
    assert.deepEqual(s.files, before); assert.equal(s.writes.length, writes);
    assert.equal(run('processAppOpen', s, {}, new Date(+now + 300000)).action, 'unlock_granted');
  });
}
test('corrupt unlock state fails closed without overwriting it', () => {
  const s = store({ 'lockouts.json': { unlockedUntil: 'garbage' } });
  assert.throws(() => run('processAppOpen', s), /Invalid lockouts/);
  assert.equal(s.writes.length, 0);
  assert.throws(() => run('beginUnlock', s, { type: '__proto__' }), /Unknown unlock/);
});
test('metric patches preserve zero/false, age and unknown fields; write once', () => {
  const c = cache(); c.extra = 'keep';
  const s = store({ 'lockoutCache.json': c });
  const result = run('prepareCacheUpdate', s, { input: { metricsByID: [{ metricID: 'a', value: 0 }, { metricID: 'b', value: false }, { metricID: 'missing', value: 9 }] } });
  assert.equal(result.updated, true); assert.equal(s.writes.length, 1);
  assert.equal(s.files['lockoutCache.json'].metricState.allByID.a.value, 0);
  assert.equal(s.files['lockoutCache.json'].metricState.allByID.b.value, false);
  assert.equal(s.files['lockoutCache.json'].lastUpdated, c.lastUpdated);
  assert.equal(s.files['lockoutCache.json'].extra, 'keep');
});
test('unchanged or absent metric values do not write', () => {
  const s = store({ 'lockoutCache.json': cache() });
  const result = run('prepareCacheUpdate', s, { input: JSON.stringify({ metricsByID: [{ metricID: 'a', value: '1' }, { metricID: 'b', value: null }] }) });
  assert.equal(result.updated, false); assert.equal(s.writes.length, 0);
});
test('no input fetches even a fresh cache; force still honors 15-second throttle', () => {
  const s = store({ 'settings.json': settings, 'lockoutCache.json': cache() });
  const result = run('prepareCacheUpdate', s);
  assert.equal(result.action, 'fetch'); assert.equal(result.method, 'POST');
  assert.equal(result.body.key, 'config_snapshot'); assert.equal(result.body.secret, settings.openHabitsSecret);
  assert.equal(new Date(result.body.clientNow).getTime(), +now);
  assert.equal(result.body.clientNow.slice(-5), context.currentOffset(now));
  assert.equal(result.url.includes('secret'), false);
  s.files['lockoutCache.json'] = cache(15000);
  assert.equal(run('prepareCacheUpdate', s, { input: 'fetch_new_cache' }).reason, 'refreshed_within_15_seconds');
});
test('stale, future and missing cache fetch; missing settings errors', () => {
  for (const c of [cache(6 * 3600000), cache(-1000), null]) {
    const s = store({ 'settings.json': settings, 'lockoutCache.json': c });
    assert.equal(run('prepareCacheUpdate', s, { input: { metricsByID: [] } }).action, 'fetch');
  }
  assert.throws(() => run('prepareCacheUpdate', store()), /settings missing/);
});
test('offset arithmetic supports half/quarter hours and both signs', () => {
  assert.equal(context.offsetMinutes('+0530') - context.offsetMinutes('+0400'), 90);
  assert.equal(context.offsetMinutes('+0545'), 345);
  assert.equal(context.offsetMinutes('-0330'), -210);
  assert.throws(() => context.offsetMinutes('+0560'));
  const oldOffset = context.currentOffset(now) === '+0545' ? '+0530' : '+0545';
  const s = store({ 'settings.json': settings, 'lockoutCache.json': cache(60000, oldOffset) });
  const r = run('prepareCacheUpdate', s);
  assert.equal(r.timeDifferenceHours, (context.offsetMinutes(oldOffset) - context.offsetMinutes(context.currentOffset(now))) / 60);
});
test('bad HTTP responses retain cache; valid snapshot saves once', () => {
  const s = store({ 'lockoutCache.json': cache() }); const before = clone(s.files);
  for (const response of ['<html>Drive error</html>', { schemaVersion: 'lockouts_cache_v1' }, { ...cache(), ok: false }, { ...cache(), schemaVersion: 'unknown' }]) {
    assert.equal(run('commitCacheRefresh', s, { response }).ok, false);
    assert.deepEqual(s.files, before); assert.equal(s.writes.length, 0);
  }
  const result = run('commitCacheRefresh', s, { response: JSON.stringify(cache(0)) });
  assert.equal(result.refreshed, true); assert.equal(result.updated, false); assert.equal(s.writes.length, 1);
});
test('entry point returns dictionary errors and completes; no iCloud downloads', async () => {
  let output, complete = false;
  const fm = { bookmarkedPath: () => '/Shortcuts', joinPath: (a,b) => a+'/'+b,
    fileExists: () => true, isFileDownloaded: () => false, downloadFileFromiCloud: () => assert.fail('must not download') };
  const sandbox = vm.createContext({ args: { shortcutParameter: { operation: 'lockouts.processAppOpen' } },
    FileManager: { iCloud: () => fm }, Script: { setShortcutOutput: value => { output = value; }, complete: () => { complete = true; } } });
  await vm.runInContext(`(async () => { ${source} })()`, sandbox);
  assert.equal(output.ok, false); assert.match(output.notification, /not downloaded/); assert.equal(complete, true);
});
test('version mismatch rejects before operation mutation', () => {
  const s = store(); assert.throws(() => context.dispatch({ clientVersion: 2, operation: 'lockouts.beginUnlock' }, s, now), /clientVersion/);
  assert.equal(s.writes.length, 0);
});
test('prepared POST is accepted by the real server request and offset parsers', () => {
  const server = vm.createContext({ Date, Session: { getScriptTimeZone: () => 'GMT' } });
  for (const file of ['Main.gs', 'Lockouts.gs']) vm.runInContext(fs.readFileSync(require.resolve('../' + file), 'utf8'), server);
  const result = run('prepareCacheUpdate', store({ 'settings.json': settings }));
  const request = server.parseRequest_({ postData: { contents: JSON.stringify(result.body) } });
  assert.equal(request.ok, true); assert.equal(request.key, 'config_snapshot');
  assert.equal(request.secret, settings.openHabitsSecret);
  const offset = server.lockouts_parseClientNowOffset_(request.clientNow);
  assert.equal(offset.timezoneOffsetRFC2822, context.currentOffset(now));
});
test('previous local day refreshes even within five hours', () => {
  const midnight = new Date(2026, 8, 30, 0, 10);
  const c = cache(); c.lastUpdated = new Date(+midnight - 30 * 60000).toISOString();
  c.virtualDay.timezoneOffsetRFC2822 = context.currentOffset(midnight);
  const s = store({ 'settings.json': settings, 'lockoutCache.json': c });
  assert.equal(run('prepareCacheUpdate', s, { input: { metricsByID: [] } }, midnight).action, 'fetch');
});
