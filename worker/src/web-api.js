import { json, readJson } from './http.js';
import { getOverview, addApplication, updateApplicationStatus, setTaskById, addReminder, deleteReminder, markReminderSeen } from './store.js';
import { runAssistant } from './assistant.js';
import { extractDocument, confirmExtraction, discardExtraction } from './ocr.js';

const STATUS = ['Saved', 'Applied', 'Interview', 'Offer', 'Closed'];
const ERR = { duplicate: 409, system_verified: 403, not_found: 404, already_confirmed: 409, not_pending: 409, too_large: 413, invalid_datetime: 400 };
const fail = (J, error) => J({ ok: false, error }, ERR[error] || 502);

export async function state(env, user) {
  const [o, msgs, pend] = await Promise.all([
    getOverview(env, user.id),
    env.DB.prepare('SELECT channel, role, content, created_at, cards_json FROM messages WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 50').bind(user.id).all(),
    env.DB.prepare("SELECT id, doc_type, fields_json, channel, created_at FROM extractions WHERE user_id=? AND status='pending' ORDER BY created_at").bind(user.id).all(),
  ]);
  const now = Date.now();
  return {
    ...o,
    messages: msgs.results.reverse().map(({ cards_json, ...m }) => ({ ...m, cards: cards_json ? JSON.parse(cards_json) : [] })),
    pending_extractions: pend.results.map(e => ({ id: e.id, doc_type: e.doc_type, fields: JSON.parse(e.fields_json), channel: e.channel })),
    unseen_reminders: o.reminders.filter(r => !r.seen_at && Date.parse(r.due_at) <= now && (!r.delivery || r.delivery === 'failed')),
    user: { email: user.email, line_linked: !!user.line_user_id },
  };
}

export async function handleApi(req, env, user, url) {
  const p = url.pathname, m = req.method, J = (d, s = 200) => json(d, s, env, req);
  const seg = p.split('/').filter(Boolean); // ['api', ...]
  if (p === '/api/state' && m === 'GET') return J(await state(env, user));
  if (p === '/api/chat' && m === 'POST') {
    const { text } = await readJson(req);
    if (!text || !String(text).trim()) return J({ error: 'empty' }, 400);
    return J(await runAssistant(env, user.id, 'web', String(text).trim()));
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
    if (!b.company || !b.role || !STATUS.includes(b.status)) return J({ error: 'bad_request' }, 400);
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
