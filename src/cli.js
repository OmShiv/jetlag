import { readFileSync } from 'node:fs';
import { availableParallelism, cpus } from 'node:os';
import {
  DESTINATIONS,
  GROUPS,
  TRIPS,
  describe,
  findDestination,
  resolveDestination,
} from './destinations.js';
import { destinationEnv, shiftedRuntimes, stagePreloads } from './env.js';
import { failingTests } from './failures.js';
import { jsonReport, renderReport } from './report.js';
import { pool, runCommand, stopAll } from './run.js';
import { Board, palette, pad, useColor } from './ui.js';
import { formatWall, isValidTimeZone, localTimeZone, parseAt } from './zone.js';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const DEFAULT_JOBS = Math.max(1, Math.min(4, Math.floor((availableParallelism?.() ?? cpus().length) / 2)));

const HELP = `
jetlag: run your tests in other time zones, on tricky dates, and in other languages.

Usage
  jetlag [options] [--] <command...>
  jetlag exec <destination> [--] <command...>
  jetlag list

Examples
  jetlag npm test
  jetlag --trip world -- pytest -q
  jetlag --only utc,leap-day -- npx vitest run
  jetlag --tz Europe/Paris --at 2027-03-28T01:30 -- npm test
  jetlag exec spring-forward -- node

Options
  -t, --trip <name>     quick (default), zones, calendar, languages, world
  -o, --only <ids>      run these destinations (comma-separated ids or trip names)
  -s, --skip <ids>      leave these destinations out
      --tz <zone>       add your own destination in this IANA time zone
      --at <datetime>   start its clock at this local time, like 2027-03-28T01:30
      --locale <name>   give it this locale, like fr_FR.UTF-8
  -j, --jobs <n>        destinations to run at once (default: ${DEFAULT_JOBS})
      --timeout <sec>   stop a run after this many seconds (default: 600)
      --no-confirm      don't re-run failures alone to rule out flaky tests
      --json            print a JSON report instead of the table
  -v, --verbose         print the full output of failing runs
  -h, --help            show this help
      --version         show the version

jetlag moves the clock in Node.js, Python, and Ruby processes. Time zones and
languages apply to every program. Run "jetlag list" to see every destination.
`;

export class UsageError extends Error {}

export function parseArgs(argv) {
  const opts = {
    sub: null,
    destination: null,
    trip: null,
    only: [],
    skip: [],
    jobs: DEFAULT_JOBS,
    timeout: 600,
    confirm: true,
    json: false,
    verbose: false,
    tz: null,
    at: null,
    locale: null,
    command: [],
  };
  let i = 0;
  if (argv[0] === 'list' || argv[0] === 'exec') opts.sub = argv[i++];

  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      opts.command = argv.slice(i + 1);
      break;
    }
    if (!arg.startsWith('-') || arg === '-') {
      if (opts.sub === 'exec' && !opts.destination) {
        opts.destination = arg;
        continue;
      }
      opts.command = argv.slice(i);
      break;
    }
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = eq > 0 ? arg.slice(0, eq) : arg;
    const value = () => {
      if (eq > 0) return arg.slice(eq + 1);
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${flag} needs a value`);
      return v;
    };
    const list = () => value().split(',').map((s) => s.trim()).filter(Boolean);
    switch (flag) {
      case '-t':
      case '--trip':
        opts.trip = value();
        break;
      case '-o':
      case '--only':
        opts.only.push(...list());
        break;
      case '-s':
      case '--skip':
        opts.skip.push(...list());
        break;
      case '-j':
      case '--jobs':
        opts.jobs = positive(value(), flag, true);
        break;
      case '--timeout':
        opts.timeout = positive(value(), flag);
        break;
      case '--tz':
        opts.tz = value();
        break;
      case '--at':
        opts.at = value();
        break;
      case '--locale':
        opts.locale = value();
        break;
      case '--no-confirm':
        opts.confirm = false;
        break;
      case '--json':
        opts.json = true;
        break;
      case '-v':
      case '--verbose':
        opts.verbose = true;
        break;
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--version':
        opts.version = true;
        break;
      default:
        throw new UsageError(`unknown option ${arg}`);
    }
  }
  return opts;
}

function positive(text, flag, integer = false) {
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0 || (integer && !Number.isInteger(n))) {
    throw new UsageError(`${flag} needs a positive ${integer ? 'whole ' : ''}number, not "${text}"`);
  }
  return n;
}

function expand(names) {
  const ids = [];
  for (const name of names) {
    if (TRIPS[name]) ids.push(...TRIPS[name]);
    else if (findDestination(name)) ids.push(name);
    else throw new UsageError(`there's no destination or trip called "${name}". Run "jetlag list" to see them.`);
  }
  return [...new Set(ids)];
}

function customDestination(opts, homeTz, now) {
  if (!opts.tz && !opts.at && !opts.locale) return null;
  if (opts.tz && !isValidTimeZone(opts.tz)) throw new UsageError(`"${opts.tz}" isn't an IANA time zone, like Europe/Paris`);
  const clockTz = opts.tz ?? homeTz;
  let pinned = null;
  if (opts.at) {
    pinned = parseAt(opts.at, clockTz);
    if (pinned == null) throw new UsageError(`--at needs a date like 2027-03-28T01:30, not "${opts.at}"`);
  } else if (opts.tz) {
    pinned = now;
  }
  const label = [opts.tz, opts.locale].filter(Boolean).join(', ');
  return {
    id: 'custom',
    name: label ? `Custom (${label})` : 'Custom',
    group: opts.at ? 'calendar' : opts.tz ? 'zones' : 'languages',
    tz: opts.tz ?? undefined,
    locale: opts.locale ?? undefined,
    atText: opts.at ?? undefined,
    clockTz,
    now: pinned,
    why: 'The destination you asked for.',
  };
}

export function selectDestinations(opts, { homeTz = localTimeZone(), now = Date.now() } = {}) {
  if (opts.trip && !TRIPS[opts.trip]) {
    throw new UsageError(`there's no trip called "${opts.trip}". Trips: ${Object.keys(TRIPS).join(', ')}`);
  }
  const custom = customDestination(opts, homeTz, now);
  let ids;
  if (opts.only.length) ids = expand(opts.only);
  else if (opts.trip) ids = TRIPS[opts.trip];
  else ids = custom ? [] : TRIPS.quick;
  const skip = new Set(expand(opts.skip));
  const chosen = ids.filter((id) => !skip.has(id)).map((id) => resolveDestination(findDestination(id), { now, homeTz }));
  if (custom) chosen.push(custom);
  if (!chosen.length) throw new UsageError('no destinations left to visit');
  return chosen;
}

export function classify(result, home) {
  const needsClock = result.dest.group === 'calendar';
  result.clockMoved = result.dest.now == null || result.shifted.length > 0;
  result.newFailing = [];
  if (result.code === 0 && !result.timedOut) {
    result.status = needsClock && !result.clockMoved ? 'skipped' : 'pass';
    return result;
  }
  const homeFailing = new Set(home.code === 0 ? [] : home.failing);
  result.newFailing = result.failing.filter((name) => !homeFailing.has(name));
  if (home.code === 0 || result.timedOut) result.status = 'fail';
  else if (!result.failing.length) result.status = 'unknown';
  else result.status = result.newFailing.length ? 'fail' : 'same';
  return result;
}

async function visit(dest, command, preloads, opts) {
  const { env, marker } = destinationEnv(dest, preloads);
  const run = await runCommand(command, { env, timeoutMs: opts.timeout * 1000 });
  return { dest, ...run, shifted: shiftedRuntimes(marker), failing: failingTests(run.output) };
}

function homeDestination(homeTz) {
  const locale = process.env.LC_ALL || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale;
  return { id: 'home', name: 'Home', group: 'home', now: null, clockTz: homeTz, detail: `${homeTz}  ${locale}`, why: '' };
}

async function trip(opts, io) {
  if (!opts.command.length) throw new UsageError('give jetlag a command to run, like: jetlag npm test');
  const homeTz = localTimeZone();
  const started = Date.now();
  const dests = selectDestinations(opts, { homeTz, now: started });
  const preloads = stagePreloads();
  const color = palette(!opts.json && useColor(io.stdout));
  const home = homeDestination(homeTz);

  let board = null;
  const onInterrupt = () => {
    stopAll();
    board?.close();
    preloads.cleanup();
    process.exit(130);
  };
  process.once('SIGINT', onInterrupt);

  try {
    if (!opts.json) {
      const runs = opts.jobs > 1 && dests.length > 1 ? `, ${Math.min(opts.jobs, dests.length)} at a time` : '';
      io.stdout.write(`\n  ${color.bold('jetlag')} ${color.gray(`${opts.command.join(' ')}  ·  home + ${dests.length} destinations${runs}`)}\n\n`);
      const rows = [home, ...dests].map((d) => ({ name: d.name, detail: d.detail ?? describe(d), state: 'waiting' }));
      board = new Board(io.stdout, rows, color);
    }

    board?.set(0, 'running');
    const homeRun = await visit(home, opts.command, preloads, opts);
    homeRun.clockMoved = true;
    homeRun.newFailing = [];
    homeRun.status = homeRun.code === 0 ? 'pass' : 'home-fail';
    board?.set(0, 'done', homeRun);

    const results = await pool(
      dests.map((dest, i) => async () => {
        board?.set(i + 1, 'running');
        const result = classify(await visit(dest, opts.command, preloads, opts), homeRun);
        result.recheck = opts.confirm && opts.jobs > 1 && result.status === 'fail' && !result.timedOut;
        board?.set(i + 1, 'done', result);
        return result;
      }),
      opts.jobs,
    );

    if (opts.confirm && opts.jobs > 1) {
      for (const [i, result] of results.entries()) {
        if (!result.recheck) continue;
        board?.set(i + 1, 'rechecking');
        const again = classify(await visit(result.dest, opts.command, preloads, opts), homeRun);
        if (again.status === 'pass') {
          result.status = 'flaky';
          results[i] = result;
        } else {
          results[i] = again;
        }
        board?.set(i + 1, 'rechecked', results[i]);
      }
    }
    board?.close();

    const elapsedMs = Date.now() - started;
    if (opts.json) io.stdout.write(`${jsonReport({ home: homeRun, results, command: opts.command, elapsedMs })}\n`);
    else {
      io.stdout.write(
        renderReport({
          home: homeRun,
          results,
          command: opts.command,
          elapsedMs,
          verbose: opts.verbose,
          c: color,
          columns: io.stdout.columns || 100,
        }),
      );
    }

    if (results.some((r) => r.status === 'fail')) return 1;
    return homeRun.code === 0 ? 0 : 2;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    board?.close();
    preloads.cleanup();
  }
}

async function exec(opts, io) {
  const homeTz = localTimeZone();
  const now = Date.now();
  let dest;
  if (opts.destination) {
    const found = findDestination(opts.destination);
    if (!found) throw new UsageError(`there's no destination called "${opts.destination}". Run "jetlag list" to see them.`);
    dest = resolveDestination(found, { now, homeTz });
  } else {
    dest = customDestination(opts, homeTz, now);
    if (!dest) throw new UsageError('tell jetlag where to go, like: jetlag exec kathmandu -- npm test');
  }
  if (!opts.command.length) throw new UsageError('give jetlag a command to run, like: jetlag exec kathmandu -- npm test');

  const c = palette(useColor(io.stderr));
  io.stderr.write(`${c.bold('jetlag')} ${c.gray('·')} ${dest.name}  ${c.gray(describe(dest))}\n`);
  const preloads = stagePreloads();
  try {
    const { env, marker } = destinationEnv(dest, preloads);
    const run = await runCommand(opts.command, { env, inherit: true });
    if (dest.now != null && shiftedRuntimes(marker).length === 0) {
      io.stderr.write(c.yellow("jetlag: the clock didn't move. jetlag can shift it in Node.js, Python, and Ruby.\n"));
    }
    return run.code;
  } finally {
    preloads.cleanup();
  }
}

function list(io) {
  const c = palette(useColor(io.stdout));
  const now = Date.now();
  const homeTz = localTimeZone();
  const out = [''];
  for (const [group, title] of Object.entries(GROUPS)) {
    out.push(`  ${c.bold(title)}`);
    for (const d of DESTINATIONS.filter((x) => x.group === group)) {
      const r = resolveDestination(d, { now, homeTz });
      const trips = Object.entries(TRIPS)
        .filter(([name, ids]) => name !== 'world' && name !== group && ids.includes(d.id))
        .map(([name]) => name);
      const tag = trips.length ? c.cyan(` [${trips.join(', ')}]`) : '';
      out.push(`    ${pad(d.id, 20)} ${pad(d.name, 28)} ${c.gray(describe(r))}${tag}`);
    }
    out.push('');
  }
  out.push(c.gray(`  Trips: ${Object.entries(TRIPS).map(([n, ids]) => `${n} (${ids.length})`).join(', ')}. Dates resolve against ${formatWall(now, homeTz)}.`));
  out.push('');
  io.stdout.write(out.join('\n'));
  return 0;
}

export async function main(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  let opts;
  try {
    opts = parseArgs(argv);
    if (opts.help || (!opts.sub && !opts.command.length && !opts.version)) {
      io.stdout.write(HELP.trimStart());
      return opts.help ? 0 : 2;
    }
    if (opts.version) {
      io.stdout.write(`${VERSION}\n`);
      return 0;
    }
    if (opts.sub === 'list') return list(io);
    if (opts.sub === 'exec') return await exec(opts, io);
    return await trip(opts, io);
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr.write(`jetlag: ${error.message}\n`);
      return 2;
    }
    throw error;
  }
}
