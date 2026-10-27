import { apply } from '../index.js';

const tools = new Map();
const disposers = [];
const ctx = {
  tools: { register: (definition) => tools.set(definition.name, definition) },
  effect: (fn) => { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); },
};

apply(ctx, { bridgePort: 49298 });
console.log('registered:', [...tools.keys()].join(', '));

const call = async (name, args = {}) => {
  const tool = tools.get(name);
  if (!tool) throw new Error(`no tool ${name}`);
  const value = await tool.execute(args);
  for (const key of tool.output.schema.required ?? []) {
    if (value[key] === undefined) throw new Error(`${name}: missing "${key}" in result`);
  }
  return value;
};

const check = (name, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);

const monitors = await call('screen_monitors');
check('screen_monitors', monitors.monitors.length > 0, `${monitors.monitors.length} monitor(s)`);

const windows = await call('screen_windows', { limit: 5 });
check('screen_windows', windows.windows.length > 0, `${windows.total} windows, first: ${windows.windows[0]?.title ?? ''}`);

const monitor = await call('screen_capture_monitor', { monitor: 0 });
check('screen_capture_monitor', Boolean(monitor.path) && monitor.width > 0, `${monitor.width}x${monitor.height}`);

const region = await call('screen_capture_region', { x: 20, y: 20, width: 200, height: 120 });
check('screen_capture_region', Boolean(region.path) && region.width === 200, `${region.width}x${region.height}`);

const started = Date.now();
const delayed = await call('screen_capture_region', { x: 5, y: 5, width: 120, height: 90, delayMs: 400 });
const elapsed = Date.now() - started;
check('delayMs honoured', elapsed >= 380, `${elapsed} ms`);

const clipped = await call('screen_capture_region', { x: -50, y: -50, width: 200, height: 200 });
check('clamped region', clipped.clamped === true && clipped.width === 150, `${clipped.width}x${clipped.height}, clamped=${clipped.clamped}`);

const oversized = await call('screen_capture_region', { x: 0, y: 0, width: 4000, height: 300 });
check('oversized region clamped', oversized.clamped === true && oversized.width <= 4000, `${oversized.width} wide`);

let outside = null;
try {
  await call('screen_capture_region', { x: 9000, y: 9000, width: 100, height: 100 });
} catch (error) {
  outside = error.message;
}
check('region outside the screen fails', Boolean(outside && /outside the screen/.test(outside)), outside ?? 'no error');

const target = windows.windows.find((window) => window.width > 100 && window.height > 100);
if (target) {
  const byPid = await call('screen_capture_window', { pid: target.pid });
  check('screen_capture_window by pid', Boolean(byPid.path), `${byPid.width}x${byPid.height} pid ${target.pid}`);

  const byTitle = await call('screen_capture_window', { title: target.title.slice(0, 8) });
  check('screen_capture_window by title', Boolean(byTitle.path), `${byTitle.width}x${byTitle.height}`);

  const cropped = await call('screen_capture_window', {
    pid: target.pid,
    crop: { x: 100, y: 80, width: 320, height: 200 },
  });
  check('crop inside the window', cropped.width === 320 && cropped.height === 200, `${cropped.width}x${cropped.height} ${cropped.label ?? ''}`);

  let cropError = null;
  try {
    await call('screen_capture_window', { pid: target.pid, crop: { x: 0, y: 0, width: 99999, height: 200 } });
  } catch (error) {
    cropError = error.message;
  }
  check('crop outside the window fails', Boolean(cropError && /does not fit/.test(cropError)), cropError ?? 'no error');

  const hexId = `0x${Number(target.id).toString(16)}`;
  const byId = await call('screen_capture_window', { id: hexId });
  check('screen_capture_window by hex id', Boolean(byId.path), `${hexId} → ${byId.label ?? ''}`);
}

for (const dispose of disposers) dispose();
process.exit(0);
