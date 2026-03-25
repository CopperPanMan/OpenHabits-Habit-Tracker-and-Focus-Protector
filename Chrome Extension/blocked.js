const params = new URLSearchParams(window.location.search);
const target = params.get('target') || '';
const message = params.get('message') || 'This site is currently blocked by your lockout settings.';

const targetEl = document.getElementById('target');
const messageEl = document.getElementById('message');
const statusEl = document.getElementById('status');
const legitimateBtn = document.getElementById('legitimateBtn');
const illegalBtn = document.getElementById('illegalBtn');

const buttonByType = {
  legitimate: legitimateBtn,
  illegal: illegalBtn
};

targetEl.textContent = target;
messageEl.textContent = message;

function setStatus(lines, hintText) {
  statusEl.innerHTML = '';

  lines.forEach((line) => {
    if (!line) {
      return;
    }

    const row = document.createElement('div');
    row.textContent = line;
    statusEl.appendChild(row);
  });

  if (hintText) {
    const hint = document.createElement('div');
    hint.className = 'status-hint';
    hint.textContent = hintText;
    statusEl.appendChild(hint);
  }
}

function setButtonActive(type, isActive) {
  const button = buttonByType[type];
  if (!button) {
    return;
  }

  button.classList.toggle('unlock-waiting', Boolean(isActive));
}

async function refreshUnlockState() {
  const response = await chrome.runtime.sendMessage({ action: 'get_unlock_state' });
  if (!response || !response.ok || !response.unlockState) {
    return;
  }

  setButtonActive('illegal', response.unlockState.illegal && response.unlockState.illegal.isActive);
  setButtonActive('legitimate', response.unlockState.legitimate && response.unlockState.legitimate.isActive);
}

function renderTimerStarted(response) {
  const lines = [`Timer started. Come back in ${response.waitSeconds}s and press again.`];
  if (response.extraMessage) {
    lines.push(response.extraMessage);
  }
  setStatus(lines);
}

function renderTimerReset(response) {
  const lines = [`Timer reset to ${response.remainingSeconds}s from ${response.previousRemainingSeconds}s.`];
  if (response.extraMessage) {
    lines.push(response.extraMessage);
  }
  setStatus(lines, '*Press again after timer completes for unlock.*');
}

async function attemptUnlock(type) {
  const response = await chrome.runtime.sendMessage({
    action: 'attempt_unlock',
    type,
    targetUrl: target
  });

  if (!response || !response.ok) {
    setStatus([response && response.error ? response.error : 'Unlock flow failed.']);
    return;
  }

  if (response.status === 'timer_started') {
    setButtonActive(type, true);
    renderTimerStarted(response);
    return;
  }

  if (response.status === 'too_early') {
    setButtonActive(type, true);
    renderTimerReset(response);
    return;
  }

  if (response.status === 'unlock_granted') {
    setButtonActive(type, false);
    setStatus(['Unlock granted. Redirecting...']);
    return;
  }

  setStatus(['No change.']);
}

legitimateBtn.addEventListener('click', () => attemptUnlock('legitimate'));
illegalBtn.addEventListener('click', () => attemptUnlock('illegal'));

refreshUnlockState();
setInterval(refreshUnlockState, 1000);
