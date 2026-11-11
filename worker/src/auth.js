import { sendOtpEmail } from './email.js';
import { seedUser } from './store.js';

const OTP_TTL_MS = 10 * 60 * 1000, RESEND_MS = 60 * 1000, MAX_ATTEMPTS = 5, SESSION_MS = 30 * 24 * 3600 * 1000;
const norm = e => String(e || '').trim().toLowerCase();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));

export function isAllowed(env, email) {
  return String(env.ALLOWED_EMAILS || '').split(',').map(norm).filter(Boolean).includes(norm(email));
}

export async function requestOtp(env, emailRaw, { purpose, lineUserId = null }) {
  const email = norm(emailRaw);
  if (!isAllowed(env, email)) return { ok: false, error: 'not_allowed' };
  const prev = await env.DB.prepare('SELECT last_sent_at FROM otps WHERE email=?').bind(email).first();
  if (prev && Date.now() - Date.parse(prev.last_sent_at) < RESEND_MS) return { ok: false, error: 'too_soon' };
  const code = String(new DataView(crypto.getRandomValues(new Uint8Array(4)).buffer).getUint32(0) % 1000000).padStart(6, '0');
  const now = new Date();
  await env.DB.prepare('INSERT OR REPLACE INTO otps (email, code_hash, expires_at, attempts, last_sent_at, purpose, line_user_id) VALUES (?,?,?,?,?,?,?)')
    .bind(email, await sha256(code), new Date(+now + OTP_TTL_MS).toISOString(), 0, now.toISOString(), purpose, lineUserId).run();
  if (!(await sendOtpEmail(env, email, code))) return { ok: false, error: 'send_failed' };
  return { ok: true };
}

export async function verifyOtp(env, emailRaw, code) {
  const email = norm(emailRaw);
  const row = await env.DB.prepare('SELECT * FROM otps WHERE email=?').bind(email).first();
  if (!row) return { ok: false, error: 'invalid' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'locked' };
  if (Date.parse(row.expires_at) < Date.now()) return { ok: false, error: 'expired' };
  if ((await sha256(String(code).trim())) !== row.code_hash) {
    await env.DB.prepare('UPDATE otps SET attempts = attempts + 1 WHERE email=?').bind(email).run();
    return { ok: false, error: 'invalid' };
  }
  await env.DB.prepare('DELETE FROM otps WHERE email=?').bind(email).run();
  let user = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  if (!user) {
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO users (id,email,created_at) VALUES (?,?,?)').bind(id, email, new Date().toISOString()).run();
    await seedUser(env, id);
    user = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
  }
  if (row.purpose === 'line' && row.line_user_id) {
    await env.DB.prepare('UPDATE users SET line_user_id=? WHERE id=?').bind(row.line_user_id, user.id).run();
    user.line_user_id = row.line_user_id;
  }
  return { ok: true, user };
}

export async function createSession(env, userId) {
  const token = randHex(32);
  await env.DB.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').bind(token, userId, new Date(Date.now() + SESSION_MS).toISOString()).run();
  return token;
}
export const sessionCookie = token => `im_session=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_MS / 1000}`;

export async function requireUser(req, env) {
  const m = /(?:^|;\s*)im_session=([a-f0-9]+)/.exec(req.headers.get('Cookie') || '');
  if (!m) return null;
  return await env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at > ?').bind(m[1], new Date().toISOString()).first();
}
export async function destroySession(req, env) {
  const m = /(?:^|;\s*)im_session=([a-f0-9]+)/.exec(req.headers.get('Cookie') || '');
  if (m) await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(m[1]).run();
}
