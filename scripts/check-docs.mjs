#!/usr/bin/env node
// Guardrails that run the same for every model and harness (CI + locally).
// Usage: node scripts/check-docs.mjs [--base origin/main]
// Exit 1 with a list of fixes when any rule fails.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(ROOT, p), 'utf8');
const errors = [];
const fail = (rule, fix) => errors.push(`✗ ${rule}\n    fix: ${fix}`);

// 1. Every backend module and doc folder entry is on the map.
const index = read('INDEX.md');
for (const f of readdirSync(join(ROOT, 'worker/src')).filter(f => f.endsWith('.js'))) {
  if (!index.includes(`worker/src/${f}`)) fail(`INDEX.md does not mention worker/src/${f}`, 'add a row for it in the Backend table of INDEX.md');
}
for (const f of ['AGENTS.md', 'docs/STATUS.md', 'PRD.md', 'UI_UX_SPEC.md', 'docs/adr/']) {
  if (!index.includes(f)) fail(`INDEX.md does not mention ${f}`, `add ${f} to INDEX.md`);
}

// 2. Harness pointer files stay pointers (one source of truth: AGENTS.md).
for (const f of ['CLAUDE.md', 'GEMINI.md']) {
  if (!existsSync(join(ROOT, f))) { fail(`${f} is missing`, `restore ${f} from git; it must point at AGENTS.md`); continue; }
  const s = read(f);
  if (!s.includes('AGENTS.md')) fail(`${f} does not point at AGENTS.md`, `make ${f} reference AGENTS.md`);
  if (s.length > 600) fail(`${f} has grown past a pointer (${s.length} chars)`, `move the instructions into AGENTS.md and leave ${f} as a pointer`);
}

// 3. ADRs are numbered 0001, 0002, ... with no gaps or duplicates.
const adrs = readdirSync(join(ROOT, 'docs/adr')).filter(f => f.endsWith('.md')).sort();
adrs.forEach((f, i) => {
  const want = String(i + 1).padStart(4, '0');
  if (!f.startsWith(want + '-')) fail(`docs/adr/${f} breaks the numbering (expected ${want}-…)`, 'renumber ADRs sequentially with no gaps or duplicates');
});

// 4. No secrets in files that ship to the browser or sit in git.
const SECRET = [
  [/AIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'secret key (sk-…)'],
  [/xkeysib-[0-9a-f]{20,}/, 'Brevo API key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/(api[_-]?key|secret|access[_-]?token)\s*[:=]\s*['"][A-Za-z0-9+/_=-]{24,}['"]/i, 'hard-coded credential'],
];
const scan = ['index.html', 'config.js', 'worker/wrangler.toml'];
for (const f of readdirSync(join(ROOT, 'worker/src'))) scan.push(`worker/src/${f}`);
for (const f of scan) {
  const s = read(f);
  for (const [re, what] of SECRET) if (re.test(s)) fail(`${f} contains a ${what}`, 'remove it and store it with `wrangler secret put` (see docs/line-setup.md)');
}

// 5. A change to code must come with a STATUS.md update (handoff for the next agent).
const baseArg = process.argv.indexOf('--base');
const base = baseArg > -1 ? process.argv[baseArg + 1] : process.env.CHECK_BASE;
if (base) {
  let changed = [];
  try {
    const mb = execFileSync('git', ['merge-base', base, 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    changed = execFileSync('git', ['diff', '--name-only', mb, 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch (e) { fail(`cannot diff against ${base}`, 'fetch the base branch (actions/checkout with fetch-depth: 0)'); }
  const code = changed.filter(f => /^(index\.html|config\.js|worker\/(src|migrations)\/|scripts\/)/.test(f));
  if (code.length && !changed.includes('docs/STATUS.md')) {
    fail(`code changed (${code.slice(0, 3).join(', ')}${code.length > 3 ? ', …' : ''}) but docs/STATUS.md did not`, 'rewrite Now / In flight / Next in docs/STATUS.md and add one Log line');
  }
}

if (errors.length) {
  console.error(`check-docs: ${errors.length} problem(s)\n\n${errors.join('\n\n')}`);
  process.exit(1);
}
console.log(`check-docs: OK (${scan.length} files scanned${base ? `, diffed against ${base}` : ''})`);
