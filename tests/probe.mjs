import { listMonitors, listWindows, captureMonitor, captureRegion, captureWindow } from '../src/win32.js';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const out = join(tmpdir(), 'hsb-screenshoot-probe');
const check = (name, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);

const monitors = await listMonitors();
check('monitors', monitors.length > 0, monitors.map((m) => `${m.width}x${m.height}@${m.x},${m.y}${m.primary ? '*' : ''}`).join(' | '));

const windows = await listWindows();
check('windows', windows.length > 0, `${windows.length} windows`);

const target = windows.find((window) => !window.minimized && window.width > 200 && window.height > 200);
check('window found', Boolean(target), target ? `${target.process} ${target.width}x${target.height}` : '');

const monitor = await captureMonitor({ index: 0, shot: join(out, 'monitor.png') });
check('capture monitor', existsSync(monitor.shot), `${Math.round(statSync(monitor.shot).size / 1024)} KB`);

const region = await captureRegion({ x: 10, y: 10, width: 300, height: 200, shot: join(out, 'region.png') });
check('capture region', existsSync(region.shot), `${Math.round(statSync(region.shot).size / 1024)} KB`);

if (target) {
  const byPid = await captureWindow({ pid: target.pid, shot: join(out, 'window.png') });
  check('capture window by pid', existsSync(byPid.shot), `${Math.round(statSync(byPid.shot).size / 1024)} KB, handle ${byPid.handle ?? '?'}`);
}
