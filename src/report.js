import { describe } from './destinations.js';
import { tail } from './failures.js';
import { seconds, wrap } from './ui.js';

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export function renderReport({ home, results, command, elapsedMs, verbose, c, columns = 100 }) {
  const out = [''];
  const cmd = command.join(' ');
  const failed = results.filter((r) => r.status === 'fail');
  const broken = new Set(failed.flatMap((r) => r.newFailing));
  const width = Math.min(columns, 100);

  if (home.code !== 0) {
    out.push(`  ${c.yellow('!')} ${c.bold('Your tests already fail at home.')}`);
    if (home.failing.length) {
      out.push(c.gray('    jetlag reports only tests that fail somewhere else. Failing at home:'));
      for (const name of home.failing.slice(0, 8)) out.push(`    ${c.yellow('!')} ${name}`);
    } else {
      out.push(c.gray("    jetlag couldn't read test names from the output, so it can't separate"));
      out.push(c.gray('    those failures from new ones. Last lines at home:'));
      for (const line of tail(home.output)) out.push(c.gray(`    │ ${line}`));
    }
    out.push('');
  }

  if (failed.length) {
    const tests = broken.size ? plural(broken.size, 'test') : 'your tests';
    out.push(`  ${c.red('✗')} ${c.bold(`${plural(failed.length, 'destination')} broke ${tests}.`)}`);
  } else if (home.code === 0) {
    const ran = results.filter((r) => r.status !== 'skipped').length;
    out.push(`  ${c.green('✓')} ${c.bold(`Your tests passed in ${ran === 1 ? 'the only destination' : `all ${ran} destinations`}.`)}`);
  } else {
    out.push(`  ${c.green('✓')} ${c.bold('No new failures in any destination.')}`);
  }
  out.push('');

  for (const r of failed) {
    out.push(`  ${c.red(c.bold(r.dest.name))}  ${c.gray(describe(r.dest))}`);
    out.push(...wrap(r.dest.why, width, '    ').map((l) => c.gray(l)));
    if (r.timedOut) out.push(`    ${c.red('✗')} timed out`);
    for (const name of r.newFailing.slice(0, 10)) out.push(`    ${c.red('✗')} ${name}`);
    if (r.newFailing.length > 10) out.push(c.gray(`    and ${r.newFailing.length - 10} more`));
    if (!r.newFailing.length && !r.timedOut) for (const line of tail(r.output)) out.push(c.gray(`    │ ${line}`));
    if (verbose) for (const line of r.output.trimEnd().split('\n')) out.push(c.gray(`    │ ${line}`));
    if (r.dest.group === 'calendar' && !r.clockMoved) {
      out.push(c.yellow("    The clock didn't move (jetlag can shift it in Node.js, Python, and Ruby), so only the time zone changed."));
    }
    out.push(`    ${c.gray('debug:')} ${debugCommand(r.dest, cmd)}`);
    out.push('');
  }

  const flaky = results.filter((r) => r.status === 'flaky');
  if (flaky.length) {
    const names = flaky.map((r) => r.dest.name).join(', ');
    out.push(`  ${c.yellow('~')} ${names} failed alongside other runs but passed alone.`);
    out.push(c.gray('    Your tests may share ports, files, or a database. Try --jobs 1.'));
    out.push('');
  }

  const skipped = results.filter((r) => r.status === 'skipped');
  if (skipped.length) {
    out.push(`  ${c.gray('-')} ${c.gray(`Skipped ${plural(skipped.length, 'date')}: jetlag can move the clock in Node.js, Python, and Ruby,`)}`);
    out.push(c.gray("    and this command didn't run any of them. Time zones and languages still apply."));
    out.push('');
  }

  if (failed.length > 1 && broken.size) {
    out.push(`  ${c.bold('Tests that broke')}`);
    const nameWidth = Math.min(44, Math.max(...[...broken].map((n) => n.length)));
    for (const test of broken) {
      const where = failed.filter((r) => r.newFailing.includes(test)).map((r) => r.dest.name);
      const label = test.length > nameWidth ? `${test.slice(0, nameWidth - 1)}…` : test.padEnd(nameWidth);
      // Wrap between destination names, never inside one.
      const lines = [''];
      for (const name of where) {
        const last = lines.length - 1;
        const next = lines[last] ? `${lines[last]}, ${name}` : name;
        if (lines[last] && nameWidth + 6 + next.length > width) {
          lines[last] += ',';
          lines.push(name);
        } else lines[last] = next;
      }
      out.push(`    ${label}  ${c.gray(lines[0])}`);
      for (const line of lines.slice(1)) out.push(`${' '.repeat(nameWidth + 6)}${c.gray(line)}`);
    }
    out.push('');
  }

  out.push(c.gray(`  Ran ${cmd} ${plural(results.length + 1, 'time')} in ${seconds(elapsedMs)}.`));
  out.push('');
  return out.join('\n');
}

// Through npx the jetlag command isn't on the PATH, so suggest npx again.
const self = () => (process.env.npm_command === 'exec' ? 'npx jetlagged' : 'jetlag');

export function debugCommand(dest, cmd) {
  if (dest.id !== 'custom') return `${self()} exec ${dest.id} -- ${cmd}`;
  const flags = [];
  if (dest.tz) flags.push(`--tz ${dest.tz}`);
  if (dest.atText) flags.push(`--at ${dest.atText}`);
  if (dest.locale) flags.push(`--locale ${dest.locale}`);
  return `${self()} exec ${flags.join(' ')} -- ${cmd}`;
}

export function jsonReport({ home, results, command, elapsedMs }) {
  const shape = (r) => ({
    id: r.dest.id,
    name: r.dest.name,
    group: r.dest.group,
    timeZone: r.dest.tz ?? null,
    locale: r.dest.locale ?? null,
    clock: r.dest.now != null ? new Date(r.dest.now).toISOString() : null,
    clockMoved: r.clockMoved,
    status: r.status,
    exitCode: r.code,
    timedOut: r.timedOut,
    durationMs: r.durationMs,
    failing: r.failing,
    newFailing: r.newFailing ?? [],
    why: r.dest.why || undefined,
  });
  return JSON.stringify(
    {
      command,
      elapsedMs,
      home: shape(home),
      destinations: results.map(shape),
      broken: [...new Set(results.filter((r) => r.status === 'fail').flatMap((r) => r.newFailing))],
    },
    null,
    2,
  );
}
