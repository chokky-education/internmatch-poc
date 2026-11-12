import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { createSession, requireUser } from '../src/auth.js';

const origin = 'https://x.test';
beforeEach(async () => {
  await env.DB.exec('DELETE FROM sessions; DELETE FROM otps; DELETE FROM users;');
  await env.DB.prepare('INSERT INTO users(id,email,created_at) VALUES (?,?,?)').bind('security-user', 'ton@example.com', new Date().toISOString()).run();
});
afterEach(() => vi.restoreAllMocks());

describe('cookie-only session boundary', () => {
  it('does not return the session secret to JavaScript after OTP verification', async () => {
    const code = '123456';
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)))].map(n => n.toString(16).padStart(2, '0')).join('');
    await env.DB.prepare('INSERT INTO otps(email,code_hash,expires_at,attempts,last_sent_at,purpose) VALUES (?,?,?,?,?,?)').bind('ton@example.com', hash, '2099-01-01', 0, new Date().toISOString(), 'web').run();
    const response = await SELF.fetch(origin + '/api/auth/verify', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ton@example.com', code }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, email: 'ton@example.com' });
    expect(response.headers.get('Set-Cookie')).toMatch(/__Host-im_session=[a-f0-9]{64}; HttpOnly; Secure; SameSite=Lax; Path=\//);
    const row = await env.DB.prepare('SELECT token FROM sessions').first();
    expect(row.token).toMatch(/^v2:[a-f0-9]{64}$/);
    expect(response.headers.get('Set-Cookie')).not.toContain(row.token);
  });
  it('old raw sessions cannot be repackaged into the new cookie or Bearer', async () => {
    const old = 'a'.repeat(64);
    await env.DB.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES (?,?,?)').bind(old, 'security-user', '2099-01-01').run();
    for (const headers of [{ Cookie: 'im_session=' + old }, { Cookie: '__Host-im_session=' + old }, { Authorization: 'Bearer ' + old }]) {
      expect(await requireUser(new Request(origin + '/api/me', { headers }), env)).toBeNull();
    }
  });
  it('rejects foreign, null and absent origins before any cookie-authenticated mutation', async () => {
    const token = await createSession(env, 'security-user');
    for (const foreign of ['https://chokky-education.github.io', 'https://evil.example', 'null', null]) {
      for (const path of ['/api/auth/request', '/api/auth/verify', '/api/auth/logout', '/api/seasons', '/api/ocr', '/api/extractions/unknown/confirm']) {
        const response = await SELF.fetch(origin + path, { method: 'POST', headers: { Cookie: '__Host-im_session=' + token, ...(foreign ? { Origin: foreign } : {}), 'Content-Type': 'text/plain' }, body: '{"name":"forged season"}' });
        expect(response.status, path + ' ' + foreign).toBe(403);
      }
    }
    expect((await env.DB.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').bind('security-user').first()).n).toBe(1);
    expect((await env.DB.prepare('SELECT COUNT(*) n FROM seasons WHERE user_id=? AND name=?').bind('security-user', 'forged season').first()).n).toBe(0);
    expect((await env.DB.prepare('SELECT COUNT(*) n FROM otps').first()).n).toBe(0);
  });
  it('requires one complete cookie value and honors expiration', async () => {
    const token = await createSession(env, 'security-user'), cookie = '__Host-im_session=' + token;
    const user = value => requireUser(new Request(origin + '/api/me', { headers: { Cookie: value } }), env);
    expect((await user(cookie)).id).toBe('security-user');
    for (const value of [cookie + 'junk', cookie.slice(0, -1), cookie + '; ' + cookie, '__Host-im_session=v2:' + token]) expect(await user(value)).toBeNull();
    await env.DB.prepare('UPDATE sessions SET expires_at=? WHERE user_id=?').bind('2000-01-01', 'security-user').run();
    expect(await user(cookie)).toBeNull();
  });
  it('serves the actual app bytes without exposing source or swallowing API routes', async () => {
    const page = await SELF.fetch(origin + '/');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('id="login"');
    expect(page.headers.get('X-Frame-Options')).toBe('DENY');
    expect((await SELF.fetch(origin + '/worker/src/auth.js')).status).toBe(404);
    expect((await SELF.fetch(origin + '/api/state')).status).toBe(401);
  });
});
