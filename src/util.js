import { execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Data directory per platform, matching the other dsh plugins. */
export const dataHome = () =>
  process.env.LOCALAPPDATA ??
  (process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support')
    : process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'));

export const defaultShotsDir = () => join(dataHome(), 'dsh-screenshoot', 'shots');

export const ensureDir = (path) => {
  mkdirSync(path, { recursive: true });
  return path;
};

export const stamp = () => {
  const now = new Date();
  const pad = (value, size = 2) => String(value).padStart(size, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${pad(now.getMilliseconds(), 3)}`;
};

/** Run a system tool and return its stdout, with a readable failure message. */
export function run(command, args, { timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr ?? '').trim() || String(error.message ?? error);
        const failure = new Error(`${command} failed: ${detail.split('\n').slice(0, 4).join(' ')}`);
        failure.code = error.code;
        failure.stdout = String(stdout ?? '');
        reject(failure);
        return;
      }
      resolve(String(stdout ?? ''));
    });
  });
}

/** Parse JSON that a platform tool printed, tolerating a BOM or extra lines. */
export function parseJson(text) {
  const clean = String(text ?? '').replace(/^\uFEFF/, '').trim();
  if (!clean) throw new Error('no output from the capture helper');
  const start = clean.search(/[[{]/);
  if (start < 0) throw new Error(`unexpected output: ${clean.slice(0, 200)}`);
  return JSON.parse(clean.slice(start));
}

/** Turn a possibly single object into an array. */
export const asArray = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);
