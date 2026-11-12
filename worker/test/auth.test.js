import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requestOtp, verifyOtp, isAllowed } from '../src/auth.js';

let brevoCalls;
let realFetch;
beforeEach(async () => {
  await env.DB.exec('DELETE FROM otps; DELETE FROM users; DELETE FROM sessions;');
  brevoCalls = [];
  realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => {
    if (String(u).includes('api.brevo.com')) { brevoCalls.push(JSON.parse(init.body)); return new Response('{}', { status: 201 }); }
    return realFetch(u, init);
  });
});
afterEach(() => vi.restoreAllMocks());

const lastCode = () => JSON.stringify(brevoCalls.at(-1)).match(/\b(\d{6})\b/)[1];

describe('allowlist', () => {
  it('isAllowed compares case-insensitively', () => {
    expect(isAllowed(env, 'TON@example.COM')).toBe(true);
    expect(isAllowed(env, 'x@example.com')).toBe(false);
  });
  it('non-allowlisted email gets not_allowed and no email is sent', async () => {
    const r = await requestOtp(env, 'stranger@example.com', { purpose: 'web' });
    expect(r).toEqual({ ok: false, error: 'not_allowed' });
    expect(brevoCalls.length).toBe(0);
  });
});

describe('otp', () => {
  it('allowlisted email triggers exactly one Brevo call with a 6-digit code', async () => {
    const r = await requestOtp(env, 'TON@example.com', { purpose: 'web' });
    expect(r).toEqual({ ok: true });
    expect(brevoCalls.length).toBe(1);
    expect(lastCode()).toMatch(/^\d{6}$/);
  });
  it('second request within 60s is too_soon', async () => {
    await requestOtp(env, 'ton@example.com', { purpose: 'web' });
    const r = await requestOtp(env, 'ton@example.com', { purpose: 'web' });
    expect(r).toEqual({ ok: false, error: 'too_soon' });
    expect(brevoCalls.length).toBe(1);
  });
  it('correct code logs in and /api/me returns the email via session cookie', async () => {
    await requestOtp(env, 'ton@example.com', { purpose: 'web' });
    const r = await SELF.fetch('https://x.test/api/auth/verify', { method: 'POST', headers: { Origin: 'https://x.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ton@example.com', code: lastCode() }) });
    expect(r.status).toBe(200);
    const cookie = r.headers.get('Set-Cookie');
    expect(cookie).toMatch(/im_session=.+HttpOnly/);
    const me = await SELF.fetch('https://x.test/api/me', { headers: { Cookie: cookie.split(';')[0] } });
    expect((await me.json()).email).toBe('ton@example.com');
  });
  it('cookie survives requests and logout ends only that web session', async () => {
    await requestOtp(env, 'ton@example.com', { purpose: 'web' });
    const login = await SELF.fetch('https://x.test/api/auth/verify', { method: 'POST', headers: { Origin: 'https://x.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ton@example.com', code: lastCode() }) });
    const cookie = login.headers.get('Set-Cookie').split(';')[0];
    expect((await SELF.fetch('https://x.test/api/state', { headers: { Cookie: cookie } })).status).toBe(200);
    const logout = await SELF.fetch('https://x.test/api/auth/logout', { method: 'POST', headers: { Origin: 'https://x.test', Cookie: cookie } });
    expect(logout.status).toBe(200);
    expect(logout.headers.get('Set-Cookie')).toContain('__Host-im_session=;');
    expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect((await SELF.fetch('https://x.test/api/me', { headers: { Cookie: cookie } })).status).toBe(401);
  });
  it('preflight no longer advertises browser Bearer authentication', async () => {
    const r = await SELF.fetch('https://x.test/api/state', { method: 'OPTIONS', headers: { Origin: env.WEB_ORIGIN } });
    expect(r.headers.get('Access-Control-Allow-Headers')).not.toMatch(/Authorization/);
  });
  it('code older than 10 minutes is expired', async () => {
    await requestOtp(env, 'ton@example.com', { purpose: 'web' });
    await env.DB.prepare("UPDATE otps SET expires_at = ?").bind(new Date(Date.now() - 1000).toISOString()).run();
    expect(await verifyOtp(env, 'ton@example.com', lastCode())).toEqual({ ok: false, error: 'expired' });
  });
  it('5 wrong attempts lock the code even if the right one is then entered', async () => {
    await requestOtp(env, 'ton@example.com', { purpose: 'web' });
    const good = lastCode();
    const bad = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await verifyOtp(env, 'ton@example.com', bad)).ok).toBe(false);
    expect(await verifyOtp(env, 'ton@example.com', good)).toEqual({ ok: false, error: 'locked' });
  });
  it('purpose line links line_user_id to the user on verify', async () => {
    await requestOtp(env, 'in@example.com', { purpose: 'line', lineUserId: 'U123' });
    const r = await verifyOtp(env, 'in@example.com', lastCode());
    expect(r.ok).toBe(true);
    const row = await env.DB.prepare('SELECT line_user_id FROM users WHERE email=?').bind('in@example.com').first();
    expect(row.line_user_id).toBe('U123');
  });
});
