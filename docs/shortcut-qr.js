(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OpenHabitsShortcutQr = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  const PREFIX = 'shortcuts://run-shortcut?name=';

  function normalizeShortcutName(value) {
    return String(value || '').trim();
  }

  function buildShortcutUrl(value) {
    const name = normalizeShortcutName(value);
    if (!name) throw new Error('Enter a Shortcut name first.');
    return PREFIX + encodeURIComponent(name);
  }

  function buildInsightsUrl(metricIds, shortcutName) {
    const ids = (metricIds || []).map(normalizeShortcutName).filter(Boolean);
    if (!ids.length) throw new Error('Select at least one metric first.');
    const text = buildShortcutMetricText(ids.map(id => ({ metricID: id })));
    return buildShortcutUrl(shortcutName || 'Insights') + '&input=text&text=' + encodeURIComponent(text);
  }

  function buildShortcutMetricText(metrics) {
    if (!Array.isArray(metrics) || !metrics.length) throw new Error('Select at least one metric first.');
    const inputMetrics = metrics.filter(metric => metric && metric.requiresInput);
    if (inputMetrics.length && metrics.length > 1) throw new Error('Generate input-bearing metrics one at a time so each magic variable is unambiguous.');
    const entries = metrics.map(metric => {
      const id = normalizeShortcutName(metric && metric.metricID);
      if (!id) throw new Error('Every selected metric needs a metric ID.');
      return metric.requiresInput ? `[${JSON.stringify(id)}, <Provided Input>]` : `[${JSON.stringify(id)}]`;
    });
    return `[${entries.join(',')}]`;
  }

  function init() {
    if (typeof document === 'undefined') return;
    const metricSelect = document.getElementById('qrMetricSelect');
    const nameInput = document.getElementById('qrShortcutName');
    const modeInput = document.getElementById('qrLaunchMode');
    const urlInput = document.getElementById('qrLaunchUrl');
    const generateBtn = document.getElementById('qrGenerateBtn');
    const copyBtn = document.getElementById('qrCopyBtn');
    const downloadBtn = document.getElementById('qrDownloadBtn');
    const openLink = document.getElementById('qrOpenLink');
    const preview = document.getElementById('qrPreview');
    const status = document.getElementById('qrStatus');
    const shortcutSearch = document.getElementById('shortcutMetricSearch');
    const shortcutOptions = document.getElementById('shortcutMetricOptions');
    const shortcutSelectionStatus = document.getElementById('shortcutMetricSelectionStatus');
    const shortcutRequiresInput = document.getElementById('shortcutRequiresInput');
    const shortcutOutput = document.getElementById('shortcutMetricOutput');
    const shortcutStatus = document.getElementById('shortcutMetricStatus');
    const shortcutGenerateBtn = document.getElementById('shortcutTextGenerate');
    const shortcutCopyBtn = document.getElementById('shortcutTextCopy');
    if (!metricSelect || !nameInput || !generateBtn || !shortcutSearch || !shortcutOptions) return;

    let canvas = null;
    let configuredMetrics = [];
    const selectedMetricIds = new Set();

    function renderShortcutOptions() {
      const query = normalizeShortcutName(shortcutSearch.value).toLowerCase();
      const matches = configuredMetrics.filter(metric =>
        `${metric.displayName || ''} ${metric.metricID || ''}`.toLowerCase().includes(query)
      );
      shortcutOptions.replaceChildren();
      matches.forEach((metric) => {
        if (!metric.metricID) return;
        const label = document.createElement('label');
        label.className = 'metric-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = metric.metricID;
        checkbox.checked = selectedMetricIds.has(metric.metricID);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selectedMetricIds.add(metric.metricID);
          else selectedMetricIds.delete(metric.metricID);
          shortcutSelectionStatus.textContent = selectedMetricIds.size
            ? `${selectedMetricIds.size} metric${selectedMetricIds.size === 1 ? '' : 's'} selected.`
            : 'No metrics selected.';
          shortcutOutput.value = '';
        });
        const text = document.createElement('span');
        const name = normalizeShortcutName(metric.displayName);
        text.textContent = name && name !== metric.metricID ? `${name} — ${metric.metricID}` : metric.metricID;
        label.append(checkbox, text);
        shortcutOptions.appendChild(label);
      });
      if (!shortcutOptions.children.length) {
        const empty = document.createElement('p');
        empty.className = 'muted metric-option-empty';
        empty.textContent = configuredMetrics.length ? 'No configured metrics match your search.' : 'Add or import a metric to select it here.';
        shortcutOptions.appendChild(empty);
      }
    }

    function selectedShortcutMetrics() {
      return configuredMetrics
        .filter(metric => selectedMetricIds.has(metric.metricID))
        .map(metric => ({ metricID: metric.metricID, requiresInput: shortcutRequiresInput.checked }));
    }

    function generateShortcutText() {
      try {
        shortcutOutput.value = buildShortcutMetricText(selectedShortcutMetrics());
        shortcutStatus.textContent = shortcutRequiresInput.checked
          ? 'Replace <Provided Input> with the appropriate magic variable before running.'
          : 'Ready to paste into the Shortcut Text action.';
        return true;
      } catch (error) {
        shortcutOutput.value = '';
        shortcutStatus.textContent = error.message;
        return false;
      }
    }

    function updateConfiguredMetrics(metrics) {
      configuredMetrics = Array.isArray(metrics) ? metrics : [];
      const availableIds = new Set(configuredMetrics.map(metric => metric.metricID));
      [...selectedMetricIds].forEach(id => { if (!availableIds.has(id)) selectedMetricIds.delete(id); });
      shortcutSelectionStatus.textContent = selectedMetricIds.size
        ? `${selectedMetricIds.size} metric${selectedMetricIds.size === 1 ? '' : 's'} selected.`
        : 'No metrics selected.';
      shortcutOutput.value = '';
      renderShortcutOptions();

      const previous = metricSelect.value;
      metricSelect.replaceChildren(new Option('Select a metric to suggest a Shortcut name', ''));
      configuredMetrics.forEach((metric) => {
        const suggestion = normalizeShortcutName(metric.displayName || metric.metricID);
        if (!suggestion) return;
        const label = metric.metricID && metric.metricID !== suggestion ? `${suggestion} — ${metric.metricID}` : suggestion;
        const option = new Option(label, suggestion);
        option.dataset.metricId = metric.metricID;
        metricSelect.add(option);
      });
      if ([...metricSelect.options].some(option => option.value === previous)) metricSelect.value = previous;
    }

    function setOutputEnabled(enabled) {
      copyBtn.disabled = !enabled;
      downloadBtn.disabled = !enabled;
      openLink.classList.toggle('disabled', !enabled);
      openLink.setAttribute('aria-disabled', String(!enabled));
      if (!enabled) openLink.removeAttribute('href');
    }

    function drawQr(url, shortcutName) {
      if (typeof qrcode !== 'function') {
        throw new Error('The QR generator could not be loaded. Check your connection and try again.');
      }
      const qr = qrcode(0, 'M');
      qr.addData(url, 'Byte');
      qr.make();

      const quietZone = 4;
      const moduleCount = qr.getModuleCount();
      const moduleSize = Math.max(5, Math.floor(320 / (moduleCount + quietZone * 2)));
      const size = (moduleCount + quietZone * 2) * moduleSize;
      canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `QR code that launches the Shortcut “${shortcutName}”`);
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size, size);
      context.fillStyle = '#000000';
      for (let row = 0; row < moduleCount; row += 1) {
        for (let col = 0; col < moduleCount; col += 1) {
          if (qr.isDark(row, col)) {
            context.fillRect((col + quietZone) * moduleSize, (row + quietZone) * moduleSize, moduleSize, moduleSize);
          }
        }
      }
      preview.replaceChildren(canvas);
    }

    function generate() {
      try {
        const shortcutName = normalizeShortcutName(nameInput.value);
        const selectedOption = metricSelect.options[metricSelect.selectedIndex];
        const metricID = selectedOption && selectedOption.dataset.metricId;
        const url = modeInput && modeInput.value === 'insights' ? buildInsightsUrl([metricID], 'Insights') : buildShortcutUrl(shortcutName);
        nameInput.value = shortcutName;
        drawQr(url, shortcutName);
        urlInput.value = url;
        openLink.href = url;
        setOutputEnabled(true);
        status.textContent = modeInput && modeInput.value === 'insights' ? 'Direct Insights QR generated. It contains the metric ID, never your secret or deployment URL.' : 'QR code generated. Scan it on a device where this Shortcut is installed.';
      } catch (error) {
        canvas = null;
        urlInput.value = '';
        preview.innerHTML = '<p class="muted">Your QR code will appear here.</p>';
        setOutputEnabled(false);
        status.textContent = error.message;
      }
    }

    metricSelect.addEventListener('change', () => {
      if (metricSelect.value) nameInput.value = metricSelect.value;
    });
    nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') generate();
    });
    generateBtn.addEventListener('click', generate);
    shortcutSearch.addEventListener('input', renderShortcutOptions);
    shortcutRequiresInput.addEventListener('change', () => {
      shortcutOutput.value = '';
      shortcutStatus.textContent = shortcutRequiresInput.checked && selectedMetricIds.size > 1
        ? 'Provided Input can only be generated for one selected metric.'
        : '';
    });
    shortcutGenerateBtn.addEventListener('click', generateShortcutText);
    shortcutCopyBtn.addEventListener('click', async () => {
      if (!shortcutOutput.value && !generateShortcutText()) return;
      try {
        await navigator.clipboard.writeText(shortcutOutput.value);
        shortcutStatus.textContent = 'Copied. Replace the Metric Logger Shortcut Text action.';
      } catch (_) {
        shortcutStatus.textContent = 'Clipboard copy failed. Select and copy the generated text manually.';
      }
    });
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(urlInput.value);
        status.textContent = 'Launch URL copied to clipboard.';
      } catch (_) {
        status.textContent = 'Clipboard copy failed. Select and copy the launch URL manually.';
      }
    });
    downloadBtn.addEventListener('click', () => {
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = `${normalizeShortcutName(nameInput.value).replace(/[^a-z0-9_-]+/gi, '-') || 'shortcut'}-qr.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      status.textContent = 'QR code downloaded as a PNG.';
    });

    document.addEventListener('openhabits:metrics-changed', event => updateConfiguredMetrics(event.detail));
    updateConfiguredMetrics(window.OpenHabitsConfiguredMetrics || []);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return { normalizeShortcutName, buildShortcutUrl, buildInsightsUrl, buildShortcutMetricText };
}));
