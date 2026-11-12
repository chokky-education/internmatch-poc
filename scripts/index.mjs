import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STORE = join(ROOT, '.local-index');
const VERSION = '2';
const extensions = new Set(['.md','.html','.htm','.js','.mjs','.json','.css','.txt','.sql','.toml','.csv']);
const ignoredDirs = new Set(['node_modules','.git','.local-index','.cursor','.vscode','dist','build']);
const ignoredFiles = new Set(['package-lock.json','pnpm-lock.yaml']);
const sha = value => createHash('sha256').update(value).digest('hex');
const clip = (s,n) => s.length > n ? s.slice(0,Math.max(0,n-1))+'…' : s;
const compact = s => s.replace(/\s+/gu,' ').trim();

function parseArgs(argv) {
  const command = argv.shift() ?? 'status';
  const options = {};
  const words = [];
  while(argv.length){
    const arg = argv.shift();
    if(arg.startsWith('--')){
      const name = arg.slice(2);
      if(['json','no-refresh','brief','chunks'].includes(name)) options[name] = true;
      else {
        if(!argv.length) throw new Error(`Missing --${name} value`);
        options[name] = argv.shift();
      }
    } else words.push(arg);
  }
  return { command, options, query: words.join(' ') };
}

const { command, options, query } = parseArgs(process.argv.slice(2));
const cap = Math.min(16000, Math.max(500, Number(options['max-chars'] ?? 2500)));
const limit = Math.min(20, Math.max(1, Number(options.limit ?? 5)));
if(!Number.isFinite(cap) || !Number.isInteger(limit)) throw new Error('Invalid output limit');
if(options.kind && !['doc','code','spec','schema'].includes(options.kind)) {
  throw new Error('kind must be: doc | code | spec | schema');
}

const pathFilter = options.path?.replaceAll('\\','/').replace(/^\.\//,'').replace(/\/$/,'');
if(options.path && (!pathFilter || pathFilter.startsWith('/') || pathFilter.split('/').some(part=>part==='..'))) {
  throw new Error('--path must be a project-relative file or directory');
}

const scopeSql = pathFilter ? ' AND (c.source=? OR instr(c.source,?)=1)' : '';
const scopeArgs = pathFilter ? ['file:'+pathFilter, 'file:'+pathFilter+'/'] : [];

if(['search','files'].includes(command) && query.length > 300) {
  throw new Error('Keep search query under 300 characters');
}

if(command === 'help') {
  console.log(`InternMatch Local Agent Index
node scripts/index.mjs search "keywords" [--kind doc|code|spec|schema] [--limit 5] [--max-chars 2500] [--path path/] [--brief] [--chunks] [--json]
node scripts/index.mjs files [filename keywords] [--path path/] [--kind doc|code|spec]
node scripts/index.mjs show <id> [--around keyword] [--context 3] [--max-chars 6000]
node scripts/index.mjs refresh
node scripts/index.mjs status
`);
  process.exit(0);
}

if(!['search','files','show','refresh','status'].includes(command)) {
  throw new Error('Use search, files, show, refresh, status, or help');
}

mkdirSync(STORE, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(join(STORE, 'index.sqlite'));
db.exec(`
  PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sources(key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS chunks(id TEXT PRIMARY KEY, source TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, ref TEXT NOT NULL, body TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS chunks_source ON chunks(source);
  CREATE VIRTUAL TABLE IF NOT EXISTS lookup USING fts5(id UNINDEXED, title, ref, body, tokenize='trigram');
`);

if(db.prepare("SELECT value FROM meta WHERE key='version'").get()?.value !== VERSION) {
  db.exec("DELETE FROM sources; DELETE FROM chunks; DROP TABLE lookup; CREATE VIRTUAL TABLE lookup USING fts5(id UNINDEXED, title, ref, body, tokenize='trigram');");
  db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('version', VERSION);
}

const stats = { changed: 0, removed: 0, skipped: 0, filesRead: 0 };
const seen = new Set();

function removeSource(key) {
  const rows = db.prepare('SELECT id FROM chunks WHERE source=?').all(key);
  for(const row of rows) db.prepare('DELETE FROM lookup WHERE id=?').run(row.id);
  db.prepare('DELETE FROM chunks WHERE source=?').run(key);
  db.prepare('DELETE FROM sources WHERE key=?').run(key);
}

function isChanged(key, fingerprint) {
  seen.add(key);
  if(db.prepare('SELECT fingerprint FROM sources WHERE key=?').get(key)?.fingerprint === fingerprint) {
    stats.skipped++;
    return false;
  }
  return true;
}

function upsert(key, fingerprint, parts) {
  removeSource(key);
  for(const [i, part] of parts.entries()) {
    const id = sha(key + ':' + i).slice(0, 16);
    db.prepare('INSERT INTO chunks VALUES (?,?,?,?,?,?)').run(id, key, part.kind, part.title, part.ref, part.body);
    db.prepare('INSERT INTO lookup VALUES (?,?,?,?)').run(id, part.title, part.ref, part.body);
  }
  db.prepare('INSERT INTO sources VALUES (?,?)').run(key, fingerprint);
  stats.changed++;
}

function chunks(text, kind, title, ref) {
  const parts = [];
  const lines = text.split('\n');
  let body = '', start = 1;
  for(let i = 0; i < lines.length; i++) {
    if(body && (body.length + lines[i].length > 2200 || i + 1 - start >= 40)) {
      parts.push({ kind, title, ref: `${ref}:${start}`, body });
      body = '';
      start = i + 1;
    }
    body += (body ? '\n' : '') + lines[i];
  }
  if(body) parts.push({ kind, title, ref: `${ref}:${start}`, body });
  return parts;
}

function classifyKind(path) {
  if(path === 'PRD.md' || path === 'UI_UX_SPEC.md' || path.startsWith('docs/superpowers/')) return 'spec';
  if(path.endsWith('.md') || path.endsWith('.csv')) return 'doc';
  if(path.endsWith('.json') || path.endsWith('.sql') || path.endsWith('.toml')) return 'schema';
  return 'code';
}

function walk(dir) {
  for(const entry of readdirSync(dir, { withFileTypes: true })) {
    if(entry.name.startsWith('.') && entry.name !== '.local-index') {
      if(ignoredDirs.has(entry.name)) continue;
    }
    if(entry.isDirectory()) {
      if(ignoredDirs.has(entry.name)) continue;
      walk(join(dir, entry.name));
      continue;
    }
    const ext = extname(entry.name).toLowerCase();
    if(!extensions.has(ext) || ignoredFiles.has(entry.name)) continue;
    const full = join(dir, entry.name);
    const rel = relative(ROOT, full).replaceAll('\\','/');
    stats.filesRead++;
    const st = statSync(full);
    const key = 'file:' + rel;
    const fingerprint = `${st.size}:${st.mtimeMs}`;
    if(!isChanged(key, fingerprint)) continue;
    const content = readFileSync(full, 'utf8');
    const kind = classifyKind(rel);
    const title = rel;
    upsert(key, fingerprint, chunks(content, kind, title, rel));
  }
}

function overview() {
  const kinds = db.prepare('SELECT kind, COUNT(*) AS chunks, COUNT(DISTINCT source) AS sources FROM chunks GROUP BY kind').all();
  return { project: ROOT, updated: db.prepare("SELECT value FROM meta WHERE key='updated'").get()?.value, kinds };
}

// INDEX.md is hand-maintained (it used to be regenerated from a stale template
// here, which silently wiped edits). Only warn if it is missing.
function writeMap() {
  if(!existsSync(join(ROOT, 'INDEX.md'))) console.error('warning: INDEX.md missing; restore it from git');
}

const started = performance.now();
if(!options['no-refresh']) {
  db.exec('BEGIN IMMEDIATE');
  try {
    walk(ROOT);
    for(const { key } of db.prepare('SELECT key FROM sources').all()) {
      if(!seen.has(key)) {
        removeSource(key);
        stats.removed++;
      }
    }
    db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('updated', new Date().toISOString());
    db.exec('COMMIT');
  } catch(error) {
    db.exec('ROLLBACK');
    throw error;
  }
  writeMap();
}

function emit(value, text) {
  if(!options.json) {
    console.log(clip(text, cap));
    return;
  }
  let output = JSON.stringify(value);
  if(output.length > cap) {
    value.truncated = true;
    if(Array.isArray(value.results)) {
      while(value.results.length && JSON.stringify(value).length > cap) value.results.pop();
    }
    output = JSON.stringify(value);
  }
  console.log(output);
}

if(command === 'refresh' || command === 'status') {
  const value = { ...overview(), refresh: stats, elapsedMs: Math.round(performance.now() - started) };
  emit(value, JSON.stringify(value, null, 2));
}

if(command === 'show') {
  if(!query) throw new Error('show requires a result id');
  const row = db.prepare('SELECT * FROM chunks WHERE id=?').get(query);
  if(!row) {
    console.error('Result no longer exists; search again.');
    process.exitCode = 1;
  } else {
    let body = row.body, ref = row.ref;
    if(options.around) {
      const context = Number(options.context ?? 3);
      if(!Number.isInteger(context) || context < 0 || context > 10) throw new Error('--context must be an integer from 0 to 10');
      const lines = body.split('\n');
      const match = lines.findIndex(line => line.toLocaleLowerCase().includes(options.around.toLocaleLowerCase()));
      if(match < 0) throw new Error('Keyword not in this chunk; search again with --chunks');
      const first = Math.max(0, match - context), last = Math.min(lines.length, match + context + 1);
      body = lines.slice(first, last).join('\n');
      if(row.source.startsWith('file:')) ref = ref.replace(/:(\d+)$/, (_, line) => ':' + (Number(line) + first));
    }
    emit({ id: row.id, kind: row.kind, title: row.title, ref, body }, `${row.id} [${row.kind}] ${row.title}\n${ref}\n\n${body}`);
  }
}

if(command === 'files') {
  const terms = query.trim().split(/\s+/u).filter(Boolean);
  const termSql = terms.map(() => " AND instr(lower(c.source||' '||c.title),lower(?))>0").join('');
  const rows = db.prepare(`SELECT c.source, c.kind, c.title, COUNT(*) AS chunks FROM chunks c WHERE c.source LIKE 'file:%' ${options.kind ? 'AND c.kind=?' : ''}${scopeSql}${termSql} GROUP BY c.source ORDER BY c.source LIMIT ?`).all(...(options.kind ? [options.kind] : []), ...scopeArgs, ...terms, limit);
  const results = rows.map(row => ({ id: sha(row.source + ':0').slice(0, 16), kind: row.kind, path: row.source.slice(5), title: clip(row.title, 150), chunks: row.chunks }));
  emit({ query, results, elapsedMs: Math.round(performance.now() - started) }, results.length ? results.map(row => `${row.id} [${row.kind}] ${row.path}${options.brief ? '' : ` (${row.chunks} chunks)`}`).join('\n') : 'ไม่พบไฟล์ ลองใช้ชื่อสั้นลงหรือเปลี่ยน --path');
}

if(command === 'search') {
  if(!query.trim()) throw new Error('search requires keywords');
  const terms = query.trim().split(/\s+/u);
  const long = terms.filter(t => [...t].length >= 3);
  const termSql = terms.map(() => " AND instr(lower(c.title||' '||c.ref||' '||c.body),lower(?))>0").join('');
  const filters = `${options.kind ? ' AND c.kind=?' : ''}${scopeSql}${termSql}`;
  const args = [...(options.kind ? [options.kind] : []), ...scopeArgs, ...terms];
  const expression = long.map(t => '"' + t.replaceAll('"', '""') + '"').join(' AND ');
  const statement = long.length
    ? db.prepare(`SELECT c.*, bm25(lookup, 0, 8, 2, 1) AS score FROM lookup JOIN chunks c ON c.id=lookup.id WHERE lookup MATCH ? ${filters} ORDER BY score, c.ref LIMIT ? OFFSET ?`)
    : db.prepare(`SELECT c.*, 0 AS score FROM chunks c WHERE 1=1 ${filters} ORDER BY c.ref LIMIT ? OFFSET ?`);
  const selected = [], sources = new Set();
  let offset = 0;
  while(selected.length < limit) {
    const rows = statement.all(...(long.length ? [expression] : []), ...args, 100, offset);
    if(!rows.length) break;
    offset += rows.length;
    for(const row of rows) {
      if(!options.chunks && sources.has(row.source)) continue;
      sources.add(row.source);
      const text = compact(row.body);
      const first = terms.map(t => text.toLocaleLowerCase().indexOf(t.toLocaleLowerCase())).filter(i => i >= 0);
      const start = Math.max(0, (first.length ? Math.min(...first) : 0) - 60);
      selected.push(options.brief ? { id: row.id, kind: row.kind, ref: row.ref } : { id: row.id, kind: row.kind, title: clip(row.title, 150), ref: row.ref, excerpt: (start ? '…' : '') + clip(text.slice(start), 240) });
      if(selected.length >= limit) break;
    }
  }
  const value = { query, results: selected, elapsedMs: Math.round(performance.now() - started) };
  const text = selected.length ? selected.map(r => options.brief ? `${r.id} [${r.kind}] ${r.ref}` : `${r.id} [${r.kind}] ${r.title}\n${r.ref}\n${r.excerpt}`).join('\n\n') : 'ไม่พบผลลัพธ์ ลองใช้คำค้นสั้นลงหรือเปลี่ยน --kind';
  emit(value, text);
}

db.close();
