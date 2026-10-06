const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadLauncher() {
  class Element {
    constructor() {
      this.children = [];
      this.listeners = {};
      this.value = '';
      this.hidden = false;
      this.classList = { remove() {} };
    }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.children.length ? this.children.map(child => child.textContent).join(' ') : this.text || ''; }
    replaceChildren(...children) { this.text = ''; this.children = children; }
    addEventListener(name, handler) { this.listeners[name] = handler; }
    removeAttribute() {}
    fire(name = 'click') { return this.listeners[name]({ target: this }); }
  }
  const html = fs.readFileSync(path.join(__dirname, '../SetupV2Launcher.html'), 'utf8');
  const elements = Object.fromEntries(Array.from(html.matchAll(/id="([^"]+)"/g), match => [match[1], new Element()]));
  elements.systemIssues.hidden = true;
  const requests = [];
  const clipboard = [];
  function runner(success, failure) {
    return new Proxy({}, {
      get(_, name) {
        if (name === 'withSuccessHandler') return handler => runner(handler, failure);
        if (name === 'withFailureHandler') return handler => runner(success, handler);
        return value => requests.push({ name, value, success, failure, settled: false });
      }
    });
  }
  const context = vm.createContext({
    document: { getElementById: id => elements[id], createElement: () => new Element() },
    google: { script: { run: runner() } },
    navigator: { clipboard: { writeText: async text => { clipboard.push(text); } } },
    confirm: () => true,
    clearTimeout() {}, setTimeout: callback => callback()
  });
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace('<?!= JSON.stringify(editorUrl) ?>', JSON.stringify('https://example.test/editor'));
  vm.runInContext(script, context);
  return { elements, requests, clipboard,
    respond(name, value, failed = false) {
      const request = requests.find(item => item.name === name && !item.settled);
      assert.ok(request, name);
      request.settled = true;
      (failed ? request.failure : request.success)(value);
    }
  };
}

function bridge(checks, configJson = '{}') {
  return { configJson, updatedAt: null, hasPreviousConfig: true, autoOpen: false, status: { checks } };
}

const healthy = [
  { id: 'config', state: 'pass', message: 'The saved configuration is valid.' },
  { id: 'rows', state: 'pass', message: 'All required rows are present.' },
  { id: 'secret', state: 'pass', message: 'Request secret is configured.' }
];

test('healthy and bundled configurations keep full checks out of the editing flow', () => {
  for (const checks of [healthy, [{ id: 'config', state: 'warning', message: 'Using the bundled configuration until your first save.' }, ...healthy.slice(1)]]) {
    const fixture = loadLauncher();
    fixture.respond('openHabitsGetConfigBridgeData', bridge(checks));
    assert.equal(fixture.elements.systemIssues.hidden, true);
    assert.equal(fixture.elements.checks.children.length, checks.length);
    if (checks[0].state === 'warning') {
      assert.equal(fixture.elements.checks.children[0].className, 'setup-check info');
      assert.doesNotMatch(fixture.elements.checks.children[0].textContent, /^!/);
    }
    assert.equal(fixture.elements.copyCurrent.disabled, false);
    assert.equal(fixture.elements.handoffStatus.textContent, 'Ready.');
  }
});

test('only actionable issues show compact notices with appropriate next actions', () => {
  const fixture = loadLauncher();
  const checks = [
    healthy[0],
    { id: 'rows', state: 'warning', message: '2 required rows are missing.' },
    { id: 'secret', state: 'warning', message: 'Add OPENHABITS_SECRET before connecting clients.' }
  ];
  fixture.respond('openHabitsGetConfigBridgeData', bridge(checks));
  assert.equal(fixture.elements.systemIssues.hidden, false);
  assert.equal(fixture.elements.systemIssues.children.length, 2);
  assert.doesNotMatch(fixture.elements.systemIssues.textContent, /saved configuration is valid/);
  assert.match(fixture.elements.systemIssues.textContent, /Check and Repair Metric Rows/);
  assert.match(fixture.elements.systemIssues.textContent, /Script Property in Apps Script/);

  fixture.elements.repair.fire();
  fixture.respond('openHabitsRepairMetricRows', { ok: true, addedRows: [{ id: 'one' }, { id: 'two' }] });
  fixture.respond('openHabitsGetConfigBridgeData', bridge(healthy));
  assert.equal(fixture.elements.systemIssues.hidden, true);
  assert.match(fixture.elements.advancedStatus.textContent, /Repaired 2/);
});

test('save and undo refresh diagnostics and the configuration copied to the editor', async () => {
  const fixture = loadLauncher();
  fixture.respond('openHabitsGetConfigBridgeData', bridge(healthy, '{"initial":true}'));
  fixture.elements.configJson.value = '{"edited":true}';
  fixture.elements.configJson.fire('input');
  fixture.respond('openHabitsPreviewConfig', { ok: true, plan: { missing: [] } });
  assert.equal(fixture.elements.save.disabled, false);
  fixture.elements.save.fire();
  fixture.respond('openHabitsSaveAndApply', { ok: true, addedRows: [] });
  fixture.respond('openHabitsGetConfigBridgeData', { ...bridge(healthy, '{"edited":true}'), updatedAt: '2026-10-06T12:00:00Z' });
  assert.equal(fixture.elements.configJson.value, '');
  assert.match(fixture.elements.savedAt.textContent, /Configuration last saved/);
  await fixture.elements.copyCurrent.fire();
  assert.equal(fixture.clipboard.at(-1), '{"edited":true}');

  fixture.elements.undo.fire();
  fixture.respond('openHabitsUndoLastConfigChange', { ok: true });
  fixture.respond('openHabitsGetConfigBridgeData', bridge(healthy, '{"initial":true}'));
  await fixture.elements.copyCurrent.fire();
  assert.equal(fixture.clipboard.at(-1), '{"initial":true}');
});

test('older status responses cannot restore warnings after a newer check succeeds', () => {
  const fixture = loadLauncher();
  fixture.respond('openHabitsGetConfigBridgeData', bridge(healthy));
  for (let i = 0; i < 2; i++) {
    fixture.elements.repair.fire();
    fixture.respond('openHabitsRepairMetricRows', { ok: true, addedRows: [] });
  }
  const pending = fixture.requests.filter(request => request.name === 'openHabitsGetConfigBridgeData' && !request.settled);
  pending[1].success(bridge(healthy));
  pending[0].success(bridge([{ id: 'rows', state: 'warning', message: 'Rows are missing.' }]));
  assert.equal(fixture.elements.systemIssues.hidden, true);
  assert.match(fixture.elements.checks.textContent, /All required rows are present/);
});

test('failed diagnostics refresh is visible without replacing a successful save result', () => {
  const fixture = loadLauncher();
  fixture.respond('openHabitsGetConfigBridgeData', bridge(healthy));
  fixture.elements.configJson.value = '{}';
  fixture.elements.save.fire();
  fixture.respond('openHabitsSaveAndApply', { ok: true, addedRows: [] });
  fixture.respond('openHabitsGetConfigBridgeData', { message: 'Connection interrupted' }, true);
  assert.equal(fixture.elements.systemIssues.hidden, false);
  assert.match(fixture.elements.systemIssues.textContent, /Could not refresh.*Connection interrupted/);
  assert.match(fixture.elements.result.textContent, /Configuration saved and applied/);
});
