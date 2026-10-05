const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'Examples/starter-config.json'), 'utf8'));

function load() {
  const context = vm.createContext({ console, Date, JSON, Math, Number, Object, String, Array, RegExp, isFinite, isNaN });
  for (const file of ['Main.gs', 'SetupV2.gs']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  context.getAppConfig = () => config;
  return context;
}

test('starter imports without warnings and supplies every documented row', () => {
  const c = load();
  const validation = c.openHabitsValidateConfig_(config);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  assert.deepEqual(Array.from(validation.warnings), []);
  const rows = Array.from(c.openHabitsCollectRequiredRows_(config), row => row.id);
  assert.deepEqual(rows.sort(), [
    'focus_duration', 'focus_points', 'point_total_alltime', 'point_total_today',
    'started_day', 'started_day_points', 'started_day_streak', 'water', 'water_points'
  ]);
  const preparation = fs.readFileSync(path.join(root, 'Examples/starter-template.md'), 'utf8');
  for (const id of rows) assert.ok(preparation.includes('`' + id + '`'), id);
  assert.equal(config.writeToNotion, false);
  assert.deepEqual(config.lockouts.blocks, []);
});

test('starter logger inputs and point units agree with the server', () => {
  const c = load();
  for (const id of ['started_day', 'water', 'focus_duration']) {
    const metric = c.getMetricSettingById(id).setting;
    assert.ok(metric, id);
    assert.equal(c.getMultiplier_(id, 10), 1);
  }
  assert.equal(c.getMetricSettingById('started_day').setting.recordType, 'keep_first');
  assert.equal(c.validateMetricValueForRecord_('timestamp', null).ok, true);
  assert.equal(c.getMetricSettingById('water').setting.recordType, 'add');
  assert.equal(c.validateMetricValueForRecord_('number', 1).value, 1);
  assert.equal(c.validateMetricValueForRecord_('number', null).ok, false);
  assert.equal(c.calculatePointsDelta_('water', 'number', 2, null, 1), 2);
  assert.equal(c.getMetricSettingById('focus_duration').setting.recordType, 'add');
  assert.equal(c.validateMetricValueForRecord_('duration', '00:30:00').ok, true);
  assert.equal(c.calculatePointsDelta_('focus_duration', 'duration', '00:30:00', null, 1), 3);
});
