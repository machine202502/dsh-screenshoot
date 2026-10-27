import { asArray, parseJson, run, stamp } from './util.js';

/**
 * macOS backend.
 *
 * Monitors and windows come from AppKit/CoreGraphics through JavaScript for
 * Automation (no compiler needed). Captures use the built-in `screencapture`,
 * whose `-l <window id>` renders a window even when it is behind others, and
 * `-R` takes a screen region. The first capture asks for the Screen Recording
 * permission; without it macOS returns a desktop-only picture.
 */
const MONITORS_JXA = `
ObjC.import('AppKit');
const screens = $.NSScreen.screens;
const main = $.NSScreen.mainScreen;
const mainHeight = main.frame.size.height;
const out = [];
for (let i = 0; i < screens.count; i++) {
  const screen = screens.objectAtIndex(i);
  const frame = screen.frame;
  out.push({
    index: i,
    id: ObjC.unwrap(screen.deviceDescription.objectForKey('NSScreenNumber')),
    x: frame.origin.x,
    y: Math.round(mainHeight - (frame.origin.y + frame.size.height)),
    width: frame.size.width,
    height: frame.size.height,
    scale: screen.backingScaleFactor,
    primary: frame.origin.x === 0 && frame.origin.y === 0,
  });
}
JSON.stringify(out);
`;

const WINDOWS_JXA = `
ObjC.import('CoreGraphics');
ObjC.import('Foundation');
const options = $.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements;
const list = $.CGWindowListCopyWindowInfo(options, $.kCGNullWindowID);
const count = list.count;
const out = [];
for (let i = 0; i < count; i++) {
  const info = list.objectAtIndex(i);
  const bounds = info.objectForKey('kCGWindowBounds');
  if (!bounds) continue;
  const number = (key) => {
    const value = bounds.objectForKey(key);
    return value ? ObjC.unwrap(value) : 0;
  };
  const owner = info.objectForKey('kCGWindowOwnerName');
  const name = info.objectForKey('kCGWindowName');
  const pid = info.objectForKey('kCGWindowOwnerPID');
  out.push({
    id: ObjC.unwrap(info.objectForKey('kCGWindowNumber')),
    pid: pid ? ObjC.unwrap(pid) : 0,
    title: name ? String(ObjC.unwrap(name)) : '',
    process: owner ? String(ObjC.unwrap(owner)) : '',
    x: number('X'),
    y: number('Y'),
    width: number('Width'),
    height: number('Height'),
    layer: ObjC.unwrap(info.objectForKey('kCGWindowLayer')),
  });
}
JSON.stringify(out);
`;

const osa = async (script) => parseJson(await run('osascript', ['-l', 'JavaScript', '-e', script], { timeout: 25000 }));

export async function listMonitors() {
  const monitors = asArray(await osa(MONITORS_JXA));
  return monitors.map((monitor) => ({
    index: monitor.index,
    id: String(monitor.id ?? monitor.index),
    name: `Display ${monitor.index + 1}`,
    primary: Boolean(monitor.primary),
    x: monitor.x,
    y: monitor.y,
    width: monitor.width,
    height: monitor.height,
    scaleFactor: monitor.scale,
  }));
}

export async function listWindows({ pid, title } = {}) {
  let windows = asArray(await osa(WINDOWS_JXA))
    // Layer 0 is the normal window layer; higher layers are menus and overlays.
    .filter((window) => (window.layer === 0 || window.layer === undefined) && window.width > 0 && window.height > 0)
    .map((window) => ({
      id: window.id,
      pid: window.pid,
      title: window.title,
      process: window.process,
      x: window.x,
      y: window.y,
      width: window.width,
      height: window.height,
      visible: true,
      minimized: false,
    }));
  if (pid) windows = windows.filter((window) => window.pid === Number(pid));
  if (title) {
    const needle = String(title).toLowerCase();
    windows = windows.filter((window) => window.title.toLowerCase().includes(needle));
  }
  return windows.sort((a, b) => b.width * b.height - a.width * a.height);
}

export async function captureMonitor({ index = 0, shot }) {
  await run('screencapture', ['-x', '-D', String(index + 1), shot], { timeout: 30000 });
  return { shot };
}

export async function captureRegion({ x, y, width, height, shot }) {
  await run('screencapture', ['-x', '-R', `${x},${y},${width},${height}`, shot], { timeout: 30000 });
  return { shot };
}

export async function captureWindow({ pid, title, id, shot }) {
  let windowId = id;
  if (!windowId) {
    const matches = await listWindows({ pid, title });
    if (!matches.length) throw new Error(`no window matched ${pid ? `pid ${pid}` : `title "${title}"`}`);
    windowId = matches[0].id;
  }
  await run('screencapture', ['-x', '-o', '-l', String(windowId), shot], { timeout: 30000 });
  return { shot, windowId };
}

export const shotName = (kind) => `${kind}-${stamp()}.png`;
