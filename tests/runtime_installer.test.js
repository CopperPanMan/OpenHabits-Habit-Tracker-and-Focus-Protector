const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const installer = fs.readFileSync(require.resolve('../Inline Scriptable/Insights Installer.js'), 'utf8');
const runtime = fs.readFileSync(require.resolve('../OpenHabits Runtime.js'), 'utf8');
const evaluator = fs.readFileSync(require.resolve('../lockouts.js'), 'utf8');
function install(input, files = {}) {
  const writes = []; let complete = false;
  const fm = { documentsDirectory: () => '/Scriptable', joinPath: (a,b) => a + '/' + b,
    writeString: (path, value) => { files[path] = value; writes.push(path); } };
  const context = vm.createContext({ args: { shortcutParameter: input },
    FileManager: { iCloud: () => fm },
    Request: function () { assert.fail('Installer must not fetch'); },
    Script: { setShortcutOutput: () => {}, complete: () => { complete = true; } } });
  return { execute: () => vm.runInContext(installer, context), files, writes,
    completed: () => complete };
}
test('reinstallation replaces both managed scripts and preserves unrelated state', () => {
  const files = { '/Scriptable/OpenHabits Runtime.js': 'old', '/Scriptable/lockouts.js': 'old',
    '/Shortcuts/OpenHabits/OpenHabits Metrics/settings.json': 'keep' };
  const r = install([runtime, evaluator], files); r.execute();
  assert.equal(files['/Scriptable/OpenHabits Runtime.js'], runtime);
  assert.equal(files['/Scriptable/lockouts.js'], evaluator);
  assert.equal(files['/Shortcuts/OpenHabits/OpenHabits Metrics/settings.json'], 'keep');
  assert.equal(r.writes.length, 2); assert.equal(r.completed(), true);
});
test('invalid second download fails before replacing a valid old runtime', () => {
  const r = install([runtime, '<html>error</html>'], { '/Scriptable/OpenHabits Runtime.js': 'old' });
  assert.throws(r.execute, /expected script/);
  assert.equal(r.writes.length, 0);
  assert.equal(r.files['/Scriptable/OpenHabits Runtime.js'], 'old');
});
test('empty or HTML runtime download never overwrites scripts', () => {
  for (const input of ['', '<html>' + runtime + '</html>']) {
    const r = install([input, evaluator]); assert.throws(r.execute);
    assert.equal(r.writes.length, 0);
  }
});
test('runtime-only bootstrap needs no bookmark or HTTP', () => {
  const r = install(runtime); r.execute();
  assert.deepEqual(r.writes, ['/Scriptable/OpenHabits Runtime.js']);
});
test('truncated or invalid JavaScript with valid markers cannot replace scripts', () => {
  const r = install([runtime + '\n}', evaluator], { '/Scriptable/OpenHabits Runtime.js': 'old' });
  assert.throws(r.execute, /invalid JavaScript/);
  assert.equal(r.writes.length, 0);
  assert.equal(r.files['/Scriptable/OpenHabits Runtime.js'], 'old');
});
