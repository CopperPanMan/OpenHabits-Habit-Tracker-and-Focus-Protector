const DAY_OPTIONS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const METRIC_TYPES = ['number', 'duration', 'timestamp', 'due_by', 'start_timer', 'stop_timer'];
const RECORD_TYPES = ['overwrite', 'keep_first', 'add'];
const BLOCK_TYPES = ['duration_block', 'task_block', 'firstXMinutesAfterTimestamp_block'];
const POINT_BLOCK_TYPES = ['heading_1', 'heading_2', 'heading_3', 'paragraph', 'quote', 'bulleted_list_item', 'numbered_list_item', 'to_do'];
const SEGMENT_COLORS = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];

const HELP = {
  defaultProperty: 'Configuration property used when generating Config.gs.',
  spreadsheetId: 'Apps Script property key that stores the spreadsheet ID.',
  comparisonArray: 'Performance comparison rows used by insights logic.',
  metricID: 'Stable metric key referenced by streaks, points, timer links, and lockout blocks.',
  metricType: 'Timer-specific settings appear only for start_timer and stop_timer metrics.',
  dates: 'Day rule format is [day_of_week, due_by, start_time, end_time]. Start/end are numeric hours.',
  blockType: 'Choose duration, task, or first-X-minutes block behavior.',
  ifTimer: 'Used for timer workflows, including stop message and metric links.',
  segments: 'Notion point output tokens or text chunks with color styling.',
};

const state = {
  config: defaultConfig(),
  activeTab: 'global',
};

function defaultConfig() {
  return {
    scriptProperties: { spreadsheetId: 'spreadSheetID' },
    trackingSheetName: 'Tracking Data',
    writeToNotion: true,
    notion: {
      databaseIdsScriptProperty: 'notionMetricDatabaseIDs',
      pointBlockIdScriptProperty: 'pointBlock',
      insightBlockIdScriptProperty: 'insightBlock',
      outputStyles: {
        pointBlock: {
          blockType: 'heading_1',
          segments: [
            { token: 'point_total', color: 'blue' },
            { text: ' Points', color: 'default' },
          ],
        },
        insightBlock: { blockType: 'paragraph', italic: true },
      },
      syncFields: { status: true, streak: true, pointMultiplier: true, points: true },
      propertyNames: {
        metricId: 'metricID',
        status: 'State',
        streak: 'Streak',
        pointMultiplier: 'Point Multiplier',
        points: 'Points',
      },
      completeStatusName: 'Complete',
    },
    dailyPointsID: 'point_total_today',
    cumulativePointsID: 'point_total_alltime',
    lateExtensionHours: 5,
    sheetConfig: { taskIdColumn: 1, labelColumn: 2, dataStartColumn: 3 },
    habitsV2Insights: {
      comparisonArray: [
        [1, 'yesterday'], [2, '2 days ago'], [3, '3 days ago'], [4, '4 days ago'], [5, '5 days ago'],
        [6, '6 days ago'], [7, '7 days ago'], [14, 'two weeks ago'], [21, '3 weeks ago'],
        [30, 'this day last month'], [60, '2 months ago'], [90, '3 months ago'], [180, '6 months ago'],
        [365, 'one year ago today'], [730, '2 years ago today'],
      ],
      posPerformanceFreq: 0.75,
      negPerformanceFreq: 0.25,
      averageSpan: 7,
    },
    metricSettings: [],
    lockoutsV2: {
      globals: { cumulativeScreentimeID: 'cumulative_app_opened', barLength: 20, presetCalendarName: 'App Lockout Settings' },
      blocks: [],
    },
  };
}

function defaultMetric() {
  return {
    metricID: '',
    type: 'number',
    displayName: '',
    recordType: 'overwrite',
    dates: [['Monday', '23:59', 0, 24]],
    streaks: { unit: 'days', streaksID: '' },
    points: { value: 0, multiplierDays: 0, maxMultiplier: 1, pointsID: '' },
    insights: {
      insightChance: 1,
      streakProb: 0.8,
      dayToDayChance: 1,
      dayToAvgChance: 0.5,
      rawValueChance: 1,
      increaseGood: 1,
      firstWords: '',
      insightFirstWords: '',
      insightUnits: '',
    },
    writeToNotion: true,
    ifTimer_Settings: {
      stopTimerMessage: '',
      timerStartMetricID: null,
      timerDurationMetricID: null,
      muteOutput: false,
    },
  };
}

function defaultBlock() {
  return {
    id: '',
    type: 'duration_block',
    presets: [],
    times: { beg: '00:00', end: '00:00' },
    typeSpecific: {
      duration: { maxMinutes: 0, screenTimeID: '', rationing: { isON: false, begMinutes: 0, endMinutes: 0 } },
      task_block_IDs: [],
      firstXMinutes: { minutes: 0, timestampID: '' },
    },
    onBlock: { message: '', shortcutName: '', shortcutInput: '' },
  };
}

function deepMerge(base, incoming) {
  if (Array.isArray(base)) return Array.isArray(incoming) ? incoming : base;
  if (!base || typeof base !== 'object') return incoming === undefined ? base : incoming;
  const out = { ...base };
  for (const [k, v] of Object.entries(incoming || {})) out[k] = k in base ? deepMerge(base[k], v) : v;
  return out;
}

function extractReturnedObjectLiteral(text) {
  const returnIdx = text.indexOf('return');
  if (returnIdx === -1) throw new Error('No return statement found. Paste full Config.gs content.');
  const start = text.indexOf('{', returnIdx);
  if (start === -1) throw new Error('No object literal found after return.');
  let depth = 0;
  let inS = false; let inD = false; let inT = false; let esc = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (!inD && !inT && ch === "'") inS = !inS;
    else if (!inS && !inT && ch === '"') inD = !inD;
    else if (!inS && !inD && ch === '`') inT = !inT;
    else if (!inS && !inD && !inT) {
      if (ch === '{') depth += 1;
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
  }
  throw new Error('Could not find matching braces for returned config object.');
}

function sanitizeConfig(parsed) {
  const merged = deepMerge(defaultConfig(), parsed);
  const normalizeDateRule = (rule) => {
    if (!Array.isArray(rule)) return ['Monday', '23:59', 0, 24];
    const day = typeof rule[0] === 'string' ? rule[0] : 'Monday';
    const dueBy = typeof rule[1] === 'string' ? rule[1] : '23:59';
    if (Array.isArray(rule[2])) {
      const win = Array.isArray(rule[2][0]) ? rule[2][0] : [0, 24];
      return [day, dueBy, typeof win[0] === 'number' ? win[0] : 0, typeof win[1] === 'number' ? win[1] : 24];
    }
    const startHour = typeof rule[2] === 'number' ? rule[2] : 0;
    const endHour = typeof rule[3] === 'number' ? rule[3] : 24;
    return [day, dueBy, startHour, endHour];
  };

  merged.metricSettings = Array.isArray(merged.metricSettings) ? merged.metricSettings.map((m) => deepMerge(defaultMetric(), m || {})) : [];
  merged.metricSettings.forEach((metric) => {
    metric.dates = Array.isArray(metric.dates) ? metric.dates.map(normalizeDateRule) : [['Monday', '23:59', 0, 24]];
    delete metric.ppnMessage;
  });
  merged.lockoutsV2 = merged.lockoutsV2 || { globals: {}, blocks: [] };
  merged.lockoutsV2.globals = deepMerge(defaultConfig().lockoutsV2.globals, merged.lockoutsV2.globals || {});
  merged.lockoutsV2.blocks = Array.isArray(merged.lockoutsV2.blocks) ? merged.lockoutsV2.blocks.map((b) => deepMerge(defaultBlock(), b || {})) : [];
  return merged;
}

function parseConfigFromText(text) {
  const parsed = Function(`"use strict"; return (${extractReturnedObjectLiteral(text)});`)();
  if (!parsed || typeof parsed !== 'object') throw new Error('Parsed return value is not an object.');
  return sanitizeConfig(parsed);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  });
  children.forEach((child) => node.appendChild(child));
  return node;
}

function labelWithHelp(text, help) {
  const label = el('label', { text });
  const icon = el('span', { class: 'help', tabindex: '0', text: '?' });
  icon.dataset.help = help || HELP.defaultProperty;
  label.appendChild(icon);
  return label;
}

function addToggleSection(container, title, open = false) {
  const details = el('details', { class: 'toggle-section' });
  if (open) details.open = true;
  details.appendChild(el('summary', { text: title }));
  const body = el('div', { class: 'toggle-body' });
  details.appendChild(body);
  container.appendChild(details);
  return body;
}

function addField(container, { label, help, type = 'text', value, onInput, min, max, step = 'any', select }) {
  const field = el('div', { class: 'field' });
  const error = el('div', { class: 'error-message' });
  field.appendChild(labelWithHelp(label, help));

  let input;
  if (select) {
    input = el('select');
    select.forEach((opt) => input.appendChild(el('option', { value: opt, text: opt })));
    input.value = value;
  } else if (type === 'boolean') {
    input = el('select');
    ['true', 'false'].forEach((opt) => input.appendChild(el('option', { value: opt, text: opt })));
    input.value = String(Boolean(value));
  } else {
    input = el('input', { type, step });
    if (min !== undefined) input.min = String(min);
    if (max !== undefined) input.max = String(max);
    input.value = value === null || value === undefined ? '' : String(value);
  }

  const commit = () => {
    const raw = input.value;
    let parsed = raw;
    if (type === 'number') {
      if (raw === '' || Number.isNaN(Number(raw))) {
        error.textContent = 'Must be a valid number.';
        return;
      }
      parsed = Number(raw);
      if (min !== undefined && parsed < min) { error.textContent = `Must be ≥ ${min}.`; return; }
      if (max !== undefined && parsed > max) { error.textContent = `Must be ≤ ${max}.`; return; }
    } else if (type === 'time') {
      if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(raw)) { error.textContent = 'Use HH:MM (24h).'; return; }
    } else if (type === 'boolean') {
      parsed = raw === 'true';
    }
    error.textContent = '';
    onInput(parsed);
  };

  input.addEventListener('input', commit);
  input.addEventListener('change', commit);
  field.appendChild(input);
  field.appendChild(error);
  container.appendChild(field);
}

function moveInArray(arr, idx, delta) {
  const next = idx + delta;
  if (next < 0 || next >= arr.length) return;
  [arr[idx], arr[next]] = [arr[next], arr[idx]];
  renderAll();
}

function addListEditor(container, { title, items, addLabel, renderItem, makeItem }) {
  const box = el('div', { class: 'nested-list' });
  box.appendChild(el('h4', { text: title }));
  items.forEach((item, idx) => {
    const card = el('div', { class: 'nested-item' });
    const top = el('div', { class: 'item-title' }, [el('strong', { text: `${title} #${idx + 1}` })]);
    const controls = el('div', { class: 'row compact' });
    const up = el('button', { type: 'button', class: 'secondary', text: 'Move Up' });
    up.onclick = () => moveInArray(items, idx, -1);
    const down = el('button', { type: 'button', class: 'secondary', text: 'Move Down' });
    down.onclick = () => moveInArray(items, idx, 1);
    const del = el('button', { type: 'button', class: 'remove', text: 'Delete' });
    del.onclick = () => { items.splice(idx, 1); renderAll(); };
    controls.append(up, down, del);
    top.appendChild(controls);
    card.appendChild(top);
    renderItem(card, item, idx);
    box.appendChild(card);
  });
  const addBtn = el('button', { type: 'button', class: 'secondary', text: addLabel });
  addBtn.onclick = () => { items.push(makeItem()); renderAll(); };
  box.appendChild(addBtn);
  container.appendChild(box);
}

function renderNotion(container) {
  const n = state.config.notion;
  addListEditor(container, {
    title: 'Notion Point Segments',
    items: n.outputStyles.pointBlock.segments,
    addLabel: 'Add Segment',
    makeItem: () => ({ text: '', color: 'default' }),
    renderItem: (card, segment) => {
      const grid = el('div', { class: 'form-grid' });
      addField(grid, { label: 'Token (optional)', value: segment.token || '', type: 'text', help: HELP.segments, onInput: (v) => { segment.token = v; if (v) delete segment.text; renderAll(); } });
      addField(grid, { label: 'Text (optional)', value: segment.text || '', type: 'text', onInput: (v) => { segment.text = v; if (v) delete segment.token; renderAll(); } });
      addField(grid, { label: 'Color', value: segment.color || 'default', select: SEGMENT_COLORS, onInput: (v) => { segment.color = v; } });
      card.appendChild(grid);
    },
  });

  const grid = el('div', { class: 'form-grid' });
  addField(grid, { label: 'Notion databaseIdsScriptProperty', value: n.databaseIdsScriptProperty, onInput: (v) => { n.databaseIdsScriptProperty = v; } });
  addField(grid, { label: 'pointBlockIdScriptProperty', value: n.pointBlockIdScriptProperty, onInput: (v) => { n.pointBlockIdScriptProperty = v; } });
  addField(grid, { label: 'insightBlockIdScriptProperty', value: n.insightBlockIdScriptProperty, onInput: (v) => { n.insightBlockIdScriptProperty = v; } });
  addField(grid, { label: 'Point blockType', value: n.outputStyles.pointBlock.blockType, select: POINT_BLOCK_TYPES, onInput: (v) => { n.outputStyles.pointBlock.blockType = v; } });
  addField(grid, { label: 'Insight blockType', value: n.outputStyles.insightBlock.blockType, select: POINT_BLOCK_TYPES, onInput: (v) => { n.outputStyles.insightBlock.blockType = v; } });
  addField(grid, { label: 'Insight italic', type: 'boolean', value: n.outputStyles.insightBlock.italic, onInput: (v) => { n.outputStyles.insightBlock.italic = v; } });
  addField(grid, { label: 'syncFields.status', type: 'boolean', value: n.syncFields.status, onInput: (v) => { n.syncFields.status = v; } });
  addField(grid, { label: 'syncFields.streak', type: 'boolean', value: n.syncFields.streak, onInput: (v) => { n.syncFields.streak = v; } });
  addField(grid, { label: 'syncFields.pointMultiplier', type: 'boolean', value: n.syncFields.pointMultiplier, onInput: (v) => { n.syncFields.pointMultiplier = v; } });
  addField(grid, { label: 'syncFields.points', type: 'boolean', value: n.syncFields.points, onInput: (v) => { n.syncFields.points = v; } });
  addField(grid, { label: 'propertyNames.metricId', value: n.propertyNames.metricId, onInput: (v) => { n.propertyNames.metricId = v; } });
  addField(grid, { label: 'propertyNames.status', value: n.propertyNames.status, onInput: (v) => { n.propertyNames.status = v; } });
  addField(grid, { label: 'propertyNames.streak', value: n.propertyNames.streak, onInput: (v) => { n.propertyNames.streak = v; } });
  addField(grid, { label: 'propertyNames.pointMultiplier', value: n.propertyNames.pointMultiplier, onInput: (v) => { n.propertyNames.pointMultiplier = v; } });
  addField(grid, { label: 'propertyNames.points', value: n.propertyNames.points, onInput: (v) => { n.propertyNames.points = v; } });
  addField(grid, { label: 'completeStatusName', value: n.completeStatusName, onInput: (v) => { n.completeStatusName = v; } });
  container.appendChild(grid);
}

function renderHabitsGlobals(container) {
  const c = state.config;
  const base = addToggleSection(container, 'Core Global Properties', true);
  const baseGrid = el('div', { class: 'form-grid' });
  addField(baseGrid, { label: 'Spreadsheet Property Key', value: c.scriptProperties.spreadsheetId, help: HELP.spreadsheetId, onInput: (v) => { c.scriptProperties.spreadsheetId = v; } });
  addField(baseGrid, { label: 'Tracking Sheet Name', value: c.trackingSheetName, onInput: (v) => { c.trackingSheetName = v; } });
  addField(baseGrid, { label: 'Write To Notion', type: 'boolean', value: c.writeToNotion, onInput: (v) => { c.writeToNotion = v; } });
  addField(baseGrid, { label: 'Daily Points Metric ID', value: c.dailyPointsID, onInput: (v) => { c.dailyPointsID = v; } });
  addField(baseGrid, { label: 'Cumulative Points Metric ID', value: c.cumulativePointsID, onInput: (v) => { c.cumulativePointsID = v; } });
  addField(baseGrid, { label: 'Late Extension Hours', type: 'number', value: c.lateExtensionHours, min: 0, onInput: (v) => { c.lateExtensionHours = v; } });
  base.appendChild(baseGrid);

  const sheet = addToggleSection(container, 'Sheet Column Properties');
  const sheetGrid = el('div', { class: 'form-grid' });
  addField(sheetGrid, { label: 'Task ID Column', type: 'number', value: c.sheetConfig.taskIdColumn, min: 1, onInput: (v) => { c.sheetConfig.taskIdColumn = v; } });
  addField(sheetGrid, { label: 'Label Column', type: 'number', value: c.sheetConfig.labelColumn, min: 1, onInput: (v) => { c.sheetConfig.labelColumn = v; } });
  addField(sheetGrid, { label: 'Data Start Column', type: 'number', value: c.sheetConfig.dataStartColumn, min: 1, onInput: (v) => { c.sheetConfig.dataStartColumn = v; } });
  sheet.appendChild(sheetGrid);

  const insights = addToggleSection(container, 'Habits Insights Properties');
  const insightsGrid = el('div', { class: 'form-grid' });
  addField(insightsGrid, { label: 'Positive Performance Frequency', type: 'number', value: c.habitsV2Insights.posPerformanceFreq, min: 0, max: 1, onInput: (v) => { c.habitsV2Insights.posPerformanceFreq = v; } });
  addField(insightsGrid, { label: 'Negative Performance Frequency', type: 'number', value: c.habitsV2Insights.negPerformanceFreq, min: 0, max: 1, onInput: (v) => { c.habitsV2Insights.negPerformanceFreq = v; } });
  addField(insightsGrid, { label: 'Average Span', type: 'number', value: c.habitsV2Insights.averageSpan, min: 1, onInput: (v) => { c.habitsV2Insights.averageSpan = v; } });
  insights.appendChild(insightsGrid);

  const comparison = addToggleSection(container, 'Comparison Array', false);
  addListEditor(comparison, {
    title: 'Comparison Rows',
    items: c.habitsV2Insights.comparisonArray,
    addLabel: 'Add Comparison Row',
    makeItem: () => [1, 'label'],
    renderItem: (card, row) => {
      const grid = el('div', { class: 'form-grid' });
      addField(grid, { label: 'Days Ago', type: 'number', value: row[0], min: 1, onInput: (v) => { row[0] = v; } });
      addField(grid, { label: 'Label', value: row[1], help: HELP.comparisonArray, onInput: (v) => { row[1] = v; } });
      card.appendChild(grid);
    },
  });

  const notionSection = el('div', { class: 'item' }, [el('h4', { text: 'Notion Settings' })]);
  renderNotion(notionSection);
  container.appendChild(notionSection);
}

function renderMetricDates(container, metric) {
  addListEditor(container, {
    title: 'Date Rules',
    items: metric.dates,
    addLabel: 'Add Date Rule',
    makeItem: () => ['Monday', '23:59', 0, 24],
    renderItem: (card, rule) => {
      const grid = el('div', { class: 'form-grid' });
      addField(grid, { label: 'Day of Week', value: rule[0], select: DAY_OPTIONS, onInput: (v) => { rule[0] = v; } });
      addField(grid, { label: 'Due By', type: 'time', value: rule[1], onInput: (v) => { rule[1] = v; } });
      addField(grid, { label: 'Start Hour', type: 'number', value: rule[2], min: 0, max: 24, help: HELP.dates, onInput: (v) => { rule[2] = v; } });
      addField(grid, { label: 'End Hour', type: 'number', value: rule[3], min: 0, max: 24, onInput: (v) => { rule[3] = v; } });
      card.appendChild(grid);
    },
  });
}

function renderMetrics(container) {
  state.config.metricSettings.forEach((metric, idx) => {
    const card = el('div', { class: 'item' });
    const title = el('div', { class: 'item-title' }, [el('strong', { text: `Metric #${idx + 1}` })]);
    const controls = el('div', { class: 'row compact' });
    const up = el('button', { type: 'button', class: 'secondary', text: 'Move Up' }); up.onclick = () => moveInArray(state.config.metricSettings, idx, -1);
    const down = el('button', { type: 'button', class: 'secondary', text: 'Move Down' }); down.onclick = () => moveInArray(state.config.metricSettings, idx, 1);
    const remove = el('button', { type: 'button', class: 'remove', text: 'Delete' }); remove.onclick = () => { state.config.metricSettings.splice(idx, 1); renderAll(); };
    controls.append(up, down, remove);
    title.appendChild(controls);
    card.appendChild(title);

    const grid = el('div', { class: 'form-grid' });
    addField(grid, { label: 'Metric ID', value: metric.metricID, help: HELP.metricID, onInput: (v) => { metric.metricID = v; } });
    addField(grid, { label: 'Display Name', value: metric.displayName, onInput: (v) => { metric.displayName = v; } });
    addField(grid, { label: 'Type', value: metric.type, select: METRIC_TYPES, help: HELP.metricType, onInput: (v) => { metric.type = v; renderAll(); } });
    addField(grid, { label: 'Record Type', value: metric.recordType, select: RECORD_TYPES, onInput: (v) => { metric.recordType = v; } });
    addField(grid, { label: 'Write To Notion', type: 'boolean', value: metric.writeToNotion, onInput: (v) => { metric.writeToNotion = v; } });
    const timerType = metric.type === 'start_timer' || metric.type === 'stop_timer';
    if (timerType) {
      addField(grid, { label: 'Stop Timer Message', value: metric.ifTimer_Settings.stopTimerMessage, help: HELP.ifTimer, onInput: (v) => { metric.ifTimer_Settings.stopTimerMessage = v; } });
      addField(grid, { label: 'Timer Start Metric ID', value: metric.ifTimer_Settings.timerStartMetricID || '', onInput: (v) => { metric.ifTimer_Settings.timerStartMetricID = v || null; } });
      addField(grid, { label: 'Timer Duration Metric ID', value: metric.ifTimer_Settings.timerDurationMetricID || '', onInput: (v) => { metric.ifTimer_Settings.timerDurationMetricID = v || null; } });
      addField(grid, { label: 'Mute Timer Output', type: 'boolean', value: metric.ifTimer_Settings.muteOutput, onInput: (v) => { metric.ifTimer_Settings.muteOutput = v; } });
    }

    card.appendChild(grid);

    const streaks = addToggleSection(card, 'Streak Properties');
    const streakGrid = el('div', { class: 'form-grid' });
    addField(streakGrid, { label: 'Unit', value: metric.streaks.unit, onInput: (v) => { metric.streaks.unit = v; } });
    addField(streakGrid, { label: 'Streak ID', value: metric.streaks.streaksID, onInput: (v) => { metric.streaks.streaksID = v; } });
    streaks.appendChild(streakGrid);

    const points = addToggleSection(card, 'Points Properties');
    const pointsGrid = el('div', { class: 'form-grid' });
    addField(pointsGrid, { label: 'Point Value', type: 'number', value: metric.points.value, onInput: (v) => { metric.points.value = v; } });
    addField(pointsGrid, { label: 'Multiplier Days', type: 'number', value: metric.points.multiplierDays, min: 0, onInput: (v) => { metric.points.multiplierDays = v; } });
    addField(pointsGrid, { label: 'Max Multiplier', type: 'number', value: metric.points.maxMultiplier, min: 0, onInput: (v) => { metric.points.maxMultiplier = v; } });
    addField(pointsGrid, { label: 'Points ID', value: metric.points.pointsID, onInput: (v) => { metric.points.pointsID = v; } });
    points.appendChild(pointsGrid);

    const insights = addToggleSection(card, 'Insights Properties');
    const insightsGrid = el('div', { class: 'form-grid' });
    addField(insightsGrid, { label: 'Insight Chance', type: 'number', value: metric.insights.insightChance, min: 0, max: 1, onInput: (v) => { metric.insights.insightChance = v; } });
    addField(insightsGrid, { label: 'Streak Probability', type: 'number', value: metric.insights.streakProb, min: 0, max: 1, onInput: (v) => { metric.insights.streakProb = v; } });
    addField(insightsGrid, { label: 'Day to Day Chance', type: 'number', value: metric.insights.dayToDayChance, min: 0, max: 1, onInput: (v) => { metric.insights.dayToDayChance = v; } });
    addField(insightsGrid, { label: 'Day to Average Chance', type: 'number', value: metric.insights.dayToAvgChance, min: 0, max: 1, onInput: (v) => { metric.insights.dayToAvgChance = v; } });
    addField(insightsGrid, { label: 'Raw Value Chance', type: 'number', value: metric.insights.rawValueChance, min: 0, max: 1, onInput: (v) => { metric.insights.rawValueChance = v; } });
    addField(insightsGrid, { label: 'Increase Direction', value: String(metric.insights.increaseGood), select: ['-1', '1'], onInput: (v) => { metric.insights.increaseGood = Number(v); } });
    addField(insightsGrid, { label: 'First Words', value: metric.insights.firstWords, onInput: (v) => { metric.insights.firstWords = v; } });
    addField(insightsGrid, { label: 'Insight First Words', value: metric.insights.insightFirstWords, onInput: (v) => { metric.insights.insightFirstWords = v; } });
    addField(insightsGrid, { label: 'Insight Units', value: metric.insights.insightUnits, onInput: (v) => { metric.insights.insightUnits = v; } });
    insights.appendChild(insightsGrid);

    renderMetricDates(card, metric);
    container.appendChild(card);
  });
}

function renderBlocks(container) {
  state.config.lockoutsV2.blocks.forEach((block, idx) => {
    const card = el('div', { class: 'item' });
    const title = el('div', { class: 'item-title' }, [el('strong', { text: `Block #${idx + 1}` })]);
    const controls = el('div', { class: 'row compact' });
    const up = el('button', { type: 'button', class: 'secondary', text: 'Move Up' }); up.onclick = () => moveInArray(state.config.lockoutsV2.blocks, idx, -1);
    const down = el('button', { type: 'button', class: 'secondary', text: 'Move Down' }); down.onclick = () => moveInArray(state.config.lockoutsV2.blocks, idx, 1);
    const remove = el('button', { type: 'button', class: 'remove', text: 'Delete' }); remove.onclick = () => { state.config.lockoutsV2.blocks.splice(idx, 1); renderAll(); };
    controls.append(up, down, remove);
    title.appendChild(controls);
    card.appendChild(title);

    const grid = el('div', { class: 'form-grid' });
    addField(grid, { label: 'Block ID', value: block.id, onInput: (v) => { block.id = v; } });
    addField(grid, { label: 'Block Type', value: block.type, select: BLOCK_TYPES, help: HELP.blockType, onInput: (v) => { block.type = v; renderAll(); } });
    addField(grid, { label: 'Begin Time', type: 'time', value: block.times.beg, onInput: (v) => { block.times.beg = v; } });
    addField(grid, { label: 'End Time', type: 'time', value: block.times.end, onInput: (v) => { block.times.end = v; } });
    addField(grid, { label: 'On Block Message', value: block.onBlock.message, onInput: (v) => { block.onBlock.message = v; } });
    addField(grid, { label: 'Shortcut Name', value: block.onBlock.shortcutName, onInput: (v) => { block.onBlock.shortcutName = v; } });
    addField(grid, { label: 'Shortcut Input', value: block.onBlock.shortcutInput, onInput: (v) => { block.onBlock.shortcutInput = v; } });
    card.appendChild(grid);

    addListEditor(card, {
      title: 'Presets',
      items: block.presets,
      addLabel: 'Add Preset',
      makeItem: () => '',
      renderItem: (presetCard, preset, pIdx) => {
        const presetGrid = el('div', { class: 'form-grid' });
        addField(presetGrid, { label: 'Preset Name', value: preset, onInput: (v) => { block.presets[pIdx] = v; } });
        presetCard.appendChild(presetGrid);
      },
    });

    if (block.type === 'duration_block') {
      const d = block.typeSpecific.duration;
      const dur = el('div', { class: 'form-grid' });
      addField(dur, { label: 'Max Minutes', type: 'number', value: d.maxMinutes, min: 0, onInput: (v) => { d.maxMinutes = v; } });
      addField(dur, { label: 'Screen Time ID', value: d.screenTimeID, onInput: (v) => { d.screenTimeID = v; } });
      addField(dur, { label: 'Rationing Enabled', type: 'boolean', value: d.rationing.isON, onInput: (v) => { d.rationing.isON = v; renderAll(); } });
      if (d.rationing.isON) {
        addField(dur, { label: 'Rationing Begin Minutes', type: 'number', value: d.rationing.begMinutes, min: 0, onInput: (v) => { d.rationing.begMinutes = v; } });
        addField(dur, { label: 'Rationing End Minutes', type: 'number', value: d.rationing.endMinutes, min: 0, onInput: (v) => { d.rationing.endMinutes = v; } });
      }
      card.appendChild(dur);
    }

    if (block.type === 'task_block') {
      addListEditor(card, {
        title: 'Task Metric IDs',
        items: block.typeSpecific.task_block_IDs,
        addLabel: 'Add Task Metric ID',
        makeItem: () => '',
        renderItem: (taskCard, id, taskIdx) => {
          const taskGrid = el('div', { class: 'form-grid' });
          addField(taskGrid, { label: 'Metric ID', value: id, onInput: (v) => { block.typeSpecific.task_block_IDs[taskIdx] = v; } });
          taskCard.appendChild(taskGrid);
        },
      });
    }

    if (block.type === 'firstXMinutesAfterTimestamp_block') {
      const fx = block.typeSpecific.firstXMinutes;
      const fxGrid = el('div', { class: 'form-grid' });
      addField(fxGrid, { label: 'Minutes', type: 'number', value: fx.minutes, min: 0, onInput: (v) => { fx.minutes = v; } });
      addField(fxGrid, { label: 'Timestamp ID', value: fx.timestampID, onInput: (v) => { fx.timestampID = v; } });
      card.appendChild(fxGrid);
    }

    container.appendChild(card);
  });
}

function renderLockoutGlobals(container) {
  const g = state.config.lockoutsV2.globals;
  const grid = el('div', { class: 'form-grid' });
  addField(grid, { label: 'Cumulative Screentime ID', value: g.cumulativeScreentimeID, onInput: (v) => { g.cumulativeScreentimeID = v; } });
  addField(grid, { label: 'Bar Length', type: 'number', value: g.barLength, min: 0, onInput: (v) => { g.barLength = v; } });
  addField(grid, { label: 'Preset Calendar Name', value: g.presetCalendarName, onInput: (v) => { g.presetCalendarName = v; } });
  container.appendChild(grid);
}

function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.tab').forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tabName));
}

function renderAll() {
  const globalContainer = document.getElementById('globalContainer');
  const blocks = document.getElementById('blocksContainer');
  const metrics = document.getElementById('metricsContainer');
  globalContainer.innerHTML = '';
  blocks.innerHTML = '';
  metrics.innerHTML = '';

  const habitsGlobalSection = addToggleSection(globalContainer, 'Habits V2 Global Properties', true);
  renderHabitsGlobals(habitsGlobalSection);
  const lockoutsGlobalSection = addToggleSection(globalContainer, 'Lockouts V2 Globals', true);
  renderLockoutGlobals(lockoutsGlobalSection);

  renderBlocks(blocks);
  renderMetrics(metrics);
  switchTab(state.activeTab);
}

function validateConfig(config) {
  if (!config.scriptProperties?.spreadsheetId) throw new Error('scriptProperties.spreadsheetId is required.');
  config.metricSettings.forEach((m, i) => {
    if (!m.metricID) throw new Error(`metricSettings[${i}].metricID is required.`);
    if (!METRIC_TYPES.includes(m.type)) throw new Error(`metricSettings[${i}].type is invalid.`);
    m.dates.forEach((d, j) => {
      if (!DAY_OPTIONS.includes(d[0])) throw new Error(`metricSettings[${i}].dates[${j}] has invalid day.`);
      if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(d[1])) throw new Error(`metricSettings[${i}].dates[${j}] has invalid dueByTime.`);
    });
  });
  config.lockoutsV2.blocks.forEach((b, i) => {
    if (!b.id) throw new Error(`blocks[${i}].id is required.`);
    if (!BLOCK_TYPES.includes(b.type)) throw new Error(`blocks[${i}].type is invalid.`);
  });
}

function toPrettyJs(value, indent = 0) {
  const pad = ' '.repeat(indent);
  const next = ' '.repeat(indent + 2);
  if (value === null) return 'null';
  if (typeof value === 'string') return `'${value.replaceAll("'", "\\'")}'`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `[\n${value.map((v) => `${next}${toPrettyJs(v, indent + 2)}`).join(',\n')}\n${pad}]`;
  }
  const entries = Object.entries(value || {});
  if (!entries.length) return '{}';
  return `{\n${entries.map(([k, v]) => `${next}${k}: ${toPrettyJs(v, indent + 2)}`).join(',\n')}\n${pad}}`;
}

function setup() {
  document.querySelectorAll('.tab').forEach((tab) => { tab.onclick = () => switchTab(tab.dataset.tab); });

  document.getElementById('parseBtn').onclick = () => {
    const status = document.getElementById('importStatus');
    try {
      state.config = parseConfigFromText(document.getElementById('importText').value);
      status.className = 'status';
      status.textContent = 'Config parsed into GUI successfully.';
      renderAll();
    } catch (err) {
      status.className = 'status error';
      status.textContent = `Import failed: ${err.message}`;
    }
  };

  document.getElementById('resetBtn').onclick = () => {
    state.config = defaultConfig();
    document.getElementById('importStatus').className = 'status';
    document.getElementById('importStatus').textContent = 'Started from default template.';
    renderAll();
  };

  document.getElementById('addMetricBtn').onclick = () => { state.config.metricSettings.push(defaultMetric()); renderAll(); };
  document.getElementById('addBlockBtn').onclick = () => { state.config.lockoutsV2.blocks.push(defaultBlock()); renderAll(); };

  document.getElementById('exportBtn').onclick = () => {
    const status = document.getElementById('exportStatus');
    try {
      validateConfig(state.config);
      document.getElementById('exportText').value = `function getAppConfig() {\n  return ${toPrettyJs(state.config, 2)};\n}`;
      status.className = 'status';
      status.textContent = 'Generated Config.gs successfully.';
    } catch (err) {
      status.className = 'status error';
      status.textContent = `Validation failed: ${err.message}`;
    }
  };

  document.getElementById('copyBtn').onclick = async () => {
    const status = document.getElementById('exportStatus');
    const text = document.getElementById('exportText').value;
    if (!text.trim()) {
      status.className = 'status error';
      status.textContent = 'Generate Config.gs first.';
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      status.className = 'status';
      status.textContent = 'Copied to clipboard.';
    } catch {
      status.className = 'status error';
      status.textContent = 'Clipboard copy failed. Copy manually from the export text box.';
    }
  };

  renderAll();
}

setup();
