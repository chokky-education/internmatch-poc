import { context } from './seasons.js';
import { SEED_TASKS } from './seed.js';

const nowIso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const thDate = () => new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
const bare = s => String(s || '').replace(/บริษัท\s*/, '').trim().toLowerCase();

async function scope(env,userId) { return (await context(env,userId)).season.id; }
async function write(env,userId,seasonId,stmt,entity,id,change,channel,truth) {
 // Both the mutation and its provenance commit in a single D1 transaction.
 const audit=env.DB.prepare('INSERT INTO audit_log(id,user_id,season_id,entity,entity_id,change_json,channel,truth_level,at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()>0')
 .bind(uuid(),userId,seasonId,entity,id,JSON.stringify(change),channel,truth||'USER_REPORTED',nowIso());
 const results=await env.DB.batch([stmt,audit]);return results[0].meta.changes;
}

export async function seedUser(env, userId) {
  const seasonId = await scope(env, userId);
  const now = nowIso(), db = env.DB;
  await db.batch(SEED_TASKS.map((t, i) => db.prepare('INSERT INTO tasks (id,user_id,season_id,title,detail,done,truth_level,sort) VALUES (?,?,?,?,?,?,?,?)')
    .bind(uuid(), userId, seasonId, t.title, t.detail, 0, 'USER_REPORTED', i)));
}

export async function getOverview(env, userId) {
  const seasonId = await scope(env, userId);
  const q = (sql) => env.DB.prepare(sql).bind(userId, seasonId).all().then(r => r.results);
  const [apps, tasks, docs, rems] = await Promise.all([
    q('SELECT * FROM applications WHERE user_id=? AND season_id=? ORDER BY updated_at DESC, rowid DESC'),
    q('SELECT * FROM tasks WHERE user_id=? AND season_id=? ORDER BY sort'),
    q("SELECT * FROM documents WHERE user_id=? AND season_id=? ORDER BY created_at, rowid"),
    q('SELECT * FROM reminders WHERE user_id=? AND season_id=? ORDER BY due_at'),
  ]);
  return {
    applications: apps.map(a => ({ id: a.id, company: a.company, role: a.role, status: a.status, next_step: a.next_step, url: a.url, truth_level: a.truth_level, verified_by_system: a.truth_level === 'SYSTEM_VERIFIED', history: JSON.parse(a.history_json), updated_at: a.updated_at })),
    university_checklist: tasks.map(t => ({ id: t.id, task: t.title, detail: t.detail, done: !!t.done, truth_level: t.truth_level })),
    my_documents: docs.map(d => ({ id: d.id, kind: d.kind, name: d.title, status: d.status, note: d.note, fields: JSON.parse(d.fields_json), truth_level: d.truth_level })),
    reminders: rems.map(r => ({ id: r.id, text: r.text, due_at: r.due_at, sent_at: r.sent_at, delivery: r.delivery, seen_at: r.seen_at })),
  };
}

async function findApp(env, userId, company) {
  const seasonId = await scope(env, userId);
  const c = bare(company);
  const rows = (await env.DB.prepare('SELECT * FROM applications WHERE user_id=? AND season_id=?').bind(userId, seasonId).all()).results;
  return rows.find(a => { const n = bare(a.company); return n.includes(c) || c.includes(n); });
}

export async function addApplication(env, userId, a, channel) {
  const seasonId = await scope(env, userId);
  const existing = (await env.DB.prepare('SELECT company FROM applications WHERE user_id=? AND season_id=?').bind(userId, seasonId).all()).results;
  if (existing.some(r => bare(r.company) === bare(a.company))) return { ok: false, error: 'duplicate' };
  const id = uuid(), hist = [[thDate(), `บันทึกผ่าน ${channel === 'line' ? 'LINE' : 'เว็บ'} (${a.truth_level})`]];
  const inserted=await write(env, userId, seasonId, env.DB.prepare('INSERT INTO applications (id,user_id,season_id,company,role,status,next_step,url,truth_level,history_json,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM applications WHERE user_id=? AND season_id=? AND lower(trim(replace(company,"บริษัท","")))=?)')
    .bind(id, userId, seasonId, a.company, a.role || 'ไม่ระบุ', a.status, a.next_step || '—', a.url || null, a.truth_level, JSON.stringify(hist), nowIso(),userId,seasonId,bare(a.company)), 'application', id, { op: 'add', company: a.company, status: a.status }, channel, a.truth_level);
  if(!inserted)return {ok:false,error:'duplicate'};
  return { ok: true, id, company: a.company, role: a.role || 'ไม่ระบุ', status: a.status };
}

export async function updateApplicationStatus(env, userId, { company, status, next_step, id }, channel) {
  const seasonId = await scope(env, userId);
  const x = id ? await env.DB.prepare('SELECT * FROM applications WHERE id=? AND user_id=? AND season_id=?').bind(id, userId, seasonId).first() : await findApp(env, userId, company);
  if (!x) return { ok: false, error: 'not_found' };
  if (x.truth_level === 'SYSTEM_VERIFIED') return { ok: false, error: 'system_verified' };
  const hist = JSON.parse(x.history_json); hist.push([thDate(), `อัปเดตผ่าน ${channel === 'line' ? 'LINE' : 'เว็บ'} → ${status}`]);
  await write(env, userId, seasonId, env.DB.prepare('UPDATE applications SET status=?, next_step=?, history_json=?, truth_level=?, updated_at=? WHERE id=? AND user_id=? AND season_id=?')
    .bind(status, next_step || x.next_step, JSON.stringify(hist), 'USER_REPORTED', nowIso(), x.id, userId, seasonId), 'application', x.id, { op: 'status', from: x.status, to: status }, channel, 'USER_REPORTED');
  return { ok: true, id: x.id, company: x.company, role: x.role, status };
}

export async function setTask(env, userId, { task_keyword, done }, channel) {
  const seasonId = await scope(env, userId);
  const rows = (await env.DB.prepare('SELECT * FROM tasks WHERE user_id=? AND season_id=?').bind(userId, seasonId).all()).results;
  const t = rows.find(r => r.title.includes(task_keyword));
  if (!t) return { ok: false, error: 'not_found' };
  await write(env, userId, seasonId, env.DB.prepare('UPDATE tasks SET done=? WHERE id=? AND user_id=? AND season_id=?').bind(done ? 1 : 0, t.id, userId, seasonId), 'task', t.id, { op: 'done', done: !!done }, channel, 'USER_REPORTED');
  return { ok: true, task: t.title, done: !!done };
}

export async function setTaskById(env, userId, id, done, channel) {
  const seasonId = await scope(env, userId);
  const t = await env.DB.prepare('SELECT * FROM tasks WHERE id=? AND user_id=? AND season_id=?').bind(id, userId, seasonId).first();
  if (!t) return { ok: false, error: 'not_found' };
  await write(env, userId, seasonId, env.DB.prepare('UPDATE tasks SET done=? WHERE id=? AND user_id=? AND season_id=?').bind(done ? 1 : 0, id, userId, seasonId), 'task', id, { op: 'done', done: !!done }, channel, 'USER_REPORTED');
  return { ok: true };
}

export async function markReminderSeen(env,userId,id,channel='web') {
 const r=await env.DB.prepare('SELECT * FROM reminders WHERE id=? AND user_id=?').bind(id,userId).first();
 if(!r)return {ok:false,error:'not_found'};
 if(r.seen_at)return {ok:true};
 await write(env,userId,r.season_id,env.DB.prepare('UPDATE reminders SET seen_at=? WHERE id=? AND user_id=?').bind(nowIso(),id,userId),'reminder',id,{op:'seen'},channel,'USER_REPORTED');
 return {ok:true};
}

export async function addReminder(env, userId, { text, datetime }, channel) {
  const seasonId = await scope(env, userId);
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/.test(datetime);
  const d = new Date(hasOffset ? datetime : `${datetime}+07:00`);
  if (!/^\d{4}-\d{2}-\d{2}/.test(datetime) || isNaN(d)) return { ok: false, error: 'invalid_datetime' };
  const id = uuid(), due = d.toISOString();
  await write(env, userId, seasonId, env.DB.prepare('INSERT INTO reminders (id,user_id,season_id,text,due_at) VALUES (?,?,?,?,?)').bind(id, userId, seasonId, text, due), 'reminder', id, { op: 'add', text, due_at: due }, channel, 'USER_REPORTED');
  return { ok: true, id, text, due_at: due };
}

export async function deleteApplication(env, userId, id, channel) {
  if (!await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(userId).first()) return {ok:false,error:'not_found'};
  const seasonId = await scope(env, userId);
  const x = await env.DB.prepare('SELECT * FROM applications WHERE id=? AND user_id=? AND season_id=?').bind(id, userId, seasonId).first();
  if (!x) return { ok: false, error: 'not_found' };
  if (x.truth_level === 'SYSTEM_VERIFIED') return { ok: false, error: 'system_verified' };
  await write(env, userId, seasonId, env.DB.prepare('DELETE FROM applications WHERE id=? AND user_id=? AND season_id=?').bind(id, userId, seasonId), 'application', id, { op: 'delete', company: x.company, status: x.status }, channel, 'USER_REPORTED');
  return { ok: true, company: x.company };
}

export async function snoozeReminder(env, userId, id, minutes, channel, now = new Date()) {
  const seasonId = await scope(env, userId);
  const r = await env.DB.prepare('SELECT * FROM reminders WHERE id=? AND user_id=? AND season_id=?').bind(id, userId, seasonId).first();
  if (!r) return { ok: false, error: 'not_found' };
  const due = new Date(now.getTime() + minutes * 60000).toISOString();
  await write(env, userId, seasonId, env.DB.prepare('UPDATE reminders SET due_at=?,version=version+1, sent_at=NULL, delivery=NULL, seen_at=NULL WHERE id=? AND user_id=? AND season_id=?').bind(due, id, userId, seasonId), 'reminder', id, { op: 'snooze', due_at: due }, channel, 'USER_REPORTED');
  return { ok: true, id, text: r.text, due_at: due };
}

export async function deleteReminder(env, userId, { id, text_keyword }, channel) {
  const seasonId = await scope(env, userId);
  const rows = (await env.DB.prepare('SELECT * FROM reminders WHERE user_id=? AND season_id=? ORDER BY due_at').bind(userId, seasonId).all()).results;
  const k = String(text_keyword || '').toLowerCase();
  const hit = id ? rows.filter(r => r.id === id) : k ? rows.filter(r => r.text.toLowerCase().includes(k)) : [];
  if (!hit.length) return { ok: false, error: 'not_found' };
  for (const r of hit) {
    await write(env, userId, seasonId, env.DB.prepare('DELETE FROM reminders WHERE id=? AND user_id=? AND season_id=?').bind(r.id, userId, seasonId), 'reminder', r.id, { op: 'delete', text: r.text, due_at: r.due_at }, channel, 'USER_REPORTED');
  }
  return { ok: true, deleted: hit.map(r => r.text) };
}

export async function addDocument(env, userId, { kind, title, fields, truth_level }, channel) {
  const seasonId = await scope(env, userId);
  const id = uuid();
  await write(env, userId, seasonId, env.DB.prepare('INSERT INTO documents (id,user_id,season_id,kind,title,status,note,fields_json,truth_level,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, userId, seasonId, kind, title, 'warn', 'อ่านโดย AI กรุณาตรวจสอบ', JSON.stringify(fields || {}), truth_level, nowIso()), 'document', id, { op: 'add', kind, title }, channel, truth_level);
  return { ok: true, id };
}
