import { asArray, run, stamp } from './util.js';

/**
 * Linux backend (X11).
 *
 * Monitors come from `xrandr`, windows from `wmctrl`, captures from ImageMagick
 * `import` — `import -window <id>` reads the window's own pixels, so an occluded
 * window is captured without raising it. On Wayland those tools see nothing, so
 * the backend reports the missing capability instead of returning a black shot.
 */
const isWayland = () => Boolean(process.env.WAYLAND_DISPLAY) || process.env.XDG_SESSION_TYPE === 'wayland';

const need = (tool, hint) => async () => {
  try {
    await run(tool, ['--version'], { timeout: 5000 });
  } catch {
    throw new Error(`${tool} is required on Linux: ${hint}`);
  }
};

const parseXrandr = (text) => {
  const monitors = [];
  let index = 0;
  for (const line of text.split('\n')) {
    const match = /^(\S+) connected (primary )?(\d+)x(\d+)\+(\d+)\+(\d+)/.exec(line.trim());
    if (!match) continue;
    monitors.push({
      index,
      id: match[1],
      name: match[1],
      primary: Boolean(match[2]),
      width: Number(match[3]),
      height: Number(match[4]),
      x: Number(match[5]),
      y: Number(match[6]),
    });
    index++;
  }
  return monitors;
};

export async function listMonitors() {
  if (isWayland()) {
    // Wayland exposes outputs through the portal only; keep the list empty but explain.
    throw new Error('monitor enumeration needs X11 (xrandr); on Wayland use a portal-based tool such as grim');
  }
  await need('xrandr', 'install x11-xserver-utils')();
  const monitors = parseXrandr(await run('xrandr', ['--query']));
  if (!monitors.length) throw new Error('xrandr reported no connected monitors');
  return monitors;
}

export async function listWindows({ pid, title } = {}) {
  if (isWayland()) {
    throw new Error('window enumeration needs X11 (wmctrl); Wayland hides windows from X11 tools');
  }
  await need('wmctrl', 'install wmctrl')();
  // -l list, -G geometry, -p pid, -x class
  const text = await run('wmctrl', ['-lGpx'], { timeout: 15000 });
  let windows = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      const [id, desktop, pidValue, x, y, width, height, klass, ...titleParts] = parts;
      return {
        id,
        desktop: Number(desktop),
        pid: Number(pidValue),
        x: Number(x),
        y: Number(y),
        width: Number(width),
        height: Number(height),
        process: String(klass ?? '').split('.').pop(),
        title: titleParts.join(' '),
        visible: Number(desktop) >= 0,
        minimized: false,
      };
    })
    .filter((window) => window.width > 0 && window.height > 0);
  if (pid) windows = windows.filter((window) => window.pid === Number(pid));
  if (title) {
    const needle = String(title).toLowerCase();
    windows = windows.filter((window) => window.title.toLowerCase().includes(needle));
  }
  return windows;
}

const importShot = async (args, shot) => {
  await need('import', 'install imagemagick')();
  await run('import', [...args, shot], { timeout: 30000 });
  return { shot };
};

/** ImageMagick `import` cannot draw the pointer; Wayland `grim -c` can. */
const refuseCursor = (cursor) => {
  if (cursor) {
    throw new Error('the cursor is not supported on Linux X11 (ImageMagick `import` cannot draw it); on Wayland grim includes it');
  }
};

export async function captureMonitor({ index = 0, shot, cursor = false }) {
  if (isWayland()) {
    await need('grim', 'install grim')();
    const monitors = await run('wlr-randr', ['--json'], { timeout: 10000 }).catch(() => '');
    void monitors;
    await run('grim', cursor ? ['-c', shot] : [shot], { timeout: 30000 });
    return { shot };
  }
  refuseCursor(cursor);
  const monitors = await listMonitors();
  const monitor = monitors[index] ?? monitors[0];
  if (!monitor) throw new Error(`monitor ${index} not found`);
  return importShot(['-window', 'root', '-crop', `${monitor.width}x${monitor.height}+${monitor.x}+${monitor.y}`, '+repage'], shot);
}

export async function captureRegion({ x, y, width, height, shot, cursor = false }) {
  if (isWayland()) {
    await need('grim', 'install grim')();
    const geometry = `${x},${y} ${width}x${height}`;
    await run('grim', cursor ? ['-c', '-g', geometry, shot] : ['-g', geometry, shot], { timeout: 30000 });
    return { shot };
  }
  refuseCursor(cursor);
  return importShot(['-window', 'root', '-crop', `${width}x${height}+${x}+${y}`, '+repage'], shot);
}

export async function captureWindow({ pid, title, id, shot, cursor = false }) {
  refuseCursor(cursor);
  let windowId = id;
  if (!windowId) {
    const matches = await listWindows({ pid, title });
    if (!matches.length) throw new Error(`no window matched ${pid ? `pid ${pid}` : `title "${title}"`}`);
    windowId = matches[0].id;
  }
  return importShot(['-window', String(windowId)], shot);
}

export const shotName = (kind) => `${kind}-${stamp()}.png`;
