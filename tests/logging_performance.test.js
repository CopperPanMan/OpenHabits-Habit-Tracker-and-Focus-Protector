const assert = require('node:assert/strict');
const test = require('node:test');
const { createFixture } = require('./helpers/apps_script_fixture');

test('long streaks use a constant number of reads, one config load and one sheet open', () => {
  for (const days of [7, 30, 180, 730]) {
    const f = createFixture({ days });
    const response = f.post([['metric', 2]]);
    assert.equal(response.metricsByID[0].streak, days + 1);
    assert.equal(f.get('metric'), 2);
    assert.equal(f.get('streak'), days + 1);
    assert.equal(f.counts.configLoads, 1);
    assert.equal(f.counts.sheetOpens, 1);
    assert.equal(f.counts.lastRow, 1);
    assert.equal(f.counts.reads.length, 8);
  }
});

test('constant multipliers skip history while preserving the returned multiplier', () => {
  for (const maxMultiplier of [undefined, 'invalid', 0, 1, '1']) {
    const f = createFixture({ days: 730, metrics: [{ metricID: 'metric', dataType: 'number', points: { value: 2, maxMultiplier } }] });
    const response = f.post([['metric', 3]]);
    assert.equal(response.metricsByID[0].multiplier, maxMultiplier === 0 ? 0 : 1);
    assert.equal(response.pointsDelta, maxMultiplier === 0 ? 0 : 6);
    assert.equal(f.counts.reads.filter(r => r.row === f.row('metric') && r.nc > 1).length, 0);
  }
});

test('streak-based multipliers, repeated additive metrics and totals use pending values', () => {
  const f = createFixture({ days: 7, metrics: [{
    metricID: 'metric', dataType: 'number', recordType: 'add', streaks: { streaksID: 'streak' },
    points: { value: 2, pointsID: 'points', maxMultiplier: 3, multiplierDays: 7 }
  }] });
  f.set('daily', 10); f.set('cumulative', 100, f.todayCol() - 1);
  const response = f.post([['metric', 1], ['metric', 2]]);
  assert.equal(response.metricsByID[0].value, 1);
  assert.equal(response.metricsByID[1].value, 3);
  assert.equal(response.metricsByID[1].streak, 8);
  assert.equal(response.metricsByID[1].multiplier, 3);
  assert.equal(response.pointsDelta, 18);
  assert.equal(response.todayPoints, 28);
  assert.equal(response.cumulativePoints, 118);
  assert.equal(f.get('points'), 18);
  assert.equal(f.counts.reads.filter(r => r.row === f.row('metric') && r.nc > 1).length, 1);
});

test('seeded scheduled streaks survive an unscheduled day and reset on an incomplete scheduled day', () => {
  const setting = { metricID: 'metric', dataType: 'number', dates: [['monday', '']], streaks: { streaksID: 'streak' } };
  const tuesday = createFixture({ days: 14, metrics: [setting] });
  tuesday.set('streak', 40, tuesday.todayCol() - 1);
  assert.equal(tuesday.post([['metric', 2]]).metricsByID[0].streak, 40);

  const monday = createFixture({ days: 14, now: '2026-10-05T12:00:00Z', metrics: [setting] });
  monday.context.dataStartColumn = 3;
  assert.equal(monday.context.calculateStreak_('metric', monday.todayCol(), 0, monday.sheet), 0);
  assert.equal(monday.post([['metric', 0]]).metricsByID[0].streak, 3);
});

test('missing date columns break a streak and late-extension schedules use the effective weekday', () => {
  const gap = createFixture({ days: 7 });
  gap.grid[0][gap.todayCol() - 3] = new Date('2026-09-01T12:00:00Z');
  assert.equal(gap.post([['metric', 2]]).metricsByID[0].streak, 2);

  const late = createFixture({ days: 7, now: '2026-10-06T02:00:00Z', config: { lateExtensionHours: 5 }, metrics: [{
    metricID: 'metric', dataType: 'number', dates: [['monday', '']], streaks: { streaksID: 'streak' }
  }] });
  assert.equal(late.post([['metric', 2]]).metricsByID[0].streak, 2);
});

test('a late due-by overwrite clears completion and reverses previously awarded points', () => {
  const f = createFixture({ metrics: [{ metricID: 'metric', dataType: 'timestamp', recordType: 'overwrite',
    timestampSettings: { writeMode: 'due_by' }, dates: [['tuesday', '10:00']],
    streaks: { streaksID: 'streak' }, points: { value: 5, pointsID: 'points' } }] });
  f.set('metric', new Date('2026-10-06T09:00:00Z')); f.set('points', 5);
  f.set('daily', 10); f.set('cumulative', 20);
  const response = f.post([['metric']]);
  assert.equal(response.metricsByID[0].status, 'late_overwritten');
  assert.equal(response.metricsByID[0].streak, 0);
  assert.equal(response.pointsDelta, -5);
  assert.equal(response.todayPoints, 5);
  assert.equal(response.cumulativePoints, 15);
  assert.equal(f.get('metric'), '');
});

test('client timezones retain due-by decisions and timestamp insight values', () => {
  const metric = { metricID: 'metric', dataType: 'timestamp', recordType: 'overwrite', timezoneMode: 'floating',
    timestampSettings: { writeMode: 'due_by' }, dates: [['tuesday', '10:00']] };
  const newYork = createFixture({ now: '2026-10-06T12:00:00Z', metrics: [metric] });
  assert.equal(newYork.post([['metric']], 'record_metric_iOS', { timezone: 'America/New_York' }).metricsByID[0].status, 'written');
  const utc = createFixture({ now: '2026-10-06T12:00:00Z', metrics: [metric] });
  assert.equal(utc.post([['metric']], 'record_metric_iOS', { timezone: 'UTC' }).metricsByID[0].status, 'late_overwritten');
  const f = createFixture({ timezone: 'America/New_York' });
  assert.equal(f.context.turnToNumberV2_({ dataType: 'timestamp' }, new Date('2026-10-06T12:00:00Z')), 480);
});

test('keep-first and invalid entries leave existing values and unrelated rows unchanged', () => {
  const f = createFixture({ metrics: [{ metricID: 'metric', dataType: 'number', recordType: 'keep_first' }] });
  f.set('metric', 9); f.set('unrelated', 123);
  const response = f.post([['metric', 2], ['missing', 1], ['metric', 'invalid']]);
  assert.equal(response.metricsByID[0].status, 'kept_first');
  assert.equal(response.metricsByID[1].status, 'error');
  assert.equal(response.metricsByID[2].status, 'error');
  assert.equal(f.get('metric'), 9);
  assert.equal(f.get('unrelated'), 123);
  assert.equal(f.counts.writes.length, 0);
});

test('flush groups only contiguous dirty rows and retains untouched formulas and concurrent edits', () => {
  const f = createFixture();
  const col = f.todayCol();
  const accessor = f.context.createColumnAccessor_(f.sheet, col);
  f.formulas.set(`4:${col}`, '=SUM(A1:A3)');
  f.grid[3][col - 1] = 42;
  accessor.set(2, 10); accessor.set(3, 20); accessor.set(5, 30);
  accessor.flush(); accessor.flush();
  assert.deepEqual(f.counts.writes.map(w => [w.row, w.nr]), [[2, 2], [5, 1]]);
  assert.equal(f.grid[3][col - 1], 42);
  assert.equal(f.formulas.get(`4:${col}`), '=SUM(A1:A3)');
});

test('insights read only the configured lookback and average windows and include the pending value', () => {
  const insights = { firstWords: 'Up', insightUnits: 'units', streakProb: 0, dayToDayChance: 1,
    dayToAvgChance: 1, rawValueChance: 1, increaseGood: 1, insightChance: 1 };
  const f = createFixture({ days: 730, metrics: [{ metricID: 'metric', dataType: 'number', insights }],
    config: { habitsV2Insights: { comparisonArray: [[1, 'yesterday'], [7, 'last week'], [30, 'last month']],
      averageSpan: 7, posPerformanceFreq: 1, negPerformanceFreq: 1 } } });
  const response = f.post([['metric', 5]]);
  assert.match(response.messages[0], /\+4 units/);
  const historyReads = f.counts.reads.filter(r => r.row === f.row('metric') && r.nc > 1);
  assert.equal(historyReads.length, 1);
  assert.equal(historyReads[0].nc, 36);
  assert.equal(historyReads[0].col + historyReads[0].nc - 1, f.todayCol() - 1);
});

test('average insights exclude empty values and retain current-span and historical-span comparisons', () => {
  for (const dayToAvgChance of [0, 1]) {
    const f = createFixture({ days: 30, metrics: [{ metricID: 'metric', dataType: 'number', insights: {
      firstWords: 'Up', insightUnits: 'units', streakProb: 0, dayToDayChance: 0,
      dayToAvgChance, rawValueChance: 1, increaseGood: 1
    } }], history: (id, d) => id === 'metric' && d > 0 ? d === 2 ? '' : d < 7 ? 3 : 1 : '',
    config: { habitsV2Insights: { comparisonArray: [[7, 'last week']], averageSpan: 3,
      posPerformanceFreq: 1, negPerformanceFreq: 1 } } });
    const message = f.post([['metric', 5]]).messages[0];
    assert.match(message, dayToAvgChance ? /\+4 units today/ : /\+3 units this 3 day span/);
  }
});

test('negative additive durations retain their values, point deltas and totals', () => {
  const f = createFixture({ metrics: [{ metricID: 'metric', dataType: 'duration', recordType: 'add',
    points: { value: 0.5, pointsID: 'points' } }] });
  f.set('metric', '01:00:00'); f.set('points', 30); f.set('daily', 30); f.set('cumulative', 100);
  const response = f.post([['metric', '-00:05:00'], ['metric', '00:02:00']]);
  assert.equal(f.get('metric'), '00:57:00');
  assert.equal(f.get('points'), 28.5);
  assert.equal(response.pointsDelta, -1.5);
  assert.equal(response.todayPoints, 28.5);
  assert.equal(response.cumulativePoints, 98.5);
});

test('insights reuse history already loaded for a multiplier and preserve first-day feedback', () => {
  const metric = { metricID: 'metric', dataType: 'number', points: { value: 2, maxMultiplier: 3, multiplierDays: 7 },
    insights: { firstWords: 'Up', insightUnits: 'units', streakProb: 0, dayToDayChance: 1,
      dayToAvgChance: 1, rawValueChance: 1, increaseGood: 1 } };
  const f = createFixture({ days: 180, metrics: [metric] });
  assert.match(f.post([['metric', 5]]).messages[0], /\+4 units/);
  assert.equal(f.counts.reads.filter(r => r.row === f.row('metric') && r.nc > 1).length, 1);
  const firstDay = createFixture({ days: 0, metrics: [metric] });
  assert.equal(firstDay.post([['metric', 5]]).messages[0], 'Well done! Complete this tomorrow for new performance insights.');
});

test('a new request rereads config and history and creates a new column after the day changes', () => {
  const f = createFixture();
  assert.equal(f.post([['metric', 2]]).metricsByID[0].streak, 31);
  assert.equal(f.context.openHabitsRequestContext_, null);
  f.config.metricSettings[0].points = { value: 4 };
  f.setNow('2026-10-07T12:00:00Z');
  const previousCol = f.todayCol();
  const response = f.post([['metric', 3]]);
  assert.equal(f.todayCol(), previousCol + 1);
  assert.equal(response.metricsByID[0].streak, 32);
  assert.equal(response.pointsDelta, 12);
  assert.equal(f.counts.configLoads, 2);
  assert.equal(f.counts.sheetOpens, 2);
  assert.equal(f.context.openHabitsRequestContext_, null);
});

test('editor config reads stay fresh and request caches are cleaned up after an exception', () => {
  const f = createFixture();
  f.context.getAppConfig(); f.context.getAppConfig();
  assert.equal(f.counts.configLoads, 2);
  const getRange = f.sheet.getRange;
  f.sheet.getRange = () => { throw new Error('Sheet unavailable'); };
  assert.throws(() => f.post([['metric', 2]]), /Sheet unavailable/);
  assert.equal(f.context.openHabitsRequestContext_, null);
  f.sheet.getRange = getRange;
  assert.equal(f.post([['metric', 2]]).ok, true);
});

test('GET stays rejected and unauthorized POST requests perform no spreadsheet work', () => {
  const f = createFixture();
  assert.match(f.context.doGet({}).text, /GET is no longer supported/);
  assert.equal(f.post([['metric', 2]], 'record_metric_iOS', { secret: 'wrong' }).ok, false);
  assert.equal(f.counts.configLoads, 0);
  assert.equal(f.counts.sheetOpens, 0);
  assert.equal(f.counts.reads.length, 0);
});
