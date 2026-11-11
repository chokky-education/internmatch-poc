import { env } from 'cloudflare:test';
import { seedDemo } from './fixtures.js';
import { seedUser } from '../src/store.js';
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
  it('seedUser gives a new user an empty board and no sample documents, only a checklist that is not marked verified or done', async () => {
    await env.DB.exec('DELETE FROM applications; DELETE FROM tasks; DELETE FROM documents;');
    await seedUser(env, U);
    const o = await getOverview(env, U);
    expect(o.applications).toEqual([]);
    expect(o.my_documents).toEqual([]);
    expect(o.university_checklist.length).toBeGreaterThan(0);
    expect(o.university_checklist.every(t => !t.done && t.truth_level !== 'SYSTEM_VERIFIED')).toBe(true);
  });
  it('addApplication without a role saves with role "ไม่ระบุ"', async () => {
    const r = await addApplication(env, U, { company: 'Dynamic', status: 'Applied', truth_level: 'USER_REPORTED' }, 'line');
    expect(r.ok).toBe(true);
    expect((await getOverview(env, U)).applications.find(a => a.company === 'Dynamic').role).toBe('ไม่ระบุ');
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
