import { spawn } from 'node:child_process';

const MAX_OUTPUT = 1_000_000;
const running = new Set();

// Run a command once and collect its output. `inherit` streams it instead.
export function runCommand(command, { env, cwd, timeoutMs, inherit = false } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const useShell = process.platform === 'win32' || command.length === 1;
    const child = spawn(command[0], command.slice(1), {
      env,
      cwd,
      shell: useShell,
      stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32' && !inherit,
    });
    running.add(child);

    let output = '';
    const collect = (chunk) => {
      output += chunk;
      if (output.length > MAX_OUTPUT) output = output.slice(-MAX_OUTPUT);
    };
    child.stdout?.setEncoding('utf8').on('data', collect);
    child.stderr?.setEncoding('utf8').on('data', collect);

    let timedOut = false;
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          stop(child);
        }, timeoutMs)
      : null;

    let settled = false;
    const finish = (code, signal, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      running.delete(child);
      if (error) output += `\n${error.message}\n`;
      resolve({ code: code ?? 1, signal, timedOut, output, durationMs: Date.now() - started });
    };
    child.on('error', (error) => finish(127, null, error));
    child.on('close', (code, signal) => finish(code, signal));
  });
}

function stop(child, signal = 'SIGTERM') {
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {}
}

export function stopAll() {
  for (const child of running) stop(child, 'SIGKILL');
}

// Run `tasks` (functions returning promises) with at most `limit` at a time.
export async function pool(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return results;
}
