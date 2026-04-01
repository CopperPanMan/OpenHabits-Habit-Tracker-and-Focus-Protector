(function () {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
        comparisonArray: [[1, 'yesterday'], [2, '2 days ago']],
        posPerformanceFreq: 0.75,
        negPerformanceFreq: 0.25,
        averageSpan: 7
      },
      metricSettings: [],
      lockoutsV2: {
        globals: { cumulativeScreentimeID: 'cumulative_app_opened', barLength: 20, presetCalendarName: 'App Lockout Settings' },
        blocks: []
      }
    };
  }

  let state = defaultConfig();

  const HELP = {
    spreadsheetId: 'Google Sheet ID where tracking rows are stored.',
    trackingSheetName: 'Name of sheet tab used for tracking data.',
    writeToNotion: 'Enable/disable Notion sync globally.',
    comparisonArray: 'Pairs of [days back, human label] used for insight comparisons.',
    metricType: 'Determines what a metric records and which extra fields apply.',
    ifTimer: 'Timer-only settings used when metric type is start_timer or stop_timer.',
    blockType: 'Determines which typeSpecific section is used for this block.',
    dateRule: 'Per-day rule: due-by time and allowed tracking hours.',
    presets: 'Preset names that must be active for this block to apply.'
  };

  const $ = (id) => document.getElementById(id);
  const tabs = document.querySelectorAll('.tab');

  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabs.forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      $(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  function labelWithHelp(text, helpText) {
    const wrapper = document.createElement('div');
    wrapper.className = 'row';
    wrapper.style.gap = '.25rem';
    const span = document.createElement('span');
    span.textContent = text;
    const help = document.createElement('span');
    help.className = 'help';
    help.textContent = '?';
    help.dataset.help = helpText || 'No description provided yet.';
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
    input.addEventListener('input', () => onChange(type === 'number' ? Number(input.value) : input.value));
    return input;
  }

  function makeCheck(value, onChange) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!value;
    input.addEventListener('change', () => onChange(input.checked));
    return input;
  }

  function makeSelect(options, value, onChange) {
    const sel = document.createElement('select');
    options.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      if (opt === value) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  function field(container, title, control, help) {
    const label = document.createElement('label');
    label.appendChild(labelWithHelp(title, help));
    label.appendChild(control);
    container.appendChild(label);
  }

  function toggleSection(title) {
    const details = document.createElement('details');
    details.className = 'section';
    details.open = true;
    const summary = document.createElement('summary');
    summary.textContent = title;
    details.appendChild(summary);
    return details;
  }

  function button(text, cls, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    if (cls) b.className = cls;
    b.addEventListener('click', onClick);
    return b;
  }

  function newMetric() {
    return {
      metricID: '', type: 'number', displayName: '', recordType: 'overwrite',
      dates: DAYS.map((d) => [d, '22:30', 20, 2]),
      streaks: { unit: 'days', streaksID: '' },
      points: { value: 1, multiplierDays: 0, maxMultiplier: 1, pointsID: '' },
      insights: {
        insightChance: 1, streakProb: 0.8, dayToDayChance: 1, dayToAvgChance: 0.5,
        rawValueChance: 1, increaseGood: 1, firstWords: '', insightFirstWords: '', insightUnits: ''
      },
      writeToNotion: true,
      ifTimer_Settings: { stopTimerMessage: '', timerStartMetricID: '', timerDurationMetricID: '', muteOutput: false }
    };
  }

  function newBlock() {
    return {
      id: '',
      type: 'duration_block',
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

  function renderGlobal() {
    const root = $('tab-global');
    root.innerHTML = '';

    const basic = toggleSection('Basic Global Settings');
    const basicGrid = document.createElement('div');
    basicGrid.className = 'grid';
    field(basicGrid, 'Spreadsheet ID', makeInput({ value: state.scriptProperties.spreadsheetId, onChange: v => state.scriptProperties.spreadsheetId = v, required: true }), HELP.spreadsheetId);
    field(basicGrid, 'Tracking Sheet Name', makeInput({ value: state.trackingSheetName, onChange: v => state.trackingSheetName = v, required: true }), HELP.trackingSheetName);
    field(basicGrid, 'Write to Notion', makeCheck(state.writeToNotion, v => state.writeToNotion = v), HELP.writeToNotion);
    field(basicGrid, 'Daily Points Metric ID', makeInput({ value: state.dailyPointsID, onChange: v => state.dailyPointsID = v }), 'Metric ID row for daily points total.');
    field(basicGrid, 'Cumulative Points Metric ID', makeInput({ value: state.cumulativePointsID, onChange: v => state.cumulativePointsID = v }), 'Metric ID row for all-time points total.');
    field(basicGrid, 'Late Extension Hours', makeInput({ type: 'number', min: 0, value: state.lateExtensionHours, onChange: v => state.lateExtensionHours = v }), 'Hours after midnight still accepted for previous day due-by checks.');
    basic.appendChild(basicGrid);
    root.appendChild(basic);

    const sheetSec = toggleSection('Sheet Columns');
    const sheetGrid = document.createElement('div');
    sheetGrid.className = 'grid';
    field(sheetGrid, 'Task ID Column', makeInput({ type: 'number', min: 1, value: state.sheetConfig.taskIdColumn, onChange: v => state.sheetConfig.taskIdColumn = v }), '1-indexed column for task ID.');
    field(sheetGrid, 'Label Column', makeInput({ type: 'number', min: 1, value: state.sheetConfig.labelColumn, onChange: v => state.sheetConfig.labelColumn = v }), '1-indexed column for label.');
    field(sheetGrid, 'Data Start Column', makeInput({ type: 'number', min: 1, value: state.sheetConfig.dataStartColumn, onChange: v => state.sheetConfig.dataStartColumn = v }), '1-indexed starting column for metric data.');
    sheetSec.appendChild(sheetGrid);
    root.appendChild(sheetSec);

    const insightSec = toggleSection('Insights Globals');
    const insightGrid = document.createElement('div');
    insightGrid.className = 'grid';
    field(insightGrid, 'Positive Performance Frequency', makeInput({ type: 'number', min: 0, max: 1, step: '0.01', value: state.habitsV2Insights.posPerformanceFreq, onChange: v => state.habitsV2Insights.posPerformanceFreq = v }), 'Chance for positive insight style. 0 to 1.');
    field(insightGrid, 'Negative Performance Frequency', makeInput({ type: 'number', min: 0, max: 1, step: '0.01', value: state.habitsV2Insights.negPerformanceFreq, onChange: v => state.habitsV2Insights.negPerformanceFreq = v }), 'Chance for negative insight style. 0 to 1.');
    field(insightGrid, 'Average Span (days)', makeInput({ type: 'number', min: 1, value: state.habitsV2Insights.averageSpan, onChange: v => state.habitsV2Insights.averageSpan = v }), 'Days used for moving-average comparisons.');
    insightSec.appendChild(insightGrid);

    const compareToggle = toggleSection('Comparison Array');
    compareToggle.open = false;
    compareToggle.appendChild(document.createTextNode('Add and reorder “days back → label” pairs used in insight text.'));
    state.habitsV2Insights.comparisonArray.forEach((row, i) => {
      const card = document.createElement('div');
      card.className = 'card';
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

    const lockouts = toggleSection('LockoutsV2 Globals');
    const lockGrid = document.createElement('div');
    lockGrid.className = 'grid';
    field(lockGrid, 'Cumulative Screentime Metric ID', makeInput({ value: state.lockoutsV2.globals.cumulativeScreentimeID, onChange: v => state.lockoutsV2.globals.cumulativeScreentimeID = v }), 'Metric ID used for global cumulative screentime.');
    field(lockGrid, 'Bar Length', makeInput({ type: 'number', min: 1, value: state.lockoutsV2.globals.barLength, onChange: v => state.lockoutsV2.globals.barLength = v }), 'Character length used for on-block screentime bar token.');
    field(lockGrid, 'Preset Calendar Name', makeInput({ value: state.lockoutsV2.globals.presetCalendarName, onChange: v => state.lockoutsV2.globals.presetCalendarName = v }), 'Calendar name used to detect active lockout preset.');
    lockouts.appendChild(lockGrid);
    root.appendChild(lockouts);
  }

  function renderMetric(metric, i) {
    const card = document.createElement('div');
    card.className = 'card';
    const head = document.createElement('div');
    head.className = 'card-head';
    const name = document.createElement('h3');
    name.textContent = metric.displayName || `Metric ${i + 1}`;
    const ctr = document.createElement('div');
    ctr.className = 'controls';
    ctr.append(button('↑', 'secondary', () => move(state.metricSettings, i, -1)));
    ctr.append(button('↓', 'secondary', () => move(state.metricSettings, i, 1)));
    ctr.append(button('Delete', 'danger', () => { state.metricSettings.splice(i, 1); renderAll(); }));
    head.append(name, ctr);
    card.appendChild(head);

    const g = document.createElement('div');
    g.className = 'grid';
    field(g, 'Metric ID', makeInput({ value: metric.metricID, onChange: v => metric.metricID = v, required: true }), 'Unique ID used for tracking row lookups.');
    field(g, 'Display Name', makeInput({ value: metric.displayName, onChange: v => metric.displayName = v, required: true }), 'Friendly name shown to users.');
    field(g, 'Type', makeSelect(['number', 'duration', 'timestamp', 'due_by', 'start_timer', 'stop_timer'], metric.type, v => { metric.type = v; renderAll(); }), HELP.metricType);
    field(g, 'Record Type', makeSelect(['overwrite', 'keep_first', 'add'], metric.recordType, v => metric.recordType = v), 'How writes merge with existing same-day values.');
    field(g, 'Write to Notion', makeCheck(metric.writeToNotion, v => metric.writeToNotion = v), 'Enable this metric for Notion sync fields.');
    card.appendChild(g);

    const dates = toggleSection('Date Rules');
    metric.dates.forEach((d, di) => {
      const dCard = document.createElement('div');
      dCard.className = 'card';
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
    dates.append(button('Add Date Rule', '', () => { metric.dates.push(['Sunday', '22:30', 20, 2]); renderAll(); }));
    card.appendChild(dates);

    const streaks = toggleSection('Streak Properties');
    const streakGrid = document.createElement('div');
    streakGrid.className = 'grid';
    field(streakGrid, 'Unit', makeInput({ value: metric.streaks.unit, onChange: v => metric.streaks.unit = v }), 'Display unit for streak narration (days, sessions, etc).');
    field(streakGrid, 'Streak Metric ID', makeInput({ value: metric.streaks.streaksID, onChange: v => metric.streaks.streaksID = v }), 'Metric row used to store streak count.');
    streaks.appendChild(streakGrid);
    card.appendChild(streaks);

    const points = toggleSection('Points Properties');
    const pointsGrid = document.createElement('div');
    pointsGrid.className = 'grid';
    field(pointsGrid, 'Point Value', makeInput({ type: 'number', value: metric.points.value, onChange: v => metric.points.value = v }), 'Base points awarded per completion.');
    field(pointsGrid, 'Multiplier Days', makeInput({ type: 'number', min: 0, value: metric.points.multiplierDays, onChange: v => metric.points.multiplierDays = v }), 'Days required to increase point multiplier.');
    field(pointsGrid, 'Max Multiplier', makeInput({ type: 'number', min: 0, value: metric.points.maxMultiplier, onChange: v => metric.points.maxMultiplier = v }), 'Upper limit for point multiplier.');
    field(pointsGrid, 'Points Metric ID', makeInput({ value: metric.points.pointsID, onChange: v => metric.points.pointsID = v }), 'Metric row used to store per-metric points.');
    points.appendChild(pointsGrid);
    card.appendChild(points);

    const insights = toggleSection('Insights Properties');
    const ig = document.createElement('div');
    ig.className = 'grid';
    [['Insight Chance', 'insightChance'], ['Streak Probability', 'streakProb'], ['Day-to-Day Chance', 'dayToDayChance'], ['Day-to-Average Chance', 'dayToAvgChance'], ['Raw Value Chance', 'rawValueChance']].forEach(([label, key]) => {
      field(ig, label, makeInput({ type: 'number', min: 0, max: 1, step: '0.01', value: metric.insights[key], onChange: v => metric.insights[key] = v }), 'Probability-style setting from 0 to 1.');
    });
    field(ig, 'Increase is Good', makeSelect(['1', '-1'], String(metric.insights.increaseGood), v => metric.insights.increaseGood = Number(v)), '1 means higher values are better; -1 means lower is better.');
    field(ig, 'First Words', makeInput({ value: metric.insights.firstWords, onChange: v => metric.insights.firstWords = v }), 'Opening phrase for insight text.');
    field(ig, 'Insight First Words (legacy alias)', makeInput({ value: metric.insights.insightFirstWords, onChange: v => metric.insights.insightFirstWords = v }), 'Backward-compatible alternative to First Words.');
    field(ig, 'Insight Units', makeInput({ value: metric.insights.insightUnits, onChange: v => metric.insights.insightUnits = v }), 'Unit text for insight values.');
    insights.appendChild(ig);
    card.appendChild(insights);

    if (metric.type === 'start_timer' || metric.type === 'stop_timer') {
      const timer = toggleSection('Timer Settings');
      const tg = document.createElement('div');
      tg.className = 'grid';
      field(tg, 'Stop Timer Message', makeInput({ value: metric.ifTimer_Settings.stopTimerMessage, onChange: v => metric.ifTimer_Settings.stopTimerMessage = v }), HELP.ifTimer);
      field(tg, 'Timer Start Metric ID', makeInput({ value: metric.ifTimer_Settings.timerStartMetricID || '', onChange: v => metric.ifTimer_Settings.timerStartMetricID = v || null }), HELP.ifTimer);
      field(tg, 'Timer Duration Metric ID', makeInput({ value: metric.ifTimer_Settings.timerDurationMetricID || '', onChange: v => metric.ifTimer_Settings.timerDurationMetricID = v || null }), HELP.ifTimer);
      field(tg, 'Mute Output', makeCheck(metric.ifTimer_Settings.muteOutput, v => metric.ifTimer_Settings.muteOutput = v), HELP.ifTimer);
      timer.appendChild(tg);
      card.appendChild(timer);
    }

    return card;
  }

  function renderMetrics() {
    const root = $('tab-metrics');
    root.innerHTML = '';
    const info = document.createElement('p');
    info.className = 'muted';
    info.textContent = 'All metric arrays are GUI-only with add/delete/reorder controls. ppnMessage is intentionally omitted.';
    root.appendChild(info);
    state.metricSettings.forEach((m, i) => root.appendChild(renderMetric(m, i)));
    root.append(button('Add Metric', '', () => { state.metricSettings.push(newMetric()); renderAll(); }));
  }

  function renderBlock(block, i) {
    const card = document.createElement('div');
    card.className = 'card';
    const head = document.createElement('div');
    head.className = 'card-head';
    const title = document.createElement('h3');
    title.textContent = block.id || `Block ${i + 1}`;
    const ctr = document.createElement('div');
    ctr.className = 'controls';
    ctr.append(button('↑', 'secondary', () => move(state.lockoutsV2.blocks, i, -1)));
    ctr.append(button('↓', 'secondary', () => move(state.lockoutsV2.blocks, i, 1)));
    ctr.append(button('Delete', 'danger', () => { state.lockoutsV2.blocks.splice(i, 1); renderAll(); }));
    head.append(title, ctr);
    card.appendChild(head);

    const g = document.createElement('div');
    g.className = 'grid';
    field(g, 'Block ID', makeInput({ value: block.id, onChange: v => block.id = v }), 'Unique lockout block identifier.');
    field(g, 'Type', makeSelect(['duration_block', 'task_block', 'firstXMinutesAfterTimestamp_block'], block.type, v => { block.type = v; renderAll(); }), HELP.blockType);
    field(g, 'Begin Time', makeInput({ type: 'time', value: block.times.beg, onChange: v => block.times.beg = v }), 'Block activation start time (24h).');
    field(g, 'End Time', makeInput({ type: 'time', value: block.times.end, onChange: v => block.times.end = v }), 'Block activation end time (24h).');
    card.appendChild(g);

    const presetSec = toggleSection('Presets');
    block.presets.forEach((p, pi) => {
      const pCard = document.createElement('div');
      pCard.className = 'card';
      const pg = document.createElement('div');
      pg.className = 'grid';
      field(pg, 'Preset Name', makeInput({ value: p, onChange: v => block.presets[pi] = v }), HELP.presets);
      pCard.appendChild(pg);
      const pCtr = document.createElement('div');
      pCtr.className = 'controls';
      pCtr.append(button('↑', 'secondary', () => move(block.presets, pi, -1)));
      pCtr.append(button('↓', 'secondary', () => move(block.presets, pi, 1)));
      pCtr.append(button('Delete', 'danger', () => { block.presets.splice(pi, 1); renderAll(); }));
      pCard.appendChild(pCtr);
      presetSec.appendChild(pCard);
    });
    presetSec.append(button('Add Preset', '', () => { block.presets.push(''); renderAll(); }));
    card.appendChild(presetSec);

    const typeSec = toggleSection('Type-Specific Properties');
    if (block.type === 'duration_block') {
      const d = document.createElement('div'); d.className = 'grid';
      field(d, 'Max Minutes', makeInput({ type: 'number', min: 0, value: block.typeSpecific.duration.maxMinutes, onChange: v => block.typeSpecific.duration.maxMinutes = v }), 'Max minutes allowed before block message/shortcut.');
      field(d, 'Screen Time Metric ID', makeInput({ value: block.typeSpecific.duration.screenTimeID, onChange: v => block.typeSpecific.duration.screenTimeID = v }), 'Metric ID used to read screentime.');
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
        const tg = document.createElement('div'); tg.className = 'grid';
        field(tg, 'Required Metric ID', makeInput({ value: id, onChange: v => block.typeSpecific.task_block_IDs[ti] = v }), 'Completion of these metric IDs unlocks this block.');
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
      field(f, 'Timestamp Metric ID', makeInput({ value: block.typeSpecific.firstXMinutes.timestampID, onChange: v => block.typeSpecific.firstXMinutes.timestampID = v }), 'Timestamp metric ID used as reference.');
      typeSec.appendChild(f);
    }
    card.appendChild(typeSec);

    const onBlock = toggleSection('On-Block Output');
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
    state.lockoutsV2.blocks.forEach((b, i) => root.appendChild(renderBlock(b, i)));
    root.append(button('Add Block', '', () => { state.lockoutsV2.blocks.push(newBlock()); renderAll(); }));
  }

  function ensureShape(raw) {
    const base = defaultConfig();
    const merged = {
      ...base,
      ...raw,
      scriptProperties: { ...base.scriptProperties, ...(raw.scriptProperties || {}) },
      sheetConfig: { ...base.sheetConfig, ...(raw.sheetConfig || {}) },
      habitsV2Insights: { ...base.habitsV2Insights, ...(raw.habitsV2Insights || {}) },
      lockoutsV2: {
        ...base.lockoutsV2,
        ...(raw.lockoutsV2 || {}),
        globals: { ...base.lockoutsV2.globals, ...((raw.lockoutsV2 && raw.lockoutsV2.globals) || {}) }
      }
    };
    merged.metricSettings = (raw.metricSettings || []).map((m) => ({ ...newMetric(), ...m, streaks: { ...newMetric().streaks, ...(m.streaks || {}) }, points: { ...newMetric().points, ...(m.points || {}) }, insights: { ...newMetric().insights, ...(m.insights || {}) }, ifTimer_Settings: { ...newMetric().ifTimer_Settings, ...(m.ifTimer_Settings || {}) } }));
    merged.lockoutsV2.blocks = ((merged.lockoutsV2 && merged.lockoutsV2.blocks) || []).map((b) => ({ ...newBlock(), ...b, times: { ...newBlock().times, ...(b.times || {}) }, typeSpecific: { ...newBlock().typeSpecific, ...(b.typeSpecific || {}), duration: { ...newBlock().typeSpecific.duration, ...((b.typeSpecific && b.typeSpecific.duration) || {}), rationing: { ...newBlock().typeSpecific.duration.rationing, ...(((b.typeSpecific || {}).duration || {}).rationing || {}) } }, firstXMinutes: { ...newBlock().typeSpecific.firstXMinutes, ...((b.typeSpecific && b.typeSpecific.firstXMinutes) || {}) } }, onBlock: { ...newBlock().onBlock, ...(b.onBlock || {}) } }));
    return merged;
  }

  function parseConfigGs(text) {
    const cleaned = text.trim();
    if (!cleaned) throw new Error('Paste Config.gs text first.');
    const fn = new Function(`${cleaned}; return (typeof getAppConfig === 'function') ? getAppConfig() : null;`);
    const cfg = fn();
    if (!cfg || typeof cfg !== 'object') throw new Error('Could not evaluate getAppConfig(). Ensure full file is pasted.');
    return ensureShape(cfg);
  }

  function validateState() {
    const errors = [];
    state.metricSettings.forEach((m, i) => {
      if (!m.metricID) errors.push(`Metric ${i + 1}: Metric ID is required.`);
      if (!m.displayName) errors.push(`Metric ${i + 1}: Display Name is required.`);
      m.dates.forEach((d, di) => {
        if (!DAYS.includes(d[0])) errors.push(`Metric ${i + 1}, date ${di + 1}: invalid day.`);
        if (!/^\d{2}:\d{2}$/.test(d[1])) errors.push(`Metric ${i + 1}, date ${di + 1}: due-by must be HH:MM.`);
        if (typeof d[2] !== 'number' || typeof d[3] !== 'number') errors.push(`Metric ${i + 1}, date ${di + 1}: start/end must be numbers.`);
      });
    });
    state.lockoutsV2.blocks.forEach((b, i) => {
      if (!b.id) errors.push(`Block ${i + 1}: Block ID is required.`);
      if (!/^\d{2}:\d{2}$/.test(b.times.beg) || !/^\d{2}:\d{2}$/.test(b.times.end)) errors.push(`Block ${i + 1}: begin/end time must be HH:MM.`);
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
      state = parseConfigGs($('importText').value);
      $('importStatus').textContent = 'Config parsed successfully.';
      renderAll();
    } catch (err) {
      $('importStatus').textContent = `Parse failed: ${err.message}`;
    }
  });

  $('freshBtn').addEventListener('click', () => {
    state = defaultConfig();
    $('importText').value = '';
    $('importStatus').textContent = 'Started fresh config.';
    renderAll();
  });

  $('exportBtn').addEventListener('click', () => {
    const errors = validateState();
    if (errors.length) {
      $('exportStatus').textContent = `Fix validation errors first: ${errors.slice(0, 3).join(' | ')}`;
      return;
    }
    $('exportText').value = toConfigGs(state);
    $('exportStatus').textContent = 'Config.gs generated.';
  });

  $('copyBtn').addEventListener('click', async () => {
    const txt = $('exportText').value;
    if (!txt) {
      $('exportStatus').textContent = 'Generate Config.gs before copying.';
      return;
    }
    try {
      await navigator.clipboard.writeText(txt);
      $('exportStatus').textContent = 'Copied to clipboard.';
    } catch (_) {
      $('exportStatus').textContent = 'Clipboard copy failed. Copy text manually.';
    }
  });

  renderAll();
})();
