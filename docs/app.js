(function () {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function defaultConfig() {
    return {
      scriptProperties: { spreadsheetId: 'spreadSheetID' },
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
              { text: ' Points', color: 'default' }
            ]
          },
          insightBlock: { blockType: 'paragraph', italic: true }
        },
        syncFields: { status: true, streak: true, pointMultiplier: true, points: true },
        propertyNames: {
          metricId: 'metricID', status: 'State', streak: 'Streak',
          pointMultiplier: 'Point Multiplier', points: 'Points'
        },
        completeStatusName: 'Complete'
      },
      dailyPointsID: 'point_total_today',
      cumulativePointsID: 'point_total_alltime',
      lateExtensionHours: 5,
      sheetConfig: { taskIdColumn: 1, labelColumn: 2, dataStartColumn: 3 },
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
      lockouts: {
        globals: { cumulativeScreentimeID: 'cumulative_app_opened', timeOpenedID: 'timeOpenedID', barLength: 20, presetCalendarName: 'App Lockout Settings', defaultBlockTimezoneMode: 'fixed', cacheTimezoneMode: 'script' },
        presets: [],
        blocks: []
      }
    };
  }

  let state = defaultConfig();
  const sectionOpenState = new Map();
  const undoStack = [];
  const redoStack = [];
  const generatedMetricIds = new WeakSet();
  const generatedBlockIds = new WeakSet();
  const HISTORY_LIMIT = 150;
  const DRAFT_KEY = 'openhabits-config-editor-draft-v2';
  let cleanSnapshot = JSON.stringify(state);

  const HELP = {
    spreadsheetId: 'Optional Script Property name containing a Google Sheet ID. Bound Sheet projects use their own Sheet automatically.',
    trackingSheetName: 'Name of sheet tab used for tracking data.',
    writeToNotion: 'Enable/disable Notion sync globally.',
    comparisonArray: 'Pairs of [days back, human label] used for insight comparisons.',
    metricType: 'Choose the kind of value stored in the Sheet. Timer clients should calculate elapsed time and send it to a duration metric.',
    recordType: 'Controls what happens when this metric is logged more than once on the same day. Replace keeps the newest value, Keep first preserves the earliest value, and Add combines supported numbers or durations.',
    blockType: 'Determines which typeSpecific section is used for this block.',
    blockTimezoneMode: 'fixed keeps this block tied to the Apps Script/cache timezone. floating follows the current device/browser wall clock while traveling.',
    defaultBlockTimezoneMode: 'Default timezone behavior for blocks that do not set their own timezoneMode. fixed is backward-compatible; floating follows the device/browser local wall clock.',
    cacheTimezoneMode: 'script preserves legacy config_snapshot task-state reads. client lets config_snapshot use a valid request timezone to build virtual task-block state from adjacent existing sheet columns.',
    dateRule: 'Per-day rule: due-by time and allowed tracking hours.',
    presets: 'Named modes supplied by a Shortcut or calendar event. A block assigned to presets applies only when one of those presets is active.',
    datesSection: 'Controls when this metric is expected and when it may be recorded. Add rules for the applicable days; due-by is the deadline, while start and end define the allowed tracking window.',
    streaksSection: 'Optionally stores the number of consecutive days or sessions this metric was completed. Leave the Streak Metric ID empty to disable separate streak storage.',
    pointsSection: 'Optionally awards points for completing this metric. A continuing streak increases the base award up to the maximum multiplier. Leave Points Metric ID empty to disable per-metric point storage.',
    insightsSection: 'Controls optional feedback after logging, such as a streak update or a comparison with an earlier day or recent average. A probability of 0% means never and 100% means always.'
  };

  const $ = (id) => document.getElementById(id);
  const tabs = document.querySelectorAll('.tab');
  const TAB_EXPLAINERS = {
    global: 'Settings that apply to everything',
    metrics: 'Metrics are individual pieces of data being logged',
    blocks: 'Blocks are individual criteria that prevent access to an app or website'
  };

  function setTabExplainer(tabName) {
    const explainer = $('tabExplainer');
    if (!explainer) return;
    explainer.textContent = TAB_EXPLAINERS[tabName] || '';
  }

  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabs.forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      $(`tab-${btn.dataset.tab}`).classList.add('active');
      setTabExplainer(btn.dataset.tab);
    });
  });

  function labelWithHelp(text, helpText) {
    const wrapper = document.createElement('div');
    wrapper.className = 'row';
    wrapper.style.gap = '.25rem';
    const span = document.createElement('span');
    span.textContent = text;
    const help = document.createElement('button');
    help.type = 'button';
    help.className = 'help';
    help.textContent = '?';
    help.dataset.help = helpText || 'No description provided yet.';
    help.setAttribute('aria-label', `Help for ${text}`);
    help.setAttribute('aria-expanded', 'false');
    help.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isOpen = help.classList.toggle('open');
      help.setAttribute('aria-expanded', String(isOpen));
    });
    wrapper.append(span, help);
    return wrapper;
  }

  function makeInput({ type = 'text', value = '', min, max, step = 'any', onChange, required = false }) {
    const input = document.createElement('input');
    input.type = type;
    input.value = value ?? '';
    if (min !== undefined) input.min = String(min);
    if (max !== undefined) input.max = String(max);
    if (type === 'number') input.step = step;
    input.required = required;
    input.addEventListener('input', () => withHistory(() => onChange(type === 'number' ? Number(input.value) : input.value)));
    return input;
  }

  function makeCheck(value, onChange) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!value;
    input.addEventListener('change', () => withHistory(() => onChange(input.checked)));
    return input;
  }

  function makeSelect(options, value, onChange) {
    const sel = document.createElement('select');
    options.forEach((opt) => {
      const option = typeof opt === 'string' ? { value: opt, label: opt } : opt;
      const o = document.createElement('option');
      o.value = option.value;
      o.textContent = option.label;
      if (option.value === value) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => withHistory(() => onChange(sel.value)));
    return sel;
  }

  function field(container, title, control, help) {
    const label = document.createElement('label');
    label.appendChild(labelWithHelp(title, help));
    label.appendChild(control);
    container.appendChild(label);
  }

  function fieldHint(text) {
    const hint = document.createElement('p');
    hint.className = 'field-hint';
    hint.textContent = text;
    return hint;
  }

  function toggleSection(title, key, defaultOpen = true, helpText = '') {
    const details = document.createElement('details');
    details.className = 'section';
    details.open = key && sectionOpenState.has(key) ? sectionOpenState.get(key) : defaultOpen;
    if (key) {
      details.addEventListener('toggle', () => {
        sectionOpenState.set(key, details.open);
      });
    }
    const summary = document.createElement('summary');
    const titleText = document.createElement('span');
    titleText.textContent = title;
    summary.appendChild(titleText);
    if (helpText) summary.appendChild(labelWithHelp(title, helpText).lastElementChild);
    details.appendChild(summary);
    return details;
  }

  function button(text, cls, onClick, options = {}) {
    const { trackHistory = true } = options;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    if (cls) b.className = cls;
    if (trackHistory) {
      b.addEventListener('click', () => withHistory(onClick));
    } else {
      b.addEventListener('click', onClick);
    }
    return b;
  }

  function cloneState(input) {
    return JSON.parse(JSON.stringify(input));
  }

  function pushUndoSnapshot(snapshot) {
    undoStack.push(snapshot);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    updateUndoRedoButtons();
  }

  function withHistory(changeFn) {
    const before = cloneState(state);
    const beforeSerialized = JSON.stringify(before);
    changeFn();
    if (JSON.stringify(state) !== beforeSerialized) {
      pushUndoSnapshot(before);
      saveLocalDraft();
    } else {
      updateUndoRedoButtons();
    }
  }

  function restoreState(snapshot) {
    state = ensureShape(cloneState(snapshot));
    saveLocalDraft();
    renderAll();
  }

  function saveLocalDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), config: state })); } catch (_) {}
  }

  function markClean() {
    cleanSnapshot = JSON.stringify(state);
  }

  function undo() {
    if (!undoStack.length) return;
    const current = cloneState(state);
    const previous = undoStack.pop();
    redoStack.push(current);
    restoreState(previous);
    updateUndoRedoButtons();
  }

  function redo() {
    if (!redoStack.length) return;
    const current = cloneState(state);
    const next = redoStack.pop();
    undoStack.push(current);
    restoreState(next);
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    const undoBtn = $('undoBtn');
    const redoBtn = $('redoBtn');
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
  }

  function newMetric() {
    return {
      metricID: '', dataType: 'number', displayName: '', recordType: 'overwrite', timezoneMode: 'floating',
      dates: [],
      streaks: { unit: 'days', streaksID: '' },
      points: { value: 0, multiplierDays: 5, maxMultiplier: 1, pointsID: '' },
      insights: {
        insightChance: 0, streakProb: 0.8, dayToDayChance: 1, dayToAvgChance: 0.5,
        rawValueChance: 1, increaseGood: 1, firstWords: '', insightUnits: ''
      },
      writeToNotion: false,
      timestampSettings: { writeMode: 'now' }
    };
  }

  function normalizedMetricId(name) {
    return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  const METRIC_TYPES = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'duration', label: 'Duration' },
    { value: 'timestamp', label: 'Timestamp' }
  ];

  const METRIC_TYPE_HINTS = {
    text: 'Store a note, journal entry, name, or other text.',
    number: 'Track a count, amount, or rating—for example 3 glasses of water or mood 8.',
    duration: 'Track elapsed time—for example 45 minutes of exercise.',
    timestamp: 'Track when something happened; optionally require it to be recorded by a scheduled time.'
  };

  const RECORD_TYPES = {
    overwrite: { value: 'overwrite', label: 'Replace it with the newest value', hint: 'Logging 5 and then 7 makes today’s value 7.' },
    keep_first: { value: 'keep_first', label: 'Keep the first value', hint: 'A second log today leaves the original value unchanged.' },
    add: { value: 'add', label: 'Add the new amount to it', hint: 'Logging 2 and then 3 makes today’s value 5.' }
  };

  function recordTypeOptions(metricType) {
    const values = ['overwrite', 'keep_first'];
    if (['number', 'duration'].includes(metricType)) values.push('add');
    return values.map(value => RECORD_TYPES[value]);
  }

  function metricTypeLabel(metricType) {
    const option = METRIC_TYPES.find(item => item.value === metricType);
    return option ? option.label : metricType;
  }

  function metricFromRecipe(recipe) {
    const metric = newMetric();
    const defaults = {
      completion: ['Completion', 'number', 'keep_first'],
      text: ['Daily Note', 'text', 'overwrite'],
      number_add: ['Number', 'number', 'add'], number_replace: ['Number', 'number', 'overwrite'],
      timestamp: ['Timestamp', 'timestamp', 'overwrite'], duration: ['Duration', 'duration', 'add'],
      due_by: ['Due-by Task', 'timestamp', 'keep_first']
    }[recipe] || ['Custom Metric', 'number', 'overwrite'];
    [metric.displayName, metric.dataType, metric.recordType] = defaults;
    metric.metricID = normalizedMetricId(metric.displayName);
    if (recipe === 'due_by') {
      metric.timestampSettings.writeMode = 'due_by';
      metric.dates = [['Sunday', '22:00', 0, 24]];
    }
    generatedMetricIds.add(metric);
    return metric;
  }

  function applyMetricTypeDefaults(metric) {
    if (metric.dataType === 'duration') {
      if (!metric.insights.insightUnits) metric.insights.insightUnits = 'minutes';
    }
    if (metric.dataType === 'timestamp') {
      if (!metric.insights.firstWords) metric.insights.firstWords = 'Time Completed:';
      if (!metric.insights.insightUnits) metric.insights.insightUnits = 'minutes';
    }
  }

  function normalizeMetricInsights(metric) {
    if (!metric.insights) metric.insights = {};
    if (!metric.insights.firstWords && metric.insights.insightFirstWords) {
      metric.insights.firstWords = metric.insights.insightFirstWords;
    }
    delete metric.insights.insightFirstWords;
  }

  function newBlock() {
    return {
      id: '', name: '',
      type: 'duration_block',
      timezoneMode: 'fixed',
      presets: [],
      times: { beg: '00:00', end: '00:00' },
      typeSpecific: {
        duration: { maxMinutes: 0, screenTimeID: '', rationing: { isON: false, begMinutes: 0, endMinutes: 0 } },
        task_block_IDs: [],
        firstXMinutes: { minutes: 0, timestampID: '' }
      },
      onBlock: { message: '', shortcutName: '', shortcutInput: '' }
    };
  }

  function move(arr, i, dir) {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    renderAll();
  }

  function uniqueId(base, existingIds) {
    const root = normalizedMetricId(base) || 'item';
    if (!existingIds.has(root)) return root;
    let suffix = 2;
    while (existingIds.has(`${root}_${suffix}`)) suffix += 1;
    return `${root}_${suffix}`;
  }

  function metricReferenceOptions(currentValue) {
    const options = [{ value: '', label: 'None / disabled' }];
    state.metricSettings.forEach(metric => options.push({
      value: metric.metricID,
      label: `${metric.displayName || 'Unnamed metric'} — ${metric.metricID || 'missing ID'}`
    }));
    if (currentValue && !state.metricSettings.some(metric => metric.metricID === currentValue)) {
      options.push({ value: currentValue, label: `${currentValue} — not found in configured metrics` });
    }
    return options;
  }

  function metricReferenceSelect(value, onChange) {
    const select = makeSelect(metricReferenceOptions(value), value, onChange);
    select.classList.add('reference-select');
    return select;
  }

  function duplicateMetric(metric, index) {
    const copy = cloneState(metric);
    copy.displayName = `${metric.displayName || 'Unnamed Metric'} Copy`;
    copy.metricID = uniqueId(`${metric.metricID || normalizedMetricId(copy.displayName)}_copy`, new Set(state.metricSettings.map(item => item.metricID)));
    if (copy.streaks) copy.streaks.streaksID = '';
    if (copy.points) copy.points.pointsID = '';
    state.metricSettings.splice(index + 1, 0, copy);
    generatedMetricIds.add(copy);
    renderAll();
  }

  function duplicateBlock(block, index) {
    const copy = cloneState(block);
    copy.name = `${block.name || block.id || 'Block'} Copy`;
    copy.id = uniqueId(`${block.id || normalizedMetricId(copy.name)}_copy`, new Set(state.lockouts.blocks.map(item => item.id)));
    state.lockouts.blocks.splice(index + 1, 0, copy);
    renderAll();
  }

  function renderGlobal() {
    const root = $('tab-global');
    root.innerHTML = '';

    const basic = toggleSection('Basic Global Settings', 'global-basic');
    const basicGrid = document.createElement('div');
    basicGrid.className = 'grid';
    field(basicGrid, 'Spreadsheet ID Property Name', makeInput({ value: state.scriptProperties.spreadsheetId, onChange: v => state.scriptProperties.spreadsheetId = v }), HELP.spreadsheetId);
    field(basicGrid, 'Tracking Sheet Name', makeInput({ value: state.trackingSheetName, onChange: v => state.trackingSheetName = v, required: true }), HELP.trackingSheetName);
    field(basicGrid, 'Daily Points Metric ID', makeInput({ value: state.dailyPointsID, onChange: v => state.dailyPointsID = v }), 'Metric ID row for daily points total.');
    field(basicGrid, 'Cumulative Points Metric ID', makeInput({ value: state.cumulativePointsID, onChange: v => state.cumulativePointsID = v }), 'Metric ID row for all-time points total.');
    field(basicGrid, 'Late Extension Hours', makeInput({ type: 'number', min: 0, value: state.lateExtensionHours, onChange: v => state.lateExtensionHours = v }), 'Hours after midnight still accepted for previous day due-by checks.');
    basic.appendChild(basicGrid);
    root.appendChild(basic);

    const notionSec = toggleSection('Optional Notion Integration Settings', 'global-notion', false);
    const notionGrid = document.createElement('div');
    notionGrid.className = 'grid';
    field(notionGrid, 'Write to Notion', makeCheck(state.writeToNotion, v => state.writeToNotion = v), HELP.writeToNotion);
    field(notionGrid, 'Database IDs Script Property', makeInput({ value: state.notion.databaseIdsScriptProperty, onChange: v => state.notion.databaseIdsScriptProperty = v }), 'Script property key that stores notion metric database IDs JSON.');
    field(notionGrid, 'Point Block ID Script Property', makeInput({ value: state.notion.pointBlockIdScriptProperty, onChange: v => state.notion.pointBlockIdScriptProperty = v }), 'Script property key for point block ID.');
    field(notionGrid, 'Insight Block ID Script Property', makeInput({ value: state.notion.insightBlockIdScriptProperty, onChange: v => state.notion.insightBlockIdScriptProperty = v }), 'Script property key for insight block ID.');
    field(notionGrid, 'Point Block Type', makeInput({ value: state.notion.outputStyles.pointBlock.blockType, onChange: v => state.notion.outputStyles.pointBlock.blockType = v }), 'Notion block type used for points output.');
    field(notionGrid, 'Point Token Color', makeInput({ value: state.notion.outputStyles.pointBlock.segments[0].color, onChange: v => state.notion.outputStyles.pointBlock.segments[0].color = v }), 'Color for the point_total token segment.');
    field(notionGrid, 'Point Suffix Text', makeInput({ value: state.notion.outputStyles.pointBlock.segments[1].text, onChange: v => state.notion.outputStyles.pointBlock.segments[1].text = v }), 'Text appended after point_total token.');
    field(notionGrid, 'Point Suffix Color', makeInput({ value: state.notion.outputStyles.pointBlock.segments[1].color, onChange: v => state.notion.outputStyles.pointBlock.segments[1].color = v }), 'Color for points suffix text.');
    field(notionGrid, 'Insight Block Type', makeInput({ value: state.notion.outputStyles.insightBlock.blockType, onChange: v => state.notion.outputStyles.insightBlock.blockType = v }), 'Notion block type used for insight output.');
    field(notionGrid, 'Insight Italic', makeCheck(state.notion.outputStyles.insightBlock.italic, v => state.notion.outputStyles.insightBlock.italic = v), 'Whether insight block text is italicized.');
    field(notionGrid, 'Sync Status', makeCheck(state.notion.syncFields.status, v => state.notion.syncFields.status = v), 'Sync State property to Notion.');
    field(notionGrid, 'Sync Streak', makeCheck(state.notion.syncFields.streak, v => state.notion.syncFields.streak = v), 'Sync Streak property to Notion.');
    field(notionGrid, 'Sync Point Multiplier', makeCheck(state.notion.syncFields.pointMultiplier, v => state.notion.syncFields.pointMultiplier = v), 'Sync point multiplier to Notion.');
    field(notionGrid, 'Sync Points', makeCheck(state.notion.syncFields.points, v => state.notion.syncFields.points = v), 'Sync points to Notion.');
    field(notionGrid, 'Property Name: Metric ID', makeInput({ value: state.notion.propertyNames.metricId, onChange: v => state.notion.propertyNames.metricId = v }), 'Notion property name for metric ID.');
    field(notionGrid, 'Property Name: Status', makeInput({ value: state.notion.propertyNames.status, onChange: v => state.notion.propertyNames.status = v }), 'Notion property name for status.');
    field(notionGrid, 'Property Name: Streak', makeInput({ value: state.notion.propertyNames.streak, onChange: v => state.notion.propertyNames.streak = v }), 'Notion property name for streak.');
    field(notionGrid, 'Property Name: Point Multiplier', makeInput({ value: state.notion.propertyNames.pointMultiplier, onChange: v => state.notion.propertyNames.pointMultiplier = v }), 'Notion property name for point multiplier.');
    field(notionGrid, 'Property Name: Points', makeInput({ value: state.notion.propertyNames.points, onChange: v => state.notion.propertyNames.points = v }), 'Notion property name for points.');
    field(notionGrid, 'Complete Status Name', makeInput({ value: state.notion.completeStatusName, onChange: v => state.notion.completeStatusName = v }), 'Status name treated as complete in Notion sync.');
    notionSec.appendChild(notionGrid);
    root.appendChild(notionSec);

    const sheetSec = toggleSection('Sheet Columns', 'global-sheet');
    const sheetGrid = document.createElement('div');
    sheetGrid.className = 'grid';
    field(sheetGrid, 'Task ID Column', makeInput({ type: 'number', min: 1, value: state.sheetConfig.taskIdColumn, onChange: v => state.sheetConfig.taskIdColumn = v }), '1-indexed column for task ID.');
    field(sheetGrid, 'Label Column', makeInput({ type: 'number', min: 1, value: state.sheetConfig.labelColumn, onChange: v => state.sheetConfig.labelColumn = v }), '1-indexed column for label.');
    field(sheetGrid, 'Data Start Column', makeInput({ type: 'number', min: 1, value: state.sheetConfig.dataStartColumn, onChange: v => state.sheetConfig.dataStartColumn = v }), '1-indexed starting column for metric data.');
    sheetSec.appendChild(sheetGrid);
    root.appendChild(sheetSec);

    const insightSec = toggleSection('Insights Globals', 'global-insights');
    const insightGrid = document.createElement('div');
    insightGrid.className = 'grid';
    field(insightGrid, 'Positive Performance Frequency', makeInput({ type: 'number', min: 0, max: 1, step: '0.01', value: state.habitsV2Insights.posPerformanceFreq, onChange: v => state.habitsV2Insights.posPerformanceFreq = v }), 'Chance for positive insight style. 0 to 1.');
    field(insightGrid, 'Negative Performance Frequency', makeInput({ type: 'number', min: 0, max: 1, step: '0.01', value: state.habitsV2Insights.negPerformanceFreq, onChange: v => state.habitsV2Insights.negPerformanceFreq = v }), 'Chance for negative insight style. 0 to 1.');
    field(insightGrid, 'Average Span (days)', makeInput({ type: 'number', min: 1, value: state.habitsV2Insights.averageSpan, onChange: v => state.habitsV2Insights.averageSpan = v }), 'Days used for moving-average comparisons.');
    insightSec.appendChild(insightGrid);

    const compareToggle = toggleSection('Comparison Array', 'global-comparison-array', false);
    compareToggle.appendChild(document.createTextNode('Add and reorder “days back → label” pairs used in insight text.'));
    state.habitsV2Insights.comparisonArray.forEach((row, i) => {
      const card = document.createElement('div');
      card.className = 'card';
      const rowTitle = document.createElement('h4');
      rowTitle.textContent = `Comparison Row ${i + 1}`;
      card.appendChild(rowTitle);
      const grid = document.createElement('div');
      grid.className = 'grid';
      field(grid, 'Days Back', makeInput({ type: 'number', min: 1, value: row[0], onChange: v => row[0] = v }), HELP.comparisonArray);
      field(grid, 'Label', makeInput({ value: row[1], onChange: v => row[1] = v }), HELP.comparisonArray);
      card.appendChild(grid);
      const ctr = document.createElement('div');
      ctr.className = 'controls';
      ctr.append(button('↑ Up', 'secondary', () => move(state.habitsV2Insights.comparisonArray, i, -1)));
      ctr.append(button('↓ Down', 'secondary', () => move(state.habitsV2Insights.comparisonArray, i, 1)));
      ctr.append(button('Delete', 'danger', () => { state.habitsV2Insights.comparisonArray.splice(i, 1); renderAll(); }));
      card.appendChild(ctr);
      compareToggle.appendChild(card);
    });
    compareToggle.append(button('Add Comparison Row', '', () => { state.habitsV2Insights.comparisonArray.push([1, 'new label']); renderAll(); }));
    insightSec.appendChild(compareToggle);
    root.appendChild(insightSec);

    const lockouts = toggleSection('Lockouts Globals', 'global-lockouts');
    const lockGrid = document.createElement('div');
    lockGrid.className = 'grid';
    field(lockGrid, 'Cumulative Screentime Metric ID', makeInput({ value: state.lockouts.globals.cumulativeScreentimeID, onChange: v => state.lockouts.globals.cumulativeScreentimeID = v }), 'Metric ID used for global cumulative screentime.');
    field(lockGrid, 'Time Opened Metric ID', makeInput({ value: state.lockouts.globals.timeOpenedID, onChange: v => state.lockouts.globals.timeOpenedID = v }), 'Metric ID used by clients for app-open timestamp tracking.');
    field(lockGrid, 'Bar Length', makeInput({ type: 'number', min: 1, value: state.lockouts.globals.barLength, onChange: v => state.lockouts.globals.barLength = v }), 'Character length used for on-block screentime bar token.');
    field(lockGrid, 'Preset Calendar Name', makeInput({ value: state.lockouts.globals.presetCalendarName, onChange: v => state.lockouts.globals.presetCalendarName = v }), 'Calendar name used to detect active lockout preset.');
    field(lockGrid, 'Default Block Timezone Mode', makeSelect(['fixed', 'floating'], state.lockouts.globals.defaultBlockTimezoneMode, v => state.lockouts.globals.defaultBlockTimezoneMode = v), HELP.defaultBlockTimezoneMode);
    field(lockGrid, 'Cache Timezone Mode', makeSelect(['script', 'client'], state.lockouts.globals.cacheTimezoneMode, v => state.lockouts.globals.cacheTimezoneMode = v), HELP.cacheTimezoneMode);
    lockouts.appendChild(lockGrid);
    root.appendChild(lockouts);
  }

  function renderMetric(metric, i) {
    const card = document.createElement('div');
    card.className = 'card metric-card';
    card.id = `metric-card-${i}`;
    const head = document.createElement('div');
    head.className = 'card-head';
    const name = document.createElement('h3');
    name.textContent = `${metric.displayName || 'Unnamed Metric'} (Metric ${i + 1})`;
    const ctr = document.createElement('div');
    ctr.className = 'controls';
    ctr.append(button('↑', 'secondary', () => move(state.metricSettings, i, -1)));
    ctr.append(button('↓', 'secondary', () => move(state.metricSettings, i, 1)));
    ctr.append(button('Duplicate', 'secondary', () => duplicateMetric(metric, i)));
    ctr.append(button('Delete', 'danger', () => { state.metricSettings.splice(i, 1); renderAll(); }));
    head.append(name, ctr);
    card.appendChild(head);

    const g = document.createElement('div');
    g.className = 'grid metric-basics';
    const metricIdInput = makeInput({ value: metric.metricID, onChange: v => { metric.metricID = v; generatedMetricIds.delete(metric); }, required: true });
    field(g, 'Display Name', makeInput({ value: metric.displayName, onChange: v => { metric.displayName = v; if (generatedMetricIds.has(metric)) { metric.metricID = normalizedMetricId(v); metricIdInput.value = metric.metricID; } }, required: true }), 'Friendly name shown to users. New recipe IDs follow this name until the ID is edited.');
    const metricIdField = document.createElement('div');
    metricIdField.className = 'field-group';
    field(metricIdField, 'Metric ID', metricIdInput, 'Unique ID used by Shortcuts and Sheet row lookups. Spaces become underscores. Changing a saved ID does not rename historical rows.');
    const idActions = document.createElement('div');
    idActions.className = 'inline-field-actions';
    idActions.append(fieldHint('Used by Shortcuts and integrations. Usually you can leave the generated value as-is.'));
    idActions.append(button('Regenerate from name', 'link-button', () => {
      metric.metricID = normalizedMetricId(metric.displayName);
      generatedMetricIds.add(metric);
      renderAll();
    }));
    metricIdField.appendChild(idActions);
    g.appendChild(metricIdField);

    const typeGroup = document.createElement('div');
    typeGroup.className = 'field-group';
    field(typeGroup, 'What are you tracking?', makeSelect(METRIC_TYPES, metric.dataType, v => {
      metric.dataType = v;
      if (metric.recordType === 'add' && !['number', 'duration'].includes(v)) metric.recordType = 'overwrite';
      if (v !== 'timestamp') metric.timestampSettings.writeMode = 'now';
      applyMetricTypeDefaults(metric);
      renderAll();
    }), HELP.metricType);
    typeGroup.appendChild(fieldHint(METRIC_TYPE_HINTS[metric.dataType] || 'Choose the kind of value this metric stores.'));
    g.appendChild(typeGroup);

    const recordGroup = document.createElement('div');
    recordGroup.className = 'field-group';
    const recordHint = fieldHint((RECORD_TYPES[metric.recordType] || RECORD_TYPES.overwrite).hint);
    field(recordGroup, 'When today already has a value', makeSelect(recordTypeOptions(metric.dataType), metric.recordType, v => {
      metric.recordType = v;
      recordHint.textContent = RECORD_TYPES[v].hint;
    }), HELP.recordType);
    recordGroup.appendChild(recordHint);
    g.appendChild(recordGroup);
    if (metric.dataType === 'timestamp') {
      field(g, 'Timestamp write behavior', makeSelect([
        { value: 'now', label: 'Record when logged' },
        { value: 'due_by', label: 'Only record by the configured due time' }
      ], metric.timestampSettings.writeMode, v => { metric.timestampSettings.writeMode = v; renderAll(); }), 'Due-by timestamps reject writes after the matching date rule’s deadline.');
    }
    card.appendChild(g);

    const advancedSummary = [`Advanced`, metricTypeLabel(metric.dataType)];
    if (metric.dataType === 'timestamp' || metric.dates.length > 0) {
      advancedSummary.push(metric.timezoneMode === 'fixed' ? 'spreadsheet timezone' : 'local time');
    }
    const advanced = toggleSection(advancedSummary.join(' · '), `metric-${i}-advanced`, false);

    const advancedGrid = document.createElement('div');
    advancedGrid.className = 'grid';
    field(advancedGrid, 'Sheet Row Override', makeInput({ type: 'number', min: 1, step: '1', value: metric.rowNumber, onChange: v => {
      if (Number.isInteger(v) && v > 0) metric.rowNumber = v;
      else delete metric.rowNumber;
    } }), 'Normally OpenHabits finds the row by Metric ID. Enter a positive row number only when you intentionally need to override that lookup.');
    const usesTimeSettings = metric.dataType === 'timestamp' || metric.dates.length > 0;
    if (usesTimeSettings) {
      field(advancedGrid, 'Timezone Behavior', makeSelect([
        { value: 'floating', label: 'Follow the device’s local time' },
        { value: 'fixed', label: 'Always use the spreadsheet timezone' }
      ], metric.timezoneMode || 'floating', v => metric.timezoneMode = v), 'Following the device is useful while traveling. Spreadsheet timezone keeps today and scheduled times tied to Apps Script.');
    }
    if (state.writeToNotion) {
      field(advancedGrid, 'Sync This Metric to Notion', makeCheck(metric.writeToNotion, v => metric.writeToNotion = v), 'Include this metric when the global Notion integration is enabled.');
    }
    advanced.appendChild(advancedGrid);

    const dates = toggleSection('Date Rules', `metric-${i}-dates`, false, HELP.datesSection);
    metric.dates.forEach((d, di) => {
      const dCard = document.createElement('div');
      dCard.className = 'card';
      const dateTitle = document.createElement('h4');
      dateTitle.textContent = `Date Rule ${di + 1}`;
      dCard.appendChild(dateTitle);
      const dg = document.createElement('div');
      dg.className = 'grid';
      field(dg, 'Day', makeSelect(DAYS, d[0], v => d[0] = v), HELP.dateRule);
      field(dg, 'Due By (HH:MM)', makeInput({ type: 'time', value: d[1], onChange: v => d[1] = v }), HELP.dateRule);
      field(dg, 'Start Hour', makeInput({ type: 'number', min: 0, max: 24, value: d[2], onChange: v => d[2] = v }), HELP.dateRule);
      field(dg, 'End Hour', makeInput({ type: 'number', min: 0, max: 24, value: d[3], onChange: v => d[3] = v }), HELP.dateRule);
      dCard.appendChild(dg);
      const dCtr = document.createElement('div');
      dCtr.className = 'controls';
      dCtr.append(button('↑', 'secondary', () => move(metric.dates, di, -1)));
      dCtr.append(button('↓', 'secondary', () => move(metric.dates, di, 1)));
      dCtr.append(button('Delete', 'danger', () => { metric.dates.splice(di, 1); renderAll(); }));
      dCard.appendChild(dCtr);
      dates.appendChild(dCard);
    });
    dates.append(button('Add Date Rule', '', () => { metric.dates.push(['Sunday', '', 20, 2]); renderAll(); }));
    advanced.appendChild(dates);

    const streaks = toggleSection('Streak Properties', `metric-${i}-streaks`, false, HELP.streaksSection);
    const streakGrid = document.createElement('div');
    streakGrid.className = 'grid';
    field(streakGrid, 'Unit', makeInput({ value: metric.streaks.unit, onChange: v => metric.streaks.unit = v }), 'Display unit for streak narration (days, sessions, etc).');
    field(streakGrid, 'Streak Metric ID', metricReferenceSelect(metric.streaks.streaksID, v => metric.streaks.streaksID = v), 'Metric row used to store the streak count. Choose None to disable separate streak storage.');
    streaks.appendChild(streakGrid);
    advanced.appendChild(streaks);

    const points = toggleSection('Points Properties', `metric-${i}-points`, false, HELP.pointsSection);
    const pointsGrid = document.createElement('div');
    pointsGrid.className = 'grid';
    field(pointsGrid, 'Base Points per Completion', makeInput({ type: 'number', value: metric.points.value, onChange: v => metric.points.value = v }), 'Points awarded before any streak multiplier is applied.');
    field(pointsGrid, 'Days Until Maximum Multiplier', makeInput({ type: 'number', min: 0, value: metric.points.multiplierDays, onChange: v => metric.points.multiplierDays = v }), 'The streak length at which the maximum multiplier is reached.');
    field(pointsGrid, 'Maximum Streak Multiplier', makeInput({ type: 'number', min: 0, value: metric.points.maxMultiplier, onChange: v => metric.points.maxMultiplier = v }), 'Largest multiplier that a continuing streak can earn.');
    field(pointsGrid, 'Store This Metric’s Points In', metricReferenceSelect(metric.points.pointsID, v => metric.points.pointsID = v), 'Metric row used to store per-metric points. Choose None to disable separate storage.');
    points.appendChild(pointsGrid);
    advanced.appendChild(points);

    const insights = toggleSection('Insights Properties', `metric-${i}-insights`, false, HELP.insightsSection);
    if (metric.dataType === 'text') insights.hidden = true;
    const ig = document.createElement('div');
    ig.className = 'grid';
    [
      ['Insight Frequency (%)', 'insightChance', 'Chance that logging produces any insight. 0% disables insights; 100% always attempts one.'],
      ['Streak Insight Chance (%)', 'streakProb', 'When an insight is produced, chance that it reports the current streak instead of a performance comparison.'],
      ['Individual-Day Comparison Chance (%)', 'dayToDayChance', 'If a streak is not selected, chance of comparing today with an earlier individual day. Lower values favor recent-average comparisons.'],
      ['Today-to-Average Chance (%)', 'dayToAvgChance', 'Within an average-style comparison, chance of comparing today with a past average. Lower values compare one rolling average with another.'],
      ['Difference as Amount Chance (%)', 'rawValueChance', 'Chance of showing a difference such as +12 minutes instead of a percentage.']
    ].forEach(([label, key, help]) => {
      field(ig, label, makeInput({ type: 'number', min: 0, max: 100, step: '1', value: Number(metric.insights[key]) * 100, onChange: v => metric.insights[key] = v / 100 }), help);
    });
    field(ig, 'Increase is Good', makeSelect(['1', '-1'], String(metric.insights.increaseGood), v => metric.insights.increaseGood = Number(v)), '1 means higher values are better; -1 means lower is better.');
    field(ig, 'First Words', makeInput({ value: metric.insights.firstWords, onChange: v => metric.insights.firstWords = v }), 'Opening phrase for insight text.');
    field(ig, 'Insight Units', makeInput({ value: metric.insights.insightUnits, onChange: v => metric.insights.insightUnits = v }), 'Unit text for insight values.');
    insights.appendChild(ig);
    advanced.appendChild(insights);

    card.appendChild(advanced);

    return card;
  }

  function renderMetrics() {
    const root = $('tab-metrics');
    root.innerHTML = '';
    const tools = document.createElement('div'); tools.className = 'metric-tools';
    const search = makeInput({ value: '', onChange: () => {}, required: false }); search.placeholder = 'Search metrics by name or ID';
    search.addEventListener('input', () => document.querySelectorAll('.metric-card').forEach((card, index) => { const m = state.metricSettings[index]; card.hidden = !`${m.displayName} ${m.metricID} ${m.dataType}`.toLowerCase().includes(search.value.toLowerCase()); }));
    tools.append(search, button('Expand All', 'secondary', () => document.querySelectorAll('#tab-metrics details').forEach(d => d.open = true), { trackHistory: false }), button('Collapse All', 'secondary', () => document.querySelectorAll('#tab-metrics details').forEach(d => d.open = false), { trackHistory: false }));
    root.appendChild(tools);
    const nav = document.createElement('nav'); nav.className = 'metric-navigator'; nav.setAttribute('aria-label', 'Metric navigator');
    state.metricSettings.forEach((m, i) => { const link = document.createElement('a'); link.href = `#metric-card-${i}`; link.textContent = `${m.displayName || 'Unnamed'} · ${m.metricID || 'missing ID'} · ${m.dataType}`; nav.appendChild(link); });
    root.appendChild(nav);
    state.metricSettings.forEach((m, i) => root.appendChild(renderMetric(m, i)));
    const recipe = makeSelect([
      { value: 'completion', label: 'Done / not done' },
      { value: 'text', label: 'Text / daily note' },
      { value: 'number_add', label: 'Count or amount — add logs together' },
      { value: 'number_replace', label: 'Count or amount — keep newest log' },
      { value: 'timestamp', label: 'Time something happened' },
      { value: 'duration', label: 'Duration' },
      { value: 'due_by', label: 'Due-by task' },
      { value: 'advanced', label: 'Custom / advanced' }
    ], 'completion', () => {});
    const addMetric = document.createElement('section');
    addMetric.className = 'add-metric';
    const addTitle = document.createElement('h3');
    addTitle.textContent = 'Add a metric';
    const addDescription = document.createElement('p');
    addDescription.className = 'muted';
    addDescription.textContent = 'Choose the closest starting point. You can change every setting afterward.';
    const addRow = document.createElement('div');
    addRow.className = 'row gap';
    addRow.append(recipe, button('Add metric', '', () => { state.metricSettings.push(metricFromRecipe(recipe.value)); renderAll(); }));
    addMetric.append(addTitle, addDescription, addRow);
    root.append(addMetric);
    const metricSummary = state.metricSettings.map(({ metricID, displayName }) => ({ metricID, displayName }));
    window.OpenHabitsConfiguredMetrics = metricSummary;
    document.dispatchEvent(new CustomEvent('openhabits:metrics-changed', { detail: metricSummary }));
  }

  function renderBlock(block, i) {
    const card = document.createElement('div');
    card.className = 'card';
    const head = document.createElement('div');
    head.className = 'card-head';
    const title = document.createElement('h3');
    const typeLabels = {
      duration_block: 'Screen-time limit',
      task_block: 'Require completed metrics',
      firstXMinutesAfterTimestamp_block: 'Block briefly after an event'
    };
    title.textContent = `${block.name || typeLabels[block.type] || 'Unnamed Block'} · ${block.times.beg}–${block.times.end}`;
    const ctr = document.createElement('div');
    ctr.className = 'controls';
    ctr.append(button('↑', 'secondary', () => move(state.lockouts.blocks, i, -1)));
    ctr.append(button('↓', 'secondary', () => move(state.lockouts.blocks, i, 1)));
    ctr.append(button('Duplicate', 'secondary', () => duplicateBlock(block, i)));
    ctr.append(button('Delete', 'danger', () => { state.lockouts.blocks.splice(i, 1); renderAll(); }));
    head.append(title, ctr);
    card.appendChild(head);

    const g = document.createElement('div');
    g.className = 'grid';
    field(g, 'Block Name', makeInput({ value: block.name || '', onChange: v => {
      block.name = v;
      if (!block.id || generatedBlockIds.has(block)) {
        block.id = uniqueId(v || `block_${i + 1}`, new Set(state.lockouts.blocks.filter(item => item !== block).map(item => item.id)));
        generatedBlockIds.add(block);
      }
    } }), 'Friendly name used in this editor. The technical ID is generated automatically.');
    field(g, 'Rule Type', makeSelect([
      { value: 'duration_block', label: 'Screen-time limit' },
      { value: 'task_block', label: 'Require completed metrics' },
      { value: 'firstXMinutesAfterTimestamp_block', label: 'Block briefly after an event' }
    ], block.type, v => { block.type = v; renderAll(); }), HELP.blockType);
    field(g, 'Timezone Mode', makeSelect(['fixed', 'floating'], block.timezoneMode || 'fixed', v => block.timezoneMode = v), HELP.blockTimezoneMode);
    field(g, 'Begin Time', makeInput({ type: 'time', value: block.times.beg, onChange: v => block.times.beg = v }), 'Block activation start time (24h).');
    field(g, 'End Time', makeInput({ type: 'time', value: block.times.end, onChange: v => block.times.end = v }), 'Block activation end time (24h).');
    card.appendChild(g);

    const technical = toggleSection('Advanced · Technical identity', `block-${i}-technical`, false, 'The Block ID is included in diagnostics and client responses. Most users can leave the generated value unchanged.');
    const technicalGrid = document.createElement('div');
    technicalGrid.className = 'grid';
    field(technicalGrid, 'Technical Block ID', makeInput({ value: block.id, onChange: v => { block.id = v; generatedBlockIds.delete(block); } }), 'Unique identifier used for diagnostics and integrations. Changing a saved ID can make older logs harder to match.');
    technical.appendChild(technicalGrid);
    card.appendChild(technical);

    const presetSec = toggleSection('Preset Assignment', `block-${i}-presets`, true, HELP.presets);
    presetSec.appendChild(fieldHint(block.presets.length ? 'This block applies only in the selected modes.' : 'No presets selected: this block applies whenever no preset is supplied.'));
    const presetOptions = document.createElement('div');
    presetOptions.className = 'check-list';
    state.lockouts.presets.forEach(preset => {
      const label = document.createElement('label');
      label.className = 'check-option';
      const check = makeCheck(block.presets.includes(preset), checked => {
        if (checked) block.presets.push(preset);
        else block.presets = block.presets.filter(item => item !== preset);
        renderAll();
      });
      label.append(check, document.createTextNode(preset));
      presetOptions.appendChild(label);
    });
    if (!state.lockouts.presets.length) presetOptions.appendChild(fieldHint('Create a preset above the block list to assign one here.'));
    presetSec.appendChild(presetOptions);
    card.appendChild(presetSec);

    const typeSec = toggleSection('Type-Specific Properties', `block-${i}-type-specific`);
    if (block.type === 'duration_block') {
      const d = document.createElement('div'); d.className = 'grid';
      field(d, 'Max Minutes', makeInput({ type: 'number', min: 0, value: block.typeSpecific.duration.maxMinutes, onChange: v => block.typeSpecific.duration.maxMinutes = v }), 'Max minutes allowed before block message/shortcut.');
      field(d, 'Screen Time Metric ID', metricReferenceSelect(block.typeSpecific.duration.screenTimeID, v => block.typeSpecific.duration.screenTimeID = v), 'Metric used to read accumulated screen time.');
      field(d, 'Rationing On', makeCheck(block.typeSpecific.duration.rationing.isON, v => block.typeSpecific.duration.rationing.isON = v), 'Enable gradual quota between beginning and end minutes.');
      field(d, 'Rationing Begin Minutes', makeInput({ type: 'number', min: 0, value: block.typeSpecific.duration.rationing.begMinutes, onChange: v => block.typeSpecific.duration.rationing.begMinutes = v }), 'Initial allowance minutes.');
      field(d, 'Rationing End Minutes', makeInput({ type: 'number', min: 0, value: block.typeSpecific.duration.rationing.endMinutes, onChange: v => block.typeSpecific.duration.rationing.endMinutes = v }), 'Ending allowance minutes.');
      typeSec.appendChild(d);
    }
    if (block.type === 'task_block') {
      const taskSec = document.createElement('div');
      block.typeSpecific.task_block_IDs.forEach((id, ti) => {
        const tc = document.createElement('div');
        tc.className = 'card';
        const reqTitle = document.createElement('h4');
        reqTitle.textContent = `Required Metric ${ti + 1}`;
        tc.appendChild(reqTitle);
        const tg = document.createElement('div'); tg.className = 'grid';
        field(tg, 'Required Metric ID', metricReferenceSelect(id, v => block.typeSpecific.task_block_IDs[ti] = v), 'Completion of every selected metric unlocks this block.');
        tc.appendChild(tg);
        const ctrs = document.createElement('div'); ctrs.className = 'controls';
        ctrs.append(button('↑', 'secondary', () => move(block.typeSpecific.task_block_IDs, ti, -1)));
        ctrs.append(button('↓', 'secondary', () => move(block.typeSpecific.task_block_IDs, ti, 1)));
        ctrs.append(button('Delete', 'danger', () => { block.typeSpecific.task_block_IDs.splice(ti, 1); renderAll(); }));
        tc.appendChild(ctrs);
        taskSec.appendChild(tc);
      });
      taskSec.append(button('Add Required Metric ID', '', () => { block.typeSpecific.task_block_IDs.push(''); renderAll(); }));
      typeSec.appendChild(taskSec);
    }
    if (block.type === 'firstXMinutesAfterTimestamp_block') {
      const f = document.createElement('div'); f.className = 'grid';
      field(f, 'Minutes', makeInput({ type: 'number', min: 0, value: block.typeSpecific.firstXMinutes.minutes, onChange: v => block.typeSpecific.firstXMinutes.minutes = v }), 'Minutes after timestamp when block is active.');
      field(f, 'Timestamp Metric ID', metricReferenceSelect(block.typeSpecific.firstXMinutes.timestampID, v => block.typeSpecific.firstXMinutes.timestampID = v), 'Timestamp metric used as the start of this temporary block.');
      typeSec.appendChild(f);
    }
    card.appendChild(typeSec);

    const onBlock = toggleSection('On-Block Output', `block-${i}-onblock`);
    const og = document.createElement('div'); og.className = 'grid';
    field(og, 'Message', makeInput({ value: block.onBlock.message, onChange: v => block.onBlock.message = v }), 'Shown when block is active. Supports tokens like {endTime} and {screenTimeBar}.');
    field(og, 'Shortcut Name', makeInput({ value: block.onBlock.shortcutName, onChange: v => block.onBlock.shortcutName = v }), 'Optional iOS shortcut name to run on block.');
    field(og, 'Shortcut Input', makeInput({ value: block.onBlock.shortcutInput, onChange: v => block.onBlock.shortcutInput = v }), 'Optional text payload sent to shortcut.');
    onBlock.appendChild(og);
    card.appendChild(onBlock);

    return card;
  }

  function renderBlocks() {
    const root = $('tab-blocks');
    root.innerHTML = '';
    const intro = document.createElement('div');
    intro.className = 'notice';
    intro.textContent = 'Blocks are checked from top to bottom. If several rules apply, the first rule that blocks access wins.';
    root.appendChild(intro);
    const presets = toggleSection('Preset Modes', 'blocks-presets', true, 'Define modes once, then select them on each block. A Shortcut or all-day calendar event can activate a preset.');
    presets.appendChild(fieldHint('Examples: workday, weekend, or entertainment. Names must match the value supplied by the client or calendar event.'));
    const presetList = document.createElement('div');
    presetList.className = 'chip-list';
    state.lockouts.presets.forEach((preset, pi) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.append(document.createTextNode(preset), button('×', 'chip-remove', () => {
        state.lockouts.presets.splice(pi, 1);
        state.lockouts.blocks.forEach(block => { block.presets = block.presets.filter(item => item !== preset); });
        renderAll();
      }));
      presetList.appendChild(chip);
    });
    presets.appendChild(presetList);
    const presetRow = document.createElement('div');
    presetRow.className = 'row gap';
    const presetInput = makeInput({ value: '', onChange: () => {} });
    presetInput.placeholder = 'New preset name';
    presetRow.append(presetInput, button('Add preset', '', () => {
      const value = presetInput.value.trim();
      if (value && !state.lockouts.presets.includes(value)) state.lockouts.presets.push(value);
      renderAll();
    }));
    presets.appendChild(presetRow);
    root.appendChild(presets);
    if (!state.lockouts.blocks.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No focus rules yet. Start with a screen-time limit, require a completed metric, or block briefly after an event.';
      root.appendChild(empty);
    }
    state.lockouts.blocks.forEach((b, i) => root.appendChild(renderBlock(b, i)));
    root.append(button('Add Block', '', () => {
      const block = newBlock();
      block.name = `Block ${state.lockouts.blocks.length + 1}`;
      block.id = uniqueId(block.name, new Set(state.lockouts.blocks.map(item => item.id)));
      generatedBlockIds.add(block);
      state.lockouts.blocks.push(block);
      renderAll();
    }));
  }

  function ensureShape(raw) {
    const base = defaultConfig();
    const merged = {
      ...base,
      ...raw,
      scriptProperties: { ...base.scriptProperties, ...(raw.scriptProperties || {}) },
      sheetConfig: { ...base.sheetConfig, ...(raw.sheetConfig || {}) },
      habitsV2Insights: { ...base.habitsV2Insights, ...(raw.habitsV2Insights || {}) },
      lockouts: {
        ...base.lockouts,
        ...(raw.lockouts || {}),
        globals: { ...base.lockouts.globals, ...((raw.lockouts && raw.lockouts.globals) || {}) }
      },
      notion: {
        ...base.notion,
        ...(raw.notion || {}),
        outputStyles: {
          ...base.notion.outputStyles,
          ...((raw.notion && raw.notion.outputStyles) || {}),
          pointBlock: {
            ...base.notion.outputStyles.pointBlock,
            ...((((raw.notion || {}).outputStyles || {}).pointBlock) || {}),
            segments: ((((raw.notion || {}).outputStyles || {}).pointBlock || {}).segments) || base.notion.outputStyles.pointBlock.segments
          },
          insightBlock: {
            ...base.notion.outputStyles.insightBlock,
            ...((((raw.notion || {}).outputStyles || {}).insightBlock) || {})
          }
        },
        syncFields: { ...base.notion.syncFields, ...((raw.notion && raw.notion.syncFields) || {}) },
        propertyNames: { ...base.notion.propertyNames, ...((raw.notion && raw.notion.propertyNames) || {}) }
      }
    };
    const assignedPresets = [];
    (((raw.lockouts || {}).blocks) || []).forEach(block => (block.presets || []).forEach(preset => {
      if (preset && !assignedPresets.includes(preset)) assignedPresets.push(preset);
    }));
    merged.lockouts.presets = Array.isArray((raw.lockouts || {}).presets) ? raw.lockouts.presets.slice() : assignedPresets;
    const pointSegments = ((merged.notion.outputStyles.pointBlock || {}).segments || []).slice();
    merged.notion.outputStyles.pointBlock.segments = [
      { token: 'point_total', color: 'blue', ...(pointSegments[0] || {}) },
      { text: ' Points', color: 'default', ...(pointSegments[1] || {}) }
    ];
    merged.metricSettings = (raw.metricSettings || []).map((m) => {
      if (m.type && !m.dataType) {
        if (m.type === 'start_timer' || m.type === 'stop_timer') {
          throw new Error(`Timer metric "${m.metricID || 'unnamed'}" must be migrated to a client-owned timer and additive duration metric before import.`);
        }
        m = { ...m, dataType: m.type === 'due_by' ? 'timestamp' : m.type };
        if (m.type === 'due_by') m.timestampSettings = { ...(m.timestampSettings || {}), writeMode: 'due_by' };
        delete m.type;
      }
      const normalized = { ...newMetric(), ...m, streaks: { ...newMetric().streaks, ...(m.streaks || {}) }, points: { ...newMetric().points, ...(m.points || {}) }, insights: { ...newMetric().insights, ...(m.insights || {}) }, timestampSettings: { ...newMetric().timestampSettings, ...(m.timestampSettings || {}) } };
      normalizeMetricInsights(normalized);
      applyMetricTypeDefaults(normalized);
      return normalized;
    });
    merged.lockouts.blocks = ((merged.lockouts && merged.lockouts.blocks) || []).map((b) => ({ ...newBlock(), ...b, times: { ...newBlock().times, ...(b.times || {}) }, typeSpecific: { ...newBlock().typeSpecific, ...(b.typeSpecific || {}), duration: { ...newBlock().typeSpecific.duration, ...((b.typeSpecific && b.typeSpecific.duration) || {}), rationing: { ...newBlock().typeSpecific.duration.rationing, ...(((b.typeSpecific || {}).duration || {}).rationing || {}) } }, firstXMinutes: { ...newBlock().typeSpecific.firstXMinutes, ...((b.typeSpecific && b.typeSpecific.firstXMinutes) || {}) } }, onBlock: { ...newBlock().onBlock, ...(b.onBlock || {}) } }));
    return merged;
  }

  function parseConfigGs(text) {
    const cleaned = text.trim();
    if (!cleaned) throw new Error('Paste configuration JSON or Config.gs text first.');
    if (cleaned[0] === '{') return ensureShape(JSON.parse(cleaned));
    const fn = new Function(`${cleaned}; return (typeof getAppConfig === 'function') ? getAppConfig() : null;`);
    const cfg = fn();
    if (!cfg || typeof cfg !== 'object') throw new Error('Could not evaluate getAppConfig(). Ensure full file is pasted.');
    return ensureShape(cfg);
  }

  function validateState() {
    const errors = [];
    const metricIds = state.metricSettings.map(metric => metric.metricID).filter(Boolean);
    const duplicateMetricIds = metricIds.filter((id, index) => metricIds.indexOf(id) !== index);
    if (duplicateMetricIds.length) errors.push(`Duplicate Metric IDs: ${[...new Set(duplicateMetricIds)].join(', ')}.`);
    state.metricSettings.forEach((m, i) => {
      if (!m.metricID) errors.push(`Metric ${i + 1}: Metric ID is required.`);
      if (!m.displayName) errors.push(`Metric ${i + 1}: Display Name is required.`);
      if (m.rowNumber !== undefined && (!Number.isInteger(m.rowNumber) || m.rowNumber <= 0)) errors.push(`Metric ${i + 1}: Row Number must be a positive whole number.`);
      if (m.timezoneMode && !['fixed', 'floating'].includes(m.timezoneMode)) errors.push(`Metric ${i + 1}: timezoneMode must be fixed or floating.`);
      if (!['text', 'number', 'duration', 'timestamp'].includes(m.dataType)) errors.push(`Metric ${i + 1}: invalid data type.`);
      if (m.recordType === 'add' && !['number', 'duration'].includes(m.dataType)) errors.push(`Metric ${i + 1}: add record type is only supported for number and duration metrics.`);
      if (m.timestampSettings.writeMode === 'due_by' && m.dates.length === 0) errors.push(`Metric ${i + 1}: due-by timestamps require at least one date rule.`);
      m.dates.forEach((d, di) => {
        if (!DAYS.includes(d[0])) errors.push(`Metric ${i + 1}, date ${di + 1}: invalid day.`);
        const hasDueBy = String(d[1] || '').trim() !== '';
        if (m.timestampSettings.writeMode === 'due_by' && !hasDueBy) errors.push(`Metric ${i + 1}, date ${di + 1}: due-by is required for due-by timestamps.`);
        if (hasDueBy && !/^\d{2}:\d{2}$/.test(d[1])) errors.push(`Metric ${i + 1}, date ${di + 1}: due-by must be HH:MM.`);
        if (typeof d[2] !== 'number' || typeof d[3] !== 'number') errors.push(`Metric ${i + 1}, date ${di + 1}: start/end must be numbers.`);
      });
    });
    if (!['fixed', 'floating'].includes(state.lockouts.globals.defaultBlockTimezoneMode)) errors.push('Lockouts defaultBlockTimezoneMode must be fixed or floating.');
    if (!['script', 'client'].includes(state.lockouts.globals.cacheTimezoneMode)) errors.push('Lockouts cacheTimezoneMode must be script or client.');
    const blockIds = state.lockouts.blocks.map(block => block.id).filter(Boolean);
    const duplicateBlockIds = blockIds.filter((id, index) => blockIds.indexOf(id) !== index);
    if (duplicateBlockIds.length) errors.push(`Duplicate Block IDs: ${[...new Set(duplicateBlockIds)].join(', ')}.`);
    state.lockouts.blocks.forEach((b, i) => {
      if (!b.id) errors.push(`Block ${i + 1}: Block ID is required.`);
      if (b.timezoneMode && !['fixed', 'floating'].includes(b.timezoneMode)) errors.push(`Block ${i + 1}: timezoneMode must be fixed or floating.`);
      if (!/^\d{2}:\d{2}$/.test(b.times.beg) || !/^\d{2}:\d{2}$/.test(b.times.end)) errors.push(`Block ${i + 1}: begin/end time must be HH:MM.`);
      const references = b.type === 'task_block' ? b.typeSpecific.task_block_IDs : b.type === 'duration_block' ? [b.typeSpecific.duration.screenTimeID] : [b.typeSpecific.firstXMinutes.timestampID];
      references.filter(Boolean).forEach(id => {
        if (!metricIds.includes(id)) errors.push(`Block ${i + 1}: referenced Metric ID "${id}" was not found.`);
      });
    });
    return errors;
  }

  function esc(value) {
    return JSON.stringify(value);
  }

  function toConfigGs(cfg) {
    const lines = [];
    lines.push('function getAppConfig() {');
    lines.push('  return ' + JSON.stringify(cfg, null, 2)
      .replace(/"([^"\\]+)":/g, '$1:')
      .replace(/"(heading_1|paragraph|blue|default|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)"/g, (s) => s)
      + ';');
    lines.push('}');
    return lines.join('\n');
  }

  function renderAll() {
    renderGlobal();
    renderMetrics();
    renderBlocks();
  }

  $('parseBtn').addEventListener('click', () => {
    try {
      withHistory(() => { state = parseConfigGs($('importText').value); sectionOpenState.clear(); });
      markClean();
      $('importStatus').textContent = 'Config loaded successfully.';
      renderAll();
    } catch (err) {
      $('importStatus').textContent = `Load failed: ${err.message}`;
    }
  });

  $('loadClipboardBtn').addEventListener('click', async () => {
    try {
      $('importText').value = await navigator.clipboard.readText();
      if (!$('importText').value.trim()) throw new Error('The clipboard is empty.');
      $('parseBtn').click();
    } catch (err) {
      $('importStatus').textContent = `Clipboard access failed: ${err.message} Open Manual import and recovery to paste it instead.`;
    }
  });

  $('importFile').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    $('importText').value = await file.text();
    $('parseBtn').click();
  });

  $('freshBtn').addEventListener('click', () => {
    withHistory(() => { state = defaultConfig(); });
    $('importText').value = '';
    $('importStatus').textContent = 'Started fresh config.';
    renderAll();
  });

  $('undoBtn').addEventListener('click', undo);
  $('redoBtn').addEventListener('click', redo);

  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    const ctrlOrMeta = event.ctrlKey || event.metaKey;
    if (!ctrlOrMeta || key !== 'z') return;
    event.preventDefault();
    if (event.shiftKey) {
      redo();
      return;
    }
    undo();
  });

  $('exportBtn').addEventListener('click', async () => {
    const errors = validateState();
    if (errors.length) {
      $('exportStatus').textContent = `Fix validation errors first: ${errors.slice(0, 3).join(' | ')}`;
      return;
    }
    $('exportText').value = JSON.stringify(state, null, 2);
    try {
      await navigator.clipboard.writeText($('exportText').value);
      markClean();
      $('exportStatus').textContent = 'Configuration copied. Return to the OpenHabits panel in your Sheet, paste it, and choose Save and Apply.';
    } catch (_) {
      $('exportText').focus();
      $('exportText').select();
      $('exportStatus').textContent = 'Clipboard access was blocked. Open Backup and migration options and copy the selected configuration manually.';
    }
  });

  $('legacyExportBtn').addEventListener('click', () => {
    const errors = validateState();
    if (errors.length) { $('exportStatus').textContent = `Fix validation errors first: ${errors.slice(0, 3).join(' | ')}`; return; }
    $('exportText').value = toConfigGs(state);
    $('exportStatus').textContent = 'Legacy Config.gs generated for migration use.';
  });

  $('copyBtn').addEventListener('click', async () => {
    const txt = $('exportText').value;
    if (!txt) {
      $('exportStatus').textContent = 'Generate output before copying.';
      return;
    }
    try {
      await navigator.clipboard.writeText(txt);
      $('exportStatus').textContent = 'Copied to clipboard.';
    } catch (_) {
      $('exportStatus').textContent = 'Clipboard copy failed. Copy text manually.';
    }
  });

  $('downloadBtn').addEventListener('click', () => {
    const errors = validateState();
    if (errors.length) { $('exportStatus').textContent = `Fix validation errors first: ${errors.slice(0, 3).join(' | ')}`; return; }
    const content = JSON.stringify(state, null, 2);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    link.download = 'openhabits-config.json';
    link.click();
    URL.revokeObjectURL(link.href);
    markClean();
    $('exportStatus').textContent = 'JSON downloaded. Import it from the OpenHabits Sheet panel.';
  });

  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (draft && draft.config) {
      $('restoreDraftBtn').hidden = false;
      $('restoreDraftBtn').addEventListener('click', () => {
        withHistory(() => { state = ensureShape(draft.config); });
        $('importStatus').textContent = `Restored local-only draft${draft.savedAt ? ' from ' + new Date(draft.savedAt).toLocaleString() : ''}.`;
        renderAll();
      });
    }
  } catch (_) {}

  if (window.location.hash === '#from-sheet') {
    $('importInstructions').textContent = 'Load the configuration you copied from your Sheet to begin editing.';
    $('loadClipboardBtn').focus();
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  window.addEventListener('beforeunload', (event) => {
    if (JSON.stringify(state) === cleanSnapshot) return;
    event.preventDefault();
    event.returnValue = '';
  });

  renderAll();
  setTabExplainer('global');
  updateUndoRedoButtons();
})();
