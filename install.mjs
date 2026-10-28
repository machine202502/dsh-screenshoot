#!/usr/bin/env node
/**
 * Install dsh-screenshoot into a DSH profile.
 *
 *   npx --yes github:machine202502/dsh-screenshoot
 *   node install.mjs --profile desktop
 *   node install.mjs --uninstall
 */
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PACKAGE = 'dsh-screenshoot';
const SPEC = 'github:machine202502/dsh-screenshoot';

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const uninstall = has('uninstall');
const dryRun = has('dry-run');
const dshHome = flag('home', process.env.DSH_HOME ?? join(homedir(), '.dsh'));
const profilesRoot = join(dshHome, 'profiles');
const profileName = flag('profile', 'desktop');
const profileDir = join(profilesRoot, profileName);
const spec = flag('spec', SPEC);

const fail = (message) => {
  console.error(`dsh-screenshoot: ${message}`);
  process.exit(1);
};

if (!existsSync(profilesRoot)) fail(`no DSH profiles at ${profilesRoot}; start DSH once first`);
if (!existsSync(join(profileDir, 'package.json'))) {
  const available = readdirSync(profilesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  fail(`profile "${profileName}" not found; available: ${available.join(', ') || '(none)'}`);
}

const manifestPath = join(profileDir, 'package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.dependencies ??= {};
manifest.dsh ??= {};
manifest.dsh.profile ??= {};

if (uninstall) {
  delete manifest.dependencies[PACKAGE];
  manifest.dsh.profile.bundles = (manifest.dsh.profile.bundles ?? []).filter((name) => name !== PACKAGE);
} else {
  manifest.dependencies[PACKAGE] = spec;
  const bundles = manifest.dsh.profile.bundles ?? [];
  if (!bundles.includes(PACKAGE)) bundles.push(PACKAGE);
  manifest.dsh.profile.bundles = bundles;
}

const backup = `${manifestPath}.bak-dsh-${Date.now()}`;
if (!dryRun) copyFileSync(manifestPath, backup);
const next = `${JSON.stringify(manifest, null, 2)}\n`;
if (dryRun) {
  console.log(`would write ${manifestPath}:\n${next}`);
  process.exit(0);
}
writeFileSync(manifestPath, next, 'utf8');
console.log(`manifest updated (backup: ${backup})`);

const proxy = process.env.npm_config_proxy ?? 'http://127.0.0.1:10901';
const args = ['install', `--config.proxy=${proxy}`, `--config.https-proxy=${proxy}`];
const direct = spawnSync('pnpm', ['--version'], { encoding: 'utf8', shell: true });
const runner = direct.status === 0
  ? { command: 'pnpm', args }
  : { command: 'npx', args: ['--yes', 'pnpm', ...args] };

const install = spawnSync(runner.command, runner.args, {
  cwd: profileDir,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, npm_config_proxy: proxy, npm_config_https_proxy: proxy },
});
if (install.status !== 0) fail(`package manager exited with ${install.status}`);

console.log(uninstall
  ? '\nRemoved. Restart DSH to apply.'
  : `\nInstalled from ${spec}. Restart DSH: the screen tools appear in the tool list.`);
