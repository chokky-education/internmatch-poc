import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { seedUser, addApplication, addReminder, setTask } from '../src/store.js';
import { runCardAction } from '../src/actions.js';
import { toFlex } from '../src/flex.js';

const U = 'user-menu';
beforeEach(async () => {
  await env.DB.exec('DELETE FROM users; DELETE FROM applications; DELETE FROM tasks; DELETE FROM documents; DELETE FROM reminders; DELETE FROM messages; DELETE FROM audit_log;');
  await env.DB.prepare('INSERT INTO users (id,email,created_at) VALUES (?,?,?)').bind(U, 'm@example.com', new Date().toISOString()).run();
  await seedUser(env, U);
});
const flexOk = c => { const f = toFlex(c); expect(f.altText.length).toBeGreaterThan(0); return f; };

describe('menu actions answer with fixed summary cards, no Gemini', () => {
  it('menu:apps lists every application with its Thai status; empty board says so', async () => {
    let r = await runCardAction(env, U, 'line', 'menu:apps');
    expect(r.ok).toBe(true);
    expect(r.reply).toContain('ยังไม่มีใบสมัคร');
    await addApplication(env, U, { company: 'SCB', role: 'DI', status: 'Interview', truth_level: 'USER_REPORTED' }, 'line');
    await addApplication(env, U, { company: 'Agoda', status: 'Applied', truth_level: 'USER_REPORTED' }, 'line');
    r = await runCardAction(env, U, 'line', 'menu:apps');
    expect(r.cards[0].kind).toBe('summary');
    expect(r.cards[0].rows).toEqual(expect.arrayContaining([['SCB', 'สัมภาษณ์'], ['Agoda', 'สมัครแล้ว']]));
    flexOk(r.cards[0]);
  });
  it('menu:checklist shows only unfinished items and the progress count', async () => {
    await setTask(env, U, { task_keyword: 'ลงทะเบียน', done: true }, 'line');
    const r = await runCardAction(env, U, 'web', 'menu:checklist');
    expect(r.cards[0].title).toContain('1/6');
    expect(r.cards[0].rows.some(([k]) => k.includes('ลงทะเบียน'))).toBe(false);
    expect(r.cards[0].rows.length).toBe(5);
  });
  it('menu:reminders lists upcoming reminders in Bangkok time with delete buttons', async () => {
    const future = new Date(Date.now() + 86400e3).toISOString();
    const a = await addReminder(env, U, { text: 'ส่งเอกสาร', datetime: future }, 'line');
    await addReminder(env, U, { text: 'อดีต', datetime: '2020-01-01T10:00' }, 'line');
    const r = await runCardAction(env, U, 'line', 'menu:reminders');
    expect(r.cards[0].rows.map(x => x[0])).toEqual(['ส่งเอกสาร']);
    expect(r.cards[0].actions.map(x => x.data)).toEqual([`rem_delete:${a.id}`]);
    flexOk(r.cards[0]);
  });
  it('menu:today combines upcoming reminders, stale applications and the next checklist item', async () => {
    await addReminder(env, U, { text: 'สัมภาษณ์ SCB', datetime: new Date(Date.now() + 3600e3).toISOString() }, 'line');
    const old = await addApplication(env, U, { company: 'OldCo', status: 'Applied', truth_level: 'USER_REPORTED' }, 'line');
    await env.DB.prepare('UPDATE applications SET updated_at=? WHERE id=?').bind(new Date(Date.now() - 20 * 86400e3).toISOString(), old.id).run();
    const r = await runCardAction(env, U, 'line', 'menu:today');
    const rows = r.cards[0].rows.map(x => x.join(' '));
    expect(rows.some(t => t.includes('สัมภาษณ์ SCB'))).toBe(true);
    expect(rows.some(t => t.includes('OldCo'))).toBe(true);
    expect(rows.some(t => t.includes('ลงทะเบียนรายวิชาฝึกงาน'))).toBe(true);
    flexOk(r.cards[0]);
  });
  it('menu presses are saved as a chat turn so the web shows them too', async () => {
    await runCardAction(env, U, 'line', 'menu:today');
    const m = (await env.DB.prepare('SELECT role, content FROM messages WHERE user_id=? ORDER BY rowid').bind(U).all()).results;
    expect(m[0]).toEqual({ role: 'user', content: 'วันนี้ต้องทำอะไร' });
  });
  it('unknown menu is a generic failure', async () => {
    expect((await runCardAction(env, U, 'line', 'menu:nope')).ok).toBe(false);
  });
});
