import { env } from 'cloudflare:test';
import { seedDemo } from './fixtures.js';
import { seedUser, deleteApplication, snoozeReminder } from '../src/store.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { getOverview, addApplication, updateApplicationStatus, setTask, addReminder, addDocument } from '../src/store.js';

const U = 'user-1';
beforeEach(async () => {
  await env.DB.exec('DELETE FROM users; DELETE FROM applications; DELETE FROM tasks; DELETE FROM documents; DELETE FROM reminders; DELETE FROM audit_log;');
  await env.DB.prepare('INSERT INTO users (id,email,created_at) VALUES (?,?,?)').bind(U, 'ton@example.com', new Date().toISOString()).run();
  await seedDemo(env, U);
});
const audit = async () => (await env.DB.prepare('SELECT * FROM audit_log WHERE user_id=? ORDER BY at, rowid').bind(U).all()).results;

describe('seed + overview', () => {
  it('seedDemo test fixture creates applications, checklist and my documents with truth levels', async () => {
    const o = await getOverview(env, U);
    expect(o.applications.length).toBe(5);
    expect(o.university_checklist.length).toBe(6);
    expect(o.my_documents.length).toBe(5);
    expect(o.applications.every(a => ['SYSTEM_VERIFIED', 'USER_REPORTED', 'AI_EXTRACTED'].includes(a.truth_level))).toBe(true);
    expect(o.applications.find(a => a.company === 'บริษัท A').verified_by_system).toBe(true);
  });
});

describe('new real user', () => {
  it('seedUser gives a new user an empty board and no sample documents or faculty requirements', async () => {
    await env.DB.exec('DELETE FROM applications; DELETE FROM tasks; DELETE FROM documents;');
    await seedUser(env, U);
    const o = await getOverview(env, U);
    expect(o.applications).toEqual([]);
    expect(o.my_documents).toEqual([]);
    expect(o.university_checklist).toEqual([]);
    expect(o.checklist_items).toEqual([]);
  });
  it('addApplication without a role saves with role "ไม่ระบุ"', async () => {
    const r = await addApplication(env, U, { company: 'Dynamic', status: 'Applied', truth_level: 'USER_REPORTED' }, 'line');
    expect(r.ok).toBe(true);
    expect((await getOverview(env, U)).applications.find(a => a.company === 'Dynamic').role).toBe('ไม่ระบุ');
  });
});

describe('card support in store', () => {
  it('deleteApplication removes a user-reported card and audits; refuses SYSTEM_VERIFIED; not_found for another user', async () => {
    const a = await addApplication(env, U, { company: 'Del Co', role: 'X', status: 'Saved', truth_level: 'USER_REPORTED' }, 'line');
    expect(await deleteApplication(env, 'someone-else', a.id, 'web')).toEqual({ ok: false, error: 'not_found' });
    expect(await deleteApplication(env, U, a.id, 'line')).toEqual({ ok: true, company: 'Del Co' });
    expect((await getOverview(env, U)).applications.find(x => x.id === a.id)).toBeUndefined();
    const row = (await audit()).filter(r => r.entity === 'application').pop();
    expect(row.channel).toBe('line'); expect(JSON.parse(row.change_json).op).toBe('delete');
    const sv = (await getOverview(env, U)).applications.find(x => x.verified_by_system);
    expect(await deleteApplication(env, U, sv.id, 'web')).toEqual({ ok: false, error: 'system_verified' });
  });
  it('snoozeReminder moves due_at 60 minutes from now and clears sent/delivery/seen so cron sends it again', async () => {
    const r = await addReminder(env, U, { text: 'ส่งเอกสาร', datetime: '2026-11-19T20:00' }, 'line');
    await env.DB.prepare("UPDATE reminders SET sent_at='x', delivery='line', seen_at='y' WHERE id=?").bind(r.id).run();
    const now = new Date('2026-11-19T13:30:00Z');
    const s = await snoozeReminder(env, U, r.id, 60, 'line', now);
    expect(s).toMatchObject({ ok: true, id: r.id, text: 'ส่งเอกสาร', due_at: '2026-11-19T14:30:00.000Z' });
    const row = await env.DB.prepare('SELECT * FROM reminders WHERE id=?').bind(r.id).first();
    expect([row.sent_at, row.delivery, row.seen_at]).toEqual([null, null, null]);
    expect(await snoozeReminder(env, U, 'nope', 60, 'line', now)).toEqual({ ok: false, error: 'not_found' });
  });
  it('add/update/addReminder results include id, company, role, status, text', async () => {
    const a = await addApplication(env, U, { company: 'Echo', status: 'Applied', truth_level: 'USER_REPORTED' }, 'web');
    expect(a).toMatchObject({ ok: true, company: 'Echo', role: 'ไม่ระบุ', status: 'Applied' }); expect(a.id).toBeTruthy();
    const u = await updateApplicationStatus(env, U, { id: a.id, status: 'Interview' }, 'web');
    expect(u).toMatchObject({ ok: true, id: a.id, company: 'Echo', role: 'ไม่ระบุ', status: 'Interview' });
    expect((await addReminder(env, U, { text: 'เตือน', datetime: '2026-11-19T20:00' }, 'web')).text).toBe('เตือน');
  });
});

describe('applications', () => {
  it('add succeeds then duplicate company is rejected', async () => {
    const a = await addApplication(env, U, { company: 'บริษัท Z', role: 'Intern', status: 'Saved', truth_level: 'USER_REPORTED' }, 'line');
    expect(a.ok).toBe(true);
    const b = await addApplication(env, U, { company: 'Z', role: 'Intern', status: 'Saved', truth_level: 'USER_REPORTED' }, 'web');
    expect(b).toEqual({ ok: false, error: 'duplicate' });
  });
  it('updating a SYSTEM_VERIFIED application is refused', async () => {
    expect(await updateApplicationStatus(env, U, { company: 'บริษัท A', status: 'Offer' }, 'line')).toEqual({ ok: false, error: 'system_verified' });
  });
  it('updating a user-reported application by partial company name works and unknown is not_found', async () => {
    expect((await updateApplicationStatus(env, U, { company: 'B', status: 'Interview', next_step: 'สัมภาษณ์ 20 พ.ย.' }, 'web')).ok).toBe(true);
    const o = await getOverview(env, U);
    expect(o.applications.find(a => a.company === 'บริษัท B').status).toBe('Interview');
    expect(await updateApplicationStatus(env, U, { company: 'ไม่มีอยู่', status: 'Closed' }, 'web')).toEqual({ ok: false, error: 'not_found' });
  });
  it('every mutation writes an audit row with the channel and truth level', async () => {
    await addApplication(env, U, { company: 'บริษัท Z', role: 'Intern', status: 'Saved', truth_level: 'AI_EXTRACTED' }, 'line');
    await updateApplicationStatus(env, U, { company: 'B', status: 'Closed' }, 'web');
    const rows = (await audit()).filter(r => r.entity === 'application');
    expect(rows.map(r => r.channel)).toEqual(['line', 'web']);
    expect(rows[0].truth_level).toBe('AI_EXTRACTED');
  });
});

describe('tasks, reminders, documents', () => {
  it('setTask ticks a checklist item by keyword', async () => {
    expect((await setTask(env, U, { task_keyword: 'ปฐมนิเทศ', done: true }, 'line')).ok).toBe(true);
    const o = await getOverview(env, U);
    expect(o.university_checklist.find(t => t.task.includes('ปฐมนิเทศ')).done).toBe(true);
    expect(await setTask(env, U, { task_keyword: 'ไม่มีรายการนี้', done: true }, 'line')).toEqual({ ok: false, error: 'not_found' });
  });
  it('addReminder treats offset-less datetime as Asia/Bangkok', async () => {
    const r = await addReminder(env, U, { text: 'สัมภาษณ์', datetime: '2026-11-19T20:00' }, 'line');
    expect(r.ok).toBe(true);
    const row = await env.DB.prepare('SELECT due_at FROM reminders WHERE user_id=?').bind(U).first();
    expect(row.due_at).toBe('2026-11-19T13:00:00.000Z');
  });
  it('addReminder rejects an invalid datetime', async () => {
    expect(await addReminder(env, U, { text: 'x', datetime: 'พรุ่งนี้' }, 'web')).toEqual({ ok: false, error: 'invalid_datetime' });
  });
  it('addDocument stores AI_EXTRACTED documents with fields', async () => {
    const r = await addDocument(env, U, { kind: 'transcript', title: 'Transcript', fields: { gpa: '3.5' }, truth_level: 'AI_EXTRACTED' }, 'line');
    expect(r.ok).toBe(true);
    const row = await env.DB.prepare('SELECT truth_level, fields_json FROM documents WHERE id=?').bind(r.id).first();
    expect(row.truth_level).toBe('AI_EXTRACTED');
    expect(JSON.parse(row.fields_json).gpa).toBe('3.5');
  });
});
