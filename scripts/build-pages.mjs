// Public allowlists: the Worker app and the old Pages entry point.
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commit = process.argv[2] || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Expected a full Git commit SHA');
const appUrl = 'https://internmatch-api.entrace-space.workers.dev/';
function bundle(directory, entries) {
  const out = join(root, directory), files = {};
  rmSync(out, { recursive: true, force: true }); mkdirSync(out);
  for (const [name, bytes] of entries) {
    files[name] = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(join(out, name), bytes);
  }
  writeFileSync(join(out, 'release.json'), JSON.stringify({ commit, appUrl, files }) + '\n');
}
bundle('.app', ['index.html', 'config.js', 'profile-ui.js', 'profile-ui.css'].map(name => [name, readFileSync(join(root, name))]));
bundle('.pages', [
  ['index.html', `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; base-uri 'none'"><title>เปิด InternMatch</title><h1>InternMatch</h1><p>กำลังเปิดหน้าฝึกงานของคุณ…</p><p><a href="${appUrl}">กดเปิด InternMatch</a></p><script src="legacy-redirect.js"></script></html>`],
  ['legacy-redirect.js', `// Discard legacy credentials without reading or forwarding them.\nfor (const name of ['localStorage','sessionStorage']) try { window[name].removeItem('im_token'); } catch {}\nlocation.replace(${JSON.stringify(appUrl)} + location.hash);\n`],
]);
console.log(`Public artifacts ready: ${commit} (Worker app + Pages launcher)`);
