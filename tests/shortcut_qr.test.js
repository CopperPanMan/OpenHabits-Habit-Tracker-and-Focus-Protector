const test = require('node:test');
const assert = require('node:assert/strict');
const { buildShortcutUrl, normalizeShortcutName, buildInsightsUrl, buildShortcutMetricText, buildTimerShortcutText } = require('../docs/shortcut-qr.js');

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

test('builds paste-ready no-value and Provided Input metric text', () => {
  assert.equal(buildShortcutMetricText([{ metricID: 'metricA' }, { metricID: 'metricB' }]), '[["metricA"],["metricB"]]');
  assert.equal(buildShortcutMetricText([{ metricID: 'water', requiresInput: true }]), '[["water", <Provided Input>]]');
  assert.throws(() => buildShortcutMetricText([{ metricID: 'water', requiresInput: true }, { metricID: 'other' }]), /one at a time/);
});

test('builds separate timer text and a credential-free direct Insights URL', () => {
  assert.deepEqual(buildTimerShortcutText('focus_start', 'focus_stop'), { startText: '[["focus_start"]]', stopText: '[["focus_stop"]]' });
  const url = buildInsightsUrl(['focus_start']);
  assert.match(url, /^shortcuts:\/\/run-shortcut\?name=Insights&input=text&text=/);
  assert.equal(url.includes('secret'), false);
});
