export function corsHeaders(env, req) {
  const origin = req?.headers.get('Origin');
  const h = { 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
  if (origin && origin === env.WEB_ORIGIN) { h['Access-Control-Allow-Origin'] = origin; h['Access-Control-Allow-Credentials'] = 'true'; }
  return h;
}
export function json(data, status = 200, env = {}, req = null, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(env, req), ...extra } });
}
export async function readJson(req) { try { return await req.json(); } catch { return {}; } }
