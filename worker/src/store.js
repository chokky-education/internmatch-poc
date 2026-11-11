import { SEED_TASKS } from './seed.js';

const nowIso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const thDate = () => new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
const bare = s => String(s || '').replace(/บริษัท\s*/, '').trim().toLowerCase();

async function audit(env, userId, entity, entityId, change, channel, truth) {
  await env.DB.prepare('INSERT INTO audit_log (id,user_id,entity,entity_id,change_json,channel,truth_level,at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(uuid(), userId, entity, entityId, JSON.stringify(change), channel, truth || null, nowIso()).run();
}

export async function seedUser(env, userId) {
  const now = nowIso(), db = env.DB;
  await db.batch(SEED_TASKS.map((t, i) => db.prepare('INSERT INTO tasks (id,user_id,title,detail,done,truth_level,sort) VALUES (?,?,?,?,?,?,?)')
    .bind(uuid(), userId, t.title, t.detail, 0, 'USER_REPORTED', i)));
}

export async function getOverview(env, userId) {
  const q = (sql) => env.DB.prepare(sql).bind(userId).all().then(r => r.results);
  const [apps, tasks, docs, rems] = await Promise.all([
    q('SELECT * FROM applications WHERE user_id=? ORDER BY updated_at DESC, rowid DESC'),
    q('SELECT * FROM tasks WHERE user_id=? ORDER BY sort'),
    q("SELECT * FROM documents WHERE user_id=? ORDER BY created_at, rowid"),
    q('SELECT * FROM reminders WHERE user_id=? ORDER BY due_at'),
  ]);
  return {
    applications: apps.map(a => ({ id: a.id, company: a.company, role: a.role, status: a.status, next_step: a.next_step, url: a.url, truth_level: a.truth_level, verified_by_system: a.truth_level === 'SYSTEM_VERIFIED', history: JSON.parse(a.history_json), updated_at: a.updated_at })),
    university_checklist: tasks.map(t => ({ id: t.id, task: t.title, detail: t.detail, done: !!t.done, truth_level: t.truth_level })),
    my_documents: docs.map(d => ({ id: d.id, kind: d.kind, name: d.title, status: d.status, note: d.note, fields: JSON.parse(d.fields_json), truth_level: d.truth_level })),
    reminders: rems.map(r => ({ id: r.id, text: r.text, due_at: r.due_at, sent_at: r.sent_at, delivery: r.delivery, seen_at: r.seen_at })),
  };
}

async function findApp(env, userId, company) {
  const c = bare(company);
  const rows = (await env.DB.prepare('SELECT * FROM applications WHERE user_id=?').bind(userId).all()).results;
  return rows.find(a => { const n = bare(a.company); return n.includes(c) || c.includes(n); });
}

export async function addApplication(env, userId, a, channel) {
  const existing = (await env.DB.prepare('SELECT company FROM applications WHERE user_id=?').bind(userId).all()).results;
  if (existing.some(r => bare(r.company) === bare(a.company))) return { ok: false, error: 'duplicate' };
  const id = uuid(), hist = [[thDate(), `บันทึกผ่าน ${channel === 'line' ? 'LINE' : 'เว็บ'} (${a.truth_level})`]];
  await env.DB.prepare('INSERT INTO applications (id,user_id,company,role,status,next_step,url,truth_level,history_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, userId, a.company, a.role || 'ไม่ระบุ', a.status, a.next_step || '—', a.url || null, a.truth_level, JSON.stringify(hist), nowIso()).run();
  await audit(env, userId, 'application', id, { op: 'add', company: a.company, status: a.status }, channel, a.truth_level);
  return { ok: true, id, company: a.company, role: a.role || 'ไม่ระบุ', status: a.status };
}

export async function updateApplicationStatus(env, userId, { company, status, next_step, id }, channel) {
  const x = id ? await env.DB.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').bind(id, userId).first() : await findApp(env, userId, company);
  if (!x) return { ok: false, error: 'not_found' };
  if (x.truth_level === 'SYSTEM_VERIFIED') return { ok: false, error: 'system_verified' };
  const hist = JSON.parse(x.history_json); hist.push([thDate(), `อัปเดตผ่าน ${channel === 'line' ? 'LINE' : 'เว็บ'} → ${status}`]);
  await env.DB.prepare('UPDATE applications SET status=?, next_step=?, history_json=?, truth_level=?, updated_at=? WHERE id=?')
    .bind(status, next_step || x.next_step, JSON.stringify(hist), 'USER_REPORTED', nowIso(), x.id).run();
  await audit(env, userId, 'application', x.id, { op: 'status', from: x.status, to: status }, channel, 'USER_REPORTED');
  return { ok: true, id: x.id, company: x.company, role: x.role, status };
}

export async function setTask(env, userId, { task_keyword, done }, channel) {
  const rows = (await env.DB.prepare('SELECT * FROM tasks WHERE user_id=?').bind(userId).all()).results;
  const t = rows.find(r => r.title.includes(task_keyword));
  if (!t) return { ok: false, error: 'not_found' };
  await env.DB.prepare('UPDATE tasks SET done=? WHERE id=?').bind(done ? 1 : 0, t.id).run();
  await audit(env, userId, 'task', t.id, { op: 'done', done: !!done }, channel, 'USER_REPORTED');
  return { ok: true, task: t.title, done: !!done };
}

export async function setTaskById(env, userId, id, done, channel) {
  const t = await env.DB.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').bind(id, userId).first();
  if (!t) return { ok: false, error: 'not_found' };
  await env.DB.prepare('UPDATE tasks SET done=? WHERE id=?').bind(done ? 1 : 0, id).run();
  await audit(env, userId, 'task', id, { op: 'done', done: !!done }, channel, 'USER_REPORTED');
  return { ok: true };
}

export async function markReminderSeen(env, userId, id) {
  const r = await env.DB.prepare('UPDATE reminders SET seen_at=? WHERE id=? AND user_id=?').bind(nowIso(), id, userId).run();
  return { ok: r.meta.changes > 0 };
}

export async function addReminder(env, userId, { text, datetime }, channel) {
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/.test(datetime);
  const d = new Date(hasOffset ? datetime : `${datetime}+07:00`);
  if (!/^\d{4}-\d{2}-\d{2}/.test(datetime) || isNaN(d)) return { ok: false, error: 'invalid_datetime' };
  const id = uuid(), due = d.toISOString();
  await env.DB.prepare('INSERT INTO reminders (id,user_id,text,due_at) VALUES (?,?,?,?)').bind(id, userId, text, due).run();
  await audit(env, userId, 'reminder', id, { op: 'add', text, due_at: due }, channel, 'USER_REPORTED');
  return { ok: true, id, text, due_at: due };
}

export async function deleteApplication(env, userId, id, channel) {
  const x = await env.DB.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').bind(id, userId).first();
  if (!x) return { ok: false, error: 'not_found' };
  if (x.truth_level === 'SYSTEM_VERIFIED') return { ok: false, error: 'system_verified' };
  await env.DB.prepare('DELETE FROM applications WHERE id=? AND user_id=?').bind(id, userId).run();
  await audit(env, userId, 'application', id, { op: 'delete', company: x.company, status: x.status }, channel, 'USER_REPORTED');
  return { ok: true, company: x.company };
}

export async function snoozeReminder(env, userId, id, minutes, channel, now = new Date()) {
  const r = await env.DB.prepare('SELECT * FROM reminders WHERE id=? AND user_id=?').bind(id, userId).first();
  if (!r) return { ok: false, error: 'not_found' };
  const due = new Date(now.getTime() + minutes * 60000).toISOString();
  await env.DB.prepare('UPDATE reminders SET due_at=?, sent_at=NULL, delivery=NULL, seen_at=NULL WHERE id=?').bind(due, id).run();
  await audit(env, userId, 'reminder', id, { op: 'snooze', due_at: due }, channel, 'USER_REPORTED');
  return { ok: true, id, text: r.text, due_at: due };
}

export async function deleteReminder(env, userId, { id, text_keyword }, channel) {
  const rows = (await env.DB.prepare('SELECT * FROM reminders WHERE user_id=? ORDER BY due_at').bind(userId).all()).results;
  const k = String(text_keyword || '').toLowerCase();
  const hit = id ? rows.filter(r => r.id === id) : k ? rows.filter(r => r.text.toLowerCase().includes(k)) : [];
  if (!hit.length) return { ok: false, error: 'not_found' };
  for (const r of hit) {
    await env.DB.prepare('DELETE FROM reminders WHERE id=? AND user_id=?').bind(r.id, userId).run();
    await audit(env, userId, 'reminder', r.id, { op: 'delete', text: r.text, due_at: r.due_at }, channel, 'USER_REPORTED');
  }
  return { ok: true, deleted: hit.map(r => r.text) };
}

export async function addDocument(env, userId, { kind, title, fields, truth_level }, channel) {
  const id = uuid();
  await env.DB.prepare('INSERT INTO documents (id,user_id,kind,title,status,note,fields_json,truth_level,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id, userId, kind, title, 'warn', 'อ่านโดย AI กรุณาตรวจสอบ', JSON.stringify(fields || {}), truth_level, nowIso()).run();
  await audit(env, userId, 'document', id, { op: 'add', kind, title }, channel, truth_level);
  return { ok: true, id };
}
