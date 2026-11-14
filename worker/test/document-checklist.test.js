import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSession } from '../src/auth.js';
import { context } from '../src/seasons.js';
import { runCardAction } from '../src/actions.js';
import { seedUser } from '../src/store.js';

const U = 'document-student';
let cookie;
const api = async (path, body) => SELF.fetch('https://x.test' + path, {
  method: body ? 'POST' : 'GET',
  headers: { Origin: 'https://x.test', Cookie: cookie, 'Content-Type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const state = async () => (await api('/api/state')).json();
const save = async item => {
  const s = await state();
  return (await api('/api/actions', { data: 'doc_save', item, request_id: crypto.randomUUID(), season_id: s.selected_season.id, selection_version: s.selection_version })).json();
};

beforeEach(async () => {
  await env.DB.exec('DELETE FROM users; DELETE FROM sessions; DELETE FROM seasons; DELETE FROM applications; DELETE FROM tasks; DELETE FROM documents; DELETE FROM reminders; DELETE FROM messages; DELETE FROM extractions; DELETE FROM audit_log;');
  await env.DB.prepare('INSERT INTO users(id,email,created_at) VALUES (?,?,?)').bind(U, 'document@example.com', new Date().toISOString()).run();
  cookie = '__Host-im_session=' + await createSession(env, U);
  await context(env, U);
});

describe('student-owned document checklist', () => {
  it('keeps legacy progress intact while new seasons start without generic requirements', async () => {
    const c = await context(env, U);
    await env.DB.prepare("INSERT INTO tasks(id,user_id,season_id,title,done,truth_level) VALUES ('old-task',?,?,?,1,'USER_REPORTED')").bind(U, c.season.id, 'รายการจากหน้ารุ่นเดิม').run();
    await seedUser(env, U);
    let s = await state();
    expect(s.university_checklist).toEqual([expect.objectContaining({ id: 'old-task', done: true, legacy: true })]);
    expect(s.checklist_items).toEqual([]);
    const created = await (await api('/api/seasons', { name: 'ฝึกงานรอบใหม่' })).json();
    await api(`/api/seasons/${created.season.id}/select`, { selection_version: s.selection_version });
    s = await state();
    expect(s.university_checklist).toEqual([]);
    expect(s.checklist_items).toEqual([]);
    expect(s.checklist_summary.total).toBe(0);
  });
  it('adds an item with unknown requirements and reports prepared and submitted as separate states across channels', async () => {
    const added = await save({ title: 'ส่งหนังสือตอบรับ', source: 'ประกาศในกลุ่มสาขา' });
    expect(added.ok).toBe(true);
    let s = await state();
    expect(s.checklist_items).toHaveLength(1);
    const item = s.checklist_items[0];
    expect(item).toMatchObject({ title: 'ส่งหนังสือตอบรับ', source: 'ประกาศในกลุ่มสาขา', recipient: null, submission_method: null, due_date: null, status: 'todo', truth_level: 'USER_REPORTED', version: 0 });
    const prepared = await runCardAction(env, U, 'line', `doc_status:${item.id}:prepared:0`);
    expect(prepared.ok).toBe(true);
    s = await state();
    expect(s.checklist_summary).toMatchObject({ total: 1, prepared: 1, submitted: 0 });
    expect((await api('/api/actions', { data: `doc_status:${item.id}:submitted:1` })).status).toBe(200);
    s = await state();
    expect(s.checklist_items[0]).toMatchObject({ status: 'submitted', truth_level: 'USER_REPORTED', version: 2 });
    expect(s.checklist_summary).toMatchObject({ total: 1, prepared: 0, submitted: 1 });
    const audit = await (await api('/api/audit')).json();
    expect(audit.entries.filter(x => x.entity === 'checklist_item').map(x => x.channel).sort()).toEqual(['line', 'web', 'web']);
  });

  it('rejects invented dates and stale/foreign writes, and a retried add creates one item', async () => {
    expect((await save({ title: 'แบบฟอร์ม', due_date: '2027-02-30' })).ok).toBe(false);
    const initial = await state();
    const body = { data: 'doc_save', item: { title: 'แบบฟอร์มจริง', recipient: 'งานฝึกงาน' }, request_id: crypto.randomUUID(), season_id: initial.selected_season.id, selection_version: initial.selection_version };
    const created = await (await api('/api/actions', body)).json();
    expect(created.ok).toBe(true);
    expect((await (await api('/api/actions', body)).json()).ok).toBe(true);
    expect((await state()).checklist_items).toHaveLength(1);
    const updates = await Promise.all(['prepared', 'submitted'].map(status => runCardAction(env, U, 'line', `doc_status:${created.item.id}:${status}:0`)));
    expect(updates.filter(x => x.ok)).toHaveLength(1);
    expect((await runCardAction(env, 'foreign', 'line', `doc_status:${created.item.id}:submitted:1`)).ok).toBe(false);
    const other = await (await api('/api/seasons', { name: 'อีกฤดู' })).json();
    await api(`/api/seasons/${other.season.id}/select`, { selection_version: initial.selection_version });
    const stale = await api('/api/actions', { ...body, data: 'doc_save:', request_id: crypto.randomUUID() });
    expect(stale.status).toBe(409);
    expect((await state()).checklist_items).toEqual([]);
  });

  it('edits source details without resetting progress, rejects a stale edit, and keeps old cards in their original season', async () => {
    const added = await save({ title: 'ส่งแบบฟอร์ม', source: 'คู่มือที่ตรวจเอง', source_page: 'หน้า 4' });
    const id = added.item.id;
    await runCardAction(env, U, 'line', `doc_status:${id}:prepared:0`);
    const edit = { data: `doc_save:${id}`, version: 1, item: { title: 'ส่งแบบฟอร์มยืนยัน', recipient: 'งานฝึกงาน', submission_method: 'ส่งที่ห้องสำนักงาน', due_date: '2027-01-31' } };
    expect((await (await api('/api/actions', edit)).json()).ok).toBe(true);
    expect((await state()).checklist_items[0]).toMatchObject({ status: 'prepared', source: 'คู่มือที่ตรวจเอง', source_page: 'หน้า 4', recipient: 'งานฝึกงาน', due_date: '2027-01-31', version: 2 });
    expect((await (await api('/api/actions', { ...edit, item: { title: 'stale title' } })).json()).error).toBe('conflict');
    const original = await state();
    const other = await (await api('/api/seasons', { name: 'ฤดูใหม่' })).json();
    await api(`/api/seasons/${other.season.id}/select`, { selection_version: original.selection_version });
    expect((await runCardAction(env, U, 'line', `doc_status:${id}:submitted:2`)).ok).toBe(true);
    expect((await state()).checklist_items).toEqual([]);
    const current = await state();
    await api(`/api/seasons/${original.selected_season.id}/select`, { selection_version: current.selection_version });
    expect((await state()).checklist_items[0]).toMatchObject({ title: 'ส่งแบบฟอร์มยืนยัน', status: 'submitted', version: 3 });
  });

});
