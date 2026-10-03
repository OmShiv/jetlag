// Pulls failing test names out of test runner output, so a report can say
// which tests broke instead of just "exit code 1".

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g;

export function stripAnsi(text) {
  return text.replace(ANSI, '');
}

const PATTERNS = [
  // node:test, spec reporter: "✖ name (1.2ms)"
  [/^\s*✖ (.+?) \(\d+(?:\.\d+)?m?s\)$/, (m) => m[1]],
  // node:test and other TAP producers: "not ok 3 - name"
  [/^\s*not ok \d+ - (.+?)(?:\s+#\s.*)?$/, (m) => m[1]],
  // Jest: "● Suite › name"
  [/^\s*● (?!Test suite failed to run)(.+?)\s*$/, (m) => m[1]],
  // Vitest: "FAIL  test/a.test.ts > suite > name"
  [/^\s*FAIL\s+\S+\s+>\s+(.+?)\s*$/, (m) => m[1]],
  // pytest: "FAILED tests/test_a.py::test_name - AssertionError"
  [/^FAILED (\S*::\S+?)(?: - .*)?$/, (m) => m[1]],
  // unittest: "FAIL: test_name (module.Class.test_name)"
  [/^(?:FAIL|ERROR): (\S+) \((.+?)\)/, (m) => `${unittestClass(m[2], m[1])} › ${m[1]}`],
  // RSpec: "rspec ./spec/a_spec.rb:12 # description"
  [/^rspec \S+ # (.+)$/, (m) => m[1]],
  // Minitest: "Failure:\nClass#test_name [file:line]" is two lines; the second matches here
  [/^([A-Z]\w*#test_\w+) \[/, (m) => m[1]],
  // Go: "--- FAIL: TestName (0.00s)"
  [/^\s*--- FAIL: (\S+)/, (m) => m[1]],
  // Rust: "test module::name ... FAILED"
  [/^test (\S+) \.\.\. FAILED$/, (m) => m[1]],
  // Gradle / JUnit: "ClassTest > name() FAILED"
  [/^(\S+ > .+) FAILED$/, (m) => m[1]],
];

// Mocha numbers its failures: "  1) suite" then "       name:" in the summary.
// Inline progress lines look like "  1) name".
const MOCHA_INLINE = /^\s+(\d+)\) (.+)$/;

export function failingTests(output, limit = 50) {
  const names = new Set();
  const mocha = new Map();
  for (const raw of stripAnsi(output).split(/\r?\n/)) {
    const line = raw.trimEnd();
    let matched = false;
    for (const [re, pick] of PATTERNS) {
      const m = re.exec(line);
      if (m) {
        names.add(clean(pick(m)));
        matched = true;
        break;
      }
    }
    if (!matched) {
      const m = MOCHA_INLINE.exec(line);
      if (m && !mocha.has(m[1])) mocha.set(m[1], clean(m[2]));
    }
    if (names.size >= limit) break;
  }
  if (names.size === 0) for (const name of mocha.values()) names.add(name);
  return [...names].filter(Boolean).slice(0, limit);
}

// "test_mod.Reminders.test_x" or "test_mod.Reminders" -> "Reminders"
function unittestClass(where, test) {
  const path = where.endsWith(`.${test}`) ? where.slice(0, -test.length - 1) : where;
  return path.split('.').pop();
}

function clean(name) {
  return name.replace(/\s+/g, ' ').replace(/:$/, '').trim();
}

// The last few meaningful lines of output, for runs we can't parse.
export function tail(output, lines = 8) {
  return stripAnsi(output)
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim())
    .slice(-lines);
}
