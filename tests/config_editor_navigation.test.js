const assert = require('node:assert/strict');
const test = require('node:test');
const { loadEditor } = require('./helpers/config_editor_fixture');

const config = () => ({ metricSettings: [
  { metricID: 'plan', displayName: 'Day plan', dataType: 'timestamp', points: { value: 2, pointsID: 'plan_points' }, streaks: { streaksID: 'plan_streak' } },
  { metricID: 'focus', displayName: 'Focused work', dataType: 'duration' }
], lockouts: { blocks: [
  { id: 'morning', name: 'Morning routine', type: 'task_block', presets: ['workday'], times: { beg: '09:00', end: '12:00' }, typeSpecific: { task_block_IDs: ['plan'] } },
  { id: 'limit', name: 'Daily limit', type: 'duration_block', typeSpecific: { duration: { screenTimeID: 'focus' } } }
] } });

test('summaries distinguish completion and show scoring, streaks, hours, and preset assignments', () => {
  const editor = loadEditor(); editor.setState(config());
  const { metricSettings, lockouts } = editor.getState();
  assert.equal(editor.metricCardSummary(metricSettings[0]), 'Timestamp · Points on · Streaks on');
  assert.equal(editor.metricCardSummary(editor.metricFromRecipe('completion')), 'Done / not done · Points off · Streaks off');
  assert.equal(editor.blockCardSummary(lockouts.blocks[0]), 'Require completed metrics · 09:00–12:00 · Presets: workday');
  assert.equal(editor.blockCardSummary(lockouts.blocks[1]), 'Screen-time limit · All day · No presets assigned');
});

test('block search matches presets, referenced metric IDs and display names', () => {
  const editor = loadEditor(); editor.setState(config());
  const [task, limit] = editor.getState().lockouts.blocks;
  for (const query of ['morning', 'workday', 'plan', 'day plan']) assert.ok(editor.blockSearchText(task).includes(query), query);
  for (const query of ['focus', 'focused work', 'screen-time']) assert.ok(editor.blockSearchText(limit).includes(query), query);
  editor.getState().metricSettings[1].displayName = 'Writing';
  assert.ok(editor.blockSearchText(limit).includes('writing'));
});

test('UI identities follow items through rename, reorder, undo and redo and remain outside configuration', () => {
  const editor = loadEditor(); editor.setState(config());
  const metric = editor.getState().metricSettings[0], block = editor.getState().lockouts.blocks[0];
  const metricKey = editor.itemUiKey(metric), blockKey = editor.itemUiKey(block);
  editor.withHistory(() => {
    metric.metricID = 'renamed'; block.name = 'Renamed block';
    editor.getState().metricSettings.reverse(); editor.getState().lockouts.blocks.reverse();
  });
  assert.equal(editor.itemUiKey(editor.getState().metricSettings[1]), metricKey);
  assert.equal(editor.itemUiKey(editor.getState().lockouts.blocks[1]), blockKey);
  editor.undo();
  assert.equal(editor.itemUiKey(editor.getState().metricSettings[0]), metricKey);
  assert.equal(editor.itemUiKey(editor.getState().lockouts.blocks[0]), blockKey);
  editor.redo();
  assert.equal(editor.itemUiKey(editor.getState().metricSettings[1]), metricKey);
  assert.equal(editor.itemUiKey(editor.getState().lockouts.blocks[1]), blockKey);
  editor.duplicateMetric(editor.getState().metricSettings[1], 1);
  editor.duplicateBlock(editor.getState().lockouts.blocks[1], 1);
  assert.notEqual(editor.itemUiKey(editor.getState().metricSettings[2]), metricKey);
  assert.notEqual(editor.itemUiKey(editor.getState().lockouts.blocks[2]), blockKey);
  assert.doesNotMatch(JSON.stringify(editor.getState()), /itemKey|sectionKey|item-\d+|cardOpen/);
});

test('validation diagnostics target the supporting ID, exact date, exact task reference and global setting', () => {
  const editor = loadEditor(); const raw = config();
  raw.metricSettings[0].points.pointsID = 'plan';
  raw.metricSettings[0].timestampSettings = { writeMode: 'due_by' };
  raw.metricSettings[0].dates = [['Tuesday', '09:00'], ['Friday', '']];
  raw.lockouts.blocks[0].typeSpecific.task_block_IDs = ['plan', 'missing'];
  raw.lockouts.globals = { cacheTimezoneMode: 'invalid' };
  editor.setState(raw);
  const issues = Array.from(editor.collectValidationIssues());
  const find = text => issues.find(issue => issue.message.includes(text)).target;
  assert.equal(find('Row ID "plan"').field, 'Points ID');
  assert.equal(find('Row ID "plan"').itemKey, editor.itemUiKey(editor.getState().metricSettings[0]));
  assert.equal(find('date 2').dateIndex, 1);
  assert.equal(find('date 2').field, 'Due By (HH:MM)');
  assert.equal(find('"missing"').occurrence, 1);
  assert.equal(find('"missing"').field, 'Required Metric ID');
  assert.equal(find('cacheTimezoneMode').tab, 'global');
  assert.equal(find('cacheTimezoneMode').field, 'Cache Timezone Mode');
  assert.deepEqual(Array.from(editor.validateState()), issues.map(issue => issue.message));
});
