import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifyProduction } from '../verify-production.mjs';
const commit = 'a'.repeat(40), hash = s => createHash('sha256').update(s).digest('hex');
async function liveFixture(t, { staleCommit = false, staleAsset = false, brokenAuth = false } = {}) {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const apiUrl = `http://127.0.0.1:${server.address().port}`;
  const webUrl = apiUrl + '/legacy/';
  const html = '<title>InternMatch</title><div id="login"></div><script src="config.js"></script>';
  const config = 'window.IM_API = location.origin;';
  const launcher = '<title>เปิด InternMatch</title><script src="legacy-redirect.js"></script>';
  const redirect = `localStorage.removeItem('im_token');location.replace(${JSON.stringify(apiUrl + '/')});`;
  const appFiles = { 'index.html': html, 'config.js': config, 'profile-ui.js': 'profile script', 'profile-ui.css': 'profile style' };
  const launcherFiles = { 'index.html': launcher, 'legacy-redirect.js': redirect };
  server.on('request', (req, res) => {
    const path = new URL(req.url, apiUrl).pathname;
    const json = (body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.headers.origin === apiUrl) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Season-Id');
    }
    if (path === '/api/auth/logout') return json({ error: 'untrusted_origin' }, 403);
    if (path === '/release.json' || path === '/legacy/release.json') return json({ commit: staleCommit ? 'b'.repeat(40) : commit, files: Object.fromEntries(Object.entries(path.startsWith('/legacy/') ? launcherFiles : appFiles).map(([k,v]) => [k,hash(v)])) });
    const bundle = path.startsWith('/legacy/') ? launcherFiles : appFiles;
    const name = path.replace(/^\/legacy\//, '/').slice(1) || 'index.html';
    if (name in bundle) return res.end(staleAsset && name === 'index.html' ? 'old page' : bundle[name]);
    if (path === '/api/health') return json({ ok: true });
    if (path === '/api/state' && req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (path === '/api/me' || path === '/api/state') return json({ error: 'unauthorized' }, 401);
    if (path === '/api/auth/verify') return json({ ok: false, error: 'invalid' }, brokenAuth ? 500 : 401);
    if (path === '/line/webhook') return json({ error: 'bad_signature' }, 401);
    return json({ error: 'not_found' }, 404);
  });
  return { apiUrl, webUrl, commit };
}

test('checks the deployed revision, asset contents, CORS, auth and LINE signature gate', async t => {
  const checks = await verifyProduction(await liveFixture(t));
  assert.ok(checks.length >= 8);
});
test('an old release is a deployment failure', async t => {
  await assert.rejects(verifyProduction(await liveFixture(t, { staleCommit: true })), /revision/);
});
test('an updated marker with stale cached HTML is a deployment failure', async t => {
  await assert.rejects(verifyProduction(await liveFixture(t, { staleAsset: true })), /index.html/);
});
test('a failing OTP verification route is not hidden by a healthy health endpoint', async t => {
  await assert.rejects(verifyProduction(await liveFixture(t, { brokenAuth: true })), /OTP/);
});
test('Pages bundle includes only public assets and a revision manifest', t => {
  const root = mkdtempSync(join(tmpdir(), 'internmatch-pages-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts')); mkdirSync(join(root, 'worker'));
  writeFileSync(join(root, 'scripts/build-pages.mjs'), readFileSync(new URL('../build-pages.mjs', import.meta.url)));
  writeFileSync(join(root, 'index.html'), '<title>InternMatch</title>');
  writeFileSync(join(root, 'config.js'), 'window.IM_API="https://example.test";');
  writeFileSync(join(root,'profile-ui.js'),'profile script');
  writeFileSync(join(root,'profile-ui.css'),'profile style');
  writeFileSync(join(root, 'worker/.dev.vars'), 'must never be published');
  execFileSync(process.execPath, ['scripts/build-pages.mjs', commit], { cwd: root });
  assert.deepEqual(readdirSync(join(root, '.pages')).sort(), ['index.html', 'legacy-redirect.js', 'release.json']);
  const release = JSON.parse(readFileSync(join(root, '.pages/release.json')));
  assert.equal(release.commit, commit);
  const app = JSON.parse(readFileSync(join(root, '.app/release.json')));
  assert.equal(app.files['index.html'], hash('<title>InternMatch</title>'));
  assert.deepEqual(readdirSync(join(root,'.app')).sort(), ['config.js','index.html','profile-ui.css','profile-ui.js','release.json']);
  assert.ok(!readFileSync(join(root,'.pages/index.html'),'utf8').includes('id="login"'));
  const redirect=readFileSync(join(root,'.pages/legacy-redirect.js'),'utf8');
  assert.ok(redirect.indexOf('removeItem') < redirect.indexOf('location.replace'));
  assert.ok(!redirect.includes('location.search'));
});

 test('D1 read commands preserve result JSON; file writes accept import progress without exposing SQL',async()=>{
 const {executeD1}=await import('../release/d1-query.mjs');
 for(const sql of ['SELECT COUNT(*) n FROM users','PRAGMA table_info(users)']){const result=executeD1(sql,'private.sql',{run:(_,args)=>{assert.ok(args.includes('--command'));assert.equal(args.at(-1),sql);return '[{"results":[{"n":4}]}]';}});assert.equal(result[0].results[0].n,4);}
 assert.deepEqual(executeD1('INSERT INTO users VALUES (...)','private.sql',{run:(_,args)=>{assert.ok(args.includes('--file'));assert.equal(args.at(-1),'private.sql');return '├ Checking import progress\nImport complete';}}),[]);
 assert.throws(()=>executeD1('DELETE FROM users WHERE id=fixture','private.sql',{run:()=>{throw Error('import failed');}}),/import failed/);
});

test('Pages reruns upload and select an artifact unique to that attempt',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/ci.yml',import.meta.url),'utf8');
 assert.match(workflow,/^\s+name: github-pages-\$\{\{ github\.run_attempt \}\}$/m);
 assert.match(workflow,/^\s+artifact_name: github-pages-\$\{\{ github\.run_attempt \}\}$/m);
});

 test('Pages launcher publication waits for the matching Worker release',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/ci.yml',import.meta.url),'utf8');
 assert.ok(workflow.indexOf('--app-only') < workflow.indexOf('actions/upload-pages-artifact'));
 assert.match(workflow,/timeout-minutes: 15/);
 });
