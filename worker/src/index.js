import { json, corsHeaders } from './http.js';

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env, req) });
    if (url.pathname === '/api/health') return json({ ok: true }, 200, env, req);
    return json({ error: 'not_found' }, 404, env, req);
  },
  async scheduled(evt, env, ctx) {},
};
