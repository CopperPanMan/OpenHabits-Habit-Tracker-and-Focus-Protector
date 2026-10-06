const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '../..');
const mainSource = fs.readFileSync(path.join(root, 'Main.gs'), 'utf8');
const configSource = fs.readFileSync(path.join(root, 'Config.gs'), 'utf8');

function createFixture(options = {}) {
  let now = new Date(options.now || '2026-10-06T12:00:00Z');
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
    static now() { return now.getTime(); }
  }
  const counts = { configLoads: 0, sheetOpens: 0, lastRow: 0, reads: [], writes: [] };
  let seed = options.seed || 1;
  const math = Object.create(Math);
  math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  const metrics = options.metrics || [{
    metricID: 'metric', displayName: 'Metric', dataType: 'number', recordType: 'overwrite',
    streaks: { streaksID: 'streak' }
  }];
  const ids = [];
  function add(id) { if (id && !ids.includes(id)) ids.push(id); }
  metrics.forEach(metric => {
    add(metric.metricID);
    add(metric.points && metric.points.pointsID);
    add(metric.streaks && metric.streaks.streaksID);
  });
  add('daily'); add('cumulative'); add('unrelated');
  const days = options.days === undefined ? 30 : options.days;
  const grid = [['Metric ID', 'Metric'], ...ids.map(id => [id, id])];
  for (let d = days; d >= 0; d--) {
    const date = new ClockDate(now);
    date.setUTCDate(date.getUTCDate() - d);
    grid[0].push(date);
    ids.forEach((id, index) => {
      const isMetric = metrics.some(metric => metric.metricID === id);
      grid[index + 1].push(options.history ? options.history(id, d, days - d) : isMetric && d > 0 ? 1 : '');
    });
  }
  const formulas = new Map();
  const sheet = {
    getLastRow: () => { counts.lastRow++; return grid.length; },
    getLastColumn: () => Math.max(...grid.map(row => row.length)),
    getSheetId: () => 1,
    getRange(row, col, nr = 1, nc = 1) {
      if (![row, col, nr, nc].every(n => Number.isInteger(n) && n > 0)) throw new Error('Invalid range');
      const read = kind => {
        counts.reads.push({ kind, row, col, nr, nc });
        return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => grid[row + i - 1]?.[col + j - 1] ?? ''));
      };
      const write = values => {
        counts.writes.push({ row, col, nr, nc, values: values.map(r => Array.from(r)) });
        values.forEach((r, i) => r.forEach((value, j) => {
          grid[row + i - 1] ||= [];
          grid[row + i - 1][col + j - 1] = value;
          formulas.delete(`${row + i}:${col + j}`);
        }));
      };
      return { getValue: () => read('getValue')[0][0], getValues: () => read('getValues'),
        setValue: value => write([[value]]), setValues: write };
    }
  };
  const spreadsheet = { getId: () => 'fixture', getSheetByName: () => sheet };
  function formatDate(date, timezone, pattern) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(date).map(part => [part.type, part.value]));
    const offsetMinutes = Math.round((Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second)) - date.getTime()) / 60000);
    const offset = `${offsetMinutes < 0 ? '-' : '+'}${String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, '0')}${String(Math.abs(offsetMinutes) % 60).padStart(2, '0')}`;
    const map = { 'yyyy-MM-dd': `${parts.year}-${parts.month}-${parts.day}`,
      'yyyy-MM-dd HH:mm': `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`, EEEE: parts.weekday,
      yyyy: parts.year, M: String(Number(parts.month)), d: String(Number(parts.day)),
      H: String(Number(parts.hour)), m: String(Number(parts.minute)), s: String(Number(parts.second)), Z: offset,
      'h:mm a': `${Number(parts.hour) % 12 || 12}:${parts.minute} ${Number(parts.hour) < 12 ? 'AM' : 'PM'}` };
    if (!(pattern in map)) throw new Error('Unsupported date format: ' + pattern);
    return map[pattern];
  }
  const context = vm.createContext({ console: { log() {}, warn() {} }, Logger: { log() {} }, Date: ClockDate,
    JSON, Math: math, Number, Object, String, Array, RegExp, isFinite, isNaN,
    Session: { getScriptTimeZone: () => options.timezone || 'UTC' }, Utilities: { formatDate },
    PropertiesService: { getScriptProperties: () => ({ getProperty: name =>
      name === 'OPENHABITS_SECRET' ? 'test-secret' : name === 'spreadSheetID' && !options.bound ? 'fixture' : null }) },
    SpreadsheetApp: {
      openById: () => { counts.sheetOpens++; return spreadsheet; },
      getActiveSpreadsheet: () => { counts.sheetOpens++; return spreadsheet; }
    },
    ContentService: { createTextOutput: text => ({ text, setMimeType() { return this; } }), MimeType: { JSON: 'json' } }
  });
  vm.runInContext(options.mainSource || mainSource, context, { filename: 'Main.gs' });
  vm.runInContext(options.configSource || configSource, context, { filename: 'Config.gs' });
  const config = { ...context.getCodeBackedAppConfig(), lateExtensionHours: 0,
    dailyPointsID: 'daily', cumulativePointsID: 'cumulative', metricSettings: metrics, ...options.config };
  context.openHabitsLoadAppConfig_ = () => { counts.configLoads++; return JSON.parse(JSON.stringify(config)); };
  const fixture = { context, counts, grid, sheet, config, formulas,
    todayCol: () => sheet.getLastColumn(),
    row: id => ids.indexOf(id) + 2,
    set(id, value, col = sheet.getLastColumn()) { grid[this.row(id) - 1][col - 1] = value; },
    get(id, col = sheet.getLastColumn()) { return grid[this.row(id) - 1][col - 1]; },
    setNow(value) { now = new Date(value); },
    post(data, key = 'record_metric_iOS', extra = {}) {
      return JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ key, data, secret: 'test-secret', ...extra }) } }).text);
    }
  };
  return fixture;
}

module.exports = { createFixture };
