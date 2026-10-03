// Each test fails at exactly one kind of destination, so the CLI tests can
// check that jetlag sends the suite to the right places.
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('it is not February 29', () => {
  const d = new Date();
  assert.ok(!(d.getMonth() === 1 && d.getDate() === 29));
});

test('the offset is a whole hour', () => {
  assert.equal(new Date().getTimezoneOffset() % 60, 0);
});

test('numbers format like en-US', () => {
  assert.equal((1234.5).toLocaleString(), '1,234.5');
});
