import { readdirSync, readFileSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { generateIcons } from './icons.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
generateIcons(root);
const output = resolve(root, 'hosted/output');
mkdirSync(resolve(output, 'server'), { recursive: true });
mkdirSync(resolve(output, '.openai'), { recursive: true });
mkdirSync(resolve(output, 'drizzle/meta'), { recursive: true });
const hosting = { project_id: 'appgprj_6af8a4da678881919b1f44a159ed213f', d1: 'DB', r2: 'BUCKET' };
writeFileSync(resolve(output, '.openai/hosting.json'), JSON.stringify(hosting, null, 2) + '\n');
const assets = {};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
function add(directory, prefix = '') {
  for (const file of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, file.name); const key = prefix + '/' + file.name;
    if (file.isDirectory()) add(path, key);
    else {
      const extension = extname(file.name); if (!types[extension]) continue;
      const binary = extension === '.png'; let content = readFileSync(path, binary ? undefined : 'utf8');
      if (key === '/app.js') {
        const first = content.indexOf('function authPage(mode) {'), last = content.indexOf('const menus = {');
        if (first < 0 || last < first) throw new Error('The local app auth screen changed. Update the hosted adapter before building.');
        content = content.slice(0, first) + readFileSync(resolve(root, 'hosted/auth-screen.js.txt'), 'utf8') + '\n' + content.slice(last);
        content = content.replaceAll('Local build', 'Private phone test').replaceAll('Development build', 'Private phone test').replaceAll('Development build · No payments collected', 'Private test · No payments collected');
        content = content.replace('The current localhost address runs on this computer. Your iPhone cannot open the computer’s localhost address. A hosted HTTPS address is needed for installation and reliable phone use.', 'Use this private HTTPS address in Chrome on your iPhone. Sign in with the same ChatGPT account, then select a test role. Home Screen installation depends on your iOS and Chrome versions.');
        content = content.replace('Once this app is hosted on an HTTPS address, open it in Safari, tap <strong>Share → Add to Home Screen</strong>, and choose <strong>Open as Web App</strong> if shown.', 'Open this address in Chrome on your iPhone. In the Share menu, choose <strong>Add to Home Screen</strong> if available, then <strong>Open as Web App</strong> if shown. You can keep using the app directly in Chrome either way.');
      }
      assets[key] = { mime: types[extension], body: binary ? content.toString('base64') : content, base64: binary };
    }
  }
}
add(resolve(root, 'public'));
assets['/'] = assets['/index.html'];
assets['/src/domain.js'] = { mime: types['.js'], body: readFileSync(resolve(root, 'src/domain.js'), 'utf8'), base64: false };
writeFileSync(resolve(output, 'server/assets.js'), 'export default ' + JSON.stringify(assets) + ';\n');
for (const file of ['worker.js', 'store.js', 'sandbox.js']) {
  const content = readFileSync(resolve(root, 'hosted', file), 'utf8').replaceAll("'../src/domain.js'", "'./domain.js'");
  writeFileSync(resolve(output, 'server', file), content);
}
copyFileSync(resolve(root, 'src/domain.js'), resolve(output, 'server/domain.js'));
writeFileSync(resolve(output, 'server/index.js'), "import {createPhoneWorker} from './worker.js';\nimport assets from './assets.js';\nexport default createPhoneWorker(assets);\n");
writeFileSync(resolve(output, 'package.json'), '{"type":"module","private":true}\n');
copyFileSync(resolve(root, 'hosted/migrations/0000_phone_sandboxes.sql'), resolve(output, 'drizzle/0000_phone_sandboxes.sql'));
writeFileSync(resolve(output, 'drizzle/meta/_journal.json'), JSON.stringify({ version: '7', dialect: 'sqlite', entries: [{ idx: 0, version: '6', when: 1794700800000, tag: '0000_phone_sandboxes', breakpoints: true }] }, null, 2));
for (const file of readdirSync(resolve(output, 'server')).filter(file => file.endsWith('.js'))) {
  const check = spawnSync(process.execPath, ['--check', resolve(output, 'server', file)], { stdio: 'inherit' }); if (check.status) process.exit(check.status);
}
const client = resolve(output, 'client-check.js');
writeFileSync(client, assets['/app.js'].body);
const result = spawnSync(process.execPath, ['--check', client], { stdio: 'inherit' }); if (result.status) process.exit(result.status);
console.log('Private hosted build passed: hosted/output/. Not published. Hosted storage migrations and private access must be applied through Sites.');
