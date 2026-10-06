const assert = require('node:assert/strict');
const test = require('node:test');
const { loadEditor } = require('./helpers/config_editor_fixture');

const plain = value => JSON.parse(JSON.stringify(value));

test('weekday-only schedules need no start or end hours', () => {
  const editor = loadEditor();
  editor.setState({ metricSettings: [{ metricID: 'habit', displayName: 'Habit', dataType: 'number', dates: ['tuesday', ['Friday', '']] }] });
  const metric = editor.getState().metricSettings[0];
  assert.deepEqual(plain(metric.dates), [['Tuesday', ''], ['Friday', '']]);
  assert.deepEqual(Array.from(editor.validateState()), []);
});

test('imports and unrelated edits preserve legacy schedule data through undo and redo', () => {
  const editor = loadEditor();
  const dates = [['Tuesday', '22:00', 20, 2], ['Friday', '21:00', [[8.5, 10], [16, 18]]]];
  editor.setState({ metricSettings: [{ metricID: 'habit', displayName: 'Habit', dataType: 'timestamp', dates, ppnMessage: ['Continue:', 'Do your habit.'] }] });
  const metric = editor.getState().metricSettings[0];
  editor.withHistory(() => { metric.displayName = 'Updated habit'; });
  for (const action of [() => {}, () => editor.undo(), () => editor.redo()]) {
    action();
    assert.deepEqual(plain(editor.getState().metricSettings[0].dates), dates);
    assert.deepEqual(plain(editor.getState().metricSettings[0].ppnMessage), ['Continue:', 'Do your habit.']);
    assert.deepEqual(Array.from(editor.validateState()), []);
  }
});

test('completion recipe is explicit, stays numeric, and survives import and duplication', () => {
  const editor = loadEditor();
  const completion = editor.metricFromRecipe('completion');
  const rating = editor.metricFromRecipe('number_replace');
  assert.equal(completion.dataType, 'number');
  assert.equal(completion.inputMode, 'completion');
  assert.equal(rating.inputMode, undefined);
  editor.setState({ metricSettings: [plain(completion), plain(rating)] });
  editor.duplicateMetric(editor.getState().metricSettings[0], 0);
  assert.equal(editor.getState().metricSettings[1].inputMode, 'completion');
  assert.deepEqual(Array.from(editor.validateState()), []);
});

test('imported block IDs survive duplication, edits, undo, and redo without exposing an ID field', () => {
  const editor = loadEditor();
  editor.setState({ lockouts: { blocks: [{ id: 'existing_id', name: 'Plan' }] } });
  const block = editor.getState().lockouts.blocks[0];
  editor.withHistory(() => editor.duplicateBlock(block, 0));
  assert.equal(editor.getState().lockouts.blocks[0].id, 'existing_id');
  assert.equal(editor.getState().lockouts.blocks[1].id, 'existing_id_copy');
  editor.undo();
  assert.equal(editor.getState().lockouts.blocks.length, 1);
  editor.redo();
  assert.equal(editor.getState().lockouts.blocks[1].id, 'existing_id_copy');
});
