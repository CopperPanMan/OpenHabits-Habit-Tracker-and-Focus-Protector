const DAY_OPTIONS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const METRIC_TYPES = ['number', 'duration', 'timestamp', 'due_by', 'start_timer', 'stop_timer'];
const RECORD_TYPES = ['overwrite', 'keep_first', 'add'];
const BLOCK_TYPES = ['duration_block', 'task_block', 'firstXMinutesAfterTimestamp_block'];
const POINT_BLOCK_TYPES = ['heading_1', 'heading_2', 'heading_3', 'paragraph', 'quote', 'bulleted_list_item', 'numbered_list_item', 'to_do'];
const SEGMENT_COLORS = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];

const HELP = {
  spreadsheetId: 'The Apps Script property name that stores the Google Sheet ID.',
  trackingSheetName: 'The tab name in your Google Sheet where metrics are logged over time.',
  writeToNotion: 'Default setting for whether metrics should sync to Notion unless overridden per metric.',
  dailyPointsID: 'Metric ID of the row that stores today\'s running point total.',
  cumulativePointsID: 'Metric ID of the row that stores the all-time running point total.',
  lateExtensionHours: 'How many hours after midnight still count as the previous day.',
  taskIdColumn: 'Column number in the tracking sheet that contains task or metric IDs.',
  labelColumn: 'Column number in the tracking sheet that contains display labels.',
  dataStartColumn: 'First column number where daily data begins.',
  comparisonArray: 'Comparison offsets used when generating performance insights.',
  notionDatabaseIdsScriptProperty: 'Script property name that stores the list of Notion database IDs.',
  pointBlockIdScriptProperty: 'Script property name that stores the synced Notion point block ID.',
  insightBlockIdScriptProperty: 'Script property name that stores the synced Notion insight block ID.',
  metricId: 'Stable internal ID for this metric. Other parts of the system refer to this exact value.',
  displayName: 'Friendly name shown to the user in outputs and editors.',
  metricType: 'What kind of value this metric records.',
  recordType: 'How repeated logs on the same day should behave.',
  dates: 'Rules for which day this metric is expected and what time window counts.',
  streaksID: 'Metric ID of the row where this metric\'s streak count should be written.',
  pointsValue: 'Base point value awarded by this metric.',
  multiplierDays: 'How many streak days it takes to reach the max point multiplier.',
  maxMultiplier: 'Highest multiplier this metric can reach from streaking.',
  pointsID: 'Metric ID of the row where this metric\'s point total for today is stored.',
  insightChance: 'Chance that an insight message is generated when this metric is logged.',
  streakProb: 'Chance that the insight focuses on streaks.',
  dayToDayChance: 'Chance that insight compares directly against a past day instead of an average.',
  dayToAvgChance: 'Chance that insight compares today against an average window.',
  rawValueChance: 'Chance the message uses raw values instead of percentages.',
  increaseGood: 'Use 1 when higher values are better, or -1 when lower values are better.',
  firstWords: 'Beginning phrase used in generated insight text.',
  insightUnits: 'Units used in generated insight text, like minutes, pounds, or reps.',
  stopTimerMessage: 'Message shown when a stop timer metric is logged.',
  timerStartMetricID: 'Metric ID used to store the timer\'s start timestamp.',
  timerDurationMetricID: 'Metric ID used to store the timer\'s accumulated duration.',
  muteOutput: 'If on, timer logging will not return timer messages to the user.',
  cumulativeScreentimeID: 'Metric ID used for total screen time today.',
  timeOpenedID: 'Metric ID where the system stores when a blocked app or site was opened.',
  barLength: 'How many characters wide the usage bar should be.',
  presetCalendarName: 'Calendar name used to activate lockout presets.',
  blockId: 'Unique internal ID for this block.',
  blockType: 'What kind of blocking behavior this block uses.',
  presets: 'Optional preset names that must be active for this block to apply.',
  blockBeg: 'Start time for when this block becomes active.',
  blockEnd: 'End time for when this block stops being active.',
  onBlockMessage: 'Message shown to the user when this block wins.',
  shortcutName: 'Shortcut to run when this block wins.',
  shortcutInput: 'Input passed into the shortcut when this block wins.',
  maxMinutes: 'Maximum minutes allowed during this block window.',
  screenTimeID: 'Metric ID that stores the usage amount checked by this block.',
  rationingIsOn: 'If on, allowance ramps over time instead of being available all at once.',
  begMinutes: 'Allowed minutes at the beginning of the block window.',
  endMinutes: 'Allowed minutes by the end of the block window.',
  taskBlockIDs: 'Metric IDs that must be completed to avoid being blocked.',
  firstXMinutes: 'How many minutes after the timestamp this block should remain active.',
  timestampID: 'Metric ID that stores the timestamp checked by this block.',
  segmentToken: 'Special token inserted into the Notion point output.',
  segmentText: 'Literal text inserted into the Notion point output.',
  segmentColor: 'Color styling for this text segment in Notion.',
};

const state = {
  config: defaultConfig(),
  activeTab: 'global',
};

function defaultConfig() {
  return {
    scriptProperties: {
      spreadsheetId: 'spreadSheetID',
      homeWifiName: 'homeWifiName',
      workWifiName: 'workWifiName',
    },
    trackingSheetName: 'Tracking Data',
    writeToNotion: false,
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
        insightBlock: {
          blockType: 'paragraph',
          italic: true,
        },
      },
      propertyNames: {
        metricId: 'metricID',
        status: 'Status',
        streak: 'Streak',
        pointMultiplier: 'Point Multiplier',
        points: 'Points',
      },
      completeStatusName: 'Complete',
    },
    dailyPointsID: 'point_total_today',
    cumulativePointsID: 'point_total_alltime',
    lateExtensionHours: 5,
    sheetConfig: {
      trackingSheetName: 'Tracking Data',
      separatorChar: 'Ù',
      taskIdColumn: 1,
      labelColumn: 2,
      dataStartColumn: 3,
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
        [730, '2 years ago today'],
      ],
      posPerformanceFreq: 0.75,
      negPerformanceFreq: 0.25,
      averageSpan: 7,
    },
    metricSettings: [],
    lockoutsV2: {
      globals: {
        cumulativeScreentimeID: null,
        timeOpenedID: 'timeOpenedID',
        barLength: 20,
        presetCalendarName: '',
      },
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
    dates: [
      ['Monday', '23:59', 0, 24],
    ],
    streaks: {
      unit: 'days',
      streaksID: '',
    },
    points: {
      value: 0,
      multiplierDays: 0,
      maxMultiplier: 1,
      pointsID: '',
    },
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
    times: {
      beg: '00:00',
      end: '00:00',
    },
    typeSpecific: {
      duration: {
        maxMinutes: 0,
        screenTimeID: '',
        rationing: {
          isON: false,
          begMinutes: 0,
          endMinutes: 0,
        },
      },
      task_block_IDs: [],
      firstXMinutes: {
        minutes: 0,
        timestampID: '',
      },
    },
    onBlock: {
      message: '',
      shortcutName: '',
      shortcutInput: '',
    },
  };
}

function deepMerge(base, incoming) {
  if (Array.isArray(base)) return Array.isArray(incoming) ? incoming : base;
  if (!base || typeof base !== 'object') return incoming === undefined ? base : incoming;
  const out = { ...base };
  for (const [key, value] of Object.entries(incoming || {})) {
    out[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return out;
}

function extractReturnedObjectLiteral(text) {
  const returnIdx = text.indexOf('return');
  if (returnIdx === -1) throw new Error('No return statement found. Paste full Config.gs content.');
  const start = text.indexOf('{', returnIdx);
  if (start === -1) throw new Error('No config object found after return.');

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (!inDouble && !inTemplate && ch === "'") inSingle = !inSingle;
    else if (!inSingle && !inTemplate && ch === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === '`') inTemplate = !inTemplate;
    else if (!inSingle && !inDouble && !inTemplate) {
      if (ch === '{') depth += 1;
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
  }

  throw new Error('Could not find matching closing brace for returned config object.');
}

function normalizeMetricDateRule(rule) {
  if (!Array.isArray(rule)) return ['Monday', '23:59', 0, 24];

  const day = DAY_OPTIONS.includes(rule[0]) ? rule[0] : 'Monday';
  const dueBy = typeof rule[1] === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(rule[1]) ? rule[1] : '23:59';

  if (Array.isArray(rule[2])) {
    const firstWindow = Array.isArray(rule[2][0]) ? rule[2][0] : [0, 24];
    const startHour = Number.isFinite(Number(firstWindow[0])) ? Number(firstWindow[0]) : 0;
    const endHour = Number.isFinite(Number(firstWindow[1])) ? Number(firstWindow[1]) : 24;
    return [day, dueBy, startHour, endHour];
  }

  const startHour = Number.isFinite(Number(rule[2])) ? Number(rule[2]) : 0;
  const endHour = Number.isFinite(Number(rule[3])) ? Number(rule[3]) : 24;
  return [day, dueBy, startHour, endHour];
}

function sanitizeConfig(parsed) {
  const merged = deepMerge(defaultConfig(), parsed);

  merged.metricSettings = Array.isArray(merged.metricSettings)
    ? merged.metricSettings.map((metric) => deepMerge(defaultMetric(), metric || {}))
    : [];

  merged.metricSettings.forEach((metric) => {
    metric.dates = Array.isArray(metric.dates)
      ? metric.dates.map(normalizeMetricDateRule)
      : [['Monday', '23:59', 0, 24]];

    if (!metric.streaks || typeof metric.streaks !== 'object') metric.streaks = { unit: 'days', streaksID: '' };
    if (!metric.points || typeof metric.points !== 'object') metric.points = { value: 0, multiplierDays: 0, maxMultiplier: 1, pointsID: '' };
    if (!metric.insights || typeof metric.insights !== 'object') metric.insights = deepMerge(defaultMetric().insights, metric.insights || {});
    if (!metric.ifTimer_Settings || typeof metric.ifTimer_Settings !== 'object') metric.ifTimer_Settings = deepMerge(defaultMetric().ifTimer_Settings, metric.ifTimer_Settings || {});
    delete metric.ppnMessage;
  });

  if (!merged.lockoutsV2 || typeof merged.lockoutsV2 !== 'object') merged.lockoutsV2 = { globals: {}, blocks: [] };
  merged.lockoutsV2.globals = deepMerge(defaultConfig().lockoutsV2.globals, merged.lockoutsV2.globals || {});
  merged.lockoutsV2.blocks = Array.isArray(merged.lockoutsV2.blocks)
    ? merged.lockoutsV2.blocks.map((block) => deepMerge(defaultBlock(), block || {}))
    : [];

  return merged;
}

function parseConfigFromText(text) {
  const objectLiteral = extractReturnedObjectLiteral(text);
  const parsed = Function(`"use strict"; return (${objectLiteral});`)();
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Parsed Config.gs did not produce an object.');
  }
  return sanitizeConfig(parsed);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else node.setAttribute(key, value);
  });
  children.forEach((child) => node.appendChild(child));
  return node;
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function labelWithHelp(text, help) {
  const label = el('label', { class: 'field-label' });
  label.appendChild(document.createTextNode(text));
  const icon = el('span', { class: 'help', tabindex: '0', text: '?' });
  icon.dataset.help = help || 'Explanation coming soon.';
  label.appendChild(icon);
  return label;
}

function addField(container, { label, help, type = 'text', value, onInput, min, max, step = 'any', select, placeholder }) {
  const field = el('div', { class: 'field' });
  const error = el('div', { class: 'error-message' });
  field.appendChild(labelWithHelp(label, help));

  let input;
  if (select) {
    input = el('select');
    select.forEach((optionValue) => {
      input.appendChild(el('option', { value: optionValue, text: optionValue }));
    });
    input.value = value ?? '';
  } else if (type === 'boolean') {
    input = el('select');
    ['true', 'false'].forEach((optionValue) => {
      input.appendChild(el('option', { value: optionValue, text: optionValue === 'true' ? 'On / True' : 'Off / False' }));
    });
    input.value = String(Boolean(value));
  } else if (type === 'textarea') {
    input = el('textarea');
    input.rows = 3;
    input.value = value ?? '';
  } else {
    input = el('input', { type, step });
    input.value = value === null || value === undefined ? '' : String(value);
  }

  if (placeholder) input.placeholder = placeholder;
  if (min !== undefined) input.min = String(min);
  if (max !== undefined) input.max = String(max);

  const commit = () => {
    const raw = input.value;
    let parsed = raw;

    if (type === 'number') {
      if (raw === '' || Number.isNaN(Number(raw))) {
        error.textContent = 'Must be a valid number.';
        return;
      }
      parsed = Number(raw);
      if (min !== undefined && parsed < min) {
        error.textContent = `Must be at least ${min}.`;
        return;
      }
      if (max !== undefined && parsed > max) {
        error.textContent = `Must be at most ${max}.`;
        return;
      }
    } else if (type === 'time') {
      if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(raw)) {
        error.textContent = 'Use HH:MM in 24-hour time.';
        return;
      }
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

function addSection(container, title, className = '') {
  const section = el('section', { class: `editor-section ${className}`.trim() });
  section.appendChild(el('h3', { text: title }));
  container.appendChild(section);
  return section;
}

function addGridSection(container, title, className = '') {
  const section = addSection(container, title, className);
  const grid = el('div', { class: 'form-grid' });
  section.appendChild(grid);
  return { section, grid };
}

function createCollapsibleSection(title, startOpen = false) {
  const wrapper = el('details', { class: 'toggle-section' });
  if (startOpen) wrapper.open = true;
  const summary = el('summary', { text: title });
  const body = el('div', { class: 'toggle-section-body' });
  wrapper.append(summary, body);
  return { wrapper, body };
}

function moveInArray(arr, idx, delta) {
  const next = idx + delta;
  if (next < 0 || next >= arr.length) return;
  [arr[idx], arr[next]] = [arr[next], arr[idx]];
  renderAll();
}

function renderArrayEditor(container, { title, items, addLabel, makeItem, renderItem }) {
  const list = el('div', { class: 'nested-list' });
  list.appendChild(el('h4', { text: title }));

  items.forEach((item, idx) => {
    const card = el('div', { class: 'nested-item' });
    const header = el('div', { class: 'item-title' }, [el('strong', { text: `${title} #${idx + 1}` })]);
    const controls = el('div', { class: 'row compact' });

    const up = el('button', { type: 'button', class: 'secondary', text: 'Move Up' });
    up.onclick = () => moveInArray(items, idx, -1);
    const down = el('button', { type: 'button', class: 'secondary', text: 'Move Down' });
    down.onclick = () => moveInArray(items, idx, 1);
    const del = el('button', { type: 'button', class: 'remove', text: 'Delete' });
    del.onclick = () => {
      items.splice(idx, 1);
      renderAll();
    };

    controls.append(up, down, del);
    header.appendChild(controls);
    card.appendChild(header);
    renderItem(card, item, idx);
    list.appendChild(card);
  });

  const addBtn = el('button', { type: 'button', class: 'secondary', text: addLabel });
  addBtn.onclick = () => {
    items.push(makeItem());
    renderAll();
  };
  list.appendChild(addBtn);
  container.appendChild(list);
}

function renderGlobalTab() {
  const root = document.getElementById('globalContainer');
  clearNode(root);
  const config = state.config;

  const sheets = addGridSection(root, 'Google Sheets');
  addField(sheets.grid, {
    label: 'Spreadsheet ID Script Property Name',
    help: HELP.spreadsheetId,
    value: config.scriptProperties.spreadsheetId,
    onInput: (v) => { config.scriptProperties.spreadsheetId = v; },
  });
  addField(sheets.grid, {
    label: 'Tracking Sheet Name',
    help: HELP.trackingSheetName,
    value: config.trackingSheetName,
    onInput: (v) => { config.trackingSheetName = v; config.sheetConfig.trackingSheetName = v; },
  });
  addField(sheets.grid, {
    label: 'Late Extension Hours',
    help: HELP.lateExtensionHours,
    type: 'number',
    min: 0,
    value: config.lateExtensionHours,
    onInput: (v) => { config.lateExtensionHours = v; },
  });
  addField(sheets.grid, {
    label: 'Task / Metric ID Column',
    help: HELP.taskIdColumn,
    type: 'number',
    min: 1,
    value: config.sheetConfig.taskIdColumn,
    onInput: (v) => { config.sheetConfig.taskIdColumn = v; },
  });
  addField(sheets.grid, {
    label: 'Label Column',
    help: HELP.labelColumn,
    type: 'number',
    min: 1,
    value: config.sheetConfig.labelColumn,
    onInput: (v) => { config.sheetConfig.labelColumn = v; },
  });
  addField(sheets.grid, {
    label: 'First Data Column',
    help: HELP.dataStartColumn,
    type: 'number',
    min: 1,
    value: config.sheetConfig.dataStartColumn,
    onInput: (v) => { config.sheetConfig.dataStartColumn = v; },
  });

  const habits = addGridSection(root, 'Habits / Logging');
  addField(habits.grid, {
    label: 'Default Write to Notion',
    help: HELP.writeToNotion,
    type: 'boolean',
    value: config.writeToNotion,
    onInput: (v) => { config.writeToNotion = v; },
  });
  addField(habits.grid, {
    label: 'Daily Points Metric ID',
    help: HELP.dailyPointsID,
    value: config.dailyPointsID,
    onInput: (v) => { config.dailyPointsID = v; },
  });
  addField(habits.grid, {
    label: 'Cumulative Points Metric ID',
    help: HELP.cumulativePointsID,
    value: config.cumulativePointsID,
    onInput: (v) => { config.cumulativePointsID = v; },
  });

  const insights = addGridSection(root, 'Insights');
  addField(insights.grid, {
    label: 'Positive Performance Frequency',
    help: 'How often positive comparisons are favored in insight generation.',
    type: 'number',
    min: 0,
    max: 1,
    value: config.habitsV2Insights.posPerformanceFreq,
    onInput: (v) => { config.habitsV2Insights.posPerformanceFreq = v; },
  });
  addField(insights.grid, {
    label: 'Negative Performance Frequency',
    help: 'How often negative comparisons are favored in insight generation.',
    type: 'number',
    min: 0,
    max: 1,
    value: config.habitsV2Insights.negPerformanceFreq,
    onInput: (v) => { config.habitsV2Insights.negPerformanceFreq = v; },
  });
  addField(insights.grid, {
    label: 'Average Span',
    help: 'Number of days used for rolling average comparisons.',
    type: 'number',
    min: 1,
    value: config.habitsV2Insights.averageSpan,
    onInput: (v) => { config.habitsV2Insights.averageSpan = v; },
  });

  const comparisonToggle = createCollapsibleSection('Comparison Rules', false);
  insights.section.appendChild(comparisonToggle.wrapper);
  renderArrayEditor(comparisonToggle.body, {
    title: 'Comparison Rule',
    items: config.habitsV2Insights.comparisonArray,
    addLabel: 'Add Comparison Rule',
    makeItem: () => [1, 'label'],
    renderItem: (card, row) => {
      const grid = el('div', { class: 'form-grid' });
      addField(grid, {
        label: 'Days Ago',
        help: HELP.comparisonArray,
        type: 'number',
        min: 1,
        value: row[0],
        onInput: (v) => { row[0] = v; },
      });
      addField(grid, {
        label: 'Label',
        help: HELP.comparisonArray,
        value: row[1],
        onInput: (v) => { row[1] = v; },
      });
      card.appendChild(grid);
    },
  });

  const notion = addGridSection(root, 'Notion');
  addField(notion.grid, {
    label: 'Database IDs Script Property Name',
    help: HELP.notionDatabaseIdsScriptProperty,
    value: config.notion.databaseIdsScriptProperty,
    onInput: (v) => { config.notion.databaseIdsScriptProperty = v; },
  });
  addField(notion.grid, {
    label: 'Point Block ID Script Property Name',
    help: HELP.pointBlockIdScriptProperty,
    value: config.notion.pointBlockIdScriptProperty,
    onInput: (v) => { config.notion.pointBlockIdScriptProperty = v; },
  });
  addField(notion.grid, {
    label: 'Insight Block ID Script Property Name',
    help: HELP.insightBlockIdScriptProperty,
    value: config.notion.insightBlockIdScriptProperty,
    onInput: (v) => { config.notion.insightBlockIdScriptProperty = v; },
  });
  addField(notion.grid, {
    label: 'Point Output Block Type',
    help: 'Notion block type used for the point total block.',
    value: config.notion.outputStyles.pointBlock.blockType,
    select: POINT_BLOCK_TYPES,
    onInput: (v) => { config.notion.outputStyles.pointBlock.blockType = v; },
  });
  addField(notion.grid, {
    label: 'Insight Output Block Type',
    help: 'Notion block type used for the insight block.',
    value: config.notion.outputStyles.insightBlock.blockType,
    select: POINT_BLOCK_TYPES,
    onInput: (v) => { config.notion.outputStyles.insightBlock.blockType = v; },
  });
  addField(notion.grid, {
    label: 'Italicize Insight Block',
    help: 'Whether the generated Notion insight text should be italicized.',
    type: 'boolean',
    value: config.notion.outputStyles.insightBlock.italic,
    onInput: (v) => { config.notion.outputStyles.insightBlock.italic = v; },
  });
  addField(notion.grid, {
    label: 'Metric ID Property Name',
    help: 'Property name in Notion used to match metric IDs.',
    value: config.notion.propertyNames.metricId,
    onInput: (v) => { config.notion.propertyNames.metricId = v; },
  });
  addField(notion.grid, {
    label: 'Status Property Name',
    help: 'Property name in Notion used for status updates.',
    value: config.notion.propertyNames.status,
    onInput: (v) => { config.notion.propertyNames.status = v; },
  });
  addField(notion.grid, {
    label: 'Streak Property Name',
    help: 'Property name in Notion used for streak updates.',
    value: config.notion.propertyNames.streak,
    onInput: (v) => { config.notion.propertyNames.streak = v; },
  });
  addField(notion.grid, {
    label: 'Point Multiplier Property Name',
    help: 'Property name in Notion used for point multiplier updates.',
    value: config.notion.propertyNames.pointMultiplier,
    onInput: (v) => { config.notion.propertyNames.pointMultiplier = v; },
  });
  addField(notion.grid, {
    label: 'Points Property Name',
    help: 'Property name in Notion used for point updates.',
    value: config.notion.propertyNames.points,
    onInput: (v) => { config.notion.propertyNames.points = v; },
  });
  addField(notion.grid, {
    label: 'Complete Status Name',
    help: 'Status value written into Notion when a metric is completed.',
    value: config.notion.completeStatusName,
    onInput: (v) => { config.notion.completeStatusName = v; },
  });

  const segmentsToggle = createCollapsibleSection('Point Output Segments', false);
  notion.section.appendChild(segmentsToggle.wrapper);
  renderArrayEditor(segmentsToggle.body, {
    title: 'Segment',
    items: config.notion.outputStyles.pointBlock.segments,
    addLabel: 'Add Segment',
    makeItem: () => ({ token: '', text: '', color: 'default' }),
    renderItem: (card, segment) => {
      const grid = el('div', { class: 'form-grid' });
      addField(grid, {
        label: 'Token',
        help: HELP.segmentToken,
        value: segment.token || '',
        onInput: (v) => { segment.token = v; if (v) delete segment.text; },
      });
      addField(grid, {
        label: 'Text',
        help: HELP.segmentText,
        value: segment.text || '',
        onInput: (v) => { segment.text = v; if (v) delete segment.token; },
      });
      addField(grid, {
        label: 'Color',
        help: HELP.segmentColor,
        value: segment.color || 'default',
        select: SEGMENT_COLORS,
        onInput: (v) => { segment.color = v; },
      });
      card.appendChild(grid);
    },
  });

  const lockouts = addGridSection(root, 'Lockouts V2 Globals');
  addField(lockouts.grid, {
    label: 'Cumulative Screen Time Metric ID',
    help: HELP.cumulativeScreentimeID,
    value: config.lockoutsV2.globals.cumulativeScreentimeID || '',
    onInput: (v) => { config.lockoutsV2.globals.cumulativeScreentimeID = v || null; },
  });
  addField(lockouts.grid, {
    label: 'Time Opened Metric ID',
    help: HELP.timeOpenedID,
    value: config.lockoutsV2.globals.timeOpenedID,
    onInput: (v) => { config.lockoutsV2.globals.timeOpenedID = v; },
  });
  addField(lockouts.grid, {
    label: 'Usage Bar Length',
    help: HELP.barLength,
    type: 'number',
    min: 1,
    value: config.lockoutsV2.globals.barLength,
    onInput: (v) => { config.lockoutsV2.globals.barLength = v; },
  });
  addField(lockouts.grid, {
    label: 'Preset Calendar Name',
    help: HELP.presetCalendarName,
    value: config.lockoutsV2.globals.presetCalendarName,
    onInput: (v) => { config.lockoutsV2.globals.presetCalendarName = v; },
  });
}

function renderMetricDateRules(container, metric) {
  renderArrayEditor(container, {
    title: 'Date Rule',
    items: metric.dates,
    addLabel: 'Add Date Rule',
    makeItem: () => ['Monday', '23:59', 0, 24],
    renderItem: (card, rule) => {
      const grid = el('div', { class: 'form-grid' });
      addField(grid, {
        label: 'Day',
        help: HELP.dates,
        value: rule[0],
        select: DAY_OPTIONS,
        onInput: (v) => { rule[0] = v; },
      });
      addField(grid, {
        label: 'Due By',
        help: HELP.dates,
        type: 'time',
        value: rule[1],
        onInput: (v) => { rule[1] = v; },
      });
      addField(grid, {
        label: 'Start Hour',
        help: HELP.dates,
        type: 'number',
        min: 0,
        max: 24,
        value: rule[2],
        onInput: (v) => { rule[2] = v; },
      });
      addField(grid, {
        label: 'End Hour',
        help: HELP.dates,
        type: 'number',
        min: 0,
        max: 24,
        value: rule[3],
        onInput: (v) => { rule[3] = v; },
      });
      card.appendChild(grid);
    },
  });
}

function renderMetricsTab() {
  const root = document.getElementById('metricsContainer');
  clearNode(root);

  state.config.metricSettings.forEach((metric, idx) => {
    const card = el('div', { class: 'item' });
    const header = el('div', { class: 'item-title' }, [el('strong', { text: `Metric #${idx + 1}` })]);
    const controls = el('div', { class: 'row compact' });
    const up = el('button', { type: 'button', class: 'secondary', text: 'Move Up' });
    up.onclick = () => moveInArray(state.config.metricSettings, idx, -1);
    const down = el('button', { type: 'button', class: 'secondary', text: 'Move Down' });
    down.onclick = () => moveInArray(state.config.metricSettings, idx, 1);
    const remove = el('button', { type: 'button', class: 'remove', text: 'Delete' });
    remove.onclick = () => { state.config.metricSettings.splice(idx, 1); renderAll(); };
    controls.append(up, down, remove);
    header.appendChild(controls);
    card.appendChild(header);

    const basicGrid = el('div', { class: 'form-grid' });
    addField(basicGrid, {
      label: 'Metric ID',
      help: HELP.metricId,
      value: metric.metricID,
      onInput: (v) => { metric.metricID = v; },
    });
    addField(basicGrid, {
      label: 'Display Name',
      help: HELP.displayName,
      value: metric.displayName,
      onInput: (v) => { metric.displayName = v; },
    });
    addField(basicGrid, {
      label: 'Type',
      help: HELP.metricType,
      value: metric.type,
      select: METRIC_TYPES,
      onInput: (v) => { metric.type = v; renderAll(); },
    });
    addField(basicGrid, {
      label: 'Record Type',
      help: HELP.recordType,
      value: metric.recordType,
      select: RECORD_TYPES,
      onInput: (v) => { metric.recordType = v; },
    });
    addField(basicGrid, {
      label: 'Write to Notion',
      help: HELP.writeToNotion,
      type: 'boolean',
      value: metric.writeToNotion,
      onInput: (v) => { metric.writeToNotion = v; },
    });
    card.appendChild(basicGrid);

    const datesToggle = createCollapsibleSection('Date Rules', true);
    card.appendChild(datesToggle.wrapper);
    renderMetricDateRules(datesToggle.body, metric);

    const streaksToggle = createCollapsibleSection('Streak Properties', false);
    const streaksGrid = el('div', { class: 'form-grid' });
    addField(streaksGrid, {
      label: 'Unit',
      help: 'Word used when presenting the streak, like days or weeks.',
      value: metric.streaks.unit,
      onInput: (v) => { metric.streaks.unit = v; },
    });
    addField(streaksGrid, {
      label: 'Streak Metric ID',
      help: HELP.streaksID,
      value: metric.streaks.streaksID,
      onInput: (v) => { metric.streaks.streaksID = v; },
    });
    streaksToggle.body.appendChild(streaksGrid);
    card.appendChild(streaksToggle.wrapper);

    const pointsToggle = createCollapsibleSection('Points Properties', false);
    const pointsGrid = el('div', { class: 'form-grid' });
    addField(pointsGrid, {
      label: 'Base Value',
      help: HELP.pointsValue,
      type: 'number',
      value: metric.points.value,
      onInput: (v) => { metric.points.value = v; },
    });
    addField(pointsGrid, {
      label: 'Multiplier Days',
      help: HELP.multiplierDays,
      type: 'number',
      min: 0,
      value: metric.points.multiplierDays,
      onInput: (v) => { metric.points.multiplierDays = v; },
    });
    addField(pointsGrid, {
      label: 'Max Multiplier',
      help: HELP.maxMultiplier,
      type: 'number',
      min: 0,
      value: metric.points.maxMultiplier,
      onInput: (v) => { metric.points.maxMultiplier = v; },
    });
    addField(pointsGrid, {
      label: 'Points Metric ID',
      help: HELP.pointsID,
      value: metric.points.pointsID,
      onInput: (v) => { metric.points.pointsID = v; },
    });
    pointsToggle.body.appendChild(pointsGrid);
    card.appendChild(pointsToggle.wrapper);

    const insightsToggle = createCollapsibleSection('Insights Properties', false);
    const insightsGrid = el('div', { class: 'form-grid' });
    addField(insightsGrid, {
      label: 'Insight Chance',
      help: HELP.insightChance,
      type: 'number',
      min: 0,
      max: 1,
      value: metric.insights.insightChance,
      onInput: (v) => { metric.insights.insightChance = v; },
    });
    addField(insightsGrid, {
      label: 'Streak Probability',
      help: HELP.streakProb,
      type: 'number',
      min: 0,
      max: 1,
      value: metric.insights.streakProb,
      onInput: (v) => { metric.insights.streakProb = v; },
    });
    addField(insightsGrid, {
      label: 'Day-to-Day Chance',
      help: HELP.dayToDayChance,
      type: 'number',
      min: 0,
      max: 1,
      value: metric.insights.dayToDayChance,
      onInput: (v) => { metric.insights.dayToDayChance = v; },
    });
    addField(insightsGrid, {
      label: 'Day-to-Average Chance',
      help: HELP.dayToAvgChance,
      type: 'number',
      min: 0,
      max: 1,
      value: metric.insights.dayToAvgChance,
      onInput: (v) => { metric.insights.dayToAvgChance = v; },
    });
    addField(insightsGrid, {
      label: 'Raw Value Chance',
      help: HELP.rawValueChance,
      type: 'number',
      min: 0,
      max: 1,
      value: metric.insights.rawValueChance,
      onInput: (v) => { metric.insights.rawValueChance = v; },
    });
    addField(insightsGrid, {
      label: 'Increase Good',
      help: HELP.increaseGood,
      value: String(metric.insights.increaseGood),
      select: ['1', '-1'],
      onInput: (v) => { metric.insights.increaseGood = Number(v); },
    });
    addField(insightsGrid, {
      label: 'First Words',
      help: HELP.firstWords,
      value: metric.insights.firstWords,
      onInput: (v) => { metric.insights.firstWords = v; metric.insights.insightFirstWords = v; },
    });
    addField(insightsGrid, {
      label: 'Units',
      help: HELP.insightUnits,
      value: metric.insights.insightUnits,
      onInput: (v) => { metric.insights.insightUnits = v; },
    });
    insightsToggle.body.appendChild(insightsGrid);
    card.appendChild(insightsToggle.wrapper);

    const isTimer = metric.type === 'start_timer' || metric.type === 'stop_timer';
    if (isTimer) {
      const timerToggle = createCollapsibleSection('Timer Properties', true);
      const timerGrid = el('div', { class: 'form-grid' });
      addField(timerGrid, {
        label: 'Stop Timer Message',
        help: HELP.stopTimerMessage,
        value: metric.ifTimer_Settings.stopTimerMessage || '',
        onInput: (v) => { metric.ifTimer_Settings.stopTimerMessage = v; },
      });
      addField(timerGrid, {
        label: 'Timer Start Metric ID',
        help: HELP.timerStartMetricID,
        value: metric.ifTimer_Settings.timerStartMetricID || '',
        onInput: (v) => { metric.ifTimer_Settings.timerStartMetricID = v || null; },
      });
      addField(timerGrid, {
        label: 'Timer Duration Metric ID',
        help: HELP.timerDurationMetricID,
        value: metric.ifTimer_Settings.timerDurationMetricID || '',
        onInput: (v) => { metric.ifTimer_Settings.timerDurationMetricID = v || null; },
      });
      addField(timerGrid, {
        label: 'Mute Output',
        help: HELP.muteOutput,
        type: 'boolean',
        value: metric.ifTimer_Settings.muteOutput,
        onInput: (v) => { metric.ifTimer_Settings.muteOutput = v; },
      });
      timerToggle.body.appendChild(timerGrid);
      card.appendChild(timerToggle.wrapper);
    }

    root.appendChild(card);
  });
}

function renderPresetList(container, block) {
  renderArrayEditor(container, {
    title: 'Preset',
    items: block.presets,
    addLabel: 'Add Preset',
    makeItem: () => '',
    renderItem: (card, preset, idx) => {
      const grid = el('div', { class: 'form-grid' });
      addField(grid, {
        label: 'Preset Name',
        help: HELP.presets,
        value: preset,
        onInput: (v) => { block.presets[idx] = v; },
      });
      card.appendChild(grid);
    },
  });
}

function renderBlocksTab() {
  const root = document.getElementById('blocksContainer');
  clearNode(root);

  state.config.lockoutsV2.blocks.forEach((block, idx) => {
    const card = el('div', { class: 'item' });
    const header = el('div', { class: 'item-title' }, [el('strong', { text: `Block #${idx + 1}` })]);
    const controls = el('div', { class: 'row compact' });
    const up = el('button', { type: 'button', class: 'secondary', text: 'Move Up' });
    up.onclick = () => moveInArray(state.config.lockoutsV2.blocks, idx, -1);
    const down = el('button', { type: 'button', class: 'secondary', text: 'Move Down' });
    down.onclick = () => moveInArray(state.config.lockoutsV2.blocks, idx, 1);
    const remove = el('button', { type: 'button', class: 'remove', text: 'Delete' });
    remove.onclick = () => { state.config.lockoutsV2.blocks.splice(idx, 1); renderAll(); };
    controls.append(up, down, remove);
    header.appendChild(controls);
    card.appendChild(header);

    const basicGrid = el('div', { class: 'form-grid' });
    addField(basicGrid, {
      label: 'Block ID',
      help: HELP.blockId,
      value: block.id,
      onInput: (v) => { block.id = v; },
    });
    addField(basicGrid, {
      label: 'Block Type',
      help: HELP.blockType,
      value: block.type,
      select: BLOCK_TYPES,
      onInput: (v) => { block.type = v; renderAll(); },
    });
    addField(basicGrid, {
      label: 'Start Time',
      help: HELP.blockBeg,
      type: 'time',
      value: block.times.beg,
      onInput: (v) => { block.times.beg = v; },
    });
    addField(basicGrid, {
      label: 'End Time',
      help: HELP.blockEnd,
      type: 'time',
      value: block.times.end,
      onInput: (v) => { block.times.end = v; },
    });
    card.appendChild(basicGrid);

    const presetsToggle = createCollapsibleSection('Preset Names', false);
    renderPresetList(presetsToggle.body, block);
    card.appendChild(presetsToggle.wrapper);

    const onBlockToggle = createCollapsibleSection('On Block Actions', false);
    const onBlockGrid = el('div', { class: 'form-grid' });
    addField(onBlockGrid, {
      label: 'Message',
      help: HELP.onBlockMessage,
      type: 'textarea',
      value: block.onBlock.message,
      onInput: (v) => { block.onBlock.message = v; },
    });
    addField(onBlockGrid, {
      label: 'Shortcut Name',
      help: HELP.shortcutName,
      value: block.onBlock.shortcutName,
      onInput: (v) => { block.onBlock.shortcutName = v; },
    });
    addField(onBlockGrid, {
      label: 'Shortcut Input',
      help: HELP.shortcutInput,
      value: block.onBlock.shortcutInput,
      onInput: (v) => { block.onBlock.shortcutInput = v; },
    });
    onBlockToggle.body.appendChild(onBlockGrid);
    card.appendChild(onBlockToggle.wrapper);

    const typeToggle = createCollapsibleSection('Type-Specific Properties', true);
    const typeGrid = el('div', { class: 'form-grid' });

    if (block.type === 'duration_block') {
      addField(typeGrid, {
        label: 'Max Minutes Allowed',
        help: HELP.maxMinutes,
        type: 'number',
        min: 0,
        value: block.typeSpecific.duration.maxMinutes,
        onInput: (v) => { block.typeSpecific.duration.maxMinutes = v; },
      });
      addField(typeGrid, {
        label: 'Screen Time Metric ID',
        help: HELP.screenTimeID,
        value: block.typeSpecific.duration.screenTimeID,
        onInput: (v) => { block.typeSpecific.duration.screenTimeID = v; },
      });
      addField(typeGrid, {
        label: 'Use Rationing',
        help: HELP.rationingIsOn,
        type: 'boolean',
        value: block.typeSpecific.duration.rationing.isON,
        onInput: (v) => { block.typeSpecific.duration.rationing.isON = v; renderAll(); },
      });
      if (block.typeSpecific.duration.rationing.isON) {
        addField(typeGrid, {
          label: 'Beginning Allowed Minutes',
          help: HELP.begMinutes,
          type: 'number',
          min: 0,
          value: block.typeSpecific.duration.rationing.begMinutes,
          onInput: (v) => { block.typeSpecific.duration.rationing.begMinutes = v; },
        });
        addField(typeGrid, {
          label: 'Ending Allowed Minutes',
          help: HELP.endMinutes,
          type: 'number',
          min: 0,
          value: block.typeSpecific.duration.rationing.endMinutes,
          onInput: (v) => { block.typeSpecific.duration.rationing.endMinutes = v; },
        });
      }
    }

    if (block.type === 'task_block') {
      typeToggle.body.appendChild(typeGrid);
      card.appendChild(typeToggle.wrapper);
      renderArrayEditor(typeToggle.body, {
        title: 'Required Metric',
        items: block.typeSpecific.task_block_IDs,
        addLabel: 'Add Required Metric',
        makeItem: () => '',
        renderItem: (taskCard, taskMetricID, taskIdx) => {
          const grid = el('div', { class: 'form-grid' });
          addField(grid, {
            label: 'Metric ID',
            help: HELP.taskBlockIDs,
            value: taskMetricID,
            onInput: (v) => { block.typeSpecific.task_block_IDs[taskIdx] = v; },
          });
          taskCard.appendChild(grid);
        },
      });
      root.appendChild(card);
      return;
    }

    if (block.type === 'firstXMinutesAfterTimestamp_block') {
      addField(typeGrid, {
        label: 'Minutes',
        help: HELP.firstXMinutes,
        type: 'number',
        min: 0,
        value: block.typeSpecific.firstXMinutes.minutes,
        onInput: (v) => { block.typeSpecific.firstXMinutes.minutes = v; },
      });
      addField(typeGrid, {
        label: 'Timestamp Metric ID',
        help: HELP.timestampID,
        value: block.typeSpecific.firstXMinutes.timestampID,
        onInput: (v) => { block.typeSpecific.firstXMinutes.timestampID = v; },
      });
    }

    typeToggle.body.appendChild(typeGrid);
    card.appendChild(typeToggle.wrapper);
    root.appendChild(card);
  });
}

function setActiveTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.tab').forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === tabName);
  });
}

function renderAll() {
  renderGlobalTab();
  renderMetricsTab();
  renderBlocksTab();
  setActiveTab(state.activeTab);
}

function serializeConfigJsValue(value, indentLevel = 0) {
  const indent = '  '.repeat(indentLevel);
  const nextIndent = '  '.repeat(indentLevel + 1);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((item) => `${nextIndent}${serializeConfigJsValue(item, indentLevel + 1)}`);
    return `[
${items.join(',\n')}
${indent}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const props = entries.map(([key, val]) => `${nextIndent}${key}: ${serializeConfigJsValue(val, indentLevel + 1)}`);
    return `{
${props.join(',\n')}
${indent}}`;
  }

  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null) return 'null';
  return String(value);
}

function buildExportConfig() {
  const sanitized = sanitizeConfig(structuredClone(state.config));
  return `function getAppConfig() {\n  return ${serializeConfigJsValue(sanitized, 1)};\n}\n`;
}

function handleParse() {
  const input = document.getElementById('importText').value;
  const status = document.getElementById('importStatus');

  try {
    state.config = parseConfigFromText(input);
    status.textContent = 'Config parsed successfully.';
    status.classList.remove('error');
    renderAll();
  } catch (error) {
    status.textContent = error.message;
    status.classList.add('error');
  }
}

function handleReset() {
  state.config = defaultConfig();
  document.getElementById('importText').value = '';
  const importStatus = document.getElementById('importStatus');
  importStatus.textContent = 'Reset to default starter config.';
  importStatus.classList.remove('error');
  renderAll();
}

function handleExport() {
  const exportText = buildExportConfig();
  document.getElementById('exportText').value = exportText;
  const status = document.getElementById('exportStatus');
  status.textContent = 'Generated fresh Config.gs content.';
  status.classList.remove('error');
}

async function handleCopy() {
  const exportField = document.getElementById('exportText');
  const status = document.getElementById('exportStatus');

  if (!exportField.value) {
    exportField.value = buildExportConfig();
  }

  try {
    await navigator.clipboard.writeText(exportField.value);
    status.textContent = 'Copied to clipboard.';
    status.classList.remove('error');
  } catch (error) {
    status.textContent = 'Could not copy automatically. Select the text and copy manually.';
    status.classList.add('error');
  }
}

function wireUi() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
  });

  document.getElementById('parseBtn').addEventListener('click', handleParse);
  document.getElementById('resetBtn').addEventListener('click', handleReset);
  document.getElementById('exportBtn').addEventListener('click', handleExport);
  document.getElementById('copyBtn').addEventListener('click', handleCopy);
  document.getElementById('addMetricBtn').addEventListener('click', () => {
    state.config.metricSettings.push(defaultMetric());
    state.activeTab = 'metrics';
    renderAll();
  });
  document.getElementById('addBlockBtn').addEventListener('click', () => {
    state.config.lockoutsV2.blocks.push(defaultBlock());
    state.activeTab = 'blocks';
    renderAll();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  wireUi();
  renderAll();
});
