const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ Date, Intl });
const source = fs.readFileSync(require.resolve('../OpenHabits Runtime.js'), 'utf8');
vm.runInContext(source.replace(/await main\(\);\s*$/, ''), context);
const plain = value => JSON.parse(JSON.stringify(value));
const now = new Date(2026, 9, 6, 12, 0);
const day = (n = 0) => new Date(2026, 9, 6 + n);
const event = (title, n = 0, length = 1) => ({ title, isAllDay: true, startDate: day(n), endDate: day(n + length) });
function store() {
  const files = { 'settings.json': { untouched: true }, 'lockoutCache.json': {
    ok: true, schemaVersion: 'lockouts_cache_v1', lastUpdated: now.toISOString(),
    virtualDay: { timezoneOffsetRFC2822: context.offset(now) },
    config: { globals: { barLength: 20, presetCalendarName: 'App Lockout Settings' }, blocks: [{
      id: 'plan', type: 'task_block', presets: ['workday'],
      times: { beg: '00:00', end: '00:00' }, typeSpecific: { task_block_IDs: ['day_plan'] },
      onBlock: { message: 'Plan your day.' }
    }] }, metricState: { allByID: {} }
  } };
  return { files, writes: [], read(name) { return files[name] ? plain(files[name]) : null; },
    write(name, value) { files[name] = plain(value); this.writes.push(name); } };
}
function calendar(events = []) {
  const read = async (name, start, end) => { read.calls.push({ name, start, end }); return events; };
  read.calls = []; return read;
}
const run = (input, s, at, read) => context.dispatchManaged(input, s, at, read);
async function evaluate(opened, title, s, at, read) {
  return JSON.parse(await run(['evaluator_input', opened, title], s, at, read));
}
async function status(input, at = now) {
  const evaluator = vm.createContext({ Date, Intl });
  vm.runInContext(fs.readFileSync(require.resolve('../lockouts.js'), 'utf8').replace(/await main\(\);\s*$/, ''), evaluator);
  return (await evaluator.lockoutsEvaluateNow({ ...input, now: at.toISOString() })).status;
}

test('forecast runs once per local day and covers today plus seven future days, including multi-day events', async () => {
  const s = store(), read = calendar([event('workday', 0, 2), event('weekend', 7)]);
  await run('app_open', s, now, read);
  await run('app_open', s, new Date(+now + 1000), read);
  assert.equal(read.calls.length, 1);
  assert.equal(+read.calls[0].start, +day());
  assert.equal(+read.calls[0].end, +day(8));
  const registry = s.files['presetRegistry.json'];
  assert.equal(Object.keys(registry.days).length, 8);
  assert.equal(registry.days['2026-10-07'].expected, 'workday');
  assert.equal(registry.days['2026-10-13'].expected, 'weekend');
  assert.deepEqual(s.files['settings.json'], { untouched: true });
});

test('a day with no expected preset allows through normal evaluation and leaves persisted cache intact', async () => {
  const s = store(), read = calendar();
  const opened = await run('app_open', s, now, read);
  const input = await evaluate(opened, '', s, now, read);
  assert.equal(input.presetOverride, null);
  assert.deepEqual(input.cache.config.blocks, []);
  assert.equal(await status(input), 'allowed');
  assert.equal(s.files['lockoutCache.json'].config.blocks.length, 1);
});

test('deletion keeps the expected rules for two minutes across repeated openings, then clears on confirmed absence', async () => {
  const s = store();
  await run('app_open', s, now, calendar([event('workday')]));
  const read = calendar();
  for (const elapsed of [0, 30000, 119999, 120000, 180000]) {
    const at = new Date(+now + elapsed);
    const opened = await run('app_open', s, at, read);
    const input = await evaluate(opened, '', s, at, read);
    assert.equal(await status(input, at), elapsed < 120000 ? 'blocked' : 'allowed');
    if (elapsed < 120000) {
      assert.equal(input.presetOverride, 'workday');
      assert.match(input.cache.config.blocks[0].onBlock.message, /Use Allowed/);
      assert.equal(s.files['presetRegistry.json'].days['2026-10-06'].missingSince, now.toISOString());
    }
  }
  assert.equal(s.files['presetRegistry.json'].days['2026-10-06'].cleared, true);
  assert.equal(s.files['lockoutCache.json'].config.blocks[0].onBlock.message, 'Plan your day.');
});

test('replacement presets apply immediately and returning events cancel the deletion hold', async () => {
  const s = store(), read = calendar([event('workday')]);
  const opened = await run('app_open', s, now, read);
  await evaluate(opened, '', s, now, calendar());
  const input = await evaluate(opened, 'weekend', s, new Date(+now + 1000), read);
  assert.equal(input.presetOverride, 'weekend');
  assert.equal(await status(input), 'allowed');
  const entry = s.files['presetRegistry.json'].days['2026-10-06'];
  assert.equal(entry.missingSince, null);
  assert.equal(entry.expected, 'weekend');
  assert.equal((await evaluate(opened, 'workday', s, new Date(+now + 120000), read)).presetOverride, 'workday');
});

test('future deletion survives daily refresh and starts its hold on that scheduled day', async () => {
  const s = store();
  await run('app_open', s, now, calendar([event('workday', 1)]));
  const tomorrow = new Date(2026, 9, 7, 12);
  const read = calendar();
  const opened = await run('app_open', s, tomorrow, read);
  assert.equal(s.files['presetRegistry.json'].days['2026-10-07'].expected, 'workday');
  const input = await evaluate(opened, '', s, tomorrow, read);
  assert.equal(await status(input, tomorrow), 'blocked');
  assert.equal(s.files['presetRegistry.json'].days['2026-10-07'].missingSince, tomorrow.toISOString());
  assert.equal(s.files['presetRegistry.json'].days['2026-10-06'], undefined);
});

test('refresh and stale forecasts cannot reset a running hold or restore a cleared preset', async () => {
  const s = store();
  let opened = await run('app_open', s, now, calendar([event('workday')]));
  await evaluate(opened, '', s, now, calendar());
  s.files['presetRegistry.json'].lastForecastKey = 'previous timezone';
  opened = await run('app_open', s, new Date(+now + 10000), calendar([event('workday')]));
  assert.equal(s.files['presetRegistry.json'].days['2026-10-06'].missingSince, now.toISOString());
  await evaluate(opened, '', s, new Date(+now + 120000), calendar());
  s.files['presetRegistry.json'].lastForecastKey = 'previous timezone';
  opened = await run('app_open', s, new Date(+now + 121000), calendar([event('workday')]));
  assert.equal((await evaluate(opened, '', s, new Date(+now + 121000), calendar())).presetOverride, null);
  assert.equal((await evaluate(opened, 'workday', s, new Date(+now + 122000), calendar())).presetOverride, 'workday');
});

test('calendar failures never clear expectations; countdown expiry requires successful confirmation', async () => {
  const s = store();
  const opened = await run('app_open', s, now, calendar([event('workday')]));
  await evaluate(opened, '', s, now, calendar());
  const before = plain(s.files);
  const failed = async () => { throw new Error('Calendar permission denied'); };
  await assert.rejects(() => evaluate(opened, '', s, new Date(+now + 120000), failed), /permission denied/);
  assert.deepEqual(s.files, before);
  s.files['presetRegistry.json'].lastForecastKey = '';
  await assert.rejects(() => run('app_open', s, now, failed), /permission denied/);
  assert.equal(s.files['presetRegistry.json'].days['2026-10-06'].expected, 'workday');
});

test('configured calendar is authoritative over the existing native default-calendar query', async () => {
  const s = store(); s.files['lockoutCache.json'].config.globals.presetCalendarName = 'My Modes';
  const read = calendar([event('workday')]);
  const opened = await run('app_open', s, now, read);
  assert.equal((await evaluate(opened, 'weekend', s, now, read)).presetOverride, 'workday');
  assert.ok(read.calls.every(call => call.name === 'My Modes'));
});

test('temporary unlocks and their grants skip calendar and registry I/O, even if unavailable', async () => {
  const s = store();
  await run('begin_penalty', s, now);
  const failed = async () => assert.fail('No calendar during a temporary unlock');
  const grant = await run('app_open', s, new Date(+now + 30000), failed);
  assert.equal(grant.route, 'allow');
  assert.doesNotMatch(grant.notification, /10|deducted/);
  assert.equal((await run('app_open', s, new Date(+now + 31000), failed)).route, 'allow');
  assert.equal(s.files['presetRegistry.json'], undefined);
});

test('task-block recursion carries managed policy without forecasting or touching unlock state', async () => {
  const s = store();
  await run('app_open', s, now, calendar([event('workday')]));
  const read = calendar();
  s.files['lockouts.json'] = { corrupt: true };
  const opened = await run(['app_open', 'task_block'], s, now, read);
  assert.equal(read.calls.length, 0);
  assert.equal(opened.presetPolicy, 'openhabits_preset_registry_v1');
  const input = await evaluate(opened, '', s, now, read);
  assert.equal(await status(input), 'blocked');
});

test('ambiguous calendars, invalid registries, and conflicting all-day events reject safely', async () => {
  const s = store();
  await assert.rejects(() => run('app_open', s, now, calendar([event('workday'), event('weekend')])), /one all-day preset/);
  assert.equal(s.files['presetRegistry.json'], undefined);
  s.files['presetRegistry.json'] = { schemaVersion: 'old', days: {} };
  await assert.rejects(() => run('app_open', s, now, calendar()), /Invalid presetRegistry/);
  const api = vm.createContext({ Date, Calendar: { forEvents: async () => [] } });
  vm.runInContext(source.replace(/await main\(\);\s*$/, ''), api);
  await assert.rejects(() => api.readPresetEvents('App Lockout Settings', day(), day(1)), /No calendar named 'App Lockout Settings'/);
});

// Exercise the real async entry point, not only command helpers.
test('Scriptable entry point persists the forecast and returns a managed evaluation result', async () => {
  const s = store(); let output, completed = false;
  const fm = { bookmarkedPath: () => '/Shortcuts', joinPath: (a, b) => a + '/' + b,
    fileExists: path => !!s.files[path.split('/').pop()] || path.endsWith('OpenHabits Metrics'),
    isFileDownloaded: () => true, readString: path => JSON.stringify(s.files[path.split('/').pop()]),
    writeString: (path, text) => s.write(path.split('/').pop(), JSON.parse(text)) };
  const sandbox = vm.createContext({ Date, Intl, args: { shortcutParameter: 'app_open' },
    FileManager: { iCloud: () => fm }, Calendar: { forEvents: async () => [{ title: 'App Lockout Settings' }] },
    CalendarEvent: { between: async () => [] },
    Script: { setShortcutOutput: value => { output = value; }, complete: () => { completed = true; } } });
  await vm.runInContext(`(async () => { ${source} })()`, sandbox);
  assert.equal(output.route, 'evaluate');
  assert.equal(output.presetPolicy, 'openhabits_preset_registry_v1');
  assert.equal(completed, true);
  assert.equal(s.files['presetRegistry.json'].schemaVersion, 'openhabits_preset_registry_v1');
});

test('calendar setup errors give distinct missing, duplicate, and access instructions', async () => {
  const read = async (calendars, between = async () => []) => {
    const api = vm.createContext({ Date, Calendar: { forEvents: calendars }, CalendarEvent: { between } });
    vm.runInContext(source.replace(/await main\(\);\s*$/, ''), api);
    return api.readPresetEvents('My Modes', day(), day(1));
  };
  await assert.rejects(() => read(async () => []), error => {
    assert.match(error.message, /No calendar named 'My Modes'/);
    assert.match(error.message, /Create it in Calendar/);
    assert.match(error.message, /all-day events, one per day/);
    assert.match(error.message, /allow Scriptable access/);
    return true;
  });
  await assert.rejects(() => read(async () => [{ title: 'My Modes' }, { title: 'My Modes' }]), /More than one calendar.*Rename the extra/);
  await assert.rejects(() => read(async () => { throw new Error('denied'); }), /could not read your calendars.*calendar access for Scriptable in Settings/);
  await assert.rejects(() => read(async () => [{ title: 'My Modes' }], async () => { throw new Error('events denied'); }), /could not read your calendars/);
  let queried;
  await read(async () => [{ title: 'Other' }, { title: 'My Modes' }], async (start, end, calendars) => { queried = calendars; return []; });
  assert.deepEqual(queried, [{ title: 'My Modes' }]);
});
