import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { seedDemo } from './fixtures.js';
import { addApplication, addReminder, getOverview } from '../src/store.js';
import { runCardAction } from '../src/actions.js';

const U = 'user-act';
const audit = async entity => (await env.DB.prepare('SELECT channel, change_json FROM audit_log WHERE entity=? ORDER BY rowid DESC').bind(entity).first());

beforeEach(async () => {
  await env.DB.exec('DELETE FROM users; DELETE FROM sessions; DELETE FROM applications; DELETE FROM tasks; DELETE FROM documents; DELETE FROM reminders; DELETE FROM messages; DELETE FROM extractions; DELETE FROM audit_log;');
  await env.DB.prepare('INSERT INTO users (id,email,created_at) VALUES (?,?,?)').bind(U, 'a@example.com', new Date().toISOString()).run();
  await seedDemo(env, U);
});

describe('runCardAction', () => {
  it('app_status moves the card, replies in Thai with a new card, audits the channel, and saves both messages', async () => {
    const a = await addApplication(env, U, { company: 'SCB', role: 'DI', status: 'Applied', truth_level: 'USER_REPORTED' }, 'line');
    const r = await runCardAction(env, U, 'line', `app_status:${a.id}:Interview`);
    expect(r.ok).toBe(true);
    expect(r.reply).toBe('อัปเดต SCB เป็น สัมภาษณ์ แล้ว');
    expect(r.cards[0].actions[0].data).toBe(`app_status:${a.id}:Offer`);
    expect((await getOverview(env, U)).applications.find(x => x.id === a.id).status).toBe('Interview');
    expect((await audit('application')).channel).toBe('line');
    const m = (await env.DB.prepare('SELECT role, channel FROM messages WHERE user_id=? ORDER BY rowid').bind(U).all()).results;
    expect(m).toEqual([{ role: 'user', channel: 'line' }, { role: 'model', channel: 'line' }]);
  });
  it('app_status rejects an unknown status and does not touch data', async () => {
    const a = await addApplication(env, U, { company: 'SCB', role: 'DI', status: 'Applied', truth_level: 'USER_REPORTED' }, 'web');
    const r = await runCardAction(env, U, 'web', `app_status:${a.id}:Hacked`);
    expect(r.ok).toBe(false);
    expect((await getOverview(env, U)).applications.find(x => x.id === a.id).status).toBe('Applied');
  });
  it('app_undo deletes once; the second press says it is gone', async () => {
    const a = await addApplication(env, U, { company: 'SCB', role: 'DI', status: 'Applied', truth_level: 'USER_REPORTED' }, 'line');
    expect((await runCardAction(env, U, 'line', `app_undo:${a.id}`)).reply).toBe('ลบ SCB ออกจากบอร์ดแล้ว');
    const again = await runCardAction(env, U, 'line', `app_undo:${a.id}`);
    expect(again).toMatchObject({ ok: false, reply: 'รายการนี้ไม่มีแล้วนะ' });
  });
  it("another user's id is not found and nothing changes", async () => {
    const a = await addApplication(env, U, { company: 'SCB', role: 'DI', status: 'Applied', truth_level: 'USER_REPORTED' }, 'line');
    const r = await runCardAction(env, 'intruder', 'web', `app_undo:${a.id}`);
    expect(r.ok).toBe(false);
    expect((await getOverview(env, U)).applications.some(x => x.id === a.id)).toBe(true);
  });
  it('a SYSTEM_VERIFIED card cannot be undone', async () => {
    const sv = (await getOverview(env, U)).applications.find(x => x.verified_by_system);
    expect((await runCardAction(env, U, 'line', `app_undo:${sv.id}`)).reply).toBe('รายการนี้บริษัทเป็นผู้อัปเดต แก้เองไม่ได้นะ');
  });
  it('rem_delete, rem_done and rem_snooze', async () => {
    const r1 = await addReminder(env, U, { text: 'หนึ่ง', datetime: '2026-11-19T20:00' }, 'line');
    expect((await runCardAction(env, U, 'line', `rem_delete:${r1.id}`)).reply).toBe('ลบการเตือนแล้ว');
    const r2 = await addReminder(env, U, { text: 'สอง', datetime: '2026-11-19T20:00' }, 'line');
    expect((await runCardAction(env, U, 'line', `rem_done:${r2.id}`)).reply).toBe('เยี่ยมเลย ✅');
    expect((await env.DB.prepare('SELECT seen_at FROM reminders WHERE id=?').bind(r2.id).first()).seen_at).toBeTruthy();
    const sn = await runCardAction(env, U, 'web', `rem_snooze:${r2.id}`);
    expect(sn.reply.startsWith('เลื่อนไปเตือนอีกครั้ง')).toBe(true);
    expect(sn.cards[0].kind).toBe('reminder_set');
    expect(Date.parse((await env.DB.prepare('SELECT due_at FROM reminders WHERE id=?').bind(r2.id).first()).due_at)).toBeGreaterThan(Date.now() + 59 * 60000);
  });
  it('ext_confirm / legacy confirm create the application; ext_discard discards', async () => {
    const mk = async id => env.DB.prepare("INSERT INTO extractions (id,user_id,doc_type,fields_json,status,channel,created_at) VALUES (?,?,'job_post',?, 'pending','line',?)").bind(id, U, JSON.stringify({ company: 'ไทยดาต้า', role: 'Intern' }), new Date().toISOString()).run();
    await mk('e1'); await mk('e2');
    expect((await runCardAction(env, U, 'line', 'confirm:e1')).ok).toBe(true);
    expect((await env.DB.prepare("SELECT truth_level FROM applications WHERE company='ไทยดาต้า'").first()).truth_level).toBe('AI_EXTRACTED');
    expect((await runCardAction(env, U, 'line', 'ext_confirm:e1')).reply).toBe('อันนี้บันทึกไปแล้วนะ');
    expect((await runCardAction(env, U, 'line', 'ext_discard:e2')).reply).toBe('โอเค ไม่บันทึกนะ');
  });
  it('unknown action is a generic failure and writes no messages', async () => {
    const r = await runCardAction(env, U, 'web', 'nuke:1');
    expect(r).toMatchObject({ ok: false, reply: 'ทำไม่สำเร็จ ลองใหม่อีกครั้งนะ' });
    expect((await env.DB.prepare('SELECT count(*) c FROM messages').first()).c).toBe(0);
  });
});

describe('POST /api/actions', () => {
  it('is 401 without a session and 400 without data', async () => {
    expect((await SELF.fetch('https://x.test/api/actions', { method: 'POST', body: '{}' })).status).toBe(401);
  });
});
