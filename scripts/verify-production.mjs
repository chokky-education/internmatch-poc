// Baseline verification sends no OTP email/LINE message and creates no sessions.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export async function verifyProduction({ webUrl, apiUrl, commit, appOnly = false }) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('Expected a full Git commit SHA');
  const origin = new URL(apiUrl).origin, checks = [];
  const assert = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); };
  const request = (url, options = {}) => fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'Cache-Control': 'no-cache', ...options.headers } });
  async function assets(base, names, kind) {
    const url = path => { const u = new URL(path, base.endsWith('/') ? base : base + '/'); u.searchParams.set('release', commit); return u; };
    const response = await request(url('release.json'));
    assert(response.ok, `${kind} manifest reachable`);
    const manifest = await response.json();
    assert(manifest.commit === commit, `${kind} revision matches merged commit`);
    assert(Object.keys(manifest.files || {}).sort().join(',') === [...names].sort().join(','), `${kind} public asset allowlist matches`);
    for (const name of names) {
      const r = await request(url(name === 'index.html' ? '' : name)), body = await r.text();
      assert(r.ok && createHash('sha256').update(body).digest('hex') === manifest.files[name], `deployed ${kind} ${name} matches artifact`);
      if (kind === 'app' && name === 'index.html') assert(body.includes('id="login"') && !body.includes('localStorage.setItem'), 'same-origin login shell has no persisted session write');
      if (kind === 'app' && name === 'config.js') assert(body.includes('location.origin'), 'app API uses its own origin');
      if (kind === 'launcher' && name === 'legacy-redirect.js') assert(body.includes(JSON.stringify(apiUrl.replace(/\/$/, '') + '/')) && body.includes("removeItem('im_token')") && !body.includes('location.search'), 'old Pages clears credentials and opens the canonical app without query credentials');
    }
  }
  await assets(apiUrl, ['index.html', 'config.js', 'profile-ui.js', 'profile-ui.css'], 'app');
  if (!appOnly) await assets(webUrl, ['index.html', 'legacy-redirect.js'], 'launcher');
  const health = await request(apiUrl + '/api/health', { headers: { Origin: origin } });
  assert(health.ok && (await health.json()).ok === true, 'API health responds');
  assert(health.headers.get('Access-Control-Allow-Origin') === origin, 'canonical app origin allowed');
  const preflight = await request(apiUrl + '/api/state', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Headers': 'content-type,x-season-id', 'Access-Control-Request-Method': 'POST' } });
  assert(preflight.status === 204 && !/authorization/i.test(preflight.headers.get('Access-Control-Allow-Headers') || ''), 'browser session Bearer preflight is no longer advertised');
  for (const foreign of ['https://chokky-education.github.io', 'https://untrusted.example.invalid', 'null']) {
    const r = await request(apiUrl + '/api/auth/logout', { method: 'POST', headers: { Origin: foreign } });
    assert(r.status === 403 && !r.headers.get('Access-Control-Allow-Origin'), `foreign mutation rejected: ${foreign}`);
  }
  assert((await request(apiUrl + '/api/auth/logout', { method: 'POST' })).status === 403, 'mutation without Origin rejected');
  for (const path of ['/api/me', '/api/state']) {
    const r = await request(apiUrl + path);
    assert(r.status === 401 && (await r.json()).error === 'unauthorized', `${path} requires authentication`);
  }
  const legacy = await request(apiUrl + '/api/me', { headers: { Authorization: 'Bearer ' + 'a'.repeat(64) } });
  assert(legacy.status === 401, 'legacy Bearer does not authenticate');
  const otp = await request(apiUrl + '/api/auth/verify', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ci-smoke@example.invalid', code: '000000' }) });
  assert(otp.status === 401 && (await otp.json()).error === 'invalid', 'OTP route reads DB and rejects an absent code');
  const webhook = await request(apiUrl + '/line/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-line-signature': 'invalid-smoke-signature' }, body: '{"events":[]}' });
  assert(webhook.status === 401 && (await webhook.json()).error === 'bad_signature', 'LINE webhook rejects invalid signatures');
  return checks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), appOnly = args.includes('--app-only');
  const [commit, webUrl = 'https://chokky-education.github.io/internmatch-poc/', apiUrl = 'https://internmatch-api.entrace-space.workers.dev'] = args.filter(a => a !== '--app-only');
  try { console.log(JSON.stringify({ ok: true, commit, checks: await verifyProduction({ webUrl, apiUrl, commit, appOnly }) }, null, 2)); }
  catch (error) { console.error(`Production verification failed: ${error.message}`); process.exitCode = 1; }
}
