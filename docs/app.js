const DAY_OPTIONS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const METRIC_TYPES = ['timestamp', 'due_by', 'number', 'duration', 'start_timer', 'stop_timer'];
const RECORD_TYPES = ['keep_first', 'overwrite', 'add'];
const BLOCK_TYPES = ['duration_block', 'task_block', 'firstXMinutesAfterTimestamp_block'];

const HELP = {
  spreadsheetId: 'Apps Script property key holding your spreadsheet id.',
  trackingSheetName: 'Sheet tab used for metric data history.',
  writeToNotion: 'Global fallback for notion syncing when metric-level writeToNotion is not set.',
  metricID: 'Stable key used across formulas, streak ids, and lockout references.',
  type: 'Metric behavior type (timestamp, due_by, number, timer start/stop, etc.).',
  dates: 'Either day strings OR [day, dueByTime, startHour, endHour] tuples.',
  ifTimer_Settings: 'Timer linkage/message settings. Only relevant for start_timer / stop_timer.',
  blockType: 'Lockout block kind. Controls typeSpecific fields shown below.',
  typeSpecific: 'Only fields relevant to the selected block type are shown.'
};

const state = { config: defaultConfig() };

function defaultConfig() {
  return {
    scriptProperties: { spreadsheetId: '' },
    trackingSheetName: 'Tracking Data',
    writeToNotion: false,
    notion: {
      databaseIdsScriptProperty: 'notionMetricDatabaseIDs',
      pointBlockIdScriptProperty: 'pointBlock',
      insightBlockIdScriptProperty: 'insightBlock',
      outputStyles: {
        pointBlock: { blockType: 'heading_1', segments: [{ token: 'point_total', color: 'blue' }, { text: ' Points', color: 'default' }] },
        insightBlock: { blockType: 'paragraph', italic: true }
      },
      syncFields: { status: true, streak: true, pointMultiplier: true, points: true },
      propertyNames: { metricId: 'metricID', status: 'Status', streak: 'Streak', pointMultiplier: 'Point Multiplier', points: 'Points' },
      completeStatusName: 'Complete'
    },
    dailyPointsID: 'point_total_today',
    cumulativePointsID: 'point_total_alltime',
    lateExtensionHours: 5,
    sheetConfig: { taskIdColumn: 1, labelColumn: 2, dataStartColumn: 3 },
    habitsV2Insights: {
      comparisonArray: [[1, 'yesterday']],
      posPerformanceFreq: 0.75,
      negPerformanceFreq: 0.25,
      averageSpan: 7
    },
    metricSettings: [],
    lockoutsV2: {
      globals: { cumulativeScreentimeID: null, barLength: 20, presetCalendarName: '' },
      blocks: []
    }
  };
}

function deepMerge(base, incoming) {
  if (Array.isArray(base)) return Array.isArray(incoming) ? incoming : base;
  if (!base || typeof base !== 'object') return incoming === undefined ? base : incoming;
  const out = { ...base };
  for (const [k, v] of Object.entries(incoming || {})) {
    out[k] = k in base ? deepMerge(base[k], v) : v;
  }
  return out;
}

function extractReturnedObjectLiteral(text) {
  const returnIdx = text.indexOf('return');
  if (returnIdx === -1) throw new Error('No return statement found. Paste full Config.gs.');
  const start = text.indexOf('{', returnIdx);
  if (start === -1) throw new Error('No object found after return.');
  let i = start;
  let depth = 0;
  let inS = false, inD = false, inT = false, esc = false;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (!inD && !inT && ch === "'") inS = !inS;
    else if (!inS && !inT && ch === '"') inD = !inD;
    else if (!inS && !inD && ch === '`') inT = !inT;
    else if (!inS && !inD && !inT) {
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
  }
  throw new Error('Could not match braces for returned object.');
}

function parseConfigFromText(text) {
  const objectLiteral = extractReturnedObjectLiteral(text);
  const parsed = Function(`"use strict"; return (${objectLiteral});`)();
  if (!parsed || typeof parsed !== 'object') throw new Error('Parsed return value is not an object.');
  return deepMerge(defaultConfig(), parsed);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.appendChild(c);
  return node;
}

function labelWithHelp(text, help) {
  const label = el('label', { text });
  if (help) {
    const q = el('span', { class: 'help', tabindex: '0', text: '?' });
    q.dataset.help = help;
    label.appendChild(q);
  }
  return label;
}

function addInput(container, opts) {
  const field = el('div', { class: 'field' });
  field.appendChild(labelWithHelp(opts.label, opts.help));
  const err = el('div', { class: 'error-message' });
  let input;
  if (opts.select) {
    input = el('select');
    opts.select.forEach(v => input.appendChild(el('option', { value: v, text: v })));
    input.value = String(opts.value ?? opts.select[0]);
  } else {
    input = el('input', { type: opts.type || 'text' });
    input.value = opts.value === null || opts.value === undefined ? '' : String(opts.value);
  }
  input.addEventListener('input', () => {
    const raw = input.value;
    if (opts.kind === 'number') {
      if (raw === '' || Number.isNaN(Number(raw))) return (err.textContent = 'Must be a number.');
      err.textContent = '';
      opts.onChange(Number(raw));
    } else if (opts.kind === 'boolean') {
      if (!['true', 'false'].includes(raw.trim().toLowerCase())) return (err.textContent = 'Enter true or false.');
      err.textContent = '';
      opts.onChange(raw.trim().toLowerCase() === 'true');
    } else {
      err.textContent = '';
      opts.onChange(raw);
    }
  });
  field.appendChild(input);
  field.appendChild(err);
  container.appendChild(field);
}

function addJsonArea(container, label, value, onChange, help) {
  const field = el('div', { class: 'field' });
  field.appendChild(labelWithHelp(label, help));
  const area = el('textarea', { rows: '4' });
  area.value = JSON.stringify(value ?? null, null, 2);
  const err = el('div', { class: 'error-message' });
  area.addEventListener('input', () => {
    try {
      onChange(JSON.parse(area.value));
      err.textContent = '';
    } catch {
      err.textContent = 'Must be valid JSON.';
    }
  });
  field.appendChild(area);
  field.appendChild(err);
  container.appendChild(field);
}

function renderLockouts() {
  const globals = document.getElementById('lockoutGlobals');
  globals.innerHTML = '';
  const g = state.config.lockoutsV2.globals;
  addInput(globals, { label: 'globals.cumulativeScreentimeID', value: g.cumulativeScreentimeID ?? '', help: 'Metric ID used by duration lockouts.', onChange: v => (g.cumulativeScreentimeID = v || null) });
  addInput(globals, { label: 'globals.barLength', value: g.barLength, kind: 'number', help: 'Length of screenTimeBar output.', onChange: v => (g.barLength = v) });
  addInput(globals, { label: 'globals.presetCalendarName', value: g.presetCalendarName, onChange: v => (g.presetCalendarName = v) });

  const blocks = document.getElementById('blocksContainer');
  blocks.innerHTML = '';
  state.config.lockoutsV2.blocks.forEach((b, i) => {
    const card = el('div', { class: 'item' });
    const title = el('div', { class: 'item-title' }, [el('strong', { text: `Block #${i + 1}` })]);
    const rm = el('button', { type: 'button', class: 'remove', text: 'Remove' });
    rm.onclick = () => { state.config.lockoutsV2.blocks.splice(i, 1); renderAll(); };
    title.appendChild(rm);
    card.appendChild(title);
    const grid = el('div', { class: 'form-grid' });

    addInput(grid, { label: 'id', value: b.id || '', onChange: v => (b.id = v) });
    addInput(grid, { label: 'type', value: b.type || BLOCK_TYPES[0], select: BLOCK_TYPES, help: HELP.blockType, onChange: v => { b.type = v; renderAll(); } });
    addInput(grid, { label: 'times.beg', value: b.times?.beg || '', onChange: v => { b.times = b.times || {}; b.times.beg = v; } });
    addInput(grid, { label: 'times.end', value: b.times?.end || '', onChange: v => { b.times = b.times || {}; b.times.end = v; } });
    addInput(grid, { label: 'onBlock.message', value: b.onBlock?.message || '', onChange: v => { b.onBlock = b.onBlock || {}; b.onBlock.message = v; } });
    addInput(grid, { label: 'onBlock.shortcutName', value: b.onBlock?.shortcutName || '', onChange: v => { b.onBlock = b.onBlock || {}; b.onBlock.shortcutName = v; } });
    addInput(grid, { label: 'onBlock.shortcutInput', value: b.onBlock?.shortcutInput || '', onChange: v => { b.onBlock = b.onBlock || {}; b.onBlock.shortcutInput = v; } });
    addJsonArea(grid, 'presets (JSON array)', b.presets || [], v => (b.presets = v));

    const ts = b.typeSpecific || {};
    if (b.type === 'duration_block') {
      ts.duration = ts.duration || { maxMinutes: 0, screenTimeID: '', rationing: { isON: false, begMinutes: 0, endMinutes: 0 } };
      addInput(grid, { label: 'typeSpecific.duration.maxMinutes', value: ts.duration.maxMinutes, kind: 'number', onChange: v => (ts.duration.maxMinutes = v), help: HELP.typeSpecific });
      addInput(grid, { label: 'typeSpecific.duration.screenTimeID', value: ts.duration.screenTimeID || '', onChange: v => (ts.duration.screenTimeID = v) });
      addInput(grid, { label: 'typeSpecific.duration.rationing.isON', value: String(Boolean(ts.duration.rationing?.isON)), kind: 'boolean', onChange: v => { ts.duration.rationing = ts.duration.rationing || {}; ts.duration.rationing.isON = v; } });
      if (ts.duration.rationing?.isON) {
        addInput(grid, { label: 'typeSpecific.duration.rationing.begMinutes', value: ts.duration.rationing.begMinutes ?? 0, kind: 'number', onChange: v => (ts.duration.rationing.begMinutes = v) });
        addInput(grid, { label: 'typeSpecific.duration.rationing.endMinutes', value: ts.duration.rationing.endMinutes ?? 0, kind: 'number', onChange: v => (ts.duration.rationing.endMinutes = v) });
      }
    } else if (b.type === 'task_block') {
      addJsonArea(grid, 'typeSpecific.task_block_IDs (JSON array)', ts.task_block_IDs || [], v => { ts.task_block_IDs = v; }, HELP.typeSpecific);
    } else if (b.type === 'firstXMinutesAfterTimestamp_block') {
      ts.firstXMinutes = ts.firstXMinutes || { minutes: 1, timestampID: '' };
      addInput(grid, { label: 'typeSpecific.firstXMinutes.minutes', value: ts.firstXMinutes.minutes, kind: 'number', onChange: v => (ts.firstXMinutes.minutes = v), help: HELP.typeSpecific });
      addInput(grid, { label: 'typeSpecific.firstXMinutes.timestampID', value: ts.firstXMinutes.timestampID || '', onChange: v => (ts.firstXMinutes.timestampID = v) });
    }
    b.typeSpecific = ts;

    card.appendChild(grid);
    blocks.appendChild(card);
  });
}

function renderHabits() {
  const globals = document.getElementById('habitsGlobals');
  globals.innerHTML = '';
  const c = state.config;
  addInput(globals, { label: 'scriptProperties.spreadsheetId', value: c.scriptProperties?.spreadsheetId || '', help: HELP.spreadsheetId, onChange: v => { c.scriptProperties = c.scriptProperties || {}; c.scriptProperties.spreadsheetId = v; } });
  addInput(globals, { label: 'trackingSheetName', value: c.trackingSheetName || '', help: HELP.trackingSheetName, onChange: v => (c.trackingSheetName = v) });
  addInput(globals, { label: 'writeToNotion (true/false)', value: String(Boolean(c.writeToNotion)), kind: 'boolean', help: HELP.writeToNotion, onChange: v => (c.writeToNotion = v) });
  addInput(globals, { label: 'dailyPointsID', value: c.dailyPointsID || '', onChange: v => (c.dailyPointsID = v) });
  addInput(globals, { label: 'cumulativePointsID', value: c.cumulativePointsID || '', onChange: v => (c.cumulativePointsID = v) });
  addInput(globals, { label: 'lateExtensionHours', value: c.lateExtensionHours, kind: 'number', onChange: v => (c.lateExtensionHours = v) });
  addInput(globals, { label: 'sheetConfig.taskIdColumn', value: c.sheetConfig?.taskIdColumn, kind: 'number', onChange: v => (c.sheetConfig.taskIdColumn = v) });
  addInput(globals, { label: 'sheetConfig.labelColumn', value: c.sheetConfig?.labelColumn, kind: 'number', onChange: v => (c.sheetConfig.labelColumn = v) });
  addInput(globals, { label: 'sheetConfig.dataStartColumn', value: c.sheetConfig?.dataStartColumn, kind: 'number', onChange: v => (c.sheetConfig.dataStartColumn = v) });
  addJsonArea(globals, 'notion (JSON)', c.notion, v => (c.notion = v));
  addJsonArea(globals, 'habitsV2Insights (JSON)', c.habitsV2Insights, v => (c.habitsV2Insights = v));

  const metrics = document.getElementById('metricsContainer');
  metrics.innerHTML = '';
  c.metricSettings.forEach((m, i) => {
    const card = el('div', { class: 'item' });
    const title = el('div', { class: 'item-title' }, [el('strong', { text: `Metric #${i + 1}` })]);
    const rm = el('button', { type: 'button', class: 'remove', text: 'Remove' });
    rm.onclick = () => { c.metricSettings.splice(i, 1); renderAll(); };
    title.appendChild(rm);
    card.appendChild(title);
    const grid = el('div', { class: 'form-grid' });

    addInput(grid, { label: 'metricID', value: m.metricID || '', help: HELP.metricID, onChange: v => (m.metricID = v) });
    addInput(grid, { label: 'displayName', value: m.displayName || '', onChange: v => (m.displayName = v) });
    addInput(grid, { label: 'type', value: m.type || METRIC_TYPES[0], select: METRIC_TYPES, help: HELP.type, onChange: v => { m.type = v; renderAll(); } });
    addInput(grid, { label: 'recordType', value: m.recordType || RECORD_TYPES[0], select: RECORD_TYPES, onChange: v => (m.recordType = v) });
    addInput(grid, { label: 'writeToNotion (true/false)', value: String(Boolean(m.writeToNotion)), kind: 'boolean', onChange: v => (m.writeToNotion = v) });

    addJsonArea(grid, 'dates (JSON)', m.dates || [], v => (m.dates = v), HELP.dates);
    addJsonArea(grid, 'streaks (JSON)', m.streaks || null, v => (m.streaks = v));
    addJsonArea(grid, 'points (JSON)', m.points || null, v => (m.points = v));
    addJsonArea(grid, 'insights (JSON)', m.insights || null, v => (m.insights = v));
    addJsonArea(grid, 'ppnMessage (JSON array)', m.ppnMessage || [], v => (m.ppnMessage = v));

    const timerType = m.type === 'start_timer' || m.type === 'stop_timer';
    if (timerType) {
      m.ifTimer_Settings = m.ifTimer_Settings || { timerStartMetricID: '', timerDurationMetricID: '' };
      addInput(grid, { label: 'ifTimer_Settings.timerStartMetricID', value: m.ifTimer_Settings.timerStartMetricID || '', help: HELP.ifTimer_Settings, onChange: v => (m.ifTimer_Settings.timerStartMetricID = v) });
      addInput(grid, { label: 'ifTimer_Settings.timerDurationMetricID', value: m.ifTimer_Settings.timerDurationMetricID || '', onChange: v => (m.ifTimer_Settings.timerDurationMetricID = v) });
      addInput(grid, { label: 'ifTimer_Settings.stopTimerMessage', value: m.ifTimer_Settings.stopTimerMessage || '', onChange: v => (m.ifTimer_Settings.stopTimerMessage = v) });
      addInput(grid, { label: 'ifTimer_Settings.muteOutput (true/false)', value: String(Boolean(m.ifTimer_Settings.muteOutput)), kind: 'boolean', onChange: v => (m.ifTimer_Settings.muteOutput = v) });
    }

    card.appendChild(grid);
    metrics.appendChild(card);
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
    return `[\n${value.map(v => `${next}${toPrettyJs(v, indent + 2)}`).join(',\n')}\n${pad}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    return `{\n${entries.map(([k, v]) => `${next}${k}: ${toPrettyJs(v, indent + 2)}`).join(',\n')}\n${pad}}`;
  }
  return 'null';
}

function renderAll() { renderLockouts(); renderHabits(); }

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => {
    const active = t.dataset.tab === tabName;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === (tabName === 'lockouts' ? 'panelLockouts' : 'panelHabits')));
}

function setup() {
  document.getElementById('parseBtn').onclick = () => {
    const status = document.getElementById('importStatus');
    try {
      state.config = parseConfigFromText(document.getElementById('importText').value);
      status.className = 'status';
      status.textContent = 'Config parsed successfully.';
      renderAll();
    } catch (e) {
      status.className = 'status error';
      status.textContent = `Import failed: ${e.message}`;
    }
  };

  document.getElementById('resetBtn').onclick = () => {
    state.config = defaultConfig();
    document.getElementById('importStatus').textContent = 'Reset to default template.';
    renderAll();
  };

  document.getElementById('addBlockBtn').onclick = () => {
    state.config.lockoutsV2.blocks.push({
      id: '',
      type: 'duration_block',
      onBlock: { message: '', shortcutName: '', shortcutInput: '' },
      times: { beg: '04:00', end: '23:59' },
      presets: [],
      typeSpecific: { duration: { maxMinutes: 0, screenTimeID: '', rationing: { isON: false, begMinutes: 0, endMinutes: 0 } } }
    });
    renderAll();
  };

  document.getElementById('addMetricBtn').onclick = () => {
    state.config.metricSettings.push({ metricID: '', displayName: '', type: 'timestamp', recordType: 'overwrite' });
    renderAll();
  };

  document.getElementById('exportBtn').onclick = () => {
    document.getElementById('exportText').value = `function getAppConfig() {\n  return ${toPrettyJs(state.config, 2)};\n}`;
    document.getElementById('exportStatus').textContent = 'Generated Config.gs output.';
  };

  document.getElementById('copyBtn').onclick = async () => {
    const text = document.getElementById('exportText').value;
    const status = document.getElementById('exportStatus');
    if (!text.trim()) return (status.textContent = 'Generate output first.');
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = 'Copied to clipboard.';
    } catch {
      status.textContent = 'Clipboard failed; copy manually.';
      status.className = 'status error';
    }
  };

  document.querySelectorAll('.tab').forEach(tab => tab.onclick = () => switchTab(tab.dataset.tab));
  renderAll();
}

setup();
