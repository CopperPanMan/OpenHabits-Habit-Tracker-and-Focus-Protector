const DAY_OPTIONS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const METRIC_TYPES = ['number', 'duration', 'timestamp', 'due_by', 'start_timer', 'stop_timer'];
const RECORD_TYPES = ['overwrite', 'keep_first', 'add'];
const BLOCK_TYPES = ['duration_block', 'task_block', 'firstXMinutesAfterTimestamp_block'];

const HELP = {
  spreadsheetId: 'Apps Script property key that stores the spreadsheet ID. Use-case: keep sheet IDs out of source code.',
  trackingSheetName: 'Tracking tab name where metric rows live.',
  writeToNotion: 'Global Notion sync default. Metric-level writeToNotion can override this.',
  lateExtensionHours: 'Grace period (hours) for previous-day completion windows.',
  comparisonArray: 'Pairs of [daysAgo, label] used for insight comparisons.',
  metricID: 'Stable key used across streak IDs, points IDs, and lockout references.',
  metricType: 'Metric behavior. Timer-only fields appear for start_timer and stop_timer.',
  recordType: 'How new submissions affect existing values.',
  dates: 'Each row: [dayOfWeek, dueByTime, [[startHour,endHour], ...]].',
  ifTimer: 'Timer config for start_timer / stop_timer metrics, including linkage and output message.',
  blockType: 'Lockout block mode. Only matching typeSpecific sub-fields are shown.',
  presets: 'Calendar preset names that activate this block.',
  times: 'Active window in HH:MM local script time. beg == end means 24 hours.',
  rationing: 'Optional progressive allowance curve for duration blocks.',
  onBlockMessage: 'Message shown when blocked. Supports runtime tokens like {endTime}.',
};

const state = {
  config: defaultConfig(),
  activeTab: 'lockouts'
};

function defaultConfig() {
  return {
    scriptProperties: {
      spreadsheetId: 'spreadSheetID',
    },
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
            { text: ' Points', color: 'default' }
          ]
        },
        insightBlock: {
          blockType: 'paragraph',
          italic: true
        }
      },
      syncFields: {
        status: true,
        streak: true,
        pointMultiplier: true,
        points: true
      },
      propertyNames: {
        metricId: 'metricID',
        status: 'State',
        streak: 'Streak',
        pointMultiplier: 'Point Multiplier',
        points: 'Points'
      },
      completeStatusName: 'Complete'
    },
    dailyPointsID: 'point_total_today',
    cumulativePointsID: 'point_total_alltime',
    lateExtensionHours: 5,
    sheetConfig: {
      taskIdColumn: 1,
      labelColumn: 2,
      dataStartColumn: 3
    },
    habitsV2Insights: {
      comparisonArray: [
        [1, 'yesterday'],
        [2, '2 days ago'],
        [3, '3 days ago'],
        [4, '4 days ago'],
        [5, '5 days ago'],
        [6, '6 days ago'],
        [7, '7 days ago'],
        [14, 'two weeks ago'],
        [21, '3 weeks ago'],
        [30, 'this day last month'],
        [60, '2 months ago'],
        [90, '3 months ago'],
        [180, '6 months ago'],
        [365, 'one year ago today'],
        [730, '2 years ago today']
      ],
      posPerformanceFreq: 0.75,
      negPerformanceFreq: 0.25,
      averageSpan: 7
    },
    metricSettings: [],
    lockoutsV2: {
      globals: {
        cumulativeScreentimeID: 'cumulative_app_opened',
        barLength: 20,
        presetCalendarName: 'App Lockout Settings'
      },
      blocks: []
    }
  };
}

function defaultMetric() {
  return {
    metricID: '',
    type: 'number',
    displayName: '',
    recordType: 'overwrite',
    dates: [['Monday', '23:59', [[0, 24]]]],
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
      insightUnits: ''
    },
    ppnMessage: ['', ''],
    writeToNotion: true,
    ifTimer_Settings: {
      stopTimerMessage: '',
      timerStartMetricID: null,
      timerDurationMetricID: null,
      muteOutput: false
    }
  };
}

function defaultBlock() {
  return {
    id: '',
    type: 'duration_block',
    presets: [],
    times: { beg: '00:00', end: '00:00' },
    typeSpecific: {
      duration: {
        maxMinutes: 0,
        screenTimeID: '',
        rationing: { isON: false, begMinutes: 0, endMinutes: 0 }
      },
      task_block_IDs: [],
      firstXMinutes: { minutes: 0, timestampID: '' }
    },
    onBlock: { message: '', shortcutName: '', shortcutInput: '' }
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
  if (returnIdx === -1) throw new Error('No return statement found. Paste a full Config.gs body.');
  const start = text.indexOf('{', returnIdx);
  if (start === -1) throw new Error('No object found after return.');

  let depth = 0;
  let inS = false;
  let inD = false;
  let inT = false;
  let esc = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\') {
      esc = true;
      continue;
    }
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

  throw new Error('Could not find matching braces for returned object.');
}

function sanitizeConfig(parsedConfig) {
  const merged = deepMerge(defaultConfig(), parsedConfig);
  merged.metricSettings = Array.isArray(merged.metricSettings)
    ? merged.metricSettings.map((m) => deepMerge(defaultMetric(), m || {}))
    : [];
  merged.lockoutsV2 = merged.lockoutsV2 || { globals: {}, blocks: [] };
  merged.lockoutsV2.globals = deepMerge(defaultConfig().lockoutsV2.globals, merged.lockoutsV2.globals || {});
  merged.lockoutsV2.blocks = Array.isArray(merged.lockoutsV2.blocks)
    ? merged.lockoutsV2.blocks.map((b) => deepMerge(defaultBlock(), b || {}))
    : [];
  return merged;
}

function parseConfigFromText(text) {
  const objectLiteral = extractReturnedObjectLiteral(text);
  const parsed = Function(`"use strict"; return (${objectLiteral});`)();
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Parsed return value is not an object.');
  }
  return sanitizeConfig(parsed);
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

function validateValue(raw, kind, opts = {}) {
  if (kind === 'text') return { valid: true, value: raw };
  if (kind === 'boolean') {
    if (raw === 'true' || raw === 'false') return { valid: true, value: raw === 'true' };
    return { valid: false, message: 'Must be true or false.' };
  }
  if (kind === 'number') {
    if (raw === '' || Number.isNaN(Number(raw))) return { valid: false, message: 'Must be a number.' };
    const num = Number(raw);
    if (opts.min !== undefined && num < opts.min) return { valid: false, message: `Must be ≥ ${opts.min}.` };
    if (opts.max !== undefined && num > opts.max) return { valid: false, message: `Must be ≤ ${opts.max}.` };
    return { valid: true, value: num };
  }
  if (kind === 'time') {
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(raw)) return { valid: false, message: 'Use HH:MM (24h).' };
    return { valid: true, value: raw };
  }
  return { valid: true, value: raw };
}

function labelWithHelp(text, help) {
  const label = el('label', { text });
  if (help) {
    const icon = el('span', { class: 'help', tabindex: '0', text: '?' });
    icon.dataset.help = help;
    label.appendChild(icon);
  }
  return label;
}

function addInput(container, opts) {
  const field = el('div', { class: 'field' });
  field.appendChild(labelWithHelp(opts.label, opts.help));
  const error = el('div', { class: 'error-message' });

  let input;
  if (opts.select) {
    input = el('select');
    opts.select.forEach((v) => input.appendChild(el('option', { value: v, text: v })));
    input.value = String(opts.value ?? opts.select[0]);
  } else {
    input = el('input', { type: 'text', placeholder: opts.placeholder || '' });
    input.value = opts.value === null || opts.value === undefined ? '' : String(opts.value);
  }

  function onEdit() {
    const raw = input.value.trim();
    const result = opts.kind ? validateValue(raw, opts.kind, opts.validateOptions) : { valid: true, value: raw };
    if (!result.valid) {
      error.textContent = result.message;
      return;
    }
    error.textContent = '';
    opts.onChange(result.value);
    if (opts.onRender) opts.onRender();
  }

  input.addEventListener('input', onEdit);

  field.appendChild(input);
  field.appendChild(error);
  container.appendChild(field);
}

function addJsonArea(container, opts) {
  const field = el('div', { class: 'field wide' });
  field.appendChild(labelWithHelp(opts.label, opts.help));
  const area = el('textarea', { rows: opts.rows || '4' });
  area.value = JSON.stringify(opts.value ?? null, null, 2);
  const error = el('div', { class: 'error-message' });

  area.addEventListener('input', () => {
    try {
      const parsed = JSON.parse(area.value);
      opts.validate?.(parsed);
      opts.onChange(parsed);
      error.textContent = '';
    } catch (err) {
      error.textContent = err.message || 'Must be valid JSON.';
    }
  });

  field.appendChild(area);
  field.appendChild(error);
  container.appendChild(field);
}

function validateDatesArray(value) {
  if (!Array.isArray(value)) throw new Error('dates must be an array.');
  value.forEach((entry) => {
    if (!Array.isArray(entry) || entry.length < 3) throw new Error('Each date row must be [day, dueByTime, windows].');
    if (!DAY_OPTIONS.includes(entry[0])) throw new Error(`Invalid day: ${entry[0]}`);
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(entry[1])) throw new Error('dueByTime must use HH:MM.');
    if (!Array.isArray(entry[2])) throw new Error('allowedWindows must be an array.');
  });
}

function validateComparisonArray(value) {
  if (!Array.isArray(value)) throw new Error('comparisonArray must be an array.');
  value.forEach((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2) throw new Error('comparisonArray entries must be [number, label].');
    if (typeof entry[0] !== 'number' || typeof entry[1] !== 'string') throw new Error('comparisonArray entry types must be [number, string].');
  });
}

function renderLockoutGlobals(container) {
  const g = state.config.lockoutsV2.globals;
  addInput(container, {
    label: 'cumulativeScreentimeID',
    value: g.cumulativeScreentimeID,
    kind: 'text',
    onChange: (v) => { g.cumulativeScreentimeID = v; }
  });
  addInput(container, {
    label: 'barLength',
    value: g.barLength,
    kind: 'number',
    validateOptions: { min: 0 },
    onChange: (v) => { g.barLength = v; }
  });
  addInput(container, {
    label: 'presetCalendarName',
    value: g.presetCalendarName,
    kind: 'text',
    onChange: (v) => { g.presetCalendarName = v; }
  });
}

function renderBlocks(container) {
  state.config.lockoutsV2.blocks.forEach((block, index) => {
    const card = el('div', { class: 'item' });
    const title = el('div', { class: 'item-title' }, [el('strong', { text: `Block #${index + 1}` })]);
    const remove = el('button', { type: 'button', class: 'remove', text: 'Remove' });
    remove.onclick = () => {
      state.config.lockoutsV2.blocks.splice(index, 1);
      renderAll();
    };
    title.appendChild(remove);
    card.appendChild(title);

    const grid = el('div', { class: 'form-grid' });

    addInput(grid, { label: 'id', value: block.id, kind: 'text', onChange: (v) => { block.id = v; } });
    addInput(grid, {
      label: 'type',
      value: block.type,
      select: BLOCK_TYPES,
      help: HELP.blockType,
      onChange: (v) => {
        block.type = v;
      },
      onRender: renderAll
    });
    addInput(grid, { label: 'times.beg', value: block.times.beg, kind: 'time', help: HELP.times, onChange: (v) => { block.times.beg = v; } });
    addInput(grid, { label: 'times.end', value: block.times.end, kind: 'time', help: HELP.times, onChange: (v) => { block.times.end = v; } });
    addJsonArea(grid, {
      label: 'presets (JSON string[])',
      value: block.presets,
      help: HELP.presets,
      onChange: (v) => { block.presets = v; },
      validate: (v) => {
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new Error('Presets must be string[].');
      }
    });

    addInput(grid, {
      label: 'onBlock.message',
      value: block.onBlock.message,
      kind: 'text',
      help: HELP.onBlockMessage,
      onChange: (v) => { block.onBlock.message = v; }
    });
    addInput(grid, { label: 'onBlock.shortcutName', value: block.onBlock.shortcutName, kind: 'text', onChange: (v) => { block.onBlock.shortcutName = v; } });
    addInput(grid, { label: 'onBlock.shortcutInput', value: block.onBlock.shortcutInput, kind: 'text', onChange: (v) => { block.onBlock.shortcutInput = v; } });

    if (block.type === 'duration_block') {
      const duration = block.typeSpecific.duration;
      addInput(grid, { label: 'typeSpecific.duration.maxMinutes', value: duration.maxMinutes, kind: 'number', validateOptions: { min: 0 }, onChange: (v) => { duration.maxMinutes = v; } });
      addInput(grid, { label: 'typeSpecific.duration.screenTimeID', value: duration.screenTimeID, kind: 'text', onChange: (v) => { duration.screenTimeID = v; } });
      addInput(grid, {
        label: 'typeSpecific.duration.rationing.isON',
        value: String(Boolean(duration.rationing.isON)),
        kind: 'boolean',
        help: HELP.rationing,
        onChange: (v) => { duration.rationing.isON = v; },
        onRender: renderAll
      });

      if (duration.rationing.isON) {
        addInput(grid, { label: 'typeSpecific.duration.rationing.begMinutes', value: duration.rationing.begMinutes, kind: 'number', validateOptions: { min: 0 }, onChange: (v) => { duration.rationing.begMinutes = v; } });
        addInput(grid, { label: 'typeSpecific.duration.rationing.endMinutes', value: duration.rationing.endMinutes, kind: 'number', validateOptions: { min: 0 }, onChange: (v) => { duration.rationing.endMinutes = v; } });
      }
    }

    if (block.type === 'task_block') {
      addJsonArea(grid, {
        label: 'typeSpecific.task_block_IDs (JSON string[])',
        value: block.typeSpecific.task_block_IDs,
        onChange: (v) => { block.typeSpecific.task_block_IDs = v; },
        validate: (v) => {
          if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new Error('task_block_IDs must be string[].');
        }
      });
    }

    if (block.type === 'firstXMinutesAfterTimestamp_block') {
      const firstX = block.typeSpecific.firstXMinutes;
      addInput(grid, { label: 'typeSpecific.firstXMinutes.minutes', value: firstX.minutes, kind: 'number', validateOptions: { min: 0 }, onChange: (v) => { firstX.minutes = v; } });
      addInput(grid, { label: 'typeSpecific.firstXMinutes.timestampID', value: firstX.timestampID, kind: 'text', onChange: (v) => { firstX.timestampID = v; } });
    }

    card.appendChild(grid);
    container.appendChild(card);
  });
}

function renderHabitsGlobals(container) {
  const c = state.config;
  addInput(container, { label: 'scriptProperties.spreadsheetId', value: c.scriptProperties.spreadsheetId, kind: 'text', help: HELP.spreadsheetId, onChange: (v) => { c.scriptProperties.spreadsheetId = v; } });
  addInput(container, { label: 'trackingSheetName', value: c.trackingSheetName, kind: 'text', help: HELP.trackingSheetName, onChange: (v) => { c.trackingSheetName = v; } });
  addInput(container, { label: 'writeToNotion', value: String(Boolean(c.writeToNotion)), kind: 'boolean', help: HELP.writeToNotion, onChange: (v) => { c.writeToNotion = v; } });
  addInput(container, { label: 'dailyPointsID', value: c.dailyPointsID, kind: 'text', onChange: (v) => { c.dailyPointsID = v; } });
  addInput(container, { label: 'cumulativePointsID', value: c.cumulativePointsID, kind: 'text', onChange: (v) => { c.cumulativePointsID = v; } });
  addInput(container, { label: 'lateExtensionHours', value: c.lateExtensionHours, kind: 'number', help: HELP.lateExtensionHours, onChange: (v) => { c.lateExtensionHours = v; } });

  addInput(container, { label: 'sheetConfig.taskIdColumn', value: c.sheetConfig.taskIdColumn, kind: 'number', onChange: (v) => { c.sheetConfig.taskIdColumn = v; } });
  addInput(container, { label: 'sheetConfig.labelColumn', value: c.sheetConfig.labelColumn, kind: 'number', onChange: (v) => { c.sheetConfig.labelColumn = v; } });
  addInput(container, { label: 'sheetConfig.dataStartColumn', value: c.sheetConfig.dataStartColumn, kind: 'number', onChange: (v) => { c.sheetConfig.dataStartColumn = v; } });

  addJsonArea(container, { label: 'notion (JSON object)', value: c.notion, onChange: (v) => { c.notion = v; }, validate: (v) => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('notion must be an object.'); } });

  addJsonArea(container, {
    label: 'habitsV2Insights.comparisonArray',
    value: c.habitsV2Insights.comparisonArray,
    help: HELP.comparisonArray,
    onChange: (v) => { c.habitsV2Insights.comparisonArray = v; },
    validate: validateComparisonArray
  });
  addInput(container, { label: 'habitsV2Insights.posPerformanceFreq', value: c.habitsV2Insights.posPerformanceFreq, kind: 'number', validateOptions: { min: 0, max: 1 }, onChange: (v) => { c.habitsV2Insights.posPerformanceFreq = v; } });
  addInput(container, { label: 'habitsV2Insights.negPerformanceFreq', value: c.habitsV2Insights.negPerformanceFreq, kind: 'number', validateOptions: { min: 0, max: 1 }, onChange: (v) => { c.habitsV2Insights.negPerformanceFreq = v; } });
  addInput(container, { label: 'habitsV2Insights.averageSpan', value: c.habitsV2Insights.averageSpan, kind: 'number', validateOptions: { min: 1 }, onChange: (v) => { c.habitsV2Insights.averageSpan = v; } });
}

function renderMetrics(container) {
  state.config.metricSettings.forEach((metric, index) => {
    const card = el('div', { class: 'item' });
    const title = el('div', { class: 'item-title' }, [el('strong', { text: `Metric #${index + 1}` })]);
    const remove = el('button', { type: 'button', class: 'remove', text: 'Remove' });
    remove.onclick = () => {
      state.config.metricSettings.splice(index, 1);
      renderAll();
    };
    title.appendChild(remove);
    card.appendChild(title);

    const grid = el('div', { class: 'form-grid' });

    addInput(grid, { label: 'metricID', value: metric.metricID, kind: 'text', help: HELP.metricID, onChange: (v) => { metric.metricID = v; } });
    addInput(grid, { label: 'displayName', value: metric.displayName, kind: 'text', onChange: (v) => { metric.displayName = v; } });
    addInput(grid, {
      label: 'type',
      value: metric.type,
      select: METRIC_TYPES,
      help: HELP.metricType,
      onChange: (v) => { metric.type = v; },
      onRender: renderAll
    });
    addInput(grid, {
      label: 'recordType',
      value: metric.recordType,
      select: RECORD_TYPES,
      help: HELP.recordType,
      onChange: (v) => { metric.recordType = v; }
    });
    addInput(grid, { label: 'writeToNotion', value: String(Boolean(metric.writeToNotion)), kind: 'boolean', onChange: (v) => { metric.writeToNotion = v; } });

    addJsonArea(grid, { label: 'dates', value: metric.dates, help: HELP.dates, onChange: (v) => { metric.dates = v; }, validate: validateDatesArray });
    addJsonArea(grid, {
      label: 'streaks (JSON)',
      value: metric.streaks,
      onChange: (v) => { metric.streaks = v; },
      validate: (v) => { if (!v || typeof v !== 'object') throw new Error('streaks must be an object.'); }
    });
    addJsonArea(grid, {
      label: 'points (JSON)',
      value: metric.points,
      onChange: (v) => { metric.points = v; },
      validate: (v) => {
        if (!v || typeof v !== 'object') throw new Error('points must be an object.');
        if (typeof v.value !== 'number') throw new Error('points.value must be a number.');
      }
    });
    addJsonArea(grid, {
      label: 'insights (JSON)',
      value: metric.insights,
      onChange: (v) => { metric.insights = v; },
      validate: (v) => { if (!v || typeof v !== 'object') throw new Error('insights must be an object.'); }
    });
    addJsonArea(grid, {
      label: 'ppnMessage (JSON [string,string])',
      value: metric.ppnMessage,
      onChange: (v) => { metric.ppnMessage = v; },
      validate: (v) => {
        if (!Array.isArray(v) || v.length !== 2 || v.some((x) => typeof x !== 'string')) {
          throw new Error('ppnMessage must be [string, string].');
        }
      }
    });

    const timerType = metric.type === 'start_timer' || metric.type === 'stop_timer';
    if (timerType) {
      addInput(grid, { label: 'ifTimer_Settings.stopTimerMessage', value: metric.ifTimer_Settings.stopTimerMessage, kind: 'text', help: HELP.ifTimer, onChange: (v) => { metric.ifTimer_Settings.stopTimerMessage = v; } });
      addInput(grid, { label: 'ifTimer_Settings.timerStartMetricID', value: metric.ifTimer_Settings.timerStartMetricID ?? '', kind: 'text', onChange: (v) => { metric.ifTimer_Settings.timerStartMetricID = v || null; } });
      addInput(grid, { label: 'ifTimer_Settings.timerDurationMetricID', value: metric.ifTimer_Settings.timerDurationMetricID ?? '', kind: 'text', onChange: (v) => { metric.ifTimer_Settings.timerDurationMetricID = v || null; } });
      addInput(grid, { label: 'ifTimer_Settings.muteOutput', value: String(Boolean(metric.ifTimer_Settings.muteOutput)), kind: 'boolean', onChange: (v) => { metric.ifTimer_Settings.muteOutput = v; } });
    }

    card.appendChild(grid);
    container.appendChild(card);
  });
}

function renderAll() {
  const lockoutGlobals = document.getElementById('lockoutGlobals');
  const blocksContainer = document.getElementById('blocksContainer');
  const habitsGlobals = document.getElementById('habitsGlobals');
  const metricsContainer = document.getElementById('metricsContainer');

  lockoutGlobals.innerHTML = '';
  blocksContainer.innerHTML = '';
  habitsGlobals.innerHTML = '';
  metricsContainer.innerHTML = '';

  renderLockoutGlobals(lockoutGlobals);
  renderBlocks(blocksContainer);
  renderHabitsGlobals(habitsGlobals);
  renderMetrics(metricsContainer);
  switchTab(state.activeTab);
}

function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.tab').forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === tabName);
  });
}

function toPrettyJs(value, indent = 0) {
  const pad = ' '.repeat(indent);
  const next = ' '.repeat(indent + 2);

  if (value === null) return 'null';
  if (typeof value === 'string') return `'${value.replaceAll("'", "\\'")}'`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[` + `\n${value.map((entry) => `${next}${toPrettyJs(entry, indent + 2)}`).join(',\n')}\n${pad}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    return `{\n${entries.map(([k, v]) => `${next}${k}: ${toPrettyJs(v, indent + 2)}`).join(',\n')}\n${pad}}`;
  }

  return 'null';
}

function setup() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.onclick = () => switchTab(tab.dataset.tab);
  });

  document.getElementById('parseBtn').onclick = () => {
    const status = document.getElementById('importStatus');
    try {
      state.config = parseConfigFromText(document.getElementById('importText').value);
      status.className = 'status';
      status.textContent = 'Config parsed successfully.';
      renderAll();
    } catch (error) {
      status.className = 'status error';
      status.textContent = `Import failed: ${error.message}`;
    }
  };

  document.getElementById('resetBtn').onclick = () => {
    state.config = defaultConfig();
    document.getElementById('importStatus').className = 'status';
    document.getElementById('importStatus').textContent = 'Reset to default config template.';
    renderAll();
  };

  document.getElementById('addMetricBtn').onclick = () => {
    state.config.metricSettings.push(defaultMetric());
    renderAll();
  };

  document.getElementById('addBlockBtn').onclick = () => {
    state.config.lockoutsV2.blocks.push(defaultBlock());
    renderAll();
  };

  document.getElementById('exportBtn').onclick = () => {
    const output = `function getAppConfig() {\n  return ${toPrettyJs(state.config, 2)};\n}`;
    document.getElementById('exportText').value = output;
    const status = document.getElementById('exportStatus');
    status.className = 'status';
    status.textContent = 'Generated Config.gs successfully.';
  };

  document.getElementById('copyBtn').onclick = async () => {
    const output = document.getElementById('exportText').value;
    const status = document.getElementById('exportStatus');
    if (!output.trim()) {
      status.className = 'status error';
      status.textContent = 'Generate Config.gs first.';
      return;
    }
    try {
      await navigator.clipboard.writeText(output);
      status.className = 'status';
      status.textContent = 'Copied to clipboard.';
    } catch {
      status.className = 'status error';
      status.textContent = 'Clipboard API failed. Copy from the box manually.';
    }
  };

  renderAll();
}

setup();
