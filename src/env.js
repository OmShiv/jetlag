import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRELOAD_SOURCE = join(dirname(fileURLToPath(import.meta.url)), '..', 'preload');

// Copies the clock preloads to a temp directory: a short path without spaces
// survives NODE_OPTIONS and RUBYOPT parsing, and Python can write bytecode
// next to sitecustomize.py without touching the install directory.
export function stagePreloads() {
  const dir = mkdtempSync(join(tmpdir(), 'jetlag-'));
  cpSync(PRELOAD_SOURCE, join(dir, 'preload'), { recursive: true });
  return {
    dir,
    node: join(dir, 'preload', 'node.cjs'),
    python: join(dir, 'preload', 'python'),
    ruby: join(dir, 'preload', 'ruby', 'jetlag.rb'),
    markers: dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const quote = (path) => (/\s/.test(path) ? JSON.stringify(path) : path);
const joinOptions = (existing, extra) => (existing ? `${existing} ${extra}` : extra);
const joinPath = (first, existing, sep) => (existing ? `${first}${sep}${existing}` : first);

// The environment a command sees at a destination. Returns the env and the
// marker file that preloads write to when they shift the clock.
export function destinationEnv(dest, preloads, base = process.env) {
  const env = { ...base, JETLAG: '1', JETLAG_DESTINATION: dest.id };
  if (dest.tz) env.TZ = dest.tz;
  if (dest.locale) {
    env.LANG = dest.locale;
    env.LC_ALL = dest.locale;
  }
  let marker = null;
  if (dest.now != null) {
    marker = join(preloads.markers, `${dest.id}-${process.hrtime.bigint()}.marker`);
    env.JETLAG_NOW = new Date(dest.now).toISOString();
    env.JETLAG_EPOCH = String(Date.now());
    env.JETLAG_MARKER = marker;
    env.NODE_OPTIONS = joinOptions(base.NODE_OPTIONS, `--require ${quote(preloads.node)}`);
    env.PYTHONPATH = joinPath(preloads.python, base.PYTHONPATH, process.platform === 'win32' ? ';' : ':');
    env.RUBYOPT = joinOptions(base.RUBYOPT, `-r${preloads.ruby}`);
  }
  return { env, marker };
}

// Which runtimes shifted their clock during a run, from the marker file.
export function shiftedRuntimes(marker) {
  if (!marker || !existsSync(marker)) return [];
  return [...new Set(readFileSync(marker, 'utf8').split('\n').filter(Boolean))];
}
