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
        globals: { barLength: 20, presetCalendarName: 'App Lockout Settings', defaultBlockTimezoneMode: 'fixed', cacheTimezoneMode: 'script' },
        presets: [],
        blocks: []
      }
    };
  }

  let state = defaultConfig();
  const sectionOpenState = new Map();
  const itemUiKeys = new WeakMap();
  let itemUiSequence = 0;
  const searchQueries = { metrics: '', blocks: '' };
  let validationShown = false;
  const undoStack = [];
  const redoStack = [];
  const generatedMetricIds = new WeakSet();
  const generatedBlockIds = new WeakSet();
  const generatedSupportingIds = { points: new WeakSet(), streaks: new WeakSet() };
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
    dateRule: 'Scheduled weekday for streaks. Due-by timestamp metrics also use the configured deadline.',
    presets: 'A preset selects its assigned blocks. On iOS, no preset means no blocks; deleting an expected preset keeps its rules for two minutes. Chrome uses all blocks when no preset is supplied.',
    datesSection: 'Choose days that count toward streaks. No rules means every day. Due-by timestamp metrics also enforce their configured deadline.',
    streaksSection: 'Enable streaks to store consecutive completed days or sessions in a separate row. Its ID defaults to Metric ID + _streak. Save and Apply creates the row.',
    pointsSection: 'Enable points to store this metric’s daily award in a separate row. Its ID defaults to Metric ID + _points. Points are per numeric unit, rounded duration minute, or text/timestamp completion. Save and Apply creates the row.',
    insightsSection: 'Controls optional feedback after logging, such as a streak update or a comparison with an earlier day or recent average. A probability of 0% means never and 100% means always.'
  };

  const $ = (id) => document.getElementById(id);
  const tabs = document.querySelectorAll('.tab');
  const TAB_EXPLAINERS = {
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
    const close = () => { help.classList.remove('open'); help.setAttribute('aria-expanded', 'false'); };
    help.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') close(); });
    help.addEventListener('blur', close);
    help.addEventListener('keydown', event => { if (event.key === 'Escape') { close(); help.blur(); } });
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

  let fieldSequence = 0;
  function field(container, title, control, help) {
    const group = document.createElement('div');
    group.className = 'config-field';
    const row = labelWithHelp(title, help);
    const label = document.createElement('label');
    label.textContent = title;
    control.id = control.id || `config-field-${++fieldSequence}`;
    control.dataset.field = title;
    label.htmlFor = control.id;
    row.firstElementChild.replaceWith(label);
    group.append(row, control);
    container.appendChild(group);
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
      details.dataset.sectionKey = key;
      details.addEventListener('toggle', () => {
        if (details.isConnected) sectionOpenState.set(key, details.open);
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

  // UI identities never enter exported configuration. They follow an item
  // through undo/redo, even when its editable ID or position changes.
  function itemUiKey(item) {
    if (!itemUiKeys.has(item)) itemUiKeys.set(item, `item-${++itemUiSequence}`);
    return itemUiKeys.get(item);
  }

  function copyItemUiKey(from, to) {
    if (itemUiKeys.has(from)) itemUiKeys.set(to, itemUiKeys.get(from));
  }

  function captureSectionState() {
    document.querySelectorAll('details[data-section-key]').forEach(details => {
      sectionOpenState.set(details.dataset.sectionKey, details.open);
    });
  }

  function resetEditorView() {
    sectionOpenState.clear();
    searchQueries.metrics = '';
    searchQueries.blocks = '';
    validationShown = false;
    clearValidationErrors();
  }

  function openNewItem(item) {
    sectionOpenState.set(`${itemUiKey(item)}-card`, true);
  }

  const BLOCK_TYPE_LABELS = {
    duration_block: 'Screen-time limit',
    task_block: 'Require completed metrics',
    firstXMinutesAfterTimestamp_block: 'Block briefly after an event'
  };

  function metricCardSummary(metric) {
    const type = metric.dataType === 'number' && metric.inputMode === 'completion' ? 'completion' : metric.dataType;
    return `${metricTypeLabel(type)} · Points ${pointsEnabled(metric) ? 'on' : 'off'} · Streaks ${metric.streaks.streaksID ? 'on' : 'off'}`;
  }

  function blockCardSummary(block) {
    const hours = block.times.beg === block.times.end ? 'All day' : `${block.times.beg}–${block.times.end}`;
    return `${BLOCK_TYPE_LABELS[block.type] || block.type} · ${hours} · ${block.presets.length ? `Presets: ${block.presets.join(', ')}` : 'No presets assigned'}`;
  }

  function blockMetricReferences(block) {
    if (block.type === 'task_block') return block.typeSpecific.task_block_IDs;
    if (block.type === 'duration_block') return [block.typeSpecific.duration.screenTimeID];
    if (block.type === 'firstXMinutesAfterTimestamp_block') return [block.typeSpecific.firstXMinutes.timestampID];
    return [];
  }

  function blockSearchText(block) {
    const references = blockMetricReferences(block);
    const metricNames = state.metricSettings.filter(metric => references.includes(metric.metricID)).map(metric => metric.displayName);
    return [block.name, block.id, BLOCK_TYPE_LABELS[block.type], ...block.presets, ...references, ...metricNames].join(' ').toLowerCase();
  }

  function filterCards(tab) {
    const root = $(`tab-${tab}`);
    if (!root) return;
    const query = searchQueries[tab].trim().toLowerCase();
    const items = tab === 'metrics' ? state.metricSettings : state.lockouts.blocks;
    root.querySelectorAll('.editor-card').forEach((card, index) => {
      const item = items[index];
      if (!item) { card.hidden = true; return; }
      const text = tab === 'metrics' ? `${item.displayName} ${item.metricID} ${item.dataType} ${metricCardSummary(item)}`.toLowerCase() : blockSearchText(item);
      card.hidden = !text.includes(query);
    });
    root.querySelectorAll('.metric-navigator a').forEach((link, index) => {
      link.hidden = root.querySelectorAll('.editor-card')[index].hidden;
    });
    const empty = root.querySelector('.search-empty');
    if (empty) empty.hidden = !items.length || [...root.querySelectorAll('.editor-card')].some(card => !card.hidden);
  }

  function listTools(tab) {
    const tools = document.createElement('div');
    tools.className = 'metric-tools';
    const search = document.createElement('input');
    search.type = 'search';
    search.id = `${tab}Search`;
    search.value = searchQueries[tab];
    search.placeholder = tab === 'metrics' ? 'Search metrics by name or ID' : 'Search blocks by name, preset, or metric';
    search.setAttribute('aria-label', `Search ${tab}`);
    search.addEventListener('input', () => { searchQueries[tab] = search.value; filterCards(tab); });
    const expand = open => {
      $(`tab-${tab}`).querySelectorAll('.editor-card, .editor-card details').forEach(details => {
        details.open = open;
        if (details.dataset.sectionKey) sectionOpenState.set(details.dataset.sectionKey, open);
      });
    };
    tools.append(search, button('Expand All', 'secondary', () => expand(true), { trackHistory: false }), button('Collapse All', 'secondary', () => expand(false), { trackHistory: false }));
    return tools;
  }

  function searchEmptyMessage(tab) {
    const empty = document.createElement('p');
    empty.className = 'empty-state search-empty';
    empty.textContent = `No ${tab} match your search.`;
    empty.hidden = true;
    return empty;
  }

  // Only handles capture pointers; normal text selection and card disclosure stay native.
  let cancelDrag = null;

  function reorderItems(items, sourceKey, targetKey, after) {
    const from = items.findIndex(item => itemUiKey(item) === sourceKey);
    const target = items.findIndex(item => itemUiKey(item) === targetKey);
    if (from < 0 || target < 0 || from === target) return false;
    const destination = target + (after ? 1 : 0) - (from < target ? 1 : 0);
    if (destination === from) return false;
    const [item] = items.splice(from, 1);
    items.splice(destination, 0, item);
    return true;
  }

  function dragHandle(card, item, tab, name) {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'drag-handle secondary';
    handle.textContent = '⠿';
    handle.setAttribute('aria-label', `Drag to reorder ${name}`);
    handle.title = 'Drag to reorder. You can also use the up and down buttons.';
    handle.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
    handle.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); });
    handle.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      if (cancelDrag) cancelDrag();
      event.preventDefault();
      event.stopPropagation();
      handle.focus({ preventScroll: true });
      const root = $(`tab-${tab}`);
      const sourceKey = itemUiKey(item);
      const currentName = (tab === 'metrics' ? item.displayName : item.name) || name;
      const startY = event.clientY, startX = event.clientX;
      let x = startX, y = startY, dragging = false, drop = null, frame = null;
      const cards = [...root.querySelectorAll('.editor-card')].filter(candidate => !candidate.hidden);
      const clearMarks = () => cards.forEach(candidate => candidate.classList.remove('drop-before', 'drop-after'));
      const updateDrop = () => {
        clearMarks();
        drop = null;
        const bounds = root.getBoundingClientRect();
        if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return;
        const ownHeader = card.firstElementChild.getBoundingClientRect();
        if (y >= ownHeader.top && y <= ownHeader.bottom) return;
        const others = cards.filter(candidate => candidate !== card);
        const target = others.find(candidate => {
          const rect = candidate.firstElementChild.getBoundingClientRect();
          return y < rect.top + rect.height / 2;
        }) || others[others.length - 1];
        if (!target) return;
        const rect = target.firstElementChild.getBoundingClientRect();
        const after = y >= rect.top + rect.height / 2;
        drop = { key: target.dataset.itemKey, after };
        target.classList.add(after ? 'drop-after' : 'drop-before');
      };
      const animate = () => {
        if (dragging) {
          const edge = 65;
          const delta = y < edge ? -Math.min(16, (edge - y) / 4) : y > innerHeight - edge ? Math.min(16, (y - innerHeight + edge) / 4) : 0;
          if (delta) window.scrollBy(0, delta);
          updateDrop();
        }
        frame = requestAnimationFrame(animate);
      };
      const movePointer = next => {
        if (next.pointerId !== event.pointerId) return;
        x = next.clientX; y = next.clientY;
        if (!dragging && Math.hypot(x - startX, y - startY) >= 6) {
          dragging = true;
          card.classList.add('drag-source');
        }
        if (dragging) updateDrop();
      };
      const finish = (commit, next) => {
        if (next && next.pointerId !== event.pointerId) return;
        if (commit && next) { x = next.clientX; y = next.clientY; updateDrop(); }
        const destination = dragging && commit ? drop : null;
        cancelDrag = null;
        cancelAnimationFrame(frame);
        clearMarks();
        card.classList.remove('drag-source');
        handle.removeEventListener('pointermove', movePointer);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', cancelled);
        handle.removeEventListener('lostpointercapture', cancelled);
        document.removeEventListener('keydown', escape);
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        if (!destination) return;
        let changed = false;
        withHistory(() => {
          const items = tab === 'metrics' ? state.metricSettings : state.lockouts.blocks;
          changed = reorderItems(items, sourceKey, destination.key, destination.after);
          if (changed) renderAll();
        });
        if (changed) {
          const moved = [...$(`tab-${tab}`).querySelectorAll('.editor-card')].find(candidate => candidate.dataset.itemKey === sourceKey);
          moved.querySelector('.drag-handle').focus({ preventScroll: true });
          const items = tab === 'metrics' ? state.metricSettings : state.lockouts.blocks;
          $('reorderStatus').textContent = `${currentName} moved to position ${items.findIndex(value => itemUiKey(value) === sourceKey) + 1} of ${items.length}.`;
        }
      };
      const up = next => finish(true, next);
      const cancelled = next => finish(false, next);
      const escape = next => { if (next.key === 'Escape') { next.preventDefault(); finish(false); } };
      cancelDrag = () => finish(false);
      handle.addEventListener('pointermove', movePointer);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', cancelled);
      handle.addEventListener('lostpointercapture', cancelled);
      document.addEventListener('keydown', escape);
      handle.setPointerCapture(event.pointerId);
      frame = requestAnimationFrame(animate);
    });
    return handle;
  }

  function cardHeader(card, item, tab, name, summaryText, controls) {
    const header = card.firstElementChild;
    header.className = 'card-head';
    header.replaceChildren();
    const text = document.createElement('div');
    text.className = 'card-heading';
    const title = document.createElement('h3');
    title.dataset.cardName = '';
    title.textContent = name;
    const description = document.createElement('span');
    description.className = 'card-description';
    description.dataset.cardDescription = '';
    description.textContent = summaryText;
    text.append(title, description);
    // Buttons in a native summary must not invoke its disclosure action.
    controls.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
    controls.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); });
    header.append(dragHandle(card, item, tab, name), text, controls);
    card.dataset.itemKey = itemUiKey(item);
    card.dataset.tab = tab;
  }

  function refreshCardSummaries() {
    for (const tab of ['metrics', 'blocks']) {
      const root = $(`tab-${tab}`);
      if (!root) continue;
      const items = tab === 'metrics' ? state.metricSettings : state.lockouts.blocks;
      root.querySelectorAll('.editor-card').forEach((card, index) => {
        const item = items[index];
        if (!item || itemUiKey(item) !== card.dataset.itemKey) return;
        card.querySelector('[data-card-name]').textContent = (tab === 'metrics' ? item.displayName : item.name) || (tab === 'metrics' ? 'Unnamed Metric' : 'Unnamed Block');
        card.querySelector('.drag-handle').setAttribute('aria-label', `Drag to reorder ${card.querySelector('[data-card-name]').textContent}`);
        card.querySelector('[data-card-description]').textContent = tab === 'metrics' ? metricCardSummary(item) : blockCardSummary(item);
      });
      if (tab === 'metrics') root.querySelectorAll('.metric-navigator a').forEach((link, index) => {
        const metric = items[index];
        if (metric) link.textContent = `${metric.displayName || 'Unnamed'} · ${metric.metricID || 'missing ID'} · ${metric.dataType}`;
      });
      filterCards(tab);
    }
    const presetSummary = $('presetCalendarSummary');
    if (presetSummary) presetSummary.textContent = presetCalendarSummary();
    const presetGuide = $('presetCalendarGuide');
    if (presetGuide) presetGuide.textContent = presetCalendarInstructions();
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
    const copy = JSON.parse(JSON.stringify(input));
    if (input.metricSettings) {
      input.metricSettings.forEach((metric, index) => copyGeneratedMetricIds(metric, copy.metricSettings[index]));
    }
    if (input.lockouts) {
      input.lockouts.blocks.forEach((block, index) => {
        copyItemUiKey(block, copy.lockouts.blocks[index]);
        if (generatedBlockIds.has(block)) generatedBlockIds.add(copy.lockouts.blocks[index]);
      });
    }
    return copy;
  }

  function copyGeneratedMetricIds(from, to) {
    copyItemUiKey(from, to);
    if (generatedMetricIds.has(from)) generatedMetricIds.add(to);
    Object.values(generatedSupportingIds).forEach(ids => { if (ids.has(from)) ids.add(to); });
  }

  function pushUndoSnapshot(snapshot) {
    undoStack.push(snapshot);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    updateUndoRedoButtons();
  }

  function withHistory(changeFn) {
    captureSectionState();
    const before = cloneState(state);
    const beforeSerialized = JSON.stringify(before);
    changeFn();
    if (JSON.stringify(state) !== beforeSerialized) {
      pushUndoSnapshot(before);
      saveLocalDraft();
      publishConfiguredMetrics();
      refreshCardSummaries();
      if (validationShown) showValidationErrors(collectValidationIssues());
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
    captureSectionState();
    const current = cloneState(state);
    const previous = undoStack.pop();
    redoStack.push(current);
    restoreState(previous);
    updateUndoRedoButtons();
  }

  function redo() {
    if (!redoStack.length) return;
    captureSectionState();
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
      points: { value: 0, multiplierDays: 5, maxMultiplier: 1.2, pointsID: '' },
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

  function supportingIdKey(kind) {
    return kind === 'points' ? 'pointsID' : 'streaksID';
  }

  function generateSupportingId(metric, kind) {
    const suffix = kind === 'points' ? 'points' : 'streak';
    metric[kind][supportingIdKey(kind)] = `${metric.metricID || normalizedMetricId(metric.displayName) || 'metric'}_${suffix}`;
    generatedSupportingIds[kind].add(metric);
  }

  function setSupportingId(metric, kind, value) {
    metric[kind][supportingIdKey(kind)] = value;
    generatedSupportingIds[kind].delete(metric);
  }

  function setMetricId(metric, id, supportingInputs = {}) {
    metric.metricID = id;
    Object.keys(generatedSupportingIds).forEach(kind => {
      if (!generatedSupportingIds[kind].has(metric)) return;
      generateSupportingId(metric, kind);
      if (supportingInputs[kind]) supportingInputs[kind].value = metric[kind][supportingIdKey(kind)];
    });
  }

  function pointsEnabled(metric) {
    return !!metric.points.pointsID || Number(metric.points.value || 0) !== 0;
  }

  function setFeatureEnabled(metric, kind, enabled) {
    if (enabled) {
      generateSupportingId(metric, kind);
      if (kind === 'points' && Number(metric.points.value || 0) === 0) metric.points.value = 1;
    } else {
      metric[kind][supportingIdKey(kind)] = '';
      generatedSupportingIds[kind].delete(metric);
      if (kind === 'points') metric.points.value = 0;
    }
  }

  function supportingIdField(container, metric, kind) {
    const title = kind === 'points' ? 'Points ID' : 'Streak ID';
    const key = supportingIdKey(kind);
    const group = document.createElement('div');
    group.className = 'field-group';
    const input = makeInput({ value: metric[kind][key], required: true, onChange: value => setSupportingId(metric, kind, value) });
    field(group, title, input, 'Unique ID for a separate supporting row. Save and Apply creates it. Changing an existing ID starts a new row and retains the old history.');
    group.appendChild(button('Regenerate from Metric ID', 'link-button', () => {
      generateSupportingId(metric, kind);
      input.value = metric[kind][key];
    }));
    group.appendChild(fieldHint('Save and Apply creates this separate row. Use a different ID from your measurement and other supporting rows.'));
    container.appendChild(group);
    return input;
  }

  function getPromptRanges(dateRule) {
    if (Array.isArray(dateRule[2])) return dateRule[2];
    if (String(dateRule[2] ?? '').trim() === '' && String(dateRule[3] ?? '').trim() === '') return [];
    return [[dateRule[2], dateRule[3]]];
  }

  const METRIC_TYPES = [
    { value: 'completion', label: 'Done / not done' },
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'duration', label: 'Duration' },
    { value: 'timestamp', label: 'Timestamp' }
  ];

  const METRIC_TYPE_HINTS = {
    completion: 'Log completion with one tap. The logger sends 1 automatically.',
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
    if (recipe === 'completion') metric.inputMode = 'completion';
    metric.metricID = normalizedMetricId(metric.displayName);
    if (recipe === 'due_by') {
      metric.timestampSettings.writeMode = 'due_by';
      metric.dates = [['Sunday', '22:00']];
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
    if (metric.streaks.streaksID) generateSupportingId(copy, 'streaks');
    if (pointsEnabled(metric)) generateSupportingId(copy, 'points');
    state.metricSettings.splice(index + 1, 0, copy);
    generatedMetricIds.add(copy);
    openNewItem(copy);
    searchQueries.metrics = '';
    renderAll();
  }

  function duplicateBlock(block, index) {
    const copy = cloneState(block);
    copy.name = `${block.name || block.id || 'Block'} Copy`;
    copy.id = uniqueId(`${block.id || normalizedMetricId(copy.name)}_copy`, new Set(state.lockouts.blocks.map(item => item.id)));
    state.lockouts.blocks.splice(index + 1, 0, copy);
    openNewItem(copy);
    searchQueries.blocks = '';
    renderAll();
  }

  function renderMetricSettings() {
    const root = toggleSection('Metric Settings', 'metric-settings', false, 'Defaults for logging, Sheet layout, insights, and optional integrations. Most setups can keep these unchanged.');

    const basic = toggleSection('Logging and Points Totals', 'metric-logging');
    const basicGrid = document.createElement('div');
    basicGrid.className = 'grid';
    field(basicGrid, 'Tracking Sheet Name', makeInput({ value: state.trackingSheetName, onChange: v => state.trackingSheetName = v, required: true }), HELP.trackingSheetName);
    field(basicGrid, 'Daily Points Metric ID', makeInput({ value: state.dailyPointsID, onChange: v => state.dailyPointsID = v }), 'Metric ID row for daily points total.');
    field(basicGrid, 'Cumulative Points Metric ID', makeInput({ value: state.cumulativePointsID, onChange: v => state.cumulativePointsID = v }), 'Metric ID row for all-time points total.');
    field(basicGrid, 'Late Extension Hours', makeInput({ type: 'number', min: 0, value: state.lateExtensionHours, onChange: v => state.lateExtensionHours = v }), 'Hours after midnight still accepted for previous day due-by checks.');
    basic.appendChild(basicGrid);
    root.appendChild(basic);

    const standalone = toggleSection('Advanced / Standalone Deployment', 'metric-standalone', false);
    standalone.appendChild(fieldHint('For an Apps Script project hosted separately from your Sheet. The usual Sheet-bound setup needs no spreadsheet ID property. The Sheet menu and setup panel require a bound project.'));
    field(standalone, 'Spreadsheet ID Property Name', makeInput({ value: state.scriptProperties.spreadsheetId, onChange: v => state.scriptProperties.spreadsheetId = v }), HELP.spreadsheetId);
    root.appendChild(standalone);

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
    field(sheetGrid, 'Metric ID Column', makeInput({ type: 'number', min: 1, value: state.sheetConfig.taskIdColumn, onChange: v => state.sheetConfig.taskIdColumn = v }), '1-indexed column containing metric IDs. Usually column A (1).');
    field(sheetGrid, 'Label Column', makeInput({ type: 'number', min: 1, value: state.sheetConfig.labelColumn, onChange: v => state.sheetConfig.labelColumn = v }), '1-indexed column for label.');
    field(sheetGrid, 'Data Start Column', makeInput({ type: 'number', min: 1, value: state.sheetConfig.dataStartColumn, onChange: v => state.sheetConfig.dataStartColumn = v }), '1-indexed starting column for metric data.');
    sheetSec.appendChild(sheetGrid);
    root.appendChild(sheetSec);

    const insightSec = toggleSection('Insight Defaults', 'metric-insights');
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

    return root;
  }

  function renderBlockSettings() {
    const lockouts = toggleSection('Advanced Block Settings', 'block-settings', false, 'Display and timezone defaults, and an optional custom preset calendar. Most setups can keep these unchanged.');
    const lockGrid = document.createElement('div');
    lockGrid.className = 'grid';
    field(lockGrid, 'Bar Length', makeInput({ type: 'number', min: 1, value: state.lockouts.globals.barLength, onChange: v => state.lockouts.globals.barLength = v }), 'Character length used for on-block screentime bar token.');
    field(lockGrid, 'Preset Calendar Name', makeInput({ value: state.lockouts.globals.presetCalendarName, onChange: v => state.lockouts.globals.presetCalendarName = v }), 'Keep App Lockout Settings for the standard setup. Runtime and Chrome read this custom name, but Locked’s native unlock-expiry event action still writes to App Lockout Settings. Keep that default calendar for expiry events, or also edit the calendar in Locked’s event-creation action when replacing it.');
    field(lockGrid, 'Default Block Timezone Mode', makeSelect(['fixed', 'floating'], state.lockouts.globals.defaultBlockTimezoneMode, v => state.lockouts.globals.defaultBlockTimezoneMode = v), HELP.defaultBlockTimezoneMode);
    field(lockGrid, 'Cache Timezone Mode', makeSelect(['script', 'client'], state.lockouts.globals.cacheTimezoneMode, v => state.lockouts.globals.cacheTimezoneMode = v), HELP.cacheTimezoneMode);
    lockouts.appendChild(lockGrid);
    return lockouts;
  }

  function renderMetric(metric, i) {
    const key = itemUiKey(metric);
    const card = toggleSection('', `${key}-card`, false);
    card.className = 'card metric-card editor-card';
    card.id = `metric-card-${i}`;
    const ctr = document.createElement('div');
    ctr.className = 'controls';
    ctr.append(button('↑', 'secondary', () => move(state.metricSettings, i, -1)));
    ctr.append(button('↓', 'secondary', () => move(state.metricSettings, i, 1)));
    ctr.append(button('Duplicate', 'secondary', () => duplicateMetric(metric, i)));
    ctr.append(button('Delete', 'danger', () => { state.metricSettings.splice(i, 1); renderAll(); }));
    cardHeader(card, metric, 'metrics', metric.displayName || 'Unnamed Metric', metricCardSummary(metric), ctr);

    const g = document.createElement('div');
    g.className = 'grid metric-basics';
    const supportingInputs = {};
    const metricIdInput = makeInput({ value: metric.metricID, onChange: v => { setMetricId(metric, v, supportingInputs); generatedMetricIds.delete(metric); }, required: true });
    field(g, 'Display Name', makeInput({ value: metric.displayName, onChange: v => { metric.displayName = v; if (generatedMetricIds.has(metric)) { setMetricId(metric, normalizedMetricId(v), supportingInputs); metricIdInput.value = metric.metricID; } }, required: true }), 'Friendly name shown to users. New recipe IDs follow this name until the ID is edited.');
    const metricIdField = document.createElement('div');
    metricIdField.className = 'field-group';
    field(metricIdField, 'Metric ID', metricIdInput, 'Unique ID used by Shortcuts and Sheet row lookups. Spaces become underscores. Changing a saved ID does not rename historical rows.');
    const idActions = document.createElement('div');
    idActions.className = 'inline-field-actions';
    idActions.append(fieldHint('Used by Shortcuts and integrations. Usually you can leave the generated value as-is.'));
    idActions.append(button('Regenerate from name', 'link-button', () => {
      metric.metricID = normalizedMetricId(metric.displayName);
      setMetricId(metric, metric.metricID, supportingInputs);
      generatedMetricIds.add(metric);
      renderAll();
    }));
    metricIdField.appendChild(idActions);
    g.appendChild(metricIdField);

    const typeGroup = document.createElement('div');
    typeGroup.className = 'field-group';
    field(typeGroup, 'What are you tracking?', makeSelect(METRIC_TYPES, metric.inputMode === 'completion' && metric.dataType === 'number' ? 'completion' : metric.dataType, v => {
      metric.dataType = v === 'completion' ? 'number' : v;
      if (v === 'completion') { metric.inputMode = 'completion'; metric.recordType = 'keep_first'; }
      else delete metric.inputMode;
      if (metric.recordType === 'add' && !['number', 'duration'].includes(v)) metric.recordType = 'overwrite';
      if (v !== 'timestamp') metric.timestampSettings.writeMode = 'now';
      applyMetricTypeDefaults(metric);
      renderAll();
    }), HELP.metricType);
    typeGroup.appendChild(fieldHint(METRIC_TYPE_HINTS[metric.inputMode === 'completion' && metric.dataType === 'number' ? 'completion' : metric.dataType] || 'Choose the kind of value this metric stores.'));
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
    const advanced = toggleSection(advancedSummary.join(' · '), `${key}-advanced`, false);

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
        { value: 'fixed', label: 'Always use the Apps Script timezone' }
      ], metric.timezoneMode || 'floating', v => metric.timezoneMode = v), 'Following the device uses a supplied client timezone or offset. Fixed keeps scheduled times tied to Apps Script.');
    }
    if (state.writeToNotion) {
      field(advancedGrid, 'Sync This Metric to Notion', makeCheck(metric.writeToNotion, v => metric.writeToNotion = v), 'Include this metric when the global Notion integration is enabled.');
    }
    advanced.appendChild(advancedGrid);

    const dates = toggleSection('Date Rules', `${key}-dates`, false, HELP.datesSection);
    metric.dates.forEach((d, di) => {
      const dCard = document.createElement('div');
      dCard.className = 'card';
      dCard.dataset.dateIndex = di;
      const dateTitle = document.createElement('h4');
      dateTitle.textContent = `Date Rule ${di + 1}`;
      dCard.appendChild(dateTitle);
      const dg = document.createElement('div');
      dg.className = 'grid';
      field(dg, 'Day', makeSelect(DAYS, d[0], v => d[0] = v), HELP.dateRule);
      if (metric.dataType === 'timestamp' && metric.timestampSettings.writeMode === 'due_by') {
        field(dg, 'Due By (HH:MM)', makeInput({ type: 'time', value: d[1], onChange: v => d[1] = v }), HELP.dateRule);
      }
      dCard.appendChild(dg);
      const dCtr = document.createElement('div');
      dCtr.className = 'controls';
      dCtr.append(button('↑', 'secondary', () => move(metric.dates, di, -1)));
      dCtr.append(button('↓', 'secondary', () => move(metric.dates, di, 1)));
      dCtr.append(button('Delete', 'danger', () => { metric.dates.splice(di, 1); renderAll(); }));
      dCard.appendChild(dCtr);
      dates.appendChild(dCard);
    });
    dates.append(button('Add Date Rule', '', () => { metric.dates.push(['Sunday', '']); renderAll(); }));
    advanced.appendChild(dates);

    const streaks = toggleSection('Streak Properties', `${key}-streaks`, false, HELP.streaksSection);
    field(streaks, 'Enable Streaks', makeCheck(!!metric.streaks.streaksID, enabled => { setFeatureEnabled(metric, 'streaks', enabled); renderAll(); }), HELP.streaksSection);
    const streakGrid = document.createElement('div');
    streakGrid.className = 'grid';
    streakGrid.hidden = !metric.streaks.streaksID;
    field(streakGrid, 'Unit', makeInput({ value: metric.streaks.unit, onChange: v => metric.streaks.unit = v }), 'Display unit for streak narration (days, sessions, etc).');
    supportingInputs.streaks = supportingIdField(streakGrid, metric, 'streaks');
    streaks.appendChild(streakGrid);
    advanced.appendChild(streaks);

    const points = toggleSection('Points Properties', `${key}-points`, false, HELP.pointsSection);
    field(points, 'Enable Points', makeCheck(pointsEnabled(metric), enabled => { setFeatureEnabled(metric, 'points', enabled); renderAll(); }), 'Enable scoring and a separate points row. Disabling points sets the award to zero.');
    const pointsGrid = document.createElement('div');
    pointsGrid.className = 'grid';
    pointsGrid.hidden = !pointsEnabled(metric);
    field(pointsGrid, 'Base Points per Unit / Completion', makeInput({ type: 'number', value: metric.points.value, onChange: v => metric.points.value = v }), 'Points per numeric unit, rounded duration minute, or text/timestamp completion, before the streak multiplier. Negative values deduct points.');
    field(pointsGrid, 'Maximum Streak Multiplier', makeInput({ type: 'number', min: 0, value: metric.points.maxMultiplier, onChange: v => metric.points.maxMultiplier = v }), 'Reward consistency with a small bonus on your base points. A maximum of 1.2 means up to 20% extra: 10 base points can become 12. The bonus grows gradually with your streak before each new recording. Set this to 1 for a constant award or fixed penalty; negative base points produce larger deductions as the multiplier grows. A separate streak row is optional; scoring can calculate the streak from your metric history.');
    field(pointsGrid, 'Days Until Maximum Multiplier', makeInput({ type: 'number', min: 0, value: metric.points.multiplierDays, onChange: v => metric.points.multiplierDays = v }), 'Choose how quickly the consistency bonus grows. With a maximum of 1.2 and 5 days, each prior streak day adds 4%, reaching 20% after 5 completed streak days; the next recording receives that maximum. Only scheduled days count. A shorter ramp rewards consistency sooner; a longer ramp makes the bonus build more slowly.');
    supportingInputs.points = supportingIdField(pointsGrid, metric, 'points');
    points.appendChild(pointsGrid);
    advanced.appendChild(points);

    const insights = toggleSection('Insights Properties', `${key}-insights`, false, HELP.insightsSection);
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
    root.appendChild(renderMetricSettings());
    root.appendChild(listTools('metrics'));
    const nav = document.createElement('nav'); nav.className = 'metric-navigator'; nav.setAttribute('aria-label', 'Metric navigator');
    state.metricSettings.forEach((m, i) => { const link = document.createElement('a'); link.href = `#metric-card-${i}`; link.textContent = `${m.displayName || 'Unnamed'} · ${m.metricID || 'missing ID'} · ${m.dataType}`; link.addEventListener('click', event => { event.preventDefault(); revealTarget({ tab: 'metrics', itemKey: itemUiKey(m) }); }); nav.appendChild(link); });
    root.appendChild(nav);
    state.metricSettings.forEach((m, i) => root.appendChild(renderMetric(m, i)));
    root.appendChild(searchEmptyMessage('metrics'));
    filterCards('metrics');
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
    addRow.append(recipe, button('Add metric', '', () => { const metric = metricFromRecipe(recipe.value); state.metricSettings.push(metric); openNewItem(metric); searchQueries.metrics = ''; renderAll(); }));
    addMetric.append(addTitle, addDescription, addRow);
    root.append(addMetric);
    publishConfiguredMetrics();
  }

  function publishConfiguredMetrics() {
    const metricSummary = state.metricSettings.map(({ metricID, displayName, dataType, inputMode }) => ({ metricID, displayName, dataType, inputMode }));
    window.OpenHabitsConfiguredMetrics = metricSummary;
    document.dispatchEvent(new CustomEvent('openhabits:metrics-changed', { detail: metricSummary }));
  }

  function renderBlock(block, i) {
    const key = itemUiKey(block);
    const card = toggleSection('', `${key}-card`, false);
    card.className = 'card block-card editor-card';
    card.id = `block-card-${i}`;
    const ctr = document.createElement('div');
    ctr.className = 'controls';
    ctr.append(button('↑', 'secondary', () => move(state.lockouts.blocks, i, -1)));
    ctr.append(button('↓', 'secondary', () => move(state.lockouts.blocks, i, 1)));
    ctr.append(button('Duplicate', 'secondary', () => duplicateBlock(block, i)));
    ctr.append(button('Delete', 'danger', () => { state.lockouts.blocks.splice(i, 1); renderAll(); }));
    cardHeader(card, block, 'blocks', block.name || 'Unnamed Block', blockCardSummary(block), ctr);

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

    const presetSec = toggleSection('Assign Presets to this Block', `${key}-presets`, true, HELP.presets);
    presetSec.appendChild(fieldHint(block.presets.length ? 'Applies when one of these presets is active.' : 'Assign a preset to enable this block on iOS.'));
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

    const typeSec = toggleSection('Type-Specific Properties', `${key}-type-specific`);
    if (block.type === 'duration_block') {
      const d = document.createElement('div'); d.className = 'grid';
      field(d, 'Max Minutes', makeInput({ type: 'number', min: 0, value: block.typeSpecific.duration.maxMinutes, onChange: v => block.typeSpecific.duration.maxMinutes = v }), 'Hard cap on this block’s screen-time allowance. The block enforces it only during its active time window. Rationing releases the allowance gradually, but never raises this cap.');
      field(d, 'Screen Time Metric ID', metricReferenceSelect(block.typeSpecific.duration.screenTimeID, v => block.typeSpecific.duration.screenTimeID = v), 'Metric used to read accumulated screen time.');
      field(d, 'Rationing On', makeCheck(block.typeSpecific.duration.rationing.isON, v => block.typeSpecific.duration.rationing.isON = v), 'Gradually release a cumulative screen-time allowance from Begin Minutes to End Minutes across the block’s Begin Time and End Time. Access blocks when recorded use reaches the allowance available now, capped at Max Minutes.');
      field(d, 'Rationing Begin Minutes', makeInput({ type: 'number', min: 0, value: block.typeSpecific.duration.rationing.begMinutes, onChange: v => block.typeSpecific.duration.rationing.begMinutes = v }), 'Screen-time minutes available immediately at Begin Time. This is an allowance, not a time of day. The allowance then grows toward End Minutes, capped at Max Minutes.');
      field(d, 'Rationing End Minutes', makeInput({ type: 'number', min: 0, value: block.typeSpecific.duration.rationing.endMinutes, onChange: v => block.typeSpecific.duration.rationing.endMinutes = v }), 'Target allowance at End Time. Set this higher than Max Minutes to release the full cap earlier. Example: 09:00–17:00, Max 60, Begin 0, End 120 releases all 60 minutes by 13:00. The hard cap remains 60.');
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

    const onBlock = toggleSection('On-Block Output', `${key}-onblock`, false);
    const og = document.createElement('div'); og.className = 'grid';
    field(og, 'Message', makeInput({ value: block.onBlock.message, onChange: v => block.onBlock.message = v }), 'Shown when block is active. Supports tokens like {endTime} and {screenTimeBar}.');
    field(og, 'Shortcut Name', makeInput({ value: block.onBlock.shortcutName, onChange: v => block.onBlock.shortcutName = v }), 'Optional iOS shortcut name to run on block.');
    field(og, 'Shortcut Input', makeInput({ value: block.onBlock.shortcutInput, onChange: v => block.onBlock.shortcutInput = v }), 'Optional text payload sent to shortcut.');
    onBlock.appendChild(og);
    card.appendChild(onBlock);

    return card;
  }

  function presetCalendarSummary() {
    const calendarName = state.lockouts.globals.presetCalendarName || 'App Lockout Settings';
    return `Add presets here, assign them to blocks, and schedule one matching all-day event per day on "${calendarName}".`;
  }

  function presetCalendarInstructions() {
    const calendarName = state.lockouts.globals.presetCalendarName || 'App Lockout Settings';
    return `Create a calendar named "${calendarName}" (the default is "App Lockout Settings"). Add presets here, such as workday or weekend, and assign them to your blocks. On that calendar, create one all-day event per day with a title that exactly matches a preset name. That day's event activates the blocks assigned to its preset.`;
  }

  function renderBlocks() {
    const root = $('tab-blocks');
    root.innerHTML = '';
    const intro = document.createElement('div');
    intro.className = 'notice';
    intro.textContent = 'Blocks are checked from top to bottom. If several rules apply, the first rule that blocks access wins.';
    root.appendChild(intro);
    const presets = toggleSection('Preset Modes', 'blocks-presets', true, 'Presets select which blocks apply on a particular day. Add a name here, assign it to blocks, and use that exact name as an all-day event title on your preset calendar. For example, a workday event activates blocks assigned to workday. Use one all-day preset event per day.');
    const calendarSummary = fieldHint(presetCalendarSummary());
    calendarSummary.id = 'presetCalendarSummary';
    presets.appendChild(calendarSummary);
    const learnMore = toggleSection('Learn more', 'blocks-presets-learn-more', false);
    const calendarGuide = fieldHint(presetCalendarInstructions());
    calendarGuide.id = 'presetCalendarGuide';
    learnMore.appendChild(calendarGuide);
    learnMore.appendChild(fieldHint('On iOS, a day with no preset has no blocks. If an expected preset is deleted, its rules remain for two minutes from the first detected absence; a later app opening confirms it is still missing and clears it. This discourages impulsive deletions. Switching to another preset takes effect immediately. Use Allowed for a temporary unlock.'));
    learnMore.appendChild(fieldHint('For Chrome syncing, use a calendar in Google Calendar or shared with the Google account running your Sheet’s Apps Script, and also add it to Apple Calendar. Use the same calendar name in Preset Calendar Name under Blocks → Advanced Block Settings. Chrome currently applies all blocks when no preset is found; the iOS two-minute deletion delay does not apply to Chrome.'));
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
    presets.appendChild(learnMore);
    root.appendChild(presets);
    root.appendChild(renderBlockSettings());
    if (!state.lockouts.blocks.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No focus rules yet. Start with a screen-time limit, require a completed metric, or block briefly after an event.';
      root.appendChild(empty);
    }
    root.appendChild(listTools('blocks'));
    state.lockouts.blocks.forEach((b, i) => root.appendChild(renderBlock(b, i)));
    root.appendChild(searchEmptyMessage('blocks'));
    filterCards('blocks');
    root.append(button('Add Block', '', () => {
      const block = newBlock();
      block.name = `Block ${state.lockouts.blocks.length + 1}`;
      block.id = uniqueId(block.name, new Set(state.lockouts.blocks.map(item => item.id)));
      generatedBlockIds.add(block);
      state.lockouts.blocks.push(block);
      openNewItem(block);
      searchQueries.blocks = '';
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
      // Existing scoring with an omitted multiplier historically meant a
      // constant award. Apply the new bonus default only to unconfigured points.
      if (m.points && pointsEnabled(m) && m.points.maxMultiplier === undefined) normalized.points.maxMultiplier = 1;
      normalized.dates = normalized.dates.map(entry => {
        const rule = typeof entry === 'string' ? [entry, ''] : entry.slice();
        rule[0] = DAYS.find(day => day.toLowerCase() === String(rule[0]).toLowerCase()) || rule[0];
        return rule;
      });
      copyGeneratedMetricIds(m, normalized);
      if (pointsEnabled(normalized) && !normalized.points.pointsID) generateSupportingId(normalized, 'points');
      normalizeMetricInsights(normalized);
      applyMetricTypeDefaults(normalized);
      return normalized;
    });
    merged.lockouts.blocks = ((merged.lockouts && merged.lockouts.blocks) || []).map((b) => {
      const normalized = { ...newBlock(), ...b, times: { ...newBlock().times, ...(b.times || {}) }, typeSpecific: { ...newBlock().typeSpecific, ...(b.typeSpecific || {}), duration: { ...newBlock().typeSpecific.duration, ...((b.typeSpecific && b.typeSpecific.duration) || {}), rationing: { ...newBlock().typeSpecific.duration.rationing, ...(((b.typeSpecific || {}).duration || {}).rationing || {}) } }, firstXMinutes: { ...newBlock().typeSpecific.firstXMinutes, ...((b.typeSpecific && b.typeSpecific.firstXMinutes) || {}) } }, onBlock: { ...newBlock().onBlock, ...(b.onBlock || {}) } };
      copyItemUiKey(b, normalized);
      if (generatedBlockIds.has(b)) generatedBlockIds.add(normalized);
      return normalized;
    });
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

  function validationTarget(tab, item, field, extra = {}) {
    return { tab, ...(item ? { itemKey: itemUiKey(item) } : {}), field, ...extra };
  }

  // Keep these storage checks aligned with openHabitsValidateStorageIds_ in SetupV2.gs.
  function validateStorageIds(config, report) {
    const errors = [];
    const owners = new Map();
    const metrics = Array.isArray(config.metricSettings) ? config.metricSettings : [];
    const fail = (message, target) => { errors.push(message); if (report) report(message, target); };
    function reserve(id, label) {
      if (typeof id === 'string') id = id.trim();
      if (typeof id === 'string' && id && !owners.has(id)) owners.set(id, label);
    }
    function add(id, label, target) {
      if (id === undefined || id === null || id === '') return;
      if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) {
        fail(`${label} may only contain letters, numbers, underscores, and hyphens, starting with a letter or number.`, target);
        return;
      }
      if (owners.has(id)) fail(`Row ID "${id}" is shared by ${owners.get(id)} and ${label}. Use a unique ID for each measurement, points, streak, and total row.`, target);
      else owners.set(id, label);
    }
    metrics.forEach(metric => {
      if (metric) reserve(metric.metricID, `Metric ID for "${metric.metricID}"`);
    });
    const globals = (config.lockouts || {}).globals || {};
    reserve(globals.cumulativeScreentimeID, 'Cumulative Screen Time ID');
    add(config.dailyPointsID, 'Daily Points ID', validationTarget('metrics', null, 'Daily Points Metric ID'));
    add(config.cumulativePointsID, 'Cumulative Points ID', validationTarget('metrics', null, 'Cumulative Points Metric ID'));
    metrics.forEach(metric => {
      if (!metric) return;
      const points = metric.points || {};
      const name = ` for metric "${metric.metricID || 'unnamed'}"`;
      const pointsTarget = validationTarget('metrics', metric, 'Points ID');
      if (Number(points.value || 0) !== 0 && !points.pointsID) fail(`Points ID${name} is required when the point value is nonzero.`, pointsTarget);
      add(points.pointsID, `Points ID${name}`, pointsTarget);
      add((metric.streaks || {}).streaksID, `Streak ID${name}`, validationTarget('metrics', metric, 'Streak ID'));
    });
    return errors;
  }

  function collectValidationIssues() {
    const issues = [];
    const fail = (message, target) => issues.push({ message, target });
    validateStorageIds(state, fail);
    const metricIds = state.metricSettings.map(metric => metric.metricID).filter(Boolean);
    const duplicateMetricIds = metricIds.filter((id, index) => metricIds.indexOf(id) !== index);
    if (duplicateMetricIds.length) {
      const metric = state.metricSettings.find(item => item.metricID === duplicateMetricIds[0]);
      fail(`Duplicate Metric IDs: ${[...new Set(duplicateMetricIds)].join(', ')}.`, validationTarget('metrics', metric, 'Metric ID'));
    }
    state.metricSettings.forEach((m, i) => {
      const metricIssue = (message, field, extra) => fail(message, validationTarget('metrics', m, field, extra));
      if (!m.metricID) metricIssue(`Metric ${i + 1}: Metric ID is required.`, 'Metric ID');
      if (!m.displayName) metricIssue(`Metric ${i + 1}: Display Name is required.`, 'Display Name');
      if (m.rowNumber !== undefined && (!Number.isInteger(m.rowNumber) || m.rowNumber <= 0)) metricIssue(`Metric ${i + 1}: Row Number must be a positive whole number.`, 'Sheet Row Override');
      if (m.timezoneMode && !['fixed', 'floating'].includes(m.timezoneMode)) metricIssue(`Metric ${i + 1}: timezoneMode must be fixed or floating.`, 'Timezone Behavior');
      if (!['text', 'number', 'duration', 'timestamp'].includes(m.dataType)) metricIssue(`Metric ${i + 1}: invalid data type.`, 'What are you tracking?');
      if (m.recordType === 'add' && !['number', 'duration'].includes(m.dataType)) metricIssue(`Metric ${i + 1}: add record type is only supported for number and duration metrics.`, 'When today already has a value');
      if (m.timestampSettings.writeMode === 'due_by' && m.dates.length === 0) metricIssue(`Metric ${i + 1}: due-by timestamps require at least one date rule.`, null, { action: 'Add Date Rule' });
      m.dates.forEach((d, di) => {
        if (!DAYS.includes(d[0])) metricIssue(`Metric ${i + 1}, date ${di + 1}: invalid day.`, 'Day', { dateIndex: di });
        const hasDueBy = String(d[1] || '').trim() !== '';
        if (m.timestampSettings.writeMode === 'due_by' && !hasDueBy) metricIssue(`Metric ${i + 1}, date ${di + 1}: due-by is required for due-by timestamps.`, 'Due By (HH:MM)', { dateIndex: di });
        if (hasDueBy && !/^\d{2}:\d{2}$/.test(d[1])) metricIssue(`Metric ${i + 1}, date ${di + 1}: due-by must be HH:MM.`, 'Due By (HH:MM)', { dateIndex: di });
        getPromptRanges(d).forEach(range => {
          if (!Array.isArray(range) || range.length < 2 || !range.slice(0, 2).every(hour => typeof hour === 'number' && Number.isFinite(hour) && hour >= 0 && hour <= 24)) {
            metricIssue(`Metric ${i + 1}, date ${di + 1}: legacy time-window start/end hours must be numbers from 0 to 24.`, 'Day', { dateIndex: di });
          }
        });
      });
    });
    if (!['fixed', 'floating'].includes(state.lockouts.globals.defaultBlockTimezoneMode)) fail('Lockouts defaultBlockTimezoneMode must be fixed or floating.', validationTarget('blocks', null, 'Default Block Timezone Mode'));
    if (!['script', 'client'].includes(state.lockouts.globals.cacheTimezoneMode)) fail('Lockouts cacheTimezoneMode must be script or client.', validationTarget('blocks', null, 'Cache Timezone Mode'));
    const blockIds = state.lockouts.blocks.map(block => block.id).filter(Boolean);
    const duplicateBlockIds = blockIds.filter((id, index) => blockIds.indexOf(id) !== index);
    if (duplicateBlockIds.length) {
      const block = state.lockouts.blocks.find(item => item.id === duplicateBlockIds[0]);
      fail(`Duplicate Block IDs: ${[...new Set(duplicateBlockIds)].join(', ')}. Recreate or remove the duplicate block.`, validationTarget('blocks', block, 'Block Name'));
    }
    state.lockouts.blocks.forEach((b, i) => {
      const blockIssue = (message, field, extra) => fail(message, validationTarget('blocks', b, field, extra));
      if (!b.id) blockIssue(`Block ${i + 1}: Block ID is required. Enter a Block Name to generate it.`, 'Block Name');
      if (b.timezoneMode && !['fixed', 'floating'].includes(b.timezoneMode)) blockIssue(`Block ${i + 1}: timezoneMode must be fixed or floating.`, 'Timezone Mode');
      if (!/^\d{2}:\d{2}$/.test(b.times.beg) || !/^\d{2}:\d{2}$/.test(b.times.end)) blockIssue(`Block ${i + 1}: begin/end time must be HH:MM.`, !/^\d{2}:\d{2}$/.test(b.times.beg) ? 'Begin Time' : 'End Time');
      const references = blockMetricReferences(b);
      const field = b.type === 'task_block' ? 'Required Metric ID' : b.type === 'duration_block' ? 'Screen Time Metric ID' : 'Timestamp Metric ID';
      references.forEach((id, occurrence) => {
        if (id && !metricIds.includes(id)) blockIssue(`Block ${i + 1}: referenced Metric ID "${id}" was not found.`, field, { occurrence });
      });
    });
    return issues;
  }

  function validateState() {
    return collectValidationIssues().map(issue => issue.message);
  }

  function clearValidationErrors() {
    const container = $('validationErrors');
    if (container) { container.replaceChildren(); container.hidden = true; }
  }

  function revealTarget(target) {
    const tab = target.tab;
    const tabButton = [...tabs].find(item => item.dataset.tab === tab);
    if (tabButton) tabButton.click();
    const root = $(`tab-${tab}`);
    if (!root) return;
    if (target.itemKey) {
      searchQueries[tab] = '';
      const search = $(`${tab}Search`);
      if (search) search.value = '';
      filterCards(tab);
    }
    const card = target.itemKey ? [...root.querySelectorAll('.editor-card')].find(item => item.dataset.itemKey === target.itemKey) : root;
    if (!card) return;
    const scope = target.dateIndex !== undefined ? card.querySelector(`[data-date-index="${target.dateIndex}"]`) : card;
    const controls = scope ? [...scope.querySelectorAll('[data-field]')].filter(control => control.dataset.field === target.field) : [];
    const action = target.action ? [...card.querySelectorAll('button')].find(control => control.textContent === target.action) : null;
    let control = controls[target.occurrence || 0] || action || (scope && scope !== card ? scope.querySelector('[data-field]') : null) || (card !== root ? card.firstElementChild : null);
    if (control && control.closest('[hidden]')) {
      // Invalid imported IDs can belong to a disabled feature. Let its
      // enable toggle generate a valid ID instead of focusing an invisible field.
      const enable = target.field === 'Points ID' ? 'Enable Points' : target.field === 'Streak ID' ? 'Enable Streaks' : null;
      if (enable) control = [...card.querySelectorAll('[data-field]')].find(item => item.dataset.field === enable) || control;
    }
    if (!control) return;
    let parent = control.closest('details');
    while (parent) {
      parent.open = true;
      if (parent.dataset.sectionKey) sectionOpenState.set(parent.dataset.sectionKey, true);
      parent = parent.parentElement.closest('details');
    }
    control.scrollIntoView({ block: 'center' });
    control.focus({ preventScroll: true });
  }

  function showValidationErrors(issues, revealFirst = false) {
    const container = $('validationErrors');
    if (!container) return;
    clearValidationErrors();
    if (!issues.length) {
      $('exportStatus').textContent = 'Validation errors resolved. Finish and copy when ready.';
      return;
    }
    validationShown = true;
    $('exportStatus').textContent = `Fix ${issues.length} validation error${issues.length === 1 ? '' : 's'} below. Select an error to open its settings.`;
    const list = document.createElement('ul');
    list.className = 'validation-errors';
    issues.forEach(issue => {
      const entry = document.createElement('li');
      entry.appendChild(button(issue.message, 'link-button', () => revealTarget(issue.target), { trackHistory: false }));
      list.appendChild(entry);
    });
    container.appendChild(list);
    container.hidden = false;
    if (revealFirst) revealTarget(issues[0].target);
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
    if (cancelDrag) cancelDrag();
    renderMetrics();
    renderBlocks();
    if (validationShown) showValidationErrors(collectValidationIssues());
  }

  $('parseBtn').addEventListener('click', () => {
    try {
      withHistory(() => { state = parseConfigGs($('importText').value); resetEditorView(); });
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
    withHistory(() => { state = defaultConfig(); resetEditorView(); });
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
    const issues = collectValidationIssues();
    if (issues.length) { showValidationErrors(issues, true); return; }
    validationShown = false;
    clearValidationErrors();
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
    const issues = collectValidationIssues();
    if (issues.length) { showValidationErrors(issues, true); return; }
    validationShown = false;
    clearValidationErrors();
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
    const issues = collectValidationIssues();
    if (issues.length) { showValidationErrors(issues, true); return; }
    validationShown = false;
    clearValidationErrors();
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
        withHistory(() => { state = ensureShape(draft.config); resetEditorView(); });
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
  setTabExplainer('metrics');
  updateUndoRedoButtons();
})();
