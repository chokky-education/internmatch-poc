import { json, corsHeaders, readJson } from './http.js';
import { handleApi } from './web-api.js';
import { sendDueReminders } from './reminders.js';
import { verifySignature, handleEvent } from './line.js';
import { requestOtp, verifyOtp, createSession, sessionCookie, requireUser, destroySession } from './auth.js';

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), p = url.pathname, J = (d, s = 200, x = {}) => json(d, s, env, req, x);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env, req) });
    if (p === '/api/health') return J({ ok: true });
    if (p === '/api/auth/request' && req.method === 'POST') {
      const { email } = await readJson(req);
      const r = await requestOtp(env, email, { purpose: 'web' });
      return J(r, r.ok ? 200 : r.error === 'too_soon' ? 429 : r.error === 'not_allowed' ? 403 : 502);
    }
    if (p === '/api/auth/verify' && req.method === 'POST') {
      const { email, code } = await readJson(req);
      const r = await verifyOtp(env, email, code);
      if (!r.ok) return J(r, r.error === 'locked' ? 429 : 401);
      const token = await createSession(env, r.user.id);
      return J({ ok: true, email: r.user.email, token }, 200, { 'Set-Cookie': sessionCookie(token) });
    }
    if (p === '/api/auth/logout' && req.method === 'POST') {
      await destroySession(req, env);
      return J({ ok: true }, 200, { 'Set-Cookie': 'im_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None' });
    }
    if (p === '/api/me') {
      const u = await requireUser(req, env);
      return u ? J({ email: u.email, line_linked: !!u.line_user_id }) : J({ error: 'unauthorized' }, 401);
    }
    if (p === '/line/webhook' && req.method === 'POST') {
      const body = await req.text();
      if (!(await verifySignature(body, req.headers.get('x-line-signature'), env.LINE_CHANNEL_SECRET))) return J({ error: 'bad_signature' }, 401);
      let events = []; try { events = JSON.parse(body).events || []; } catch {}
      ctx.waitUntil(Promise.all(events.map(e => handleEvent(env, e))));
      return J({ ok: true });
    }
    if (p.startsWith('/api/')) {
      const u = await requireUser(req, env);
      if (!u) return J({ error: 'unauthorized' }, 401);
      return handleApi(req, env, u, url);
    }
    return J({ error: 'not_found' }, 404);
  },
  async scheduled(evt, env, ctx) { ctx.waitUntil(sendDueReminders(env, new Date())); },
};
