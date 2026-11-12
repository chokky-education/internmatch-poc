// Reviewed, bounded production verification. Only reserved fixture data is written.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes, randomUUID, randomInt, createHash } from 'node:crypto';
import { executeD1 } from './d1-query.mjs';

const [mode, sha] = process.argv.slice(2), root = resolve(import.meta.dirname, '../..');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(sha || '') || git(['rev-parse', 'HEAD']) !== sha || git(['status', '--porcelain'])) throw Error('Use a clean checkout of the exact merged revision');
git(['merge-base', '--is-ancestor', sha, 'origin/main']);
if (!process.env.INTERNMATCH_RELEASE_DIR) throw Error('Set a private verification directory');
const privateDir = resolve(process.env.INTERNMATCH_RELEASE_DIR);
mkdirSync(privateDir, { recursive: true, mode: 0o700 });
const literal = v => "'" + String(v).replaceAll("'", "''") + "'";
const hash = v => createHash('sha256').update(v).digest('hex');
let sequence = 0;
function query(sql) {
  const file = resolve(privateDir, `security-${++sequence}.sql`);
  writeFileSync(file, sql, { mode: 0o600 });
  try { return executeD1(sql, file, { cwd: resolve(root, 'worker') })[0]?.results || []; }
  catch { throw Error('Private production fixture operation failed'); }
}
if (mode === 'expire-legacy') {
  const before = query("SELECT COUNT(*) n FROM sessions WHERE token NOT LIKE 'v2:%' AND expires_at>datetime('now')")[0].n;
  query("UPDATE sessions SET expires_at='1970-01-01T00:00:00.000Z' WHERE token NOT LIKE 'v2:%'");
  if (query("SELECT COUNT(*) n FROM sessions WHERE token NOT LIKE 'v2:%' AND expires_at>datetime('now')")[0].n) throw Error('Legacy sessions still active');
  console.log(JSON.stringify({ ok: true, legacy_sessions_expired: before, business_data_changed: false }));
} else if (mode === 'smoke') {
  if (!process.env.INTERNMATCH_PLAYWRIGHT_MODULE) throw Error('Set the installed Playwright module path');
  const pw = await import(pathToFileURL(process.env.INTERNMATCH_PLAYWRIGHT_MODULE));
  const base = 'https://internmatch-api.entrace-space.workers.dev', id = 'security-smoke-' + randomBytes(8).toString('hex'), email = id + '@example.invalid';
  const legacy = randomBytes(32).toString('hex'), results = [];
  const links = () => hash(JSON.stringify(query(`SELECT id,line_user_id FROM users WHERE id<>${literal(id)} ORDER BY id`)));
  const beforeLinks = links();
  let created = false;
  const seedOtp = () => {
    const code = String(randomInt(1000000)).padStart(6, '0'), now = new Date().toISOString();
    query(`INSERT OR REPLACE INTO otps(email,code_hash,expires_at,attempts,last_sent_at,purpose,line_user_id) VALUES (${literal(email)},${literal(hash(code))},${literal(new Date(Date.now() + 600000).toISOString())},0,${literal(now)},'web',NULL)`);
    return code;
  };
  const check = (condition, message) => { if (!condition) throw Error(message); };
  try {
    created = true;
    query(`INSERT INTO users(id,email,created_at) VALUES (${literal(id)},${literal(email)},${literal(new Date().toISOString())}); INSERT INTO sessions(token,user_id,expires_at) VALUES (${literal(legacy)},${literal(id)},'2099-01-01')`);
    for (const headers of [{ Authorization: 'Bearer ' + legacy }, { Cookie: 'im_session=' + legacy }, { Cookie: '__Host-im_session=' + legacy }]) check((await fetch(base + '/api/me', { headers })).status === 401, 'Active legacy fixture session was accepted');
    results.push('active legacy raw session rejected as Bearer, old cookie and repackaged new cookie');
    for (const engine of ['chromium', 'webkit']) {
      console.log(`Checking production fixture in ${engine}...`);
      const browser = await pw[engine].launch({ headless: true });
      try {
        const context = await browser.newContext(engine === 'webkit' ? { ...pw.devices['iPhone 13'] } : {}), page = await context.newPage();
        const errors = []; let browserBearer = false;
        page.on('pageerror', e => errors.push(e.message));
        page.on('request', r => { if (r.url().startsWith(base + '/api/') && r.headers().authorization) browserBearer = true; });
        await context.addInitScript(() => { localStorage.setItem('im_token', 'obsolete-test-credential'); sessionStorage.setItem('im_token', 'obsolete-test-credential'); });
        const login = async () => {
          const response = await context.request.post(base + '/api/auth/verify', { headers: { Origin: base }, data: { email, code: seedOtp() } });
          check(response.status() === 200, 'Fixture OTP verification failed');
          const body = await response.json();
          check(body.ok && !('token' in body), 'Session secret returned to JavaScript');
          const cookies = await context.cookies(base), cookie = cookies.find(c => c.name === '__Host-im_session');
          check(cookie?.httpOnly && cookie.secure && cookie.sameSite === 'Lax' && cookie.path === '/', 'Cookie attributes incorrect');
          check(query(`SELECT token FROM sessions WHERE user_id=${literal(id)}`).some(r => r.token === 'v2:' + hash(cookie.value)), 'Session digest missing');
        };
        await login();
        await page.goto(base + '/');
        await page.waitForFunction(() => !!window.document.querySelector('#bar #activeSeason'));
        const image = `<img src="/__security_probe_missing" onerror="window.__securityProbe=1"> ${engine} ไทย & 'quote'`;
        const svg = `<svg onload="window.__securityProbe=2"></svg> ${engine}`;
        await page.evaluate(() => { go('tracker'); openAdd(); });
        await page.locator('#aCo').fill('Manual ' + image);
        await page.locator('#aRole').fill(svg);
        await page.locator('#mAdd .btn').filter({ hasText: 'บันทึก' }).click();
        await page.waitForFunction(text => apps.some(a => a.co === text), 'Manual ' + image);
        const state = await (await context.request.get(base + '/api/state')).json(), extractionId = randomUUID();
        const fields = { company: 'OCR ' + svg, role: image, deadline: '2099-01-01', [image]: '&lt;img src=x&gt;' };
        query(`INSERT INTO extractions(id,user_id,season_id,doc_type,fields_json,status,channel,created_at) VALUES (${literal(extractionId)},${literal(id)},${literal(state.selected_season.id)},'job_post',${literal(JSON.stringify(fields))},'pending','line',${literal(new Date().toISOString())})`);
        await page.reload();
        await page.waitForFunction(() => !!serverState);
        await page.evaluate(extractionId => { go('ocr'); renderOut(serverState.pending_extractions.find(x => x.id === extractionId)); }, extractionId);
        check(await page.locator('#ocrOut img,#ocrOut svg').count() === 0, 'OCR key became a node');
        await page.getByRole('button', { name: '✔ ยืนยันและบันทึก', exact: true }).click();
        await page.waitForFunction(company => apps.some(a => a.co === company && a.truth === 'AI_EXTRACTED'), 'OCR ' + svg);
        const quoted = `ไทย ${engine}" autofocus onfocus="window.__securityProbe=3`;
        await page.evaluate(() => go('onboard'));
        await page.locator('#profileSetup [name=preferred_name]').fill(quoted);
        await page.getByRole('button', { name: 'บันทึกโปรไฟล์', exact: true }).click();
        await page.waitForFunction(name => serverState.profile.preferred_name === name, quoted);
        await page.reload(); await page.waitForFunction(() => !!serverState);
        await page.evaluate(() => go('onboard'));
        const input = page.locator('#profileSetup [name=preferred_name]');
        check(await input.inputValue() === quoted, 'Profile text changed');
        check(await input.getAttribute('onfocus') === null && await input.getAttribute('autofocus') === null, 'Profile escaped its value attribute');
        await input.focus();
        check(await page.locator('#kanban img,#kanban svg,#kanban script').count() === 0, 'Stored application created an executable node');
        check(await page.evaluate(() => !window.__securityProbe && !document.cookie.includes('__Host-im_session') && localStorage.getItem('im_token') === null && sessionStorage.getItem('im_token') === null), 'Script executed or session credential exposed');
        const forged = await context.request.post(base + '/api/seasons', { headers: { Origin: 'https://chokky-education.github.io', 'Content-Type': 'text/plain' }, data: '{"name":"forged"}' });
        check(forged.status() === 403, 'Authenticated foreign mutation accepted');
        await page.getByText('ออกจากระบบ', { exact: true }).click();
        await page.locator('#login.show').waitFor();
        check((await context.request.get(base + '/api/me')).status() === 401, 'Logout left an active session');
        await login(); await page.reload(); await page.waitForFunction(() => !!serverState);
        check(await page.evaluate(() => apps.length > 0) && !browserBearer && errors.length === 0, 'Relogin/UI regression');
        results.push(`${engine}: cookie login/reload/logout/relogin, persisted manual+LINE-origin OCR text, attribute injection, storage cleanup and CSRF passed`);
      } finally { await browser.close(); }
    }
  } finally {
    if (created) {
      const tables = ['pending_actions','milestones','applications','tasks','documents','reminders','messages','extractions','audit_log','seasons','sessions'];
      query([...tables.map(t => `DELETE FROM ${t} WHERE user_id=${literal(id)}`), `DELETE FROM otps WHERE email=${literal(email)}`, `DELETE FROM users WHERE id=${literal(id)}`].join(';'));
      for (const t of [...tables, 'users']) check(query(`SELECT COUNT(*) n FROM ${t} WHERE ${t === 'users' ? 'id' : 'user_id'}=${literal(id)}`)[0].n === 0, 'Fixture cleanup incomplete');
    }
    check(links() === beforeLinks, 'Existing LINE links changed');
  }
  console.log(JSON.stringify({ ok: true, sha, results, fixture_removed: true, existing_line_links_preserved: true, external_messages_sent: 0 }, null, 2));
} else throw Error('Expected expire-legacy or smoke');
