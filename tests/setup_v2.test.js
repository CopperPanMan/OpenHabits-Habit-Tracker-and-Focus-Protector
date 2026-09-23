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

test('allows add record type for stop timers but not other non-addable metrics', () => {
  const c = load();
  const timerSettings = { timerStartMetricID: 'timer_started', timerDurationMetricID: 'timer_duration' };
  const result = c.openHabitsValidateConfig_({ trackingSheetName: 'Tracking Data', metricSettings: [
    { metricID: 'stop', displayName: 'Stop', type: 'stop_timer', recordType: 'add', ifTimer_Settings: timerSettings },
    { metricID: 'start', displayName: 'Start', type: 'start_timer', recordType: 'add', ifTimer_Settings: timerSettings }
  ] });

  assert.equal(result.ok, false);
  assert.doesNotMatch(result.errors.join(' '), /metricSettings\[0\].*can only use add/);
  assert.match(result.errors.join(' '), /metricSettings\[1\] can only use add/);
});

test('config editor allows add record type for stop timers', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'docs', 'app.js'), 'utf8');
  assert.match(source, /\['number', 'duration', 'stop_timer'\]\.includes\(m\.type\)/);
});

test('config editor presents beginner-friendly metric fields and keeps implementation controls advanced', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'docs', 'app.js'), 'utf8');
  const basicStart = source.indexOf("g.className = 'grid metric-basics'");
  const advancedStart = source.indexOf('const advancedSummary', basicStart);
  const basicFields = source.slice(basicStart, advancedStart);
  const advancedFields = source.slice(advancedStart, source.indexOf("const dates = toggleSection", advancedStart));

  assert.ok(basicStart > -1 && advancedStart > basicStart);
  assert.match(basicFields, /'Display Name'/);
  assert.match(basicFields, /'Metric ID'/);
  assert.match(basicFields, /'What are you tracking\?'/);
  assert.match(basicFields, /'When today already has a value'/);
  assert.doesNotMatch(basicFields, /'Sheet Row Override'|'Timezone Behavior'/);
  assert.match(advancedFields, /'Sheet Row Override'/);
  assert.match(advancedFields, /'Timezone Behavior'/);
  assert.match(advancedFields, /if \(state\.writeToNotion\)/);
  assert.match(source, /metric\.metricID = normalizedMetricId\(metric\.displayName\)/);
  assert.match(source, /Regenerate from name/);
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

test('Sheet menu opens an owner-authorized import bridge to the canonical editor', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'SetupV2.gs'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'Main.gs'), 'utf8');
  const launcher = fs.readFileSync(path.join(__dirname, '..', 'SetupV2Launcher.html'), 'utf8');
  assert.match(source, /showSidebar\(template\.evaluate\(\)\.setTitle\('OpenHabits'\)\)/);
  assert.match(source, /OPENHABITS_CONFIG_EDITOR_URL/);
  assert.match(source, /openHabitsGetConfigBridgeData/);
  assert.doesNotMatch(source, /ScriptApp\.getService\(\)\.getUrl\(\)/);
  assert.doesNotMatch(main, /parameter\.openhabits === 'editor'/);
  assert.match(source, /addItem\('Add a Metric', 'openHabitsShowAddMetric'\)/);
  assert.match(launcher, /target="_blank"/);
  assert.match(launcher, /Open Config Editor/);
  assert.match(launcher, /openHabitsPreviewConfig/);
  assert.match(launcher, /openHabitsSaveAndApply/);
  assert.match(launcher, /accept="application\/json,\.json"/);
});

test('GitHub editor is the sole visual editor and exports first-class JSON', () => {
  const githubEditor = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
  for (const text of ['OpenHabits Config Editor', '1. Get Started', '2. Edit Config', 'Global', 'Metrics', 'Blocks']) {
    assert.match(githubEditor, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(githubEditor, /Import JSON File/);
  assert.match(githubEditor, /Download JSON/);
  assert.match(githubEditor, /Copy JSON/);
});

test('Shortcut metric text uses a searchable configured-metric multi-select', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'docs', 'app.js'), 'utf8');
  const shortcut = fs.readFileSync(path.join(__dirname, '..', 'docs', 'shortcut-qr.js'), 'utf8');

  assert.match(html, /id="shortcutMetricSearch"[^>]*type="search"/);
  assert.match(html, /id="shortcutMetricOptions"/);
  assert.doesNotMatch(html, /id="shortcutMetricIds"/);
  assert.match(app, /window\.OpenHabitsConfiguredMetrics = metricSummary/);
  assert.match(shortcut, /selectedMetricIds = new Set\(\)/);
  assert.match(shortcut, /openhabits:metrics-changed/);
  assert.match(shortcut, /window\.OpenHabitsConfiguredMetrics/);
});

test('public web endpoint does not expose configuration administration', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'SetupV2.gs'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'Main.gs'), 'utf8');
  assert.doesNotMatch(source, /openHabitsServeEditor_/);
  assert.doesNotMatch(source, /EDITOR_TOKEN/);
  assert.doesNotMatch(main, /openHabitsServeEditor_/);
});
