import assert from 'node:assert/strict';
import { test } from 'node:test';
import { failingTests, tail } from '../src/failures.js';

const cases = {
  'node:test spec': [
    '✔ passes (0.4ms)\n✖ an invoice due today is due (1.2ms)\n  AssertionError\n✖ failing tests:\n\n✖ an invoice due today is due (1.2ms)',
    ['an invoice due today is due'],
  ],
  TAP: ['ok 1 - fine\nnot ok 2 - totals use a separator\nnot ok 3 - skips # TODO later', ['totals use a separator', 'skips']],
  Jest: [
    '  billing\n    ✓ fine (2 ms)\n    ✕ is due (5 ms)\n\n  ● billing › is due\n\n    expect(received).toBe(expected)\n  ● Test suite failed to run',
    ['billing › is due'],
  ],
  Vitest: [
    ' FAIL  test/a.test.ts > billing > is due\n AssertionError: expected false to be true\n × is due 3ms',
    ['billing > is due'],
  ],
  pytest: [
    'FAILED tests/test_a.py::test_today - AssertionError: x\nFAILED tests/test_a.py::Test::test_b\n2 failed in 0.1s',
    ['tests/test_a.py::test_today', 'tests/test_a.py::Test::test_b'],
  ],
  unittest: [
    'FAIL: test_today (test_mod.Reminders.test_today)\nERROR: test_leap (test_mod.Reminders)\nFAILED (failures=1, errors=1)',
    ['Reminders › test_today', 'Reminders › test_leap'],
  ],
  RSpec: ['rspec ./spec/a_spec.rb:12 # Billing is due today', ['Billing is due today']],
  Go: ['=== RUN   TestDue\n--- FAIL: TestDue (0.00s)\n    --- FAIL: TestDue/today (0.00s)\nFAIL', ['TestDue', 'TestDue/today']],
  Rust: ['test billing::due ... FAILED\ntest billing::ok ... ok', ['billing::due']],
  Gradle: ['BillingTest > dueToday() FAILED', ['BillingTest > dueToday()']],
  Mocha: [
    '  billing\n    ✔ fine\n    1) is due today\n\n  1 passing\n  1 failing\n\n  1) billing\n       is due today:\n     AssertionError',
    ['is due today'],
  ],
};

for (const [runner, [output, expected]] of Object.entries(cases)) {
  test(`reads failing test names from ${runner}`, () => {
    assert.deepEqual(failingTests(output), expected);
  });
}

test('strips color codes before matching', () => {
  assert.deepEqual(failingTests('\x1b[31m✖ colored (1ms)\x1b[39m'), ['colored']);
});

test('returns nothing for output it does not recognize', () => {
  assert.deepEqual(failingTests('Error: something went wrong\n    at main.js:1:1'), []);
});

test('tail keeps the last meaningful lines', () => {
  assert.deepEqual(tail('a\n\nb\n  \nc\n', 2), ['b', 'c']);
});
