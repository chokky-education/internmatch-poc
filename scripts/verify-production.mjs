// Safe baseline checks: no real OTP emails, authenticated sessions or LINE messages.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export async function verifyProduction({ webUrl, apiUrl, commit }) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('Expected a full Git commit SHA');
  const origin = new URL(webUrl).origin, checks = [];
  const assert = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); };
  const request = (url, options = {}) => fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'Cache-Control': 'no-cache', ...options.headers } });
  const web = path => { const u = new URL(path, webUrl.endsWith('/') ? webUrl : webUrl + '/'); u.searchParams.set('release', commit); return u; };
  const releaseResponse = await request(web('release.json'));
  assert(releaseResponse.ok, 'web release manifest reachable');
  const release = await releaseResponse.json();
  assert(release.commit === commit, 'web revision matches merged commit');
  for (const name of ['index.html', 'config.js']) {
    const response = await request(web(name === 'index.html' ? '' : name));
    const body = await response.text();
    assert(response.ok && createHash('sha256').update(body).digest('hex') === release.files?.[name], `deployed ${name} matches artifact`);
    if (name === 'index.html') assert(body.includes('id="login"') && body.includes('config.js'), 'web login shell exists');
    else assert(body.includes(apiUrl.replace(/\/$/, '')), 'web config points to production API');
  }
  const health = await request(apiUrl + '/api/health', { headers: { Origin: origin } });
  assert(health.ok && (await health.json()).ok === true, 'API health responds');
  assert(health.headers.get('Access-Control-Allow-Origin') === origin && health.headers.get('Access-Control-Allow-Credentials') === 'true', 'production web origin allowed');
  const preflight = await request(apiUrl + '/api/state', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Headers': 'authorization,content-type', 'Access-Control-Request-Method': 'GET' } });
  assert(preflight.status === 204 && /authorization/i.test(preflight.headers.get('Access-Control-Allow-Headers') || ''), 'Bearer token preflight allowed');
  const foreign = await request(apiUrl + '/api/health', { headers: { Origin: 'https://untrusted.example.invalid' } });
  assert(!foreign.headers.get('Access-Control-Allow-Origin'), 'foreign web origin rejected');
  for (const path of ['/api/me', '/api/state']) {
    const r = await request(apiUrl + path);
    assert(r.status === 401 && (await r.json()).error === 'unauthorized', `${path} requires authentication`);
  }
  // This reserved, non-deliverable identity has no OTP; the route reads D1 but never sends email.
  const otp = await request(apiUrl + '/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ci-smoke@example.invalid', code: '000000' }) });
  assert(otp.status === 401 && (await otp.json()).error === 'invalid', 'OTP verification route reads DB and rejects an absent code');
  const webhook = await request(apiUrl + '/line/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-line-signature': 'invalid-smoke-signature' }, body: '{"events":[]}' });
  assert(webhook.status === 401 && (await webhook.json()).error === 'bad_signature', 'LINE webhook rejects invalid signatures');
  return checks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [commit, webUrl = 'https://chokky-education.github.io/internmatch-poc/', apiUrl = 'https://internmatch-api.entrace-space.workers.dev'] = process.argv.slice(2);
  try {
    const checks = await verifyProduction({ webUrl, apiUrl, commit });
    console.log(JSON.stringify({ ok: true, commit, checked_at: new Date().toISOString(), checks }, null, 2));
  } catch (error) { console.error(`Production verification failed: ${error.message}`); process.exitCode = 1; }
}
