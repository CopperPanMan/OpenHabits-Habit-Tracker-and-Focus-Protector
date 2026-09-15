/**
 * OpenHabits Setup Experience V2.
 *
 * Mutable configuration lives in a protected, hidden sheet.  This file keeps
 * all administration behind functions invoked by the spreadsheet owner; the
 * public logging endpoint remains strict and never creates rows.
 */
var OPENHABITS_CONFIG_SHEET = '_OpenHabits Config';
var OPENHABITS_CONFIG_SCHEMA = 2;
var OPENHABITS_CONFIG_CACHE_KEY = 'openhabits-config-v2';
var OPENHABITS_STARTER_IDS = ['started_work', 'glasses_of_water', 'focus_session_start', 'focus_session_stop'];

function openHabitsLoadAppConfig_() {
  var fallback = getCodeBackedAppConfig();
  try {
    var stored = openHabitsReadStoredConfig_();
    return stored && stored.config ? stored.config : fallback;
  } catch (error) {
    console.warn('OpenHabits stored config ignored: ' + error.message);
    return fallback;
  }
}

function openHabitsValidateConfig_(config) {
  var errors = [];
  var warnings = [];
  var ids = {};
  if (!config || typeof config !== 'object' || Array.isArray(config)) return { ok: false, errors: ['Configuration must be a JSON object.'], warnings: [] };
  if (!config.trackingSheetName || typeof config.trackingSheetName !== 'string') errors.push('trackingSheetName is required.');
  if (!Array.isArray(config.metricSettings)) errors.push('metricSettings must be an array.');
  (config.metricSettings || []).forEach(function (metric, index) {
    var label = 'metricSettings[' + index + ']';
    if (!metric || typeof metric !== 'object') { errors.push(label + ' must be an object.'); return; }
    var id = String(metric.metricID || '').trim();
    if (!id) errors.push(label + '.metricID is required.');
    else if (ids[id] !== undefined) errors.push('Duplicate metricID: ' + id + '.');
    else ids[id] = index;
    if (!metric.displayName) errors.push(label + '.displayName is required.');
    if (metric.recordType === 'add' && ['number', 'duration'].indexOf(metric.type) < 0) errors.push(label + ' can only use add with number or duration.');
    if ((metric.type === 'start_timer' || metric.type === 'stop_timer') && (!metric.ifTimer_Settings || !metric.ifTimer_Settings.timerStartMetricID || !metric.ifTimer_Settings.timerDurationMetricID)) errors.push(label + ' timer rows are incomplete.');
  });
  var references = openHabitsCollectRequiredRows_(config);
  references.forEach(function (row) {
    if (!Object.prototype.hasOwnProperty.call(ids, row.id) && row.kind === 'reference') warnings.push(row.id + ' is a supporting Sheet row, not a loggable metric.');
  });
  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

function openHabitsCollectRequiredRows_(config) {
  var rows = {};
  function add(id, label, kind) {
    id = typeof id === 'string' ? id.trim() : '';
    if (id && !rows[id]) rows[id] = { id: id, label: label || id, kind: kind || 'reference' };
  }
  (config.metricSettings || []).forEach(function (metric) {
    var name = metric.displayName || metric.metricID;
    add(metric.metricID, name, 'metric');
    add(metric.streaks && metric.streaks.streaksID, name + ' streak');
    add(metric.points && metric.points.pointsID, name + ' points');
    add(metric.ifTimer_Settings && metric.ifTimer_Settings.timerStartMetricID, name + ' timer start');
    add(metric.ifTimer_Settings && metric.ifTimer_Settings.timerDurationMetricID, name + ' timer duration');
  });
  add(config.dailyPointsID, 'Points today');
  add(config.cumulativePointsID, 'Points all time');
  var lockouts = config.lockouts || {};
  add(lockouts.globals && lockouts.globals.cumulativeScreentimeID, 'Cumulative screen time');
  add(lockouts.globals && lockouts.globals.timeOpenedID, 'Time opened');
  (lockouts.blocks || []).forEach(function (block) {
    var specific = block.typeSpecific || {};
    add(specific.duration && specific.duration.screenTimeID, (block.id || 'Lockout') + ' screen time');
    (specific.task_block_IDs || []).forEach(function (id) { add(id, id); });
    add(specific.firstXMinutes && specific.firstXMinutes.timestampID, (block.id || 'Lockout') + ' timestamp');
  });
  return Object.keys(rows).map(function (id) { return rows[id]; });
}

function openHabitsPlanReconciliation_(config, existingRows) {
  var required = openHabitsCollectRequiredRows_(config);
  var seen = {};
  var duplicates = [];
  (existingRows || []).forEach(function (row) {
    var id = String((Array.isArray(row) ? row[0] : row.id) || '').trim();
    if (!id) return;
    if (seen[id]) duplicates.push(id); else seen[id] = true;
  });
  var missing = required.filter(function (row) { return !seen[row.id]; });
  var requiredMap = {};
  required.forEach(function (row) { requiredMap[row.id] = true; });
  var unused = Object.keys(seen).filter(function (id) { return !requiredMap[id]; });
  return { ok: duplicates.length === 0, required: required, missing: missing, duplicates: duplicates, retainedUnreferenced: unused };
}

function openHabitsSpreadsheet_() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  var id = PropertiesService.getScriptProperties().getProperty('spreadsheetId');
  if (!id) id = getCodeBackedAppConfig().scriptProperties.spreadsheetId;
  return SpreadsheetApp.openById(id);
}

function openHabitsReadStoredConfig_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(OPENHABITS_CONFIG_CACHE_KEY);
  if (cached) return JSON.parse(cached);
  var sheet = openHabitsSpreadsheet_().getSheetByName(OPENHABITS_CONFIG_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var record = {
    schemaVersion: Number(sheet.getRange('B2').getValue()),
    revision: Number(sheet.getRange('B3').getValue()),
    updatedAt: String(sheet.getRange('B4').getValue()),
    config: JSON.parse(String(sheet.getRange('B5').getValue()))
  };
  if (record.schemaVersion !== OPENHABITS_CONFIG_SCHEMA) throw new Error('Unsupported config schema ' + record.schemaVersion + '.');
  var validation = openHabitsValidateConfig_(record.config);
  if (!validation.ok) throw new Error(validation.errors.join(' '));
  cache.put(OPENHABITS_CONFIG_CACHE_KEY, JSON.stringify(record), 21600);
  return record;
}

function openHabitsEnsureConfigSheet_() {
  var spreadsheet = openHabitsSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(OPENHABITS_CONFIG_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(OPENHABITS_CONFIG_SHEET);
    sheet.getRange('A1:B7').setValues([
      ['OpenHabits configuration', 'Do not edit this protected data manually'],
      ['Schema version', ''], ['Active revision', ''], ['Updated at', ''],
      ['Active JSON', ''], ['Previous revision', ''], ['Previous JSON', '']
    ]);
  }
  sheet.hideSheet();
  try { if (!sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) sheet.protect().setDescription('Managed by OpenHabits'); } catch (ignore) {}
  return sheet;
}

function openHabitsPreviewConfig(configJson) {
  var config;
  try { config = typeof configJson === 'string' ? JSON.parse(configJson) : configJson; } catch (error) { return { ok: false, errors: ['Invalid JSON: ' + error.message] }; }
  var validation = openHabitsValidateConfig_(config);
  if (!validation.ok) return validation;
  var tracking = openHabitsSpreadsheet_().getSheetByName(config.trackingSheetName);
  var values = tracking && tracking.getLastRow() ? tracking.getRange(1, config.sheetConfig && config.sheetConfig.taskIdColumn || 1, tracking.getLastRow(), 2).getValues() : [];
  var plan = openHabitsPlanReconciliation_(config, values.slice(1));
  return { ok: plan.ok, errors: plan.duplicates.length ? ['Duplicate Tracking Data IDs: ' + plan.duplicates.join(', ')] : [], warnings: validation.warnings, plan: plan };
}

function openHabitsSaveAndApply(configJson, options) {
  options = options || {};
  var config;
  try { config = typeof configJson === 'string' ? JSON.parse(configJson) : configJson; } catch (error) { return { ok: false, errors: ['Invalid JSON: ' + error.message] }; }
  var preview = openHabitsPreviewConfig(config);
  if (!preview.ok) return preview;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = openHabitsEnsureConfigSheet_();
    var oldRevision = Number(sheet.getRange('B3').getValue()) || 0;
    var oldJson = String(sheet.getRange('B5').getValue() || '');
    sheet.getRange('B6:B7').setValues([[oldRevision], [oldJson]]);
    var revision = oldRevision + 1;
    sheet.getRange('B2:B5').setValues([[OPENHABITS_CONFIG_SCHEMA], [revision], [new Date().toISOString()], [JSON.stringify(config)]]);
    var added = [];
    if (options.reconcile !== false) added = openHabitsApplyReconciliation_(config, preview.plan);
    CacheService.getScriptCache().remove(OPENHABITS_CONFIG_CACHE_KEY);
    return { ok: true, revision: revision, addedRows: added, retainedUnreferenced: preview.plan.retainedUnreferenced, warnings: preview.warnings || [] };
  } finally { lock.releaseLock(); }
}

function openHabitsApplyReconciliation_(config, plan) {
  var spreadsheet = openHabitsSpreadsheet_();
  var tracking = spreadsheet.getSheetByName(config.trackingSheetName);
  if (!tracking) {
    tracking = spreadsheet.insertSheet(config.trackingSheetName);
    tracking.getRange(1, 1, 1, 3).setValues([['Metric ID', 'Metric', new Date()]]);
  }
  if (!plan.missing.length) return [];
  var idColumn = config.sheetConfig && config.sheetConfig.taskIdColumn || 1;
  var labelColumn = config.sheetConfig && config.sheetConfig.labelColumn || 2;
  var start = Math.max(2, tracking.getLastRow() + 1);
  plan.missing.forEach(function (row, index) {
    tracking.getRange(start + index, idColumn).setValue(row.id);
    tracking.getRange(start + index, labelColumn).setValue(row.label);
  });
  return plan.missing;
}

function openHabitsRestorePreviousRevision() {
  var sheet = openHabitsEnsureConfigSheet_();
  var json = String(sheet.getRange('B7').getValue() || '');
  if (!json) return { ok: false, errors: ['No previous revision is available.'] };
  return openHabitsSaveAndApply(json, { reconcile: true });
}

function openHabitsImportCodeConfig() { return openHabitsSaveAndApply(getCodeBackedAppConfig(), { reconcile: true }); }

function openHabitsStarterConfig() {
  var config = JSON.parse(JSON.stringify(getCodeBackedAppConfig()));
  config.metricSettings = [
    { metricID: 'started_work', displayName: 'Started Work', type: 'timestamp', recordType: 'overwrite', timezoneMode: 'floating', dates: [] },
    { metricID: 'glasses_of_water', displayName: 'Glasses of Water', type: 'number', recordType: 'add', timezoneMode: 'floating', dates: [] },
    { metricID: 'focus_session_start', displayName: 'Start Focus Session', type: 'start_timer', recordType: 'overwrite', timezoneMode: 'floating', dates: [], ifTimer_Settings: { timerStartMetricID: 'focus_session_started_at', timerDurationMetricID: 'focus_session_minutes', stopTimerMessage: '', muteOutput: true } },
    { metricID: 'focus_session_stop', displayName: 'Stop Focus Session', type: 'stop_timer', recordType: 'overwrite', timezoneMode: 'floating', dates: [], ifTimer_Settings: { timerStartMetricID: 'focus_session_started_at', timerDurationMetricID: 'focus_session_minutes', stopTimerMessage: 'Focus session complete.', muteOutput: false } }
  ];
  return config;
}

function openHabitsInstallStarterConfig() { return openHabitsSaveAndApply(openHabitsStarterConfig(), { reconcile: true }); }

function openHabitsGetEditorBootstrap() {
  var stored = openHabitsReadStoredConfig_();
  return { config: stored ? stored.config : getCodeBackedAppConfig(), revision: stored ? stored.revision : 0, status: openHabitsSetupStatus() };
}

function openHabitsSetupStatus() {
  var checks = [];
  var spreadsheet = openHabitsSpreadsheet_();
  var stored;
  try { stored = openHabitsReadStoredConfig_(); checks.push({ id: 'config', state: stored ? 'pass' : 'warning', message: stored ? 'Stored config revision ' + stored.revision + ' is valid.' : 'Using Config.gs fallback. Import it to enable no-redeploy editing.' }); }
  catch (error) { checks.push({ id: 'config', state: 'fail', message: error.message }); }
  var config = stored ? stored.config : getCodeBackedAppConfig();
  var tracking = spreadsheet.getSheetByName(config.trackingSheetName);
  checks.push({ id: 'tracking', state: tracking ? 'pass' : 'fail', message: tracking ? config.trackingSheetName + ' exists.' : config.trackingSheetName + ' is missing.' });
  if (tracking) {
    var rows = tracking.getRange(1, config.sheetConfig.taskIdColumn || 1, Math.max(1, tracking.getLastRow()), 2).getValues().slice(1);
    var plan = openHabitsPlanReconciliation_(config, rows);
    checks.push({ id: 'rows', state: plan.duplicates.length ? 'fail' : plan.missing.length ? 'warning' : 'pass', message: plan.duplicates.length ? 'Duplicate IDs: ' + plan.duplicates.join(', ') : plan.missing.length ? plan.missing.length + ' required rows are missing.' : 'All required rows are present.' });
  }
  checks.push({ id: 'timezone', state: Session.getScriptTimeZone() ? 'pass' : 'fail', message: 'Script timezone: ' + (Session.getScriptTimeZone() || 'not set') });
  checks.push({ id: 'secret', state: PropertiesService.getScriptProperties().getProperty('OPENHABITS_SECRET') ? 'pass' : 'warning', message: PropertiesService.getScriptProperties().getProperty('OPENHABITS_SECRET') ? 'Request secret is configured.' : 'Add OPENHABITS_SECRET before connecting clients.' });
  return { ok: !checks.some(function (check) { return check.state === 'fail'; }), checks: checks };
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('OpenHabits')
    .addItem('Edit Configuration', 'openHabitsShowEditor').addItem('Add a Metric', 'openHabitsShowEditor')
    .addSeparator().addItem('Setup Status', 'openHabitsShowSetupStatus')
    .addItem('Sync Metric Rows', 'openHabitsSyncMetricRows').addItem('Install Starter Metrics', 'openHabitsInstallStarterConfigFromMenu')
    .addItem('Restore Previous Revision', 'openHabitsRestorePreviousRevisionFromMenu').addToUi();
}

function openHabitsShowEditor() { SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile('SetupV2Sidebar').setTitle('OpenHabits V2')); }
function openHabitsShowSetupStatus() { var status = openHabitsSetupStatus(); SpreadsheetApp.getUi().alert(status.checks.map(function (c) { return c.state.toUpperCase() + ': ' + c.message; }).join('\n')); }
function openHabitsSyncMetricRows() { var stored = openHabitsReadStoredConfig_(); if (!stored) return SpreadsheetApp.getUi().alert('Import or save a configuration first.'); var result = openHabitsSaveAndApply(stored.config, { reconcile: true }); SpreadsheetApp.getUi().alert(result.ok ? 'Synced rows. Added ' + result.addedRows.length + '.' : result.errors.join('\n')); }
function openHabitsRestorePreviousRevisionFromMenu() { var result = openHabitsRestorePreviousRevision(); SpreadsheetApp.getUi().alert(result.ok ? 'Restored as revision ' + result.revision + '.' : result.errors.join('\n')); }
function openHabitsInstallStarterConfigFromMenu() { var ui = SpreadsheetApp.getUi(); if (ui.alert('Install starter metrics?', 'This saves the starter configuration; your current config remains available as the previous revision.', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return; var result = openHabitsInstallStarterConfig(); ui.alert(result.ok ? 'Starter metrics installed. Added ' + result.addedRows.length + ' rows.' : result.errors.join('\n')); }
