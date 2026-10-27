import { fileURLToPath } from 'node:url';
import { asArray, parseJson, run, stamp } from './util.js';

/**
 * Windows backend.
 *
 * Everything happens in one PowerShell helper (`win.ps1`): it sets per-monitor
 * DPI awareness, enumerates monitors through WinForms, enumerates windows
 * through EnumWindows, and captures windows with PrintWindow(PW_RENDERFULLCONTENT),
 * which renders an occluded window instead of copying the visible screen.
 */
const SCRIPT = fileURLToPath(new URL('./win.ps1', import.meta.url));

const call = async (action, extra = []) => {
  const output = await run('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    SCRIPT,
    '-Action',
    action,
    ...extra,
  ], { timeout: 30000 });
  return parseJson(output);
};

export async function listMonitors() {
  const monitors = asArray(await call('monitors'));
  return monitors.map((monitor) => ({
    index: monitor.index,
    id: monitor.id,
    name: monitor.name,
    primary: Boolean(monitor.primary),
    x: monitor.x,
    y: monitor.y,
    width: monitor.width,
    height: monitor.height,
    workArea: {
      x: monitor.workX,
      y: monitor.workY,
      width: monitor.workWidth,
      height: monitor.workHeight,
    },
  }));
}

export async function listWindows({ pid, title } = {}) {
  let windows = asArray(await call('windows')).map((window) => ({
    id: window.handle,
    pid: window.pid,
    title: window.title,
    process: window.process,
    x: window.x,
    y: window.y,
    width: window.width,
    height: window.height,
    visible: Boolean(window.visible),
    minimized: Boolean(window.minimized),
    maximized: Boolean(window.maximized),
  }));
  if (pid) windows = windows.filter((window) => window.pid === Number(pid));
  if (title) {
    const needle = String(title).toLowerCase();
    windows = windows.filter((window) => window.title.toLowerCase().includes(needle));
  }
  return windows;
}

export async function captureMonitor({ index = 0, shot }) {
  const result = await call('capture-monitor', ['-Monitor', String(index), '-Out', shot]);
  return { shot: result.path ?? shot, ...result };
}

export async function captureRegion({ x, y, width, height, shot }) {
  const result = await call('capture-region', [
    '-X', String(x), '-Y', String(y), '-W', String(width), '-H', String(height), '-Out', shot,
  ]);
  return { shot: result.path ?? shot, ...result };
}

export async function captureWindow({ pid, title, id, shot }) {
  const extra = ['-Out', shot];
  if (id) extra.push('-Hwnd', String(id));
  if (pid) extra.push('-ProcessId', String(pid));
  if (title) extra.push('-TitleBase64', Buffer.from(String(title), 'utf8').toString('base64'));
  const result = await call('capture-window', extra);
  return { shot: result.path ?? shot, ...result };
}

export const shotName = (kind) => `${kind}-${stamp()}.png`;
