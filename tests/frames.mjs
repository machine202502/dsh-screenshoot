import { apply } from '../index.js';

const tools = new Map();
const disposers = [];
const ctx = {
  tools: { register: (definition) => tools.set(definition.name, definition) },
  effect: (fn) => { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); },
};

const PORT = 49299;
apply(ctx, { bridgePort: PORT });
console.log('tools:', [...tools.keys()].join(', '));

const check = (name, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);

const windows = await tools.get('screen_windows').execute({ limit: 5 });
const target = windows.windows.find((window) => window.width > 200 && window.height > 200);
check('window target', Boolean(target), target ? `${target.process} ${target.width}x${target.height}` : '');

const shot = await tools.get('screen_capture_window').execute({ pid: target.pid });
check('capture has frame id', Boolean(shot.frame), shot.frame ?? 'none');

const rendered = tools.get('screen_capture_window').output.render({}, shot).map((part) => part.text).join('\n');
check('render carries marker', /\[shot:[^\]]+\]/.test(rendered), rendered.slice(0, 120));

if (shot.frame) {
  const response = await fetch(`http://127.0.0.1:${PORT}/shot/${shot.frame}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  check('frame served', response.ok && response.headers.get('content-type') === 'image/png', `${buffer.length} bytes, ${response.headers.get('content-type')}`);
}

for (const dispose of disposers) dispose();
