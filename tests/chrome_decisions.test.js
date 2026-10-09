const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../Chrome Extension/background.js'), 'utf8');
function client(fetch, timers = {}) {
  const listener = { addListener() {} };
  const context = vm.createContext({ fetch, AbortController, setTimeout, clearTimeout, Intl,
    chrome: { runtime: { onInstalled: listener, onMessage: listener },
      tabs: { onUpdated: listener, onActivated: listener, onRemoved: listener },
      windows: { onFocusChanged: listener }, idle: { onStateChanged: listener } }, ...timers });
  vm.runInContext(source, context);
  return context;
}
const cfg = { lockoutsServerUrl: 'https://example.invalid/exec', lockoutsSecret: 'private-secret' };
const response = data => ({ ok: true, text: async () => JSON.stringify(data) });
test('allowed decisions still permit access', async () => {
  assert.equal((await client(async () => response({ status: 'allowed' })).queryServerBlockDecision(cfg)).allowed, true);
});
test('transient connection failure retries and recovers', async () => {
  let calls = 0;
  const result = await client(async () => { if (++calls === 1) throw Error('offline'); return response({ status: 'allowed' }); }).queryServerBlockDecision(cfg);
  assert.equal(calls, 2); assert.equal(result.allowed, true);
});
test('persistent connection failure explains why and retries only once', async () => {
  let calls = 0;
  const result = await client(async () => { calls++; throw Error(cfg.lockoutsSecret); }).queryServerBlockDecision(cfg);
  assert.equal(calls, 2); assert.equal(result.allowed, false); assert.match(result.message, /could not connect/);
  assert.ok(!result.message.includes(cfg.lockoutsSecret));
});
for (const [status, calls] of [[503, 2], [429, 2], [403, 1]]) {
  test(`HTTP ${status} explains failure with ${calls} attempt(s)`, async () => {
    let count = 0;
    const result = await client(async () => { count++; return { ok: false, status }; }).queryServerBlockDecision(cfg);
    assert.equal(count, calls); assert.equal(result.allowed, false); assert.match(result.message, new RegExp(String(status)));
  });
}
test('timeout aborts requests and displays a timeout explanation', async () => {
  let calls = 0, cleared = 0;
  const c = client(async (url, options) => new Promise((resolve, reject) => {
    calls++; options.signal.addEventListener('abort', () => reject(Error('aborted')));
  }), { setTimeout: callback => { queueMicrotask(callback); return 1; }, clearTimeout: () => cleared++ });
  const result = await c.queryServerBlockDecision(cfg);
  assert.equal(calls, 2); assert.equal(cleared, 2); assert.match(result.message, /too long/);
});
test('text/plain authentication JSON displays the error and redacts the secret', async () => {
  const result = await client(async () => response({ ok: false, errors: ['Unauthorized request: ' + cfg.lockoutsSecret] })).queryServerBlockDecision(cfg);
  assert.match(result.message, /Unauthorized/); assert.ok(!result.message.includes(cfg.lockoutsSecret));
});
test('configuration errors are surfaced from debug.errors', async () => {
  const result = await client(async () => response({ status: 'error', debug: { errors: ['Invalid duration config'] } })).queryServerBlockDecision(cfg);
  assert.match(result.message, /Invalid duration config/);
});
for (const body of ['<html>Sign in</html>', '{invalid']) {
  test(`unreadable response explains deployment checks: ${body}`, async () => {
    const result = await client(async () => ({ ok: true, text: async () => body })).queryServerBlockDecision(cfg);
    assert.equal(result.allowed, false); assert.match(result.message, /unreadable response/);
  });
}
for (const data of [null, [], 42, {}, { status: 'unexpected' }]) {
  test(`invalid decision fails with an explanation: ${JSON.stringify(data)}`, async () => {
    const result = await client(async () => response(data)).queryServerBlockDecision(cfg);
    assert.equal(result.allowed, false); assert.ok(result.message.trim());
  });
}
for (const type of ['task_block', 'duration_block', 'firstXMinutesAfterTimestamp_block', 'time_block']) {
  test(`empty message for ${type} receives an explanation without retrying`, async () => {
    let calls = 0;
    const result = await client(async () => { calls++; return response({ status: 'blocked', block: { type, id: 'rule1' }, ui: { message: '  ', usedMinutes: 1, allowedNowMinutes: 0.5 } }); }).queryServerBlockDecision(cfg);
    assert.equal(calls, 1); assert.equal(result.allowed, false); assert.ok(result.message.trim());
    if (type === 'duration_block') assert.match(result.message, /1 minutes used; 0.5 minutes allowed/);
  });
}
test('configured block message is preserved', async () => {
  const result = await client(async () => response({ status: 'blocked', ui: { message: 'Finish your tasks first.' } })).queryServerBlockDecision(cfg);
  assert.equal(result.message, 'Finish your tasks first.');
});
test('missing URL explains how to configure the extension', async () => {
  const result = await client(() => { throw Error('must not fetch'); }).queryServerBlockDecision({});
  assert.equal(result.allowed, false); assert.match(result.message, /no server URL/);
});
