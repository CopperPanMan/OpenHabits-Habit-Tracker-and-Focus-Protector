const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function load() {
  const context = vm.createContext({ console, JSON, Object, Array, String, Number, Date });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'SetupV2.gs'), 'utf8'), context);
  return context;
}

test('validates config IDs and timer requirements', () => {
  const c = load();
  const result = c.openHabitsValidateConfig_({ trackingSheetName: 'Tracking Data', metricSettings: [
    { metricID: 'same', displayName: 'One', type: 'number' },
    { metricID: 'same', displayName: 'Two', type: 'start_timer', ifTimer_Settings: {} }
  ] });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /Duplicate metricID/);
  assert.match(result.errors.join(' '), /timer rows are incomplete/);
});

test('collects every primary, derived, points, and lockout row once', () => {
  const c = load();
  const rows = c.openHabitsCollectRequiredRows_({
    dailyPointsID: 'daily', cumulativePointsID: 'all', metricSettings: [{ metricID: 'focus_start', displayName: 'Focus', streaks: { streaksID: 'streak' }, points: { pointsID: 'points' }, ifTimer_Settings: { timerStartMetricID: 'timer_started', timerDurationMetricID: 'timer_minutes' } }],
    lockouts: { globals: { cumulativeScreentimeID: 'screen_all', timeOpenedID: 'opened' }, blocks: [{ id: 'social', typeSpecific: { duration: { screenTimeID: 'social_time' }, task_block_IDs: ['focus_start'], firstXMinutes: { timestampID: 'wake' } } }] }
  });
  assert.deepEqual(Array.from(rows, row => row.id).sort(), ['all','daily','focus_start','opened','points','screen_all','social_time','streak','timer_minutes','timer_started','wake']);
});

test('reconciliation appends only missing rows, reports duplicates, and retains history', () => {
  const c = load();
  const config = { metricSettings: [{ metricID: 'one', displayName: 'One' }, { metricID: 'two', displayName: 'Two' }] };
  const plan = c.openHabitsPlanReconciliation_(config, [['one', 'One'], ['one', 'duplicate'], ['old', 'History']]);
  assert.equal(plan.ok, false);
  assert.deepEqual(Array.from(plan.missing, row => row.id), ['two']);
  assert.deepEqual(Array.from(plan.duplicates), ['one']);
  assert.deepEqual(Array.from(plan.retainedUnreferenced), ['old']);
});

test('rejects unsafe metric IDs and duplicate focus-rule IDs', () => {
  const c = load();
  const result = c.openHabitsValidateConfig_({
    trackingSheetName: 'Tracking Data',
    metricSettings: [{ metricID: 'has spaces', displayName: 'Unsafe' }],
    lockouts: { blocks: [{ id: 'social' }, { id: 'social' }] }
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /only contain letters/);
  assert.match(result.errors.join(' '), /Duplicate lockout block ID/);
});

test('validates lockout block collection shape without throwing', () => {
  const c = load();
  const result = c.openHabitsValidateConfig_({
    trackingSheetName: 'Tracking Data', metricSettings: [], lockouts: { blocks: {} }
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /lockouts.blocks must be an array/);
});

test('Sheet menu links the lightweight sidebar to a full-page web app editor', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'SetupV2.gs'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'Main.gs'), 'utf8');
  const launcher = fs.readFileSync(path.join(__dirname, '..', 'SetupV2Launcher.html'), 'utf8');
  assert.match(source, /showSidebar\(template\.evaluate\(\)\.setTitle\('OpenHabits'\)\)/);
  assert.match(source, /ScriptApp\.getService\(\)\.getUrl\(\)/);
  assert.match(source, /CacheService\.getScriptCache\(\)\.put/);
  assert.match(main, /parameter\.openhabits === 'editor'/);
  assert.match(source, /addItem\('Add a Metric', 'openHabitsShowAddMetric'\)/);
  assert.match(launcher, /target="_blank"/);
  assert.doesNotMatch(source, /showModelessDialog/);
  assert.doesNotMatch(launcher, /openHabitsSaveAndApply/);
});

test('full-page editor links are deployment-aware and short-lived', () => {
  const c = load();
  let cached;
  c.ScriptApp = { getService: () => ({ getUrl: () => 'https://script.google.com/example/exec' }) };
  c.Utilities = { getUuid: () => 'uuid-' };
  c.CacheService = { getScriptCache: () => ({ put: (...args) => { cached = args; } }) };
  const urls = c.openHabitsCreateEditorUrls_();
  assert.equal(urls.available, true);
  assert.equal(urls.edit, 'https://script.google.com/example/exec?openhabits=editor&token=uuid-uuid-&mode=edit');
  assert.equal(urls.add, 'https://script.google.com/example/exec?openhabits=editor&token=uuid-uuid-&mode=add');
  assert.deepEqual(cached, ['openhabits-editor-token-uuid-uuid-', 'allowed', 600]);

  c.ScriptApp = { getService: () => ({ getUrl: () => null }) };
  assert.equal(c.openHabitsCreateEditorUrls_().available, false);
});
