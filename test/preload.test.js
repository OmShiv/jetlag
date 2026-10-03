import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = '2028-02-29T12:00:00.000Z';

function clockEnv(extra = {}) {
  const marker = join(mkdtempSync(join(tmpdir(), 'jetlag-test-')), 'marker');
  return {
    marker,
    env: { ...process.env, JETLAG_NOW: TARGET, JETLAG_EPOCH: String(Date.now()), JETLAG_MARKER: marker, TZ: 'UTC', PYTHONDONTWRITEBYTECODE: '1', ...extra },
  };
}

const has = (cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0;

test('node: Date, Intl, vm contexts, and workers see the shifted clock', () => {
  const script = `
    const vm = require('vm');
    const { Worker } = require('worker_threads');
    class Sub extends Date {}
    const out = {
      now: new Date(Date.now()).toISOString().slice(0, 16),
      constructed: new Date().toISOString().slice(0, 16),
      called: typeof Date(),
      calledYear: Date().includes('2028'),
      explicit: new Date(0).toISOString(),
      parts: new Date(2020, 0, 2).getDate(),
      instance: new Date() instanceof Date,
      constructorCheck: new Date().constructor === Date,
      tag: Object.prototype.toString.call(new Date()),
      sub: new Sub() instanceof Sub && new Sub().getFullYear(),
      intl: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric' }).format(),
      vm: vm.runInContext('new Date().getFullYear() + ":" + Date.now()', vm.createContext({})).startsWith('2028:'),
      length: Date.length,
      name: Date.name,
    };
    new Worker('require("worker_threads").parentPort.postMessage(new Date().getFullYear())', { eval: true })
      .on('message', (year) => { out.worker = year; console.log(JSON.stringify(out)); });
  `;
  const { env, marker } = clockEnv();
  const run = spawnSync(process.execPath, ['--require', join(root, 'preload/node.cjs'), '-e', script], { env, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  assert.deepEqual(out, {
    now: '2028-02-29T12:00',
    constructed: '2028-02-29T12:00',
    called: 'string',
    calledYear: true,
    explicit: '1970-01-01T00:00:00.000Z',
    parts: 2,
    instance: true,
    constructorCheck: true,
    tag: '[object Date]',
    sub: 2028,
    intl: '2028',
    vm: true,
    length: 7,
    name: 'Date',
    worker: 2028,
  });
  assert.match(readFileSync(marker, 'utf8'), /node/);
});

test('node: the clock keeps flowing from the shifted start', () => {
  const script = `const a = Date.now(); setTimeout(() => console.log(Date.now() - a), 120);`;
  const { env } = clockEnv();
  const run = spawnSync(process.execPath, ['--require', join(root, 'preload/node.cjs'), '-e', script], { env, encoding: 'utf8' });
  const elapsed = Number(run.stdout);
  assert.ok(elapsed >= 100 && elapsed < 1000, `elapsed ${elapsed}`);
});

test('node: without JETLAG_NOW the preload does nothing', () => {
  const env = { ...process.env };
  delete env.JETLAG_NOW;
  const run = spawnSync(process.execPath, ['--require', join(root, 'preload/node.cjs'), '-e', 'console.log(new Date().getFullYear())'], { env, encoding: 'utf8' });
  assert.equal(Number(run.stdout), new Date().getFullYear());
});

test('python: time, datetime, and date see the shifted clock', { skip: !has('python3') && 'python3 not found' }, () => {
  const script = [
    'import time, datetime as dt, json',
    'from datetime import date, datetime, timezone',
    'print(json.dumps({',
    '  "time": time.strftime("%Y-%m-%d", time.gmtime(time.time())),',
    '  "now": datetime.now(timezone.utc).strftime("%Y-%m-%d %H"),',
    '  "today": date.today().isoformat(),',
    '  "utcnow": dt.datetime.utcnow().year,',
    '  "localtime": time.localtime().tm_year,',
    '  "strftime": time.strftime("%Y"),',
    '  "isinstance": isinstance(datetime(2020, 1, 1), datetime) and isinstance(dt.datetime.now(), dt.date),',
    '  "real": datetime.fromtimestamp(0, timezone.utc).year,',
    '}))',
  ].join('\n');
  const { env, marker } = clockEnv({ PYTHONPATH: join(root, 'preload/python'), PYTHONWARNINGS: 'ignore' });
  const run = spawnSync('python3', ['-c', script], { env, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), {
    time: '2028-02-29',
    now: '2028-02-29 12',
    today: '2028-02-29',
    utcnow: 2028,
    localtime: 2028,
    strftime: '2028',
    isinstance: true,
    real: 1970,
  });
  assert.match(readFileSync(marker, 'utf8'), /python/);
});

test('ruby: Time.now and Date.today see the shifted clock', { skip: !has('ruby') && 'ruby not found' }, () => {
  const script = 'require "date"; puts [Time.now.utc.strftime("%Y-%m-%d %H"), Date.today.to_s, DateTime.now.year].join("|")';
  const { env, marker } = clockEnv();
  const run = spawnSync('ruby', ['-r', join(root, 'preload/ruby/jetlag.rb'), '-e', script], { env, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), '2028-02-29 12|2028-02-29|2028');
  assert.match(readFileSync(marker, 'utf8'), /ruby/);
});
