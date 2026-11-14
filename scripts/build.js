import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { generateIcons } from './icons.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
generateIcons(root);
function check(directory) { for (const entry of readdirSync(directory, { withFileTypes: true })) { const file = resolve(directory, entry.name); if (entry.isDirectory()) check(file); else if (entry.name.endsWith('.js')) { const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' }); if (result.status !== 0) process.exit(result.status || 1); } } }
for (const folder of ['server', 'src', 'scripts', 'public', 'tests']) check(resolve(root, folder));
const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8'));
for (const icon of manifest.icons) readFileSync(resolve(root, 'public', icon.src.slice(1)));
const dist = resolve(root, 'dist'); mkdirSync(dist, { recursive: true });
for (const folder of ['public', 'server', 'src']) cpSync(resolve(root, folder), resolve(dist, folder), { recursive: true });
writeFileSync(resolve(dist, 'package.json'), JSON.stringify({ name: 'athleteconnect', private: true, type: 'module', engines: { node: '>=22.13' }, scripts: { start: 'node server/index.js' } }, null, 2));
console.log('Build passed. Self-contained Node app written to dist/. No dependencies or API keys required.');
