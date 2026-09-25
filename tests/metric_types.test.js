const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function load() {
  const context = vm.createContext({ console, Date, JSON, Math, Number, Object, String, Array, RegExp, isFinite, isNaN });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Main.gs'), 'utf8'), context);
  return context;
}

test('validates text as a first-class data value', () => {
  const c = load();
  assert.deepEqual(JSON.parse(JSON.stringify(c.validateMetricValueForRecord_('text', 'Dear diary'))), { ok: true, value: 'Dear diary' });
  assert.equal(c.validateMetricValueForRecord_('text', 42).ok, false);
});

test('rejects removed timer and due-by pseudo data types', () => {
  const c = load();
  for (const removed of ['start_timer', 'stop_timer', 'due_by']) {
    assert.equal(c.validateMetricValueForRecord_(removed, '00:05:00').ok, false);
  }
});

test('builds a duration write message from a client-supplied delta', () => {
  const c = load();
  assert.equal(
    c.buildDurationWriteMessage_({ metricID: 'work', displayName: 'Work' }, 22 * 60, 3 * 3600 + 47 * 60, 2.2, 24.7),
    'Added +22min! (0.37h) Work total: 3h 47min (+2.2pts = 24.7)'
  );
});

test('awards completion-style points for text', () => {
  const c = load();
  c.getMetricSettingById = () => ({ setting: { points: { value: 2 } } });
  assert.equal(c.calculatePointsDelta_('journal', 'text', 'Dear diary', null, 1.5), 3);
  assert.equal(c.calculatePointsDelta_('journal', 'text', '', null, 1.5), 0);
});
