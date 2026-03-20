const blockedDomainsEl = document.getElementById('blockedDomains');
const lockoutsServerUrlEl = document.getElementById('lockoutsServerUrl');
const lockoutsSecretEl = document.getElementById('lockoutsSecret');
const metricLogKeyEl = document.getElementById('metricLogKey');
const notificationsEnabledEl = document.getElementById('notificationsEnabled');
const saveButtonEl = document.getElementById('saveButton');
const statusEl = document.getElementById('status');

async function loadOptions() {
  const response = await chrome.runtime.sendMessage({ action: 'get_options' });
  if (!response || !response.ok) {
    statusEl.textContent = response && response.error ? response.error : 'Failed to load options.';
    return;
  }

  const { cfg } = response;
  blockedDomainsEl.value = (cfg.blockedDomains || []).join('\n');
  lockoutsServerUrlEl.value = cfg.lockoutsServerUrl || '';
  lockoutsSecretEl.value = cfg.lockoutsSecret || '';
  metricLogKeyEl.value = cfg.metricLogKey || 'record_metric_iOS';
  notificationsEnabledEl.checked = cfg.notificationsEnabled !== false;
}

async function saveOptions() {
  const payload = {
    blockedDomains: blockedDomainsEl.value,
    lockoutsServerUrl: lockoutsServerUrlEl.value,
    lockoutsSecret: lockoutsSecretEl.value,
    metricLogKey: metricLogKeyEl.value,
    notificationsEnabled: notificationsEnabledEl.checked
  };

  const response = await chrome.runtime.sendMessage({ action: 'save_options', payload });
  if (!response || !response.ok) {
    statusEl.textContent = response && response.error ? response.error : 'Failed to save options.';
    return;
  }

  statusEl.textContent = 'Saved.';
  setTimeout(() => {
    statusEl.textContent = '';
  }, 2000);
}

saveButtonEl.addEventListener('click', saveOptions);
loadOptions();
