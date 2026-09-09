const test = require('node:test');
const assert = require('node:assert/strict');
const { buildShortcutUrl, normalizeShortcutName } = require('../docs/shortcut-qr.js');

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
