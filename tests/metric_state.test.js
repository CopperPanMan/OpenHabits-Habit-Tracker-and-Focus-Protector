const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function formatUtc(date, pattern) {
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const hour = date.getUTCHours();
  const replacements = {
    EEEE: weekdays[date.getUTCDay()],
    yyyy: String(date.getUTCFullYear()),
    M: String(date.getUTCMonth() + 1),
    d: String(date.getUTCDate()),
    H: String(hour),
    m: String(date.getUTCMinutes()),
    s: String(date.getUTCSeconds()),
    Z: '+0000',
    'h:mm a': `${hour % 12 || 12}:${String(date.getUTCMinutes()).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
  };
  return replacements[pattern];
}

function loadAppsScript() {
  const context = vm.createContext({
    console,
    Date,
    JSON,
    Math,
    Number,
    Object,
    String,
    Array,
    RegExp,
    isFinite,
    isNaN,
    Session: { getScriptTimeZone: () => 'GMT' },
    Utilities: { formatDate: (date, timezone, pattern) => formatUtc(date, pattern) }
  });
  for (const file of ['Main.gs', 'Lockouts.gs']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }
  context.requestTimezone = 'GMT';
  context.requestClientNow = '';
  context.lateExtensionHours = 0;
  context.getMultiplier_ = () => 1;
  return context;
}

function buildEntry(context, setting, value, now) {
  context.getMetricSettingById = () => ({ setting });
  return context.lockouts_buildMetricStateEntryFromRow_(
    setting.metricID,
    { row: 2, warnings: [] },
    [value],
    [new Date('2026-08-31T12:00:00.000Z')],
    { now, todayCol: 3, dataColumn: 3 }
  );
}

test('reports complete using the existing non-empty-cell semantics', () => {
  const context = loadAppsScript();
  const setting = { metricID: 'task', dates: [] };

  assert.equal(buildEntry(context, setting, '', new Date('2026-08-31T12:00:00Z')).complete, false);
  assert.equal(buildEntry(context, setting, 0, new Date('2026-08-31T12:00:00Z')).complete, true);
});

test('reports whether the metric is scheduled on the effective weekday', () => {
  const context = loadAppsScript();
  const now = new Date('2026-08-31T12:00:00Z'); // Monday

  assert.equal(buildEntry(context, { metricID: 'monday', dates: [['monday', '']] }, '', now).scheduledToday, true);
  assert.equal(buildEntry(context, { metricID: 'tuesday', dates: [['tuesday', '']] }, '', now).scheduledToday, false);
});

test('preserves null dueState and returns no-deadline properties for an untimed metric', () => {
  const context = loadAppsScript();
  const entry = buildEntry(context, { metricID: 'untimed', dates: [['monday', '']] }, '', new Date('2026-08-31T12:00:00Z'));

  assert.equal(entry.dueState, null);
  assert.deepEqual(JSON.parse(JSON.stringify(entry.dueProperties)), {
    hasDeadline: false,
    dueAtISO: null,
    dueTimeLocal: null,
    minutesRemaining: null,
    status: 'none'
  });
});

test('preserves numeric dueState and reports upcoming and expired dueProperties', () => {
  const context = loadAppsScript();
  const setting = { metricID: 'timed', dates: [['monday', '23:45']] };
  const upcomingEntry = buildEntry(context, setting, '', new Date('2026-08-31T23:32:00Z'));
  const expiredEntry = buildEntry(context, setting, '', new Date('2026-08-31T23:46:00Z'));
  const upcoming = upcomingEntry.dueProperties;
  const expired = expiredEntry.dueProperties;

  assert.equal(upcomingEntry.dueState, -13);
  assert.equal(upcoming.status, 'upcoming');
  assert.equal(upcoming.minutesRemaining, 13);
  assert.equal(upcoming.dueAtISO, '2026-08-31T23:45:00.000Z');
  assert.equal(upcoming.dueTimeLocal, '11:45 PM');
  assert.equal(expired.status, 'expired');
  assert.equal(expired.minutesRemaining, 0);
  assert.equal(expiredEntry.dueState, 1);
});

test('uses the late extension when selecting the effective day and deadline', () => {
  const context = loadAppsScript();
  context.lateExtensionHours = 3;
  const now = new Date('2026-08-31T01:00:00Z'); // Monday, but still effective Sunday
  const entry = buildEntry(context, { metricID: 'late', dates: [['sunday', '23:45']] }, '', now);

  assert.equal(entry.scheduledToday, true);
  assert.equal(entry.dueState, 75);
  assert.equal(entry.dueProperties.dueAtISO, '2026-08-30T23:45:00.000Z');
  assert.equal(entry.dueProperties.status, 'expired');
  assert.equal(entry.dueProperties.minutesRemaining, 0);
});
