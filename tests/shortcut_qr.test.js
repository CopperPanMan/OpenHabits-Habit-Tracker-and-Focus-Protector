const test = require('node:test');
const assert = require('node:assert/strict');
const { buildShortcutUrl, normalizeShortcutName, buildInsightsUrl, buildShortcutMetricText } = require('../docs/shortcut-qr.js');

test('buildShortcutUrl URL-encodes an exact Shortcut name', () => {
  assert.equal(
    buildShortcutUrl('Log weight & notes'),
    'shortcuts://run-shortcut?name=Log%20weight%20%26%20notes'
  );
});

test('buildShortcutUrl supports Unicode and trims surrounding whitespace', () => {
  assert.equal(
    buildShortcutUrl('  Log café ☕  '),
    'shortcuts://run-shortcut?name=Log%20caf%C3%A9%20%E2%98%95'
  );
});

test('normalizeShortcutName preserves meaningful internal whitespace', () => {
  assert.equal(normalizeShortcutName('  Log  Meditation  '), 'Log  Meditation');
});

test('buildShortcutUrl rejects an empty Shortcut name', () => {
  assert.throws(() => buildShortcutUrl('   '), /Enter a Shortcut name first/);
});

test('infers input and quoting from configured types, supports multiple metrics, and sends completion 1', () => {
  assert.equal(buildShortcutMetricText([
    { metricID: 'done', dataType: 'number', inputMode: 'completion' },
    { metricID: 'water', dataType: 'number', recordType: 'keep_first' },
    { metricID: 'note', dataType: 'text' },
    { metricID: 'focus', dataType: 'duration' },
    { metricID: 'started', dataType: 'timestamp' }
  ]), '[[' + '"done",1],["water",<Provided Input>],["note","<Provided Input>"],["focus","<Provided Input>"],["started"]]');
});

test('fixed inputs are valid JSON with numeric conversion and lossless text escaping', () => {
  const value = 'quote " backslash \\ and newline\n';
  const output = buildShortcutMetricText([{ metricID: 'number', dataType: 'number', value: '3.5' }, { metricID: 'note', dataType: 'text', value }]);
  assert.deepEqual(JSON.parse(output), [['number', 3.5], ['note', value]]);
  for (const value of ['bad', '', 'Infinity']) assert.throws(() => buildShortcutMetricText([{ metricID: 'n', dataType: 'number', value }]), /valid number/);
});

test('direct Insights QR permits timestamps and completions and rejects metrics that need live input', () => {
  for (const dataType of ['number', 'duration', 'text']) assert.throws(() => buildInsightsUrl([{ metricID: 'n', dataType }]), /dedicated logger/);
  const url = buildInsightsUrl([{ metricID: 'done', dataType: 'number', inputMode: 'completion' }]);
  assert.equal(decodeURIComponent(url.split('&text=')[1]), '[["done",1]]');
  assert.throws(() => buildInsightsUrl([undefined]), /Select at least one/);
});

test('builds a credential-free direct Insights URL', () => {
  const url = buildInsightsUrl(['focus_start']);
  assert.match(url, /^shortcuts:\/\/run-shortcut\?name=Insights&input=text&text=/);
  assert.equal(url.includes('secret'), false);
});
