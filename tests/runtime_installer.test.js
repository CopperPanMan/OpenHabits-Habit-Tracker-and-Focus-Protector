const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const installer = fs.readFileSync(require.resolve('../Inline Scriptable/Insights Installer.js'), 'utf8');
const runtime = fs.readFileSync(require.resolve('../OpenHabits Runtime.js'), 'utf8');
const evaluator = fs.readFileSync(require.resolve('../lockouts.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(require.resolve('../runtime-install-manifest.json'), 'utf8'));
function install(downloads = [runtime, evaluator], files = {}) {
  const writes = []; const requests = []; let complete = false;
  const fm = { documentsDirectory: () => '/Scriptable', joinPath: (a,b) => a + '/' + b,
    writeString: (path, value) => { files[path] = value; writes.push(path); } };
  const context = vm.createContext({
    FileManager: { iCloud: () => fm },
    Request: function (url) {
      const index = requests.length; requests.push(url);
      this.loadString = async () => {
        if (downloads[index] instanceof Error) throw downloads[index];
        return downloads[index];
      };
    },
    Script: { setShortcutOutput: () => {}, complete: () => { complete = true; } } });
  return { execute: () => vm.runInContext('(async () => {\n' + installer + '\n})()', context), files, writes, requests,
    completed: () => complete };
}
test('reinstallation replaces both managed scripts and preserves unrelated state', async () => {
  const files = { '/Scriptable/OpenHabits Runtime.js': 'old', '/Scriptable/lockouts.js': 'old',
    '/Shortcuts/OpenHabits/OpenHabits Metrics/settings.json': 'keep' };
  const r = install([runtime, evaluator], files); await r.execute();
  assert.equal(files['/Scriptable/OpenHabits Runtime.js'], runtime);
  assert.equal(files['/Scriptable/lockouts.js'], evaluator);
  assert.equal(files['/Shortcuts/OpenHabits/OpenHabits Metrics/settings.json'], 'keep');
  assert.equal(r.writes.length, 2); assert.equal(r.completed(), true);
});
test('invalid second download fails before replacing a valid old runtime', async () => {
  const r = install([runtime, '<html>error</html>'], { '/Scriptable/OpenHabits Runtime.js': 'old' });
  await assert.rejects(r.execute, /expected script/);
  assert.equal(r.writes.length, 0);
  assert.equal(r.files['/Scriptable/OpenHabits Runtime.js'], 'old');
});
test('empty or HTML runtime download never overwrites scripts', async () => {
  for (const input of ['', '<html>' + runtime + '</html>']) {
    const r = install([input, evaluator]); await assert.rejects(r.execute);
    assert.equal(r.writes.length, 0);
  }
});
test('self-contained bootstrap downloads both scripts without args or a bookmark', async () => {
  const r = install(); await r.execute();
  assert.deepEqual(r.requests, manifest.scripts.map(script => script.url));
  assert.deepEqual(r.writes, ['/Scriptable/OpenHabits Runtime.js', '/Scriptable/lockouts.js']);
  assert.equal(r.completed(), true);
});
test('truncated or invalid JavaScript with valid markers cannot replace scripts', async () => {
  const r = install([runtime + '\n}', evaluator], { '/Scriptable/OpenHabits Runtime.js': 'old' });
  await assert.rejects(r.execute, /invalid JavaScript/);
  assert.equal(r.writes.length, 0);
  assert.equal(r.files['/Scriptable/OpenHabits Runtime.js'], 'old');
});
test('failed downloads leave existing scripts untouched', async () => {
  for (const downloads of [[new Error('offline'), evaluator], [runtime, new Error('offline')]]) {
    const files = { '/Scriptable/OpenHabits Runtime.js': 'old runtime', '/Scriptable/lockouts.js': 'old evaluator' };
    const r = install(downloads, files);
    await assert.rejects(r.execute, /offline/);
    assert.equal(r.writes.length, 0);
    assert.equal(files['/Scriptable/OpenHabits Runtime.js'], 'old runtime');
    assert.equal(files['/Scriptable/lockouts.js'], 'old evaluator');
    assert.equal(r.completed(), false);
  }
});
