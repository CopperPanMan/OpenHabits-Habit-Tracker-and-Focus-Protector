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

  function buildTimerShortcutText(startMetricID, stopMetricID) {
    return {
      startText: buildShortcutMetricText([{ metricID: startMetricID }]),
      stopText: buildShortcutMetricText([{ metricID: stopMetricID }])
    };
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
    if (!metricSelect || !nameInput || !generateBtn) return;

    let canvas = null;

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

    document.addEventListener('openhabits:metrics-changed', (event) => {
      const previous = metricSelect.value;
      metricSelect.replaceChildren(new Option('Select a metric to suggest a Shortcut name', ''));
      (event.detail || []).forEach((metric) => {
        const suggestion = normalizeShortcutName(metric.displayName || metric.metricID);
        if (!suggestion) return;
        const label = metric.metricID && metric.metricID !== suggestion
          ? `${suggestion} — ${metric.metricID}`
          : suggestion;
        const option = new Option(label, suggestion); option.dataset.metricId = metric.metricID; metricSelect.add(option);
      });
      if ([...metricSelect.options].some(option => option.value === previous)) metricSelect.value = previous;
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return { normalizeShortcutName, buildShortcutUrl, buildInsightsUrl, buildShortcutMetricText, buildTimerShortcutText };
}));
