import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

const source = readFileSync(new URL('../check-docs.mjs', import.meta.url), 'utf8');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'internmatch-guards-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (name, body) => { mkdirSync(join(root, name, '..'), { recursive: true }); writeFileSync(join(root, name), body); };
  put('scripts/check-docs.mjs', source);
  put('worker/src/main.js', 'export const ready = true;');
  put('worker/wrangler.toml', 'name="test"');
  put('INDEX.md', 'worker/src/main.js AGENTS.md docs/STATUS.md PRD.md UI_UX_SPEC.md docs/adr/');
  put('CLAUDE.md', '@AGENTS.md'); put('GEMINI.md', 'Read AGENTS.md');
  put('index.html', '<html></html>'); put('config.js', 'window.IM_API="https://example.test";');
  put('docs/adr/0001-test.md', 'Existing decision'); put('docs/STATUS.md', 'Initial');
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.test');
  git('add', '.'); git('commit', '-qm', 'baseline');
  const check = (...args) => spawnSync(process.execPath, ['scripts/check-docs.mjs', ...args], { cwd: root, encoding: 'utf8' });
  return { put, git, check };
}

test('a secret in a newly added browser file blocks the check without leaking its value', t => {
  const f = fixture(t), key = 'AIza' + 'x'.repeat(35);
  f.put('browser/new-feature.js', `const credential = '${key}';`);
  f.git('add', '.');
  const r = f.check();
  assert.equal(r.status, 1); assert.match(r.stderr, /browser\/new-feature.js/);
  assert.ok(!r.stderr.includes(key));
});

test('nested backend modules are checked without reading a directory as a file', t => {
  const f = fixture(t);
  f.put('worker/src/nested/helper.js', 'export const helper = true;');
  f.put('INDEX.md', 'worker/src/main.js worker/src/nested/helper.js AGENTS.md docs/STATUS.md PRD.md UI_UX_SPEC.md docs/adr/');
  f.git('add', '.');
  const r = f.check(); assert.equal(r.status, 0, r.stderr);
});

test('local uncommitted code changes require a handoff update', t => {
  const f = fixture(t); f.put('worker/src/main.js', 'export const ready = false;');
  const r = f.check('--base', 'HEAD');
  assert.equal(r.status, 1); assert.match(r.stderr, /STATUS.md did not/);
  f.put('docs/STATUS.md', 'Updated behavior');
  assert.equal(f.check('--base', 'HEAD').status, 0);
});

test('a missing comparison ref fails closed', t => {
  const r = fixture(t).check('--base');
  assert.equal(r.status, 1); assert.match(r.stderr, /--base/);
});

test('index upgrade rebuilds unchanged specs that were previously classified as docs', t => {
  const root = mkdtempSync(join(tmpdir(), 'internmatch-index-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts')); mkdirSync(join(root, 'docs/superpowers/specs'), { recursive: true });
  const script = readFileSync(new URL('../index.mjs', import.meta.url), 'utf8');
  const legacy = script.replace(/const VERSION = '[^']+';/, "const VERSION = '1';")
    .replace(" || path.startsWith('docs/superpowers/')", '');
  writeFileSync(join(root, 'scripts/index.mjs'), legacy);
  writeFileSync(join(root, 'INDEX.md'), '# Hand-maintained map');
  writeFileSync(join(root, 'docs/superpowers/specs/example.md'), 'migrationneedle unchanged specification');
  execFileSync(process.execPath, ['scripts/index.mjs', 'refresh'], { cwd: root });
  writeFileSync(join(root, 'scripts/index.mjs'), script);
  const output = execFileSync(process.execPath, ['scripts/index.mjs', 'search', 'migrationneedle', '--kind', 'spec'], { cwd: root, encoding: 'utf8' });
  assert.match(output, /docs\/superpowers\/specs\/example.md/);
  assert.equal(readFileSync(join(root, 'INDEX.md'), 'utf8'), '# Hand-maintained map');
});
