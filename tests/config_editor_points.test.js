const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createFixture } = require('./helpers/apps_script_fixture');
const { loadEditor } = require('./helpers/config_editor_fixture');

const root = path.join(__dirname, '..');

function loadSetup() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'SetupV2.gs'), 'utf8'), context);
  return context;
}

test('enabling features generates separate editable IDs that follow metric ID changes', () => {
  const editor = loadEditor();
  const metric = editor.metricFromRecipe('number_replace');
  assert.equal(editor.pointsEnabled(metric), false);
  editor.setMetricId(metric, 'Water-Intake');
  editor.setFeatureEnabled(metric, 'points', true);
  editor.setFeatureEnabled(metric, 'streaks', true);
  assert.equal(metric.points.pointsID, 'Water-Intake_points');
  assert.equal(metric.streaks.streaksID, 'Water-Intake_streak');
  assert.equal(metric.points.value, 1);

  editor.setMetricId(metric, 'water');
  assert.equal(metric.points.pointsID, 'water_points');
  assert.equal(metric.streaks.streaksID, 'water_streak');
  editor.setSupportingId(metric, 'points', 'custom_award');
  editor.setSupportingId(metric, 'streaks', 'custom_streak');
  editor.setMetricId(metric, 'drinking');
  assert.equal(metric.points.pointsID, 'custom_award');
  assert.equal(metric.streaks.streaksID, 'custom_streak');
  editor.generateSupportingId(metric, 'points');
  assert.equal(metric.points.pointsID, 'drinking_points');
});

test('disabling points removes scoring as well as the storage ID', () => {
  const editor = loadEditor();
  const metric = editor.metricFromRecipe('completion');
  editor.setFeatureEnabled(metric, 'points', true);
  editor.setFeatureEnabled(metric, 'streaks', true);
  metric.points.value = -10;
  editor.setFeatureEnabled(metric, 'points', false);
  editor.setFeatureEnabled(metric, 'streaks', false);
  assert.equal(metric.points.value, 0);
  assert.equal(metric.points.pointsID, '');
  assert.equal(metric.streaks.streaksID, '');
  editor.setMetricId(metric, 'new_metric');
  assert.equal(metric.points.pointsID, '');
  assert.equal(metric.streaks.streaksID, '');
  assert.equal(editor.pointsEnabled(metric), false);
});

test('imports retain supporting IDs and repair missing IDs for positive and negative awards', () => {
  const editor = loadEditor();
  const imported = editor.ensureShape({ metricSettings: [
    { metricID: 'existing', points: { value: 2, pointsID: 'historic_award' }, streaks: { streaksID: 'historic_streak' } },
    { metricID: 'reward', points: { value: 2 } },
    { metricID: 'penalty', points: { value: -10 } },
    { metricID: 'disabled', points: { value: 0 } }
  ] });
  const [existing, reward, penalty, disabled] = imported.metricSettings;
  editor.setMetricId(existing, 'renamed');
  assert.equal(existing.points.pointsID, 'historic_award');
  assert.equal(existing.streaks.streaksID, 'historic_streak');
  assert.equal(reward.points.pointsID, 'reward_points');
  assert.equal(penalty.points.pointsID, 'penalty_points');
  assert.equal(penalty.points.value, -10);
  assert.equal(disabled.points.pointsID, '');
  assert.equal(disabled.streaks.streaksID, '');

  const starter = JSON.parse(fs.readFileSync(path.join(root, 'Examples/starter-config.json'), 'utf8'));
  const normalized = editor.ensureShape(starter);
  const supportingRows = metrics => Array.from(metrics, metric => ({
    metricID: metric.metricID,
    pointsID: (metric.points || {}).pointsID || '',
    streaksID: (metric.streaks || {}).streaksID || ''
  }));
  assert.deepEqual(supportingRows(normalized.metricSettings), supportingRows(starter.metricSettings));
});

test('duplicates keep features enabled using their own supporting rows', () => {
  const editor = loadEditor();
  editor.setState({ metricSettings: [{ metricID: 'water', displayName: 'Water', dataType: 'number',
    points: { value: 3, pointsID: 'custom_award' }, streaks: { streaksID: 'custom_streak' } }] });
  editor.duplicateMetric(editor.getState().metricSettings[0], 0);
  editor.duplicateMetric(editor.getState().metricSettings[0], 0);
  const [original, secondCopy, firstCopy] = editor.getState().metricSettings;
  assert.equal(original.points.pointsID, 'custom_award');
  assert.equal(firstCopy.metricID, 'water_copy');
  assert.equal(secondCopy.metricID, 'water_copy_2');
  for (const copy of [firstCopy, secondCopy]) {
    assert.equal(copy.points.value, 3);
    assert.equal(copy.points.pointsID, copy.metricID + '_points');
    assert.equal(copy.streaks.streaksID, copy.metricID + '_streak');
  }
  assert.deepEqual(Array.from(editor.validateState()), []);
});

test('undo and redo retain generated ID tracking and custom overrides', () => {
  const editor = loadEditor();
  const metric = editor.metricFromRecipe('completion');
  editor.setState({ metricSettings: [metric] });
  const current = () => editor.getState().metricSettings[0];
  editor.withHistory(() => editor.setFeatureEnabled(current(), 'points', true));
  editor.withHistory(() => editor.setSupportingId(current(), 'points', 'custom'));
  editor.undo();
  assert.equal(current().points.pointsID, 'completion_points');
  editor.redo();
  editor.withHistory(() => editor.setMetricId(current(), 'renamed'));
  assert.equal(current().points.pointsID, 'custom');
  editor.undo();
  editor.undo();
  editor.withHistory(() => editor.setMetricId(current(), 'another'));
  assert.equal(current().points.pointsID, 'another_points');
});

test('editor and Sheet validation reject colliding and invalid storage IDs consistently', () => {
  const editor = loadEditor();
  const setup = loadSetup();
  const base = () => ({ trackingSheetName: 'Tracking Data', dailyPointsID: 'daily', cumulativePointsID: 'all', metricSettings: [
    { metricID: 'water', displayName: 'Water', dataType: 'number', points: { value: 1, pointsID: 'water_points' }, streaks: { streaksID: 'water_streak' } },
    { metricID: 'exercise', displayName: 'Exercise', dataType: 'duration', points: { value: 2, pointsID: 'exercise_points' } }
  ], lockouts: { globals: { timeOpenedID: 'opened', cumulativeScreentimeID: 'screen_all' } } });
  const cases = [
    config => { config.metricSettings[0].points.pointsID = 'water'; },
    config => { config.metricSettings[0].streaks.streaksID = 'exercise'; },
    config => { config.metricSettings[1].points.pointsID = 'water_points'; },
    config => { config.metricSettings[0].streaks.streaksID = 'water_points'; },
    config => { config.metricSettings[0].points.pointsID = 'daily'; },
    config => { config.metricSettings[0].points.pointsID = 'all'; },
    config => { config.metricSettings[0].streaks.streaksID = 'screen_all'; },
    config => { config.dailyPointsID = 'water'; },
    config => { config.cumulativePointsID = 'daily'; },
    config => { config.metricSettings[0].points.pointsID = 'has spaces'; },
    config => { config.metricSettings[0].streaks.streaksID = 123; },
    config => { config.metricSettings[0].points.pointsID = ''; },
    config => { config.metricSettings[0].points.value = -1; delete config.metricSettings[0].points.pointsID; },
    config => { config.metricSettings[0].metricID = 'water '; config.metricSettings[0].points.pointsID = 'water'; }
  ];
  assert.equal(setup.openHabitsValidateConfig_(base()).ok, true);
  for (const mutate of cases) {
    const config = base();
    mutate(config);
    const browserErrors = Array.from(editor.validateStorageIds(config));
    const serverErrors = Array.from(setup.openHabitsValidateStorageIds_(config));
    assert.ok(browserErrors.length > 0, JSON.stringify(config));
    assert.deepEqual(browserErrors, serverErrors);
    assert.equal(setup.openHabitsValidateConfig_(config).ok, false);
    assert.equal(setup.openHabitsSaveAndApply(JSON.stringify(config)).ok, false);
  }
});

test('generated rows keep measurements separate and score repeated replacements by the difference', () => {
  const editor = loadEditor();
  const setup = loadSetup();
  const metric = editor.metricFromRecipe('number_replace');
  editor.setMetricId(metric, 'water');
  editor.setFeatureEnabled(metric, 'points', true);
  editor.setFeatureEnabled(metric, 'streaks', true);
  metric.points.value = 3;
  const config = { trackingSheetName: 'Tracking Data', dailyPointsID: 'daily', cumulativePointsID: 'cumulative', metricSettings: [metric] };
  assert.equal(setup.openHabitsValidateConfig_(config).ok, true);
  const plan = setup.openHabitsPlanReconciliation_(config, []);
  assert.deepEqual(Array.from(plan.missing, row => row.id).sort(), ['cumulative', 'daily', 'water', 'water_points', 'water_streak']);

  const fixture = createFixture({ metrics: [JSON.parse(JSON.stringify(metric))], days: 0 });
  assert.equal(fixture.post([['water', 2]]).pointsDelta, 6);
  assert.equal(fixture.post([['water', 3]]).pointsDelta, 3);
  assert.equal(fixture.post([['water', 3]]).pointsDelta, 0);
  assert.equal(fixture.get('water'), 3);
  assert.equal(fixture.get('water_points'), 9);
  assert.equal(fixture.get('water_streak'), 1);
  assert.equal(fixture.get('daily'), 9);
  assert.equal(fixture.get('cumulative'), 9);
});

test('new points use a 20% bonus default while imported scoring retains its configured multiplier', () => {
  const editor = loadEditor();
  const metric = editor.metricFromRecipe('completion');
  editor.setFeatureEnabled(metric, 'points', true);
  assert.equal(metric.points.maxMultiplier, 1.2);
  assert.equal(metric.points.multiplierDays, 5);
  for (const maxMultiplier of [0, 1, 1.5, 2]) {
    editor.setState({ metricSettings: [{ metricID: 'existing', points: { value: 0, maxMultiplier } }] });
    const existing = editor.getState().metricSettings[0];
    editor.setFeatureEnabled(existing, 'points', true);
    assert.equal(existing.points.maxMultiplier, maxMultiplier);
    editor.setFeatureEnabled(existing, 'points', false);
    editor.setFeatureEnabled(existing, 'points', true);
    assert.equal(existing.points.maxMultiplier, maxMultiplier);
  }
  const imported = editor.ensureShape({ metricSettings: [
    { metricID: 'old_scoring', points: { value: 2 } },
    { metricID: 'not_configured' }
  ] });
  assert.equal(imported.metricSettings[0].points.maxMultiplier, 1);
  editor.setFeatureEnabled(imported.metricSettings[1], 'points', true);
  assert.equal(imported.metricSettings[1].points.maxMultiplier, 1.2);
});

test('the new bonus reaches 20% after five prior streak days without requiring a separate streak row', () => {
  const editor = loadEditor();
  const metric = editor.metricFromRecipe('number_replace');
  editor.setFeatureEnabled(metric, 'points', true);
  const fixture = createFixture({ metrics: [JSON.parse(JSON.stringify(metric))], days: 5,
    history: (id, daysBack) => daysBack > 0 ? 1 : '' });
  const response = fixture.post([[metric.metricID, 10]]);
  assert.equal(response.pointsDelta, 12);
  assert.equal(response.metricsByID[0].multiplier, 1.2);
  assert.equal(metric.streaks.streaksID, '');
});
