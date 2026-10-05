const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../OpenHabits Runtime.js'), 'utf8');
const context = vm.createContext({ Date, Intl });
vm.runInContext(source.replace(/await main\(\);\s*$/, ''), context);
const now = new Date('2026-10-05T16:00:37.250Z');
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const settings = { webAppId: 'test-deployment', openHabitsSecret: 'secret with ?&' };
function cache(age = 60000, offset = context.offset(now)) {
  return { ok: true, schemaVersion: 'lockouts_cache_v1',
    lastUpdated: new Date(+now - age).toISOString(),
    config: { globals: { barLength: 20 }, blocks: [] },
    virtualDay: { timezoneOffsetRFC2822: offset },
    metricState: { allByID: { a: { value: 1 }, b: { value: 2 } } } };
}
function storage(files = {}) {
  return { files: clone(files), reads: [], writes: [],
    read(name) { this.reads.push(name); return clone(this.files[name]) ?? null; },
    write(name, value) { this.files[name] = clone(value); this.writes.push(name); } };
}
function run(input, s, at = now) { return context.dispatch(input, s, at); }

test('normal app opening returns evaluator cache without initializing a file', () => {
  const s = storage({ 'lockoutCache.json': cache() });
  const r = run(['app_open', 'Instagram'], s);
  assert.equal(r.route, 'evaluate');
  assert.equal(JSON.parse(r.cacheJSON).schemaVersion, 'lockouts_cache_v1');
  assert.deepEqual(s.reads, ['lockouts.json', 'lockoutCache.json']);
  assert.equal(s.writes.length, 0);
});

for (const [command, wait, nominal, penalty] of [
  ['begin_penalty', 30, 10, true], ['begin_legitimate', 60, 20, false]
]) {
  test(`${command}: begin writes once; early entry restarts full wait`, () => {
    const s = storage();
    assert.match(run(command, s).notification, new RegExp(`${wait}s timer started`));
    assert.equal(s.writes.length, 1);
    const early = new Date(+now + 10000);
    assert.equal(run('app_open', s, early).route, 'block');
    assert.equal(s.files['lockouts.json'].unlockWait, early.toISOString());
    assert.equal(run('app_open', s, new Date(+early + wait * 1000 - 1)).route, 'block');
  });

  test(`${command}: calendar alarm is one minute earlier and shares local expiry`, () => {
    for (const seconds of [0, 1, 37, 59]) {
      const start = new Date('2026-10-05T16:00:00Z');
      start.setUTCSeconds(seconds, 250);
      const s = storage({ 'lockoutCache.json': cache() });
      run(command, s, start);
      const grantTime = new Date(+start + wait * 1000);
      const grant = run('app_open', s, grantTime);
      const oldClockTime = Math.floor((+grantTime + nominal * 60000) / 60000) * 60000;
      const deadline = Date.parse(grant.calendarEnd);
      assert.equal(deadline, oldClockTime - 60000);
      assert.equal(deadline % 60000, 0);
      assert.equal(grant.calendarEnd, s.files['lockouts.json'].unlockedUntil);
      assert.equal(grant.calendarMinutes, nominal - 1);
      assert.equal(grant.penalty, penalty);
      assert.equal(s.files['lockouts.json'].unlockType, '');
      assert.equal(run('app_open', s, new Date(deadline - 1)).route, 'allow');
      for (const delay of [0, 1, 5000, 59999]) {
        assert.equal(run('app_open', s, new Date(deadline + delay)).route, 'evaluate');
      }
      const repeat = run('app_open', s, new Date(+grantTime + 1000));
      assert.equal(repeat.route, 'allow');
      assert.equal(repeat.calendarEnd, undefined);
    }
  });

  test(`${command}: five-minute boundary remains valid; expired attempt unchanged`, () => {
    const s = storage({ 'lockoutCache.json': cache() });
    run(command, s);
    const before = clone(s.files), writes = s.writes.length;
    assert.equal(run('app_open', s, new Date(+now + 300001)).route, 'evaluate');
    assert.deepEqual(s.files, before);
    assert.equal(s.writes.length, writes);
    assert.ok(run('app_open', s, new Date(+now + 300000)).calendarEnd);
  });
}

test('existing active sessions keep their previously stored deadline', () => {
  const future = new Date(+now + 61000).toISOString();
  const s = storage({ 'lockouts.json': { unlockedUntil: future,
    unlockWait: now.toISOString(), unlockType: 'penalty_unlock' } });
  assert.match(run('app_open', s).notification, /2 more minutes/);
  assert.equal(s.files['lockouts.json'].unlockedUntil, future);
  assert.equal(s.writes.length, 0);
});

test('recursive task_block skips unlock state and never requests HTTP', () => {
  const s = storage({ 'lockouts.json': { invalid: true }, 'lockoutCache.json': cache() });
  const result = run(['app_open', 'task_block'], s);
  assert.equal(result.route, 'evaluate');
  assert.deepEqual(s.reads, ['lockoutCache.json']);
  assert.equal(result.url, undefined);
  assert.equal(s.writes.length, 0);
});

test('evaluator input safely escapes title and returns null without a preset', () => {
  const s = storage({ 'lockoutCache.json': cache() });
  const opened = run('app_open', s);
  const title = 'Work "focused" \\ day\n';
  const input = JSON.parse(run(['evaluator_input', opened, title], s));
  assert.equal(input.presetOverride, title);
  assert.deepEqual(input.cache, cache());
  assert.equal(JSON.parse(run(['evaluator_input', opened], s)).presetOverride, null);
});

test('reopening at alarm deadline reaches actual blocking rules', async () => {
  const c = cache();
  c.config.blocks = [{ id: 'task', type: 'task_block',
    times: { beg: '00:00', end: '00:00' },
    typeSpecific: { task_block_IDs: ['not_completed'] },
    onBlock: { message: 'Complete your task.' } }];
  const s = storage({ 'lockoutCache.json': c });
  run('begin_legitimate', s);
  const grant = run('app_open', s, new Date(+now + 60000));
  const deadline = new Date(grant.calendarEnd);
  const result = run('app_open', s, deadline);
  const input = JSON.parse(run(['evaluator_input', result], s, deadline));
  input.now = deadline.toISOString();
  const evaluator = vm.createContext({ Date, Intl });
  const core = fs.readFileSync(require.resolve('../lockouts.js'), 'utf8');
  vm.runInContext(core.replace(/await main\(\);\s*$/, ''), evaluator);
  assert.equal((await evaluator.lockoutsEvaluateNow(input)).status, 'blocked');
});

test('patches zero/false once and preserves snapshot age', () => {
  const c = cache(); c.extra = 'keep';
  const s = storage({ 'lockoutCache.json': c });
  const r = run(['cache_prepare', { metricsByID: [
    { metricID: 'a', value: 0 }, { metricID: 'b', value: false },
    { metricID: 'unknown', value: 9 }
  ] }], s);
  assert.equal(r.updatedState, 1);
  assert.equal(s.writes.length, 1);
  assert.equal(s.files['lockoutCache.json'].metricState.allByID.a.value, 0);
  assert.equal(s.files['lockoutCache.json'].metricState.allByID.b.value, false);
  assert.equal(s.files['lockoutCache.json'].lastUpdated, c.lastUpdated);
  assert.equal(s.files['lockoutCache.json'].extra, 'keep');
});

test('unchanged/missing metric values do not write; text responses work', () => {
  const s = storage({ 'lockoutCache.json': cache() });
  assert.equal(run(['cache_prepare', JSON.stringify({ metricsByID: [
    { metricID: 'a', value: '1' }, { metricID: 'b', value: null }
  ] })], s).updatedState, '');
  assert.equal(s.writes.length, 0);
});

test('no input fetches fresh cache; force and timezone changes obey 15-second throttle', () => {
  const s = storage({ 'settings.json': settings, 'lockoutCache.json': cache() });
  assert.ok(run(['cache_prepare'], s).url);
  for (const input of [undefined, 'fetch_new_cache']) {
    s.files['lockoutCache.json'] = cache(15000, '+0530');
    const r = run(['cache_prepare', input], s);
    assert.equal(r.url, undefined);
    assert.equal(r.notification, undefined);
  }
});

test('stale, future, previous-day, and malformed caches refresh', () => {
  for (const c of [cache(6 * 3600000), cache(-1000), null]) {
    const s = storage({ 'settings.json': settings, 'lockoutCache.json': c });
    assert.ok(run(['cache_prepare', { metricsByID: [] }], s).url);
  }
  const midnight = new Date(2026, 9, 5, 0, 10);
  const c = cache(); c.lastUpdated = new Date(+midnight - 30 * 60000).toISOString();
  c.virtualDay.timezoneOffsetRFC2822 = context.offset(midnight);
  assert.ok(run(['cache_prepare', { metricsByID: [] }],
    storage({ 'settings.json': settings, 'lockoutCache.json': c }), midnight).url);
  const s = storage({ 'settings.json': settings });
  s.read = name => { if (name === 'lockoutCache.json') throw new SyntaxError('bad JSON'); return s.files[name]; };
  assert.ok(run(['cache_prepare'], s).url);
});

test('timezone message and RFC 2822 client date support fractional offsets', () => {
  assert.equal(context.offsetMinutes('+0530') - context.offsetMinutes('+0400'), 90);
  assert.equal(context.offsetMinutes('+0545'), 345);
  assert.equal(context.offsetMinutes('-0330'), -210);
  assert.throws(() => context.offsetMinutes('+0560'));
  const previous = context.offset(now) === '+0545' ? '+0530' : '+0545';
  const r = run(['cache_prepare'], storage({ 'settings.json': settings,
    'lockoutCache.json': cache(60000, previous) }));
  const hours = (context.offsetMinutes(previous) - context.offsetMinutes(context.offset(now))) / 60;
  assert.match(r.notification, new RegExp(`${hours >= 0 ? '\\+' : ''}${hours}h`));
  // RFC 2822 transmits whole seconds.
  assert.equal(Date.parse(r.clientNow), Math.floor(+now / 1000) * 1000);
});

test('bad HTTP responses preserve previous cache; valid text or dictionary commits once', () => {
  const s = storage({ 'lockoutCache.json': cache() }); const before = clone(s.files);
  for (const response of ['<html>"Drive error"\n</html>', { schemaVersion: 'lockouts_cache_v1' },
    { ...cache(), ok: false }, { ...cache(), schemaVersion: 'unknown' }]) {
    assert.match(run(['cache_commit', response], s).notification, /retained/);
    assert.deepEqual(s.files, before);
    assert.equal(s.writes.length, 0);
  }
  assert.equal(Object.keys(run(['cache_commit', JSON.stringify(cache(0))], s)).length, 0);
  assert.equal(s.writes.length, 1);
});

test('corrupt state, missing settings, and unsupported old envelopes reject without mutation', () => {
  const s = storage({ 'lockouts.json': { unlockedUntil: 'bad' } });
  assert.throws(() => run('app_open', s), /Invalid lockouts/);
  assert.equal(s.writes.length, 0);
  assert.throws(() => run(['cache_prepare'], storage()), /settings missing/);
  assert.throws(() => run({ operation: 'lockouts.beginUnlock' }, storage()), /Unknown/);
});

test('entry point blocks unavailable iCloud files without waiting/downloading', async () => {
  let output, complete = false;
  const fm = { bookmarkedPath: () => '/Shortcuts', joinPath: (a,b) => a + '/' + b,
    fileExists: () => true, isFileDownloaded: () => false,
    downloadFileFromiCloud: () => assert.fail('No download allowed') };
  const sandbox = vm.createContext({ args: { shortcutParameter: ['app_open', 'Instagram'] },
    FileManager: { iCloud: () => fm },
    Request: function () { assert.fail('No network allowed'); },
    Script: { setShortcutOutput: r => { output = r; }, complete: () => { complete = true; } } });
  await vm.runInContext(`(async () => { ${source} })()`, sandbox);
  assert.equal(output.route, 'block');
  assert.match(output.notification, /not downloaded/);
  assert.equal(complete, true);
});

test('native POST fields are accepted by actual server request/offset parsers', () => {
  const server = vm.createContext({ Date, Session: { getScriptTimeZone: () => 'GMT' } });
  for (const file of ['Main.gs', 'Lockouts.gs']) {
    vm.runInContext(fs.readFileSync(require.resolve('../' + file), 'utf8'), server);
  }
  const r = run(['cache_prepare'], storage({ 'settings.json': settings }));
  const request = server.parseRequest_({ postData: { contents: JSON.stringify({
    key: 'config_snapshot', secret: r.secret, clientNow: r.clientNow
  }) } });
  assert.equal(request.ok, true);
  assert.equal(request.key, 'config_snapshot');
  assert.equal(request.secret, settings.openHabitsSecret);
  assert.equal(server.lockouts_parseClientNowOffset_(request.clientNow).timezoneOffsetRFC2822, context.offset(now));
});
