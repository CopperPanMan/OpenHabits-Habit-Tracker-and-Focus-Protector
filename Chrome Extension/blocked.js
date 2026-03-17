const params = new URLSearchParams(window.location.search);
const target = params.get('target') || '';
const message = params.get('message') || 'This site is currently blocked by your lockout settings.';

const targetEl = document.getElementById('target');
const messageEl = document.getElementById('message');
const statusEl = document.getElementById('status');
const legitimateBtn = document.getElementById('legitimateBtn');
const illegalBtn = document.getElementById('illegalBtn');

targetEl.textContent = target;
messageEl.textContent = message;

async function attemptUnlock(type) {
  const response = await chrome.runtime.sendMessage({
    action: 'attempt_unlock',
    type,
    targetUrl: target
  });

  if (!response || !response.ok) {
    statusEl.textContent = response && response.error ? response.error : 'Unlock flow failed.';
    return;
  }

  if (response.status === 'timer_started') {
    statusEl.textContent = `Timer started. Come back in ${response.waitSeconds}s and press again.`;
    return;
  }

  if (response.status === 'too_early') {
    statusEl.textContent = `Too early. Wait ${response.remainingSeconds}s.`;
    return;
  }

  if (response.status === 'unlock_granted') {
    statusEl.textContent = 'Unlock granted. Redirecting...';
    return;
  }

  statusEl.textContent = 'No change.';
}

legitimateBtn.addEventListener('click', () => attemptUnlock('legitimate'));
illegalBtn.addEventListener('click', () => attemptUnlock('illegal'));
