import { stripAnsi } from './failures.js';

export function useColor(stream) {
  if ('NO_COLOR' in process.env) return false;
  if (process.env.FORCE_COLOR) return process.env.FORCE_COLOR !== '0';
  return Boolean(stream.isTTY);
}

export function palette(on) {
  const wrap = (open, close) => (s) => (on ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));
  return {
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    cyan: wrap(36, 39),
    gray: wrap(90, 39),
  };
}

export const width = (s) => [...stripAnsi(s)].length;

export function pad(s, n) {
  return s + ' '.repeat(Math.max(0, n - width(s)));
}

export function truncate(s, n) {
  const chars = [...s];
  return chars.length <= n ? s : `${chars.slice(0, Math.max(0, n - 1)).join('')}…`;
}

export function wrap(text, columns, indent) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && width(indent + line + ' ' + word) > columns) {
      lines.push(indent + line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(indent + line);
  return lines;
}

export function seconds(ms) {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// The table of destinations, redrawn in place while runs are in flight. On a
// stream that isn't a terminal it prints each row once, when it finishes.
export class Board {
  constructor(stream, rows, c) {
    this.stream = stream;
    this.rows = rows; // { name, detail, state, result }
    this.c = c;
    this.live = Boolean(stream.isTTY);
    this.frame = 0;
    this.drawn = 0;
    this.nameWidth = Math.min(28, Math.max(...rows.map((r) => width(r.name))));
    const columns = stream.columns || 100;
    this.detailWidth = Math.max(10, Math.min(Math.max(...rows.map((r) => width(r.detail))), columns - this.nameWidth - 34));
    if (this.live) {
      stream.write('\x1b[?25l');
      this.timer = setInterval(() => this.draw(), 80);
      this.draw();
    }
  }

  set(i, state, result) {
    const row = this.rows[i];
    row.state = state;
    if (result) row.result = result;
    // Without a live table, print each row once, when its result is final.
    const final = state === 'rechecked' || (state === 'done' && !result?.recheck);
    if (!this.live && final) this.stream.write(`${this.line(row)}\n`);
  }

  line(row) {
    const { c } = this;
    const r = row.result;
    let icon = c.gray('·');
    let time = '';
    let note = '';
    if (row.state === 'running') icon = c.cyan(SPINNER[this.frame % SPINNER.length]);
    if (row.state === 'rechecking') {
      icon = c.cyan(SPINNER[this.frame % SPINNER.length]);
      note = c.gray('re-running alone');
    }
    if (r && row.state !== 'running' && row.state !== 'rechecking') {
      time = seconds(r.durationMs);
      ({ icon, note } = verdict(r, c));
    }
    const name = pad(truncate(row.name, this.nameWidth), this.nameWidth);
    const detail = c.gray(pad(truncate(row.detail, this.detailWidth), this.detailWidth));
    return `  ${icon}  ${name}  ${detail}  ${time.padStart(5)}  ${note}`.trimEnd();
  }

  draw() {
    this.frame++;
    const out = [];
    if (this.drawn) out.push(`\x1b[${this.drawn}A`);
    for (const row of this.rows) out.push(`\x1b[2K${this.line(row)}\n`);
    this.drawn = this.rows.length;
    this.stream.write(out.join(''));
  }

  close() {
    if (!this.live) return;
    this.live = false;
    clearInterval(this.timer);
    this.draw();
    this.stream.write('\x1b[?25h');
  }
}

export function verdict(r, c) {
  switch (r.status) {
    case 'pass':
      return { icon: c.green('✓'), note: r.clockMoved ? '' : c.gray("clock didn't move") };
    case 'fail': {
      const n = r.newFailing?.length ?? 0;
      const what = r.timedOut ? 'timed out' : n ? `${n} failing` : 'failed';
      return { icon: c.red('✗'), note: c.red(what) };
    }
    case 'flaky':
      return { icon: c.yellow('~'), note: c.yellow('passed when re-run alone') };
    case 'same':
      return { icon: c.gray('='), note: c.gray('same failures as home') };
    case 'unknown':
      return { icon: c.yellow('?'), note: c.yellow('failed, like home') };
    case 'skipped':
      return { icon: c.gray('-'), note: c.gray("clock didn't move") };
    case 'home-fail':
      return { icon: c.yellow('!'), note: c.yellow(`${r.failing.length || 'some'} failing already`) };
    default:
      return { icon: c.green('✓'), note: '' };
  }
}
