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

const target = windows.windows.find((window) => window.width > 100 && window.height > 100);
if (target) {
  const byPid = await call('screen_capture_window', { pid: target.pid });
  check('screen_capture_window by pid', Boolean(byPid.path), `${byPid.width}x${byPid.height} pid ${target.pid}`);

  const byTitle = await call('screen_capture_window', { title: target.title.slice(0, 8) });
  check('screen_capture_window by title', Boolean(byTitle.path), `${byTitle.width}x${byTitle.height}`);
}

for (const dispose of disposers) dispose();
process.exit(0);
