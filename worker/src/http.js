export function corsHeaders(env, req) {
  const origin = req?.headers.get('Origin');
  const h = { 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Season-Id, X-Selection-Version', Vary: 'Origin' };
  if (origin && origin === env.WEB_ORIGIN) { h['Access-Control-Allow-Origin'] = origin; h['Access-Control-Allow-Credentials'] = 'true'; }
  return h;
}
export function json(data, status = 200, env = {}, req = null, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(env, req), ...extra } });
}
export function trustedWebMutation(req, env) {
  const origin = req.headers.get('Origin');
  return !!origin && origin === env.WEB_ORIGIN && origin === new URL(req.url).origin;
}
export async function readJson(req) { try { return await req.json(); } catch { return {}; } }
