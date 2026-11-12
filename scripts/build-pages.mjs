// Publish only explicit public files, never the repository or Worker sources.
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commit = process.argv[2] || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Expected a full Git commit SHA');
const out = join(root, '.pages');
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
const files = {};
for (const name of ['index.html', 'config.js']) {
  const bytes = readFileSync(join(root, name));
  files[name] = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(join(out, name), bytes);
}
writeFileSync(join(out, 'release.json'), JSON.stringify({ commit, files }) + '\n');
console.log(`Pages artifact ready: ${commit}, ${Object.keys(files).length} public files`);
