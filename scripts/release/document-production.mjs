// Reviewed production smoke: one reserved test identity, no external messages.
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { executeD1 } from './d1-query.mjs';
import { checkDocumentFlow } from '../uat/document-flow.mjs';

const sha = process.argv[2], root = resolve(import.meta.dirname, '../..');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(sha || '') || git(['rev-parse','HEAD']) !== sha || git(['status','--porcelain'])) throw Error('Use a clean checkout of the exact merged revision');
git(['merge-base','--is-ancestor',sha,'origin/main']);
if (!process.env.INTERNMATCH_RELEASE_DIR || !process.env.INTERNMATCH_PLAYWRIGHT_MODULE) throw Error('Set a private release directory and installed Playwright module path');
const privateDir = resolve(process.env.INTERNMATCH_RELEASE_DIR);
mkdirSync(privateDir, { recursive: true, mode: 0o700 });
if (statSync(privateDir).mode & 0o077) throw Error('Release directory must be private');
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const hash = value => createHash('sha256').update(value).digest('hex');
let sequence = 0;
function query(sql) {
  const file = resolve(privateDir, `documents-${++sequence}.sql`);
  writeFileSync(file, sql, { mode: 0o600 });
  try { return executeD1(sql, file, { cwd: resolve(root, 'worker') })[0]?.results || []; }
  catch { throw Error('Private document-smoke fixture operation failed'); }
}
const id = 'documents-smoke-' + randomBytes(8).toString('hex'), email = id + '@example.invalid';
const token = randomBytes(32).toString('hex'), results = [], base = 'https://internmatch-api.entrace-space.workers.dev';
const links = () => hash(JSON.stringify(query(`SELECT id,line_user_id FROM users WHERE id<>${literal(id)} ORDER BY id`)));
const beforeLinks = links();
writeFileSync(resolve(privateDir, 'documents-fixture.json'), JSON.stringify({ id, email }), { mode: 0o600 });
let created = false;
try {
  created = true;
  query(`INSERT INTO users(id,email,created_at) VALUES (${literal(id)},${literal(email)},${literal(new Date().toISOString())}); INSERT INTO sessions(token,user_id,expires_at) VALUES (${literal('v2:' + hash(token))},${literal(id)},${literal(new Date(Date.now() + 3600000).toISOString())})`);
  const pw = await import(pathToFileURL(process.env.INTERNMATCH_PLAYWRIGHT_MODULE));
  for (const engine of ['chromium','webkit']) {
    const browser = await pw[engine].launch({ headless: true });
    try {
      const context = await browser.newContext(engine === 'webkit' ? { ...pw.devices['iPhone 13'] } : { viewport: { width: 1280, height: 900 } });
      await context.addCookies([{ name: '__Host-im_session', value: token, url: base, httpOnly: true, secure: true, sameSite: 'Lax' }]);
      results.push(await checkDocumentFlow(await context.newPage(), { base, label: engine, outputDir: privateDir }));
      console.log(JSON.stringify({ engine, ok: true, scope: 'manual document API and browser flow; synthetic session' }));
    } finally { await browser.close(); }
  }
} finally {
  if (created) {
    const tables = ['sessions','applications','tasks','documents','reminders','messages','extractions','audit_log','milestones','pending_actions','seasons','users'];
    const key = table => table === 'users' ? 'id' : 'user_id';
    query(tables.map(table => `DELETE FROM ${table} WHERE ${key(table)}=${literal(id)}`).join(';\n'));
    const remaining = query(tables.map(table => `SELECT ${literal(table)} AS name,COUNT(*) AS n FROM ${table} WHERE ${key(table)}=${literal(id)}`).join(' UNION ALL '));
    if (remaining.some(row => row.n)) throw Error('Document-smoke fixture cleanup incomplete');
  }
  if (links() !== beforeLinks) throw Error('Existing account/LINE-link fingerprint changed during smoke');
}
writeFileSync(resolve(privateDir, 'documents-result.json'), JSON.stringify({ sha, ok: true, results, fixture_cleanup: true, existing_links_unchanged: true, external_messages_sent: false }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ ok: true, fixture_cleanup: true, existing_links_unchanged: true, external_messages_sent: false }));
