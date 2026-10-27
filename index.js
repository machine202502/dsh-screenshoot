import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultShotsDir, ensureDir, stamp } from './src/util.js';
import { createFrameServer } from './src/frames.js';
import { cropPng } from './src/png.js';

export const inject = ['tools'];

const backends = {
  win32: () => import('./src/win32.js'),
  darwin: () => import('./src/darwin.js'),
  linux: () => import('./src/linux.js'),
};

const backend = async () => {
  const loader = backends[process.platform];
  if (!loader) throw new Error(`unsupported platform: ${process.platform}`);
  return loader();
};

/** PNG size from the IHDR chunk, so every tool reports the real picture size. */
const pngSize = (path) => {
  try {
    const buffer = readFileSync(path);
    if (buffer.length < 24) return {};
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  } catch {
    return {};
  }
};

const obj = (properties = {}, required = []) => ({
  type: 'object',
  additionalProperties: false,
  ...(required.length ? { required } : {}),
  properties,
});

export function apply(ctx, config = {}) {
  const outDir = config.outDir ?? defaultShotsDir();
  const frames = createFrameServer({ port: config.bridgePort ?? 49231 });

  ctx.effect(() => {
    frames.listen().catch(() => {});
    return () => frames.close();
  });

  /** Store the PNG for the chat thumbnail and return the marker payload. */
  const publish = (shot, caption) => {
    try {
      const id = frames.put(readFileSync(shot), { path: shot, caption });
      return { id, suffix: `[shot:${id}]${caption}` };
    } catch {
      return { id: null, suffix: caption };
    }
  };

  // The union of all monitors, so a region can be clamped to what exists.
  let boundsCache = { at: 0, value: null };
  const virtualBounds = async (api) => {
    if (Date.now() - boundsCache.at < 5000 && boundsCache.value) return boundsCache.value;
    const monitors = await api.listMonitors();
    if (!monitors.length) return null;
    const left = Math.min(...monitors.map((monitor) => monitor.x));
    const top = Math.min(...monitors.map((monitor) => monitor.y));
    const right = Math.max(...monitors.map((monitor) => monitor.x + monitor.width));
    const bottom = Math.max(...monitors.map((monitor) => monitor.y + monitor.height));
    const value = { x: left, y: top, width: right - left, height: bottom - top };
    boundsCache = { at: Date.now(), value };
    return value;
  };

  /** Wait before the shot, so menus, animations or focus changes settle. */
  const settle = async (delayMs) => {
    const delay = Number(delayMs ?? 0);
    if (!Number.isFinite(delay) || delay <= 0) return 0;
    const capped = Math.min(Math.round(delay), 30000);
    await new Promise((resolve) => setTimeout(resolve, capped));
    return capped;
  };

  const target = (explicit) => {
    const path = explicit && typeof explicit === 'string' && explicit.trim()
      ? explicit.trim()
      : join(ensureDir(outDir), `shot-${stamp()}.png`);
    return path;
  };

  const tool = (definition) => ctx.tools.register(definition);

  tool({
    name: 'screen_monitors',
    description: 'List monitors with their position, size and scale, in physical pixels.',
    parameters: obj(),
    output: {
      schema: obj({ monitors: { type: 'array', items: { type: 'object', additionalProperties: true } } }, ['monitors']),
      render: (_args, value) => [{
        type: 'text',
        text: value.monitors
          .map((monitor) => `${monitor.index}${monitor.primary ? '*' : ' '} ${monitor.width}x${monitor.height} at ${monitor.x},${monitor.y}${monitor.scaleFactor ? ` @${monitor.scaleFactor}x` : ''}`)
          .join('\n') || 'no monitors reported',
      }],
    },
    isConcurrencySafe: () => true,
    execute: async () => {
      const api = await backend();
      return { monitors: await api.listMonitors() };
    },
  });

  tool({
    name: 'screen_windows',
    description: 'List visible top-level windows with pid, title and bounds. Covers occluded windows too.',
    parameters: obj({
      pid: { type: 'number', description: 'Only windows of this process' },
      title: { type: 'string', description: 'Only windows whose title contains this text' },
      limit: { type: 'number', description: 'Maximum rows (default 100)' },
    }),
    output: {
      schema: obj({
        windows: { type: 'array', items: { type: 'object', additionalProperties: true } },
        total: { type: 'number' },
      }, ['windows']),
      render: (_args, value) => [{
        type: 'text',
        text: value.windows.length
          ? value.windows.map((window) => `${window.id}  pid ${window.pid}  ${window.width}x${window.height} at ${window.x},${window.y}  ${window.title}`).join('\n')
          : 'no windows matched',
      }],
    },
    isConcurrencySafe: () => true,
    execute: async (args) => {
      const api = await backend();
      const windows = await api.listWindows({ pid: args.pid, title: args.title });
      const limit = Number(args.limit ?? 100);
      return { total: windows.length, windows: windows.slice(0, limit) };
    },
  });

  tool({
    name: 'screen_capture_monitor',
    description: 'Capture one whole monitor to a PNG file. Pass the path to read_image to look at it.',
    parameters: obj({
      monitor: { type: 'number', description: 'Monitor index from screen_monitors (default 0)' },
      delayMs: { type: 'number', description: 'Wait this many milliseconds before the shot (max 30000)' },
      out: { type: 'string', description: 'Output PNG path; a timestamped file is used when omitted' },
    }),
    output: {
      schema: obj({
        path: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
        frame: { type: 'string' },
        label: { type: 'string' },
      }, ['path']),
      render: (_args, value) => [{
        type: 'text',
        text: `monitor ${value.width ?? '?'}×${value.height ?? '?'} → ${value.path}${value.frame ? ` [shot:${value.frame}]${value.label ?? ''}` : ''}`,
      }],
    },
    isConcurrencySafe: () => true,
    execute: async (args) => {
      const api = await backend();
      const shot = target(args.out);
      const waited = await settle(args.delayMs);
      await api.captureMonitor({ index: Number(args.monitor ?? 0), shot });
      const size = pngSize(shot);
      const label = `monitor ${args.monitor ?? 0} · ${size.width ?? '?'}×${size.height ?? '?'}${waited ? ` (+${waited} ms)` : ''}`;
      const frame = publish(shot, label).id;
      return { path: shot, ...size, label, ...(frame ? { frame } : {}) };
    },
  });

  tool({
    name: 'screen_capture_region',
    description: 'Capture a rectangle of the screen (virtual-desktop pixels) to a PNG file.',
    parameters: obj({
      x: { type: 'number' },
      y: { type: 'number' },
      width: { type: 'number' },
      height: { type: 'number' },
      delayMs: { type: 'number', description: 'Wait this many milliseconds before the shot (max 30000)' },
      out: { type: 'string' },
    }, ['x', 'y', 'width', 'height']),
    output: {
      schema: obj({
        path: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
        frame: { type: 'string' },
        label: { type: 'string' },
        clamped: { type: 'boolean' },
      }, ['path']),
      render: (_args, value) => [{
        type: 'text',
        text: `region ${value.width ?? '?'}×${value.height ?? '?'} → ${value.path}${value.frame ? ` [shot:${value.frame}]${value.label ?? ''}` : ''}`,
      }],
    },
    isConcurrencySafe: () => true,
    execute: async (args) => {
      const width = Number(args.width);
      const height = Number(args.height);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
        throw new Error('width and height must be positive numbers');
      }
      if (!Number.isFinite(Number(args.x)) || !Number.isFinite(Number(args.y))) {
        throw new Error('x and y must be numbers');
      }
      const api = await backend();
      let x = Math.round(Number(args.x));
      let y = Math.round(Number(args.y));
      let keepWidth = Math.round(width);
      let keepHeight = Math.round(height);
      let clamped = false;
      const bounds = await virtualBounds(api);
      if (bounds) {
        const left = Math.max(x, bounds.x);
        const top = Math.max(y, bounds.y);
        const right = Math.min(x + keepWidth, bounds.x + bounds.width);
        const bottom = Math.min(y + keepHeight, bounds.y + bounds.height);
        if (right - left < 1 || bottom - top < 1) {
          throw new Error(
            `region ${keepWidth}x${keepHeight} at ${x},${y} is outside the screen `
            + `(virtual desktop ${bounds.width}x${bounds.height} at ${bounds.x},${bounds.y})`,
          );
        }
        clamped = left !== x || top !== y || right - left !== keepWidth || bottom - top !== keepHeight;
        x = left;
        y = top;
        keepWidth = right - left;
        keepHeight = bottom - top;
      }
      const shot = target(args.out);
      const waited = await settle(args.delayMs);
      await api.captureRegion({ x, y, width: keepWidth, height: keepHeight, shot });
      const size = pngSize(shot);
      const label = `region ${size.width ?? keepWidth}×${size.height ?? keepHeight} at ${x},${y}`
        + (clamped ? ' · clamped' : '')
        + (waited ? ` (+${waited} ms)` : '');
      const frame = publish(shot, label).id;
      return { path: shot, ...size, label, clamped, ...(frame ? { frame } : {}) };
    },
  });

  tool({
    name: 'screen_capture_window',
    description: 'Capture one window by pid, title or window id — including a window that is behind others or unfocused.',
    parameters: obj({
      pid: { type: 'number', description: 'Process id owning the window' },
      title: { type: 'string', description: 'Substring of the window title' },
      id: { type: 'string', description: 'Window handle from screen_windows (numeric or hex)' },
      delayMs: { type: 'number', description: 'Wait this many milliseconds before the shot (max 30000)' },
      crop: {
        type: 'object',
        additionalProperties: false,
        description: 'Cut this rectangle out of the window, relative to its top-left corner',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
        },
        required: ['width', 'height'],
      },
      out: { type: 'string' },
    }),
    output: {
      schema: obj({
        path: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
        window: { type: 'object', additionalProperties: true },
        frame: { type: 'string' },
        label: { type: 'string' },
      }, ['path']),
      render: (_args, value) => [{
        type: 'text',
        text: `window ${value.width ?? '?'}×${value.height ?? '?'} → ${value.path}${value.frame ? ` [shot:${value.frame}]${value.label ?? ''}` : ''}`,
      }],
    },
    isConcurrencySafe: () => true,
    execute: async (args) => {
      const pid = args.pid === undefined ? undefined : Number(args.pid);
      if (pid === undefined && !args.title && !args.id) throw new Error('pass pid, title or id');
      // Window handles come as decimal from the list, but a user may paste hex.
      const id = args.id === undefined
        ? undefined
        : String(args.id).trim().toLowerCase().startsWith('0x')
          ? String(parseInt(String(args.id), 16))
          : String(args.id).trim();
      const api = await backend();
      const shot = target(args.out);
      const waited = await settle(args.delayMs);
      const result = await api.captureWindow({ pid, title: args.title, id, shot });
      // Fetch the window record for the label: by pid/title, or by handle.
      let window = (pid || args.title) && !id
        ? (await api.listWindows({ pid, title: args.title }))[0]
        : undefined;
      if (!window && id) {
        window = (await api.listWindows({})).find((entry) => String(entry.id) === String(id));
      }
      let size = pngSize(shot);
      let cropLabel = '';
      if (args.crop) {
        const cropX = Number(args.crop.x ?? 0);
        const cropY = Number(args.crop.y ?? 0);
        const cropWidth = Number(args.crop.width);
        const cropHeight = Number(args.crop.height);
        if (![cropX, cropY, cropWidth, cropHeight].every(Number.isFinite) || cropWidth < 1 || cropHeight < 1) {
          throw new Error('crop needs numeric width and height greater than zero');
        }
        if (cropX < 0 || cropY < 0 || cropX + cropWidth > size.width || cropY + cropHeight > size.height) {
          throw new Error(
            `crop ${cropWidth}x${cropHeight} at ${cropX},${cropY} does not fit the window image (${size.width}x${size.height})`,
          );
        }
        const source = readFileSync(shot);
        const cropped = cropPng(source, { x: cropX, y: cropY, width: cropWidth, height: cropHeight });
        writeFileSync(shot, cropped.buffer);
        size = { width: cropped.width, height: cropped.height };
        cropLabel = ` · crop ${cropped.width}×${cropped.height} at ${cropX},${cropY}`;
      }
      const label = `${window?.title ?? 'window'} · ${size.width ?? '?'}×${size.height ?? '?'}`
        + cropLabel
        + (waited ? ` (+${waited} ms)` : '');
      const frame = publish(shot, label).id;
      return { path: shot, ...size, label, ...(window ? { window } : {}), ...(frame ? { frame } : {}) };
    },
  });
}
