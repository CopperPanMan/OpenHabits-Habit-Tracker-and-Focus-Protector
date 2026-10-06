const assert = require('node:assert/strict');
const test = require('node:test');
const { loadEditor } = require('./helpers/config_editor_fixture');
const { createFixture } = require('./helpers/apps_script_fixture');

const plain = value => JSON.parse(JSON.stringify(value));

test('weekday-only schedules work without enabling suggestions or requiring hours', () => {
  const editor = loadEditor();
  editor.setState({ metricSettings: [{ metricID: 'habit', displayName: 'Habit', dataType: 'number', dates: ['tuesday', ['Friday', '']] }] });
  const metric = editor.getState().metricSettings[0];
  assert.equal(editor.promptsEnabled(metric), false);
  assert.deepEqual(plain(metric.dates), [['Tuesday', ''], ['Friday', '']]);
  assert.deepEqual(Array.from(editor.validateState()), []);
});

test('imports and disables preserve legacy and multiple prompt windows and due times', () => {
  const editor = loadEditor();
  const dates = [['Tuesday', '22:00', 20, 2], ['Friday', '21:00', [[8.5, 10], [16, 18]]]];
  editor.setState({ metricSettings: [
    { metricID: 'habit', displayName: 'Habit', dataType: 'timestamp', dates, ppnMessage: ['Continue:', 'Do your habit.'] },
    { metricID: 'other', displayName: 'Other', dataType: 'number', ppnMessage: 'Do this habit. Current streak:' }
  ] });
  const [metric, other] = editor.getState().metricSettings;
  assert.deepEqual(plain(metric.dates), dates);
  assert.deepEqual(plain(metric.ppnMessage), ['Continue:', 'Do your habit.']);
  assert.equal(other.ppnMessage, 'Do this habit. Current streak:');
  assert.deepEqual(Array.from(editor.validateState()), []);
  editor.withHistory(() => editor.setPromptsEnabled(metric, false));
  assert.equal(editor.promptsEnabled(metric), false);
  assert.deepEqual(plain(metric.dates), dates);
  editor.undo();
  assert.deepEqual(plain(editor.getState().metricSettings[0].ppnMessage), ['Continue:', 'Do your habit.']);
  editor.redo();
  assert.equal(editor.promptsEnabled(editor.getState().metricSettings[0]), false);
});

test('editing windows preserves their representation and supports adding or removing ranges', () => {
  const editor = loadEditor();
  const rule = ['Tuesday', '22:00', 8, 10];
  editor.setPromptRanges(rule, [[8.5, 11]]);
  assert.deepEqual(rule, ['Tuesday', '22:00', 8.5, 11]);
  editor.setPromptRanges(rule, [[8.5, 11], [20, 2]]);
  assert.deepEqual(rule, ['Tuesday', '22:00', [[8.5, 11], [20, 2]]]);
  editor.setPromptRanges(rule, [[20, 2]]);
  assert.deepEqual(rule, ['Tuesday', '22:00', [[20, 2]]]);
  editor.setPromptRanges(rule, []);
  assert.deepEqual(rule, ['Tuesday', '22:00']);
  assert.deepEqual(plain(editor.getPromptRanges(rule)), []);
});

test('validation accepts multiple and overnight windows and rejects invalid hours', () => {
  const editor = loadEditor();
  const metric = { metricID: 'habit', displayName: 'Habit', dataType: 'number' };
  for (const range of [[8.5, 10], [20, 2], [0, 24]]) {
    editor.setState({ metricSettings: [{ ...metric, dates: [['Tuesday', '', [range]]] }] });
    assert.deepEqual(Array.from(editor.validateState()), []);
  }
  for (const range of [[-1, 10], [10, 25], ['eight', 10], [8], [null, 10]]) {
    editor.setState({ metricSettings: [{ ...metric, dates: [['Tuesday', '', [range]]] }] });
    assert.match(editor.validateState().join(' '), /suggestion start\/end hours must be numbers from 0 to 24/);
  }
});

test('edited suggestions use the existing endpoint, preserve logging, and follow configuration order', () => {
  const editor = loadEditor();
  editor.setState({ lateExtensionHours: 0, metricSettings: [
    { metricID: 'morning', displayName: 'Morning', dataType: 'number', dates: [['Tuesday', '', 8, 10]] },
    { metricID: 'work', displayName: 'Work', dataType: 'number', dates: [['Tuesday', '', [[8, 10], [12, 18]]]] }
  ] });
  const metrics = editor.getState().metricSettings;
  metrics.forEach(metric => editor.setPromptsEnabled(metric, true));
  const fixture = createFixture({ metrics: plain(metrics), days: 0 });
  const first = fixture.post(null, 'positive_push_notification');
  assert.equal(first.metricsByID[0].metricID, 'work');
  assert.match(first.messages[0], /Complete Work/);
  // An ordinary recording still succeeds outside the metric's suggestion window.
  assert.equal(fixture.post([['morning', 1]]).metricsByID[0].status, 'written');
  assert.equal(fixture.get('morning'), 1);
  fixture.setNow('2026-10-06T09:00:00Z');
  fixture.set('morning', '');
  assert.equal(fixture.post(null, 'positive_push_notification').metricsByID[0].metricID, 'morning');
  fixture.set('morning', 1);
  assert.equal(fixture.post(null, 'positive_push_notification').metricsByID[0].metricID, 'work');
  fixture.set('work', 1);
  assert.equal(fixture.post(null, 'positive_push_notification').metricsByID.length, 0);
});
