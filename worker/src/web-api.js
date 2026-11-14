import { listMilestones, saveMilestone } from './milestones.js';
import { context, scoped, listSeasons, createSeason, selectSeason, saveProfile, saveSeason, ContextError } from './seasons.js';
import { json, readJson } from './http.js';
import { getOverview, addApplication, updateApplicationStatus, setTaskById, addReminder, deleteReminder, markReminderSeen } from './store.js';
import { runAssistant } from './assistant.js';
import { runCardAction } from './actions.js';
import { extractDocument, confirmExtraction, discardExtraction } from './ocr.js';

const STATUS = ['Saved', 'Applied', 'Interview', 'Offer', 'Closed'];
const ERR = { conflict: 409, bad_request: 400, duplicate: 409, system_verified: 403, not_found: 404, already_confirmed: 409, not_pending: 409, too_large: 413, invalid_datetime: 400, missing_company: 400 };
const fail = (J, error) => J({ ok: false, error }, ERR[error] || 502);

export async function state(env, user) {
  const c = await context(env,user.id);
  env = scoped(env,c.season.id);
  const [o, msgs, pend] = await Promise.all([
    getOverview(env, user.id),
    env.DB.prepare('SELECT channel, role, content, created_at, cards_json FROM messages WHERE user_id=? AND season_id=? ORDER BY created_at DESC, rowid DESC LIMIT 50').bind(user.id,c.season.id).all(),
    env.DB.prepare("SELECT id, doc_type, fields_json, channel, created_at FROM extractions WHERE user_id=? AND season_id=? AND status='pending' ORDER BY created_at").bind(user.id,c.season.id).all(),
  ]);
  const now = Date.now();
  const unseen = (await env.DB.prepare("SELECT r.*,s.name AS season_name FROM reminders r LEFT JOIN seasons s ON s.id=r.season_id AND s.user_id=r.user_id WHERE r.user_id=? AND r.seen_at IS NULL AND r.due_at<=? AND (r.delivery IS NULL OR r.delivery='failed') ORDER BY r.due_at").bind(user.id,new Date(now).toISOString()).all()).results;
  return {
    ...o,
    milestones:await listMilestones(env,user.id),
    profile: c.profile, profile_version: c.user.profile_version, selected_season: c.season, selection_version:c.selection_version, seasons: await listSeasons(env,user.id),
    messages: msgs.results.reverse().map(({ cards_json, ...m }) => ({ ...m, cards: cards_json ? JSON.parse(cards_json) : [] })),
    pending_extractions: pend.results.map(e => ({ id: e.id, doc_type: e.doc_type, fields: JSON.parse(e.fields_json), channel: e.channel })),
    unseen_reminders: unseen,
    user: { email: user.email, line_linked: !!user.line_user_id },
  };
}

export async function handleApi(req, env, user, url) {
  const p = url.pathname, m = req.method, J = (d, s = 200) => json(d, s, env, req);
  const captured=await context(env,user.id);
  const fixedAction=p==='/api/actions'||/^\/api\/extractions\/[^/]+\/(confirm|discard)$/.test(p)||/\/seen$/.test(p);
  if(m!=='GET'&&!fixedAction && !(p.startsWith('/api/seasons')&&m!=='PATCH') && p!=='/api/profile') {
    const reference=req.headers.get('X-Season-Id'),version=req.headers.get('X-Selection-Version');
    if(reference!==captured.season.id||version!==String(captured.selection_version)) return fail(J,'conflict');
  }
  env=scoped(env,captured.season.id);
  const seg = p.split('/').filter(Boolean); // ['api', ...]
  if(p==='/api/audit'&&m==='GET')return J({entries:(await env.DB.prepare('SELECT entity,channel,truth_level,at FROM audit_log WHERE user_id=? AND (season_id=? OR season_id IS NULL) ORDER BY at DESC LIMIT 100').bind(user.id,captured.season.id).all()).results});
  if (p === '/api/state' && m === 'GET') return J(await state(env, user));
  if (p === '/api/profile' && m === 'PATCH') {
    const b = await readJson(req);
    if (!b || !b.profile || !Number.isInteger(b.version)) return fail(J,'bad_request');
    const r = await saveProfile(env,user.id,b.profile,b.version,'web');
    return r.ok ? J(r) : fail(J,r.error);
  }
  if (p === '/api/seasons' && m === 'POST') {
    const b = await readJson(req);
    const r = await createSeason(env,user.id,b || {},'web');
    return r.ok ? J(r) : fail(J,r.error);
  }
  if (seg[1] === 'seasons' && seg[2] && seg[3] === 'select' && m === 'POST') {
    const b = await readJson(req);
    if (!Number.isInteger(b?.selection_version)) return fail(J,'bad_request');
    const r = await selectSeason(env,user.id,seg[2],b.selection_version,'web');
    return r.ok ? J(r) : fail(J,r.error);
  }
  if (seg[1] === 'seasons' && seg[2] && !seg[3] && m === 'PATCH') {
    const b = await readJson(req);
    if (!b?.season || !Number.isInteger(b.version)) return fail(J,'bad_request');
    try {
      const r = await saveSeason(env,user.id,seg[2],b.season,b.version,'web');
      return r.ok ? J(r) : fail(J,r.error);
    } catch (e) { if (e instanceof ContextError) return fail(J,e.code); throw e; }
  }
  if (seg[1]==='milestones' && (m==='POST'||m==='PATCH')) {
    const b=await readJson(req);
    const r=await saveMilestone(env,user.id,b,'web',m==='PATCH'?seg[2]:null);
    return r.ok?J(r):fail(J,r.error);
  }
  if (p === '/api/chat' && m === 'POST') {
    const { text } = await readJson(req);
    if (!text || !String(text).trim()) return J({ error: 'empty' }, 400);
    return J(await runAssistant(env, user.id, 'web', String(text).trim()));
  }
  if (p === '/api/actions' && m === 'POST') {
    const b = await readJson(req);
    const { data, reminders } = b || {};
    if (!data || typeof data !== 'string') return J({ error: 'bad_request' }, 400);
    if (data.split(':')[0] === 'doc_save' && !data.split(':')[1] && (b.season_id !== captured.season.id || b.selection_version !== captured.selection_version)) return fail(J, 'conflict');
    return J(await runCardAction(env, user.id, 'web', data, {reminders, item: b.item, version: b.version, request_id: b.request_id, season_id: b.season_id, selection_version: b.selection_version}));
  }
  if (p === '/api/ocr' && m === 'POST') {
    let fd; try { fd = await req.formData(); } catch { return J({ error: 'bad_form' }, 400); }
    const f = fd.get('file');
    if (!f || typeof f === 'string') return J({ error: 'no_file' }, 400);
    const r = await extractDocument(env, user.id, 'web', { bytes: await f.arrayBuffer(), mime: f.type, docType: fd.get('docType') || undefined });
    return r.ok ? J(r) : fail(J, r.error);
  }
  if (seg[1] === 'extractions' && seg[3] && m === 'POST') {
    const r = seg[3] === 'confirm' ? await confirmExtraction(env, user.id, seg[2], 'web') : seg[3] === 'discard' ? await discardExtraction(env, user.id, seg[2]) : null;
    if (!r) return J({ error: 'not_found' }, 404);
    return r.ok ? J(r) : fail(J, r.error);
  }
  if (p === '/api/applications' && m === 'POST') {
    const b = await readJson(req);
    if (!b.company || !STATUS.includes(b.status)) return J({ error: 'bad_request' }, 400);
    const r = await addApplication(env, user.id, { company: b.company, role: b.role, status: b.status, next_step: b.next_step, url: b.url, truth_level: 'USER_REPORTED' }, 'web');
    return r.ok ? J(r) : fail(J, r.error);
  }
  if (seg[1] === 'applications' && seg[2] && m === 'PATCH') {
    const b = await readJson(req);
    if (!STATUS.includes(b.status)) return J({ error: 'bad_request' }, 400);
    const r = await updateApplicationStatus(env, user.id, { id: seg[2], status: b.status, next_step: b.next_step }, 'web');
    return r.ok ? J(r) : fail(J, r.error);
  }
  if (seg[1] === 'tasks' && seg[2] && m === 'PATCH') {
    const { done } = await readJson(req);
    const r = await setTaskById(env, user.id, seg[2], done, 'web');
    return r.ok ? J(r) : fail(J, r.error);
  }
  if (p === '/api/reminders' && m === 'POST') {
    const b = await readJson(req);
    if (!b.text || !b.datetime) return J({ error: 'bad_request' }, 400);
    const r = await addReminder(env, user.id, { text: b.text, datetime: b.datetime }, 'web');
    return r.ok ? J(r) : fail(J, r.error);
  }
  if (seg[1] === 'reminders' && seg[2] && !seg[3] && m === 'DELETE') {
    const r = await deleteReminder(env, user.id, { id: seg[2] }, 'web');
    return r.ok ? J(r) : fail(J, 'not_found');
  }
  if (seg[1] === 'reminders' && seg[2] && seg[3] === 'seen' && m === 'POST') {
    const r = await markReminderSeen(env, user.id, seg[2]);
    return r.ok ? J(r) : fail(J, 'not_found');
  }
  return J({ error: 'not_found' }, 404);
}
