const HELP = {
  cumulativeScreentimeID: 'Metric ID for cumulative screentime. Use when your blocks compare against total daily screen usage.',
  barLength: 'Length of the visual progress bar. Example: 20 gives a 20-character progress display.',
  presetCalendarName: 'Calendar name used for preset windows, if your lockout logic reads calendar events.',
  lockout_name: 'Human-readable name shown in logs/debugging.',
  enabled: 'Turn a block on/off without deleting it.',
  threshold_minutes: 'Minutes of activity that trigger this lockout.',
  site: 'Domain or app label to block. Example: youtube.com',
  label: 'Display name for the habit metric.',
  metric_id: 'Stable ID stored in sheet headers and scripts. Avoid changing once in use.',
  metric_type: 'Controls expected input style. Timer-based metrics can use ifTimer_Settings.',
  target: 'Target numeric value for completion logic.',
  pointMultiplier: 'How many points this metric is worth when complete.',
  timerMinutes: 'Timer duration in minutes for timer-type metrics.',
  enforceSingleStartStop: 'If true, users should run one start/stop cycle per day.'
};

const state = {
  config: defaultConfig(),
  errors: []
};

function defaultConfig() {
  return {
    lockoutsV2: {
      globals: {
        cumulativeScreentimeID: null,
        barLength: 20,
        presetCalendarName: ''
      },
      blocks: []
    },
    metricSettings: []
  };
}

function parseConfigFromText(text) {
  const returnMatch = text.match(/return\s+({[\s\S]*});?/);
  if (!returnMatch) {
    throw new Error('Could not find a `return { ... }` object in the pasted text.');
  }
  const objectLiteral = returnMatch[1];
  const parsed = Function(`"use strict"; return (${objectLiteral});`)();
  if (!parsed || typeof parsed !== 'object') throw new Error('Parsed value is not an object.');
  return {
    ...defaultConfig(),
    ...parsed,
    lockoutsV2: {
      ...defaultConfig().lockoutsV2,
      ...(parsed.lockoutsV2 || {}),
      globals: {
        ...defaultConfig().lockoutsV2.globals,
        ...((parsed.lockoutsV2 || {}).globals || {})
      },
      blocks: Array.isArray((parsed.lockoutsV2 || {}).blocks) ? parsed.lockoutsV2.blocks : []
    },
    metricSettings: Array.isArray(parsed.metricSettings) ? parsed.metricSettings : []
  };
}

function makeField({ label, key, type = 'text', value, help, placeholder = '', onInput }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';

  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  if (help) {
    const helpEl = document.createElement('span');
    helpEl.className = 'help';
    helpEl.dataset.help = help;
    helpEl.textContent = '?';
    labelEl.appendChild(helpEl);
  }
  wrapper.appendChild(labelEl);

  let input;
  if (type === 'select') {
    input = document.createElement('select');
    for (const option of ['boolean', 'timer', 'count', 'text']) {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      if (value === option) opt.selected = true;
      input.appendChild(opt);
    }
  } else {
    input = document.createElement('input');
    input.type = type;
    if (type === 'number' && typeof value === 'number') input.value = String(value);
    if (type !== 'number' && value !== null && value !== undefined) input.value = String(value);
  }

  input.placeholder = placeholder;
  input.dataset.key = key;
  wrapper.appendChild(input);

  const err = document.createElement('div');
  err.className = 'error-message';
  wrapper.appendChild(err);

  input.addEventListener('input', () => onInput(input.value, err));
  return wrapper;
}

function renderGlobals() {
  const lockoutGlobals = document.getElementById('lockoutGlobals');
  lockoutGlobals.innerHTML = '';
  const g = state.config.lockoutsV2.globals;

  lockoutGlobals.appendChild(makeField({
    label: 'cumulativeScreentimeID', key: 'cumulativeScreentimeID', value: g.cumulativeScreentimeID ?? '',
    help: HELP.cumulativeScreentimeID,
    onInput: (v, err) => { g.cumulativeScreentimeID = v || null; err.textContent = ''; }
  }));
  lockoutGlobals.appendChild(makeField({
    label: 'barLength', key: 'barLength', type: 'number', value: g.barLength,
    help: HELP.barLength,
    onInput: (v, err) => {
      if (v === '' || Number.isNaN(Number(v))) { err.textContent = 'Must be a number.'; return; }
      g.barLength = Number(v); err.textContent = '';
    }
  }));
  lockoutGlobals.appendChild(makeField({
    label: 'presetCalendarName', key: 'presetCalendarName', value: g.presetCalendarName,
    help: HELP.presetCalendarName,
    onInput: (v, err) => { g.presetCalendarName = v; err.textContent = ''; }
  }));
}

function renderBlocks() {
  const container = document.getElementById('blocksContainer');
  container.innerHTML = '';
  state.config.lockoutsV2.blocks.forEach((block, index) => {
    const item = document.createElement('div');
    item.className = 'item';

    const title = document.createElement('div');
    title.className = 'item-title';
    title.innerHTML = `<strong>Block #${index + 1}</strong>`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = 'Remove';
    remove.onclick = () => { state.config.lockoutsV2.blocks.splice(index, 1); renderAll(); };
    title.appendChild(remove);
    item.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'form-grid';
    grid.appendChild(makeField({
      label: 'lockout_name', key: 'lockout_name', value: block.lockout_name || '', help: HELP.lockout_name,
      onInput: (v, err) => { block.lockout_name = v; err.textContent = ''; }
    }));
    grid.appendChild(makeField({
      label: 'site', key: 'site', value: block.site || '', help: HELP.site,
      onInput: (v, err) => { block.site = v; err.textContent = ''; }
    }));
    grid.appendChild(makeField({
      label: 'threshold_minutes', key: 'threshold_minutes', type: 'number', value: block.threshold_minutes ?? 0, help: HELP.threshold_minutes,
      onInput: (v, err) => {
        if (v === '' || Number.isNaN(Number(v))) { err.textContent = 'Must be a number.'; return; }
        block.threshold_minutes = Number(v); err.textContent = '';
      }
    }));
    grid.appendChild(makeField({
      label: 'enabled (true/false)', key: 'enabled', value: String(Boolean(block.enabled)), help: HELP.enabled,
      onInput: (v, err) => {
        if (!['true', 'false'].includes(v.trim().toLowerCase())) { err.textContent = 'Enter true or false.'; return; }
        block.enabled = v.trim().toLowerCase() === 'true'; err.textContent = '';
      }
    }));
    item.appendChild(grid);
    container.appendChild(item);
  });
}

function renderHabitsGlobals() {
  const container = document.getElementById('habitsGlobals');
  container.innerHTML = '';
  const count = document.createElement('div');
  count.className = 'field';
  count.innerHTML = `<label>Metrics configured</label><input type="text" readonly value="${state.config.metricSettings.length}" />`;
  container.appendChild(count);
}

function renderMetrics() {
  const container = document.getElementById('metricsContainer');
  container.innerHTML = '';
  state.config.metricSettings.forEach((metric, index) => {
    const item = document.createElement('div');
    item.className = 'item';

    const title = document.createElement('div');
    title.className = 'item-title';
    title.innerHTML = `<strong>Metric #${index + 1}</strong>`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = 'Remove';
    remove.onclick = () => { state.config.metricSettings.splice(index, 1); renderAll(); };
    title.appendChild(remove);
    item.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'form-grid';
    grid.appendChild(makeField({ label: 'label', key: 'label', value: metric.label || '', help: HELP.label, onInput: (v, err) => { metric.label = v; err.textContent = ''; }}));
    grid.appendChild(makeField({ label: 'metric_id', key: 'metric_id', value: metric.metric_id || '', help: HELP.metric_id, onInput: (v, err) => { metric.metric_id = v; err.textContent = ''; }}));
    grid.appendChild(makeField({ label: 'metric_type', key: 'metric_type', type: 'select', value: metric.metric_type || 'boolean', help: HELP.metric_type, onInput: (v, err) => { metric.metric_type = v; err.textContent = ''; renderAll(); }}));
    grid.appendChild(makeField({ label: 'target', key: 'target', type: 'number', value: Number(metric.target ?? 1), help: HELP.target, onInput: (v, err) => {
      if (v === '' || Number.isNaN(Number(v))) { err.textContent = 'Must be a number.'; return; }
      metric.target = Number(v); err.textContent = '';
    }}));
    grid.appendChild(makeField({ label: 'pointMultiplier', key: 'pointMultiplier', type: 'number', value: Number(metric.pointMultiplier ?? 1), help: HELP.pointMultiplier, onInput: (v, err) => {
      if (v === '' || Number.isNaN(Number(v))) { err.textContent = 'Must be a number.'; return; }
      metric.pointMultiplier = Number(v); err.textContent = '';
    }}));

    const showTimer = metric.metric_type === 'timer';
    if (showTimer) {
      metric.ifTimer_Settings = metric.ifTimer_Settings || { timerMinutes: 25, enforceSingleStartStop: true };
      grid.appendChild(makeField({ label: 'ifTimer_Settings.timerMinutes', key: 'timerMinutes', type: 'number', value: Number(metric.ifTimer_Settings.timerMinutes ?? 25), help: HELP.timerMinutes, onInput: (v, err) => {
        if (v === '' || Number.isNaN(Number(v))) { err.textContent = 'Must be a number.'; return; }
        metric.ifTimer_Settings.timerMinutes = Number(v); err.textContent = '';
      }}));
      grid.appendChild(makeField({ label: 'ifTimer_Settings.enforceSingleStartStop (true/false)', key: 'enforceSingleStartStop', value: String(Boolean(metric.ifTimer_Settings.enforceSingleStartStop)), help: HELP.enforceSingleStartStop, onInput: (v, err) => {
        if (!['true', 'false'].includes(v.trim().toLowerCase())) { err.textContent = 'Enter true or false.'; return; }
        metric.ifTimer_Settings.enforceSingleStartStop = v.trim().toLowerCase() === 'true'; err.textContent = '';
      }}));
    } else if (metric.ifTimer_Settings) {
      delete metric.ifTimer_Settings;
    }

    item.appendChild(grid);
    container.appendChild(item);
  });
}

function renderAll() {
  renderGlobals();
  renderBlocks();
  renderHabitsGlobals();
  renderMetrics();
}

function generateConfigText() {
  const merged = {
    ...state.config,
    lockoutsV2: state.config.lockoutsV2,
    metricSettings: state.config.metricSettings
  };
  return `function getAppConfig() {\n  return ${toPrettyJs(merged, 2)};\n}`;
}

function toPrettyJs(value, indent = 0) {
  const space = ' '.repeat(indent);
  const next = ' '.repeat(indent + 2);
  if (value === null) return 'null';
  if (typeof value === 'string') return `'${value.replaceAll("'", "\\'")}'`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `[\n${value.map(v => `${next}${toPrettyJs(v, indent + 2)}`).join(',\n')}\n${space}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    return `{\n${entries.map(([k, v]) => `${next}${k}: ${toPrettyJs(v, indent + 2)}`).join(',\n')}\n${space}}`;
  }
  return 'null';
}

function switchTab(tabName) {
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tab-panel');
  tabs.forEach(t => {
    const active = t.dataset.tab === tabName;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
  });
  panels.forEach(p => p.classList.toggle('active', p.id === (tabName === 'lockouts' ? 'panelLockouts' : 'panelHabits')));
}

function setup() {
  document.getElementById('parseBtn').onclick = () => {
    const status = document.getElementById('importStatus');
    const text = document.getElementById('importText').value;
    try {
      state.config = parseConfigFromText(text);
      status.className = 'status';
      status.textContent = 'Config loaded successfully.';
      renderAll();
    } catch (e) {
      status.className = 'status error';
      status.textContent = `Import failed: ${e.message}`;
    }
  };

  document.getElementById('resetBtn').onclick = () => {
    state.config = defaultConfig();
    document.getElementById('importStatus').textContent = 'Reset to defaults.';
    renderAll();
  };

  document.getElementById('addBlockBtn').onclick = () => {
    state.config.lockoutsV2.blocks.push({ lockout_name: '', site: '', threshold_minutes: 0, enabled: true });
    renderAll();
  };

  document.getElementById('addMetricBtn').onclick = () => {
    state.config.metricSettings.push({ label: '', metric_id: '', metric_type: 'boolean', target: 1, pointMultiplier: 1 });
    renderAll();
  };

  document.getElementById('exportBtn').onclick = () => {
    const text = generateConfigText();
    document.getElementById('exportText').value = text;
    document.getElementById('exportStatus').textContent = 'Config.gs generated.';
  };

  document.getElementById('copyBtn').onclick = async () => {
    const status = document.getElementById('exportStatus');
    const text = document.getElementById('exportText').value;
    if (!text.trim()) {
      status.className = 'status error';
      status.textContent = 'Nothing to copy yet. Generate first.';
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      status.className = 'status';
      status.textContent = 'Copied to clipboard.';
    } catch {
      status.className = 'status error';
      status.textContent = 'Clipboard access failed. Copy manually from the text box.';
    }
  };

  document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => switchTab(tab.dataset.tab);
  });

  renderAll();
}

setup();
