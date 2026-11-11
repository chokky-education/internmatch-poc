import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { addReminder } from '../src/store.js';
import { sendDueReminders } from '../src/reminders.js';

const U = 'user-r', LU = 'Uremind';
let pushes, pushOk, realFetch, flexRejected = false;

beforeEach(async () => {
  await env.DB.exec('DELETE FROM users; DELETE FROM sessions; DELETE FROM reminders; DELETE FROM audit_log;');
  await env.DB.prepare('INSERT INTO users (id,email,line_user_id,created_at) VALUES (?,?,?,?)').bind(U, 'ton@example.com', LU, new Date().toISOString()).run();
  await env.DB.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').bind('abcdef0123456789', U, new Date(Date.now() + 1e9).toISOString()).run();
  pushes = []; pushOk = true; flexRejected = false; realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => {
    if (String(u).includes('api.line.me/v2/bot/message/push')) { const b = JSON.parse(init.body); pushes.push(b); return new Response('{}', { status: !pushOk || (flexRejected && JSON.stringify(b).includes('"flex"')) ? 400 : 200 }); }
    return realFetch(u, init);
  });
});
afterEach(() => vi.restoreAllMocks());

const row = id => env.DB.prepare('SELECT * FROM reminders WHERE id=?').bind(id).first();

describe('reminder cards', () => {
  it('the push is a flex card with done and snooze buttons', async () => {
    const { id } = await addReminder(env, U, { text: 'ส่งเอกสาร', datetime: '2026-11-19T20:00' }, 'line');
    await sendDueReminders(env, new Date('2026-11-19T13:00:00Z'));
    const m = pushes[0].messages[0];
    expect(m.type).toBe('flex');
    expect(m.contents.footer.contents.map(b => b.action.data)).toEqual([`rem_done:${id}`, `rem_snooze:${id}`]);
  });
  it('if LINE rejects the flex push it falls back to the plain text push and is still marked delivered', async () => {
    flexRejected = true;
    const { id } = await addReminder(env, U, { text: 'ส่งเอกสาร', datetime: '2026-11-19T20:00' }, 'line');
    expect(await sendDueReminders(env, new Date('2026-11-19T13:00:00Z'))).toEqual({ sent: 1, failed: 0 });
    expect(pushes.at(-1).messages[0].type).toBe('text');
    expect((await row(id)).delivery).toBe('line');
  });
  it('a snoozed reminder is sent again by a later run', async () => {
    const { snoozeReminder } = await import('../src/store.js');
    const { id } = await addReminder(env, U, { text: 'ส่งเอกสาร', datetime: '2026-11-19T20:00' }, 'line');
    await sendDueReminders(env, new Date('2026-11-19T13:00:00Z'));
    await snoozeReminder(env, U, id, 60, 'line', new Date('2026-11-19T13:05:00Z'));
    expect(await sendDueReminders(env, new Date('2026-11-19T14:00:00Z'))).toEqual({ sent: 0, failed: 0 });
    expect(await sendDueReminders(env, new Date('2026-11-19T14:06:00Z'))).toEqual({ sent: 1, failed: 0 });
    expect(pushes.length).toBe(2);
  });
});

describe('sendDueReminders', () => {
  it('a reminder set for 20:00 Bangkok is not sent at 12:59Z but is sent at 13:00Z', async () => {
    const { id } = await addReminder(env, U, { text: 'สัมภาษณ์บริษัท A', datetime: '2026-11-19T20:00' }, 'line');
    expect(await sendDueReminders(env, new Date('2026-11-19T12:59:00Z'))).toEqual({ sent: 0, failed: 0 });
    expect(pushes.length).toBe(0);
    expect(await sendDueReminders(env, new Date('2026-11-19T13:00:00Z'))).toEqual({ sent: 1, failed: 0 });
    expect(pushes[0].to).toBe(LU);
    expect(JSON.stringify(pushes[0].messages)).toContain('สัมภาษณ์บริษัท A');
    expect((await row(id)).delivery).toBe('line');
  });
  it('is not resent on the next run', async () => {
    await addReminder(env, U, { text: 'x', datetime: '2026-11-19T20:00' }, 'line');
    await sendDueReminders(env, new Date('2026-11-19T13:00:00Z'));
    expect(await sendDueReminders(env, new Date('2026-11-19T13:15:00Z'))).toEqual({ sent: 0, failed: 0 });
    expect(pushes.length).toBe(1);
  });
  it('a push failure is marked failed and shows up as an unseen reminder on the web', async () => {
    pushOk = false;
    await env.DB.prepare("INSERT INTO reminders (id,user_id,text,due_at) VALUES ('rf',?,?,?)").bind(U, 'ส่งเอกสาร', new Date(Date.now() - 60000).toISOString()).run();
    expect(await sendDueReminders(env, new Date())).toEqual({ sent: 0, failed: 1 });
    expect((await row('rf')).delivery).toBe('failed');
    const s = await (await SELF.fetch('https://x.test/api/state', { headers: { Cookie: 'im_session=abcdef0123456789' } })).json();
    expect(s.unseen_reminders.map(r => r.id)).toEqual(['rf']);
  });
  it('a user without a linked LINE account gets failed delivery (web shows it) and no push', async () => {
    await env.DB.prepare('UPDATE users SET line_user_id=NULL WHERE id=?').bind(U).run();
    await env.DB.prepare("INSERT INTO reminders (id,user_id,text,due_at) VALUES ('rn',?,?,?)").bind(U, 'x', new Date(Date.now() - 1000).toISOString()).run();
    expect(await sendDueReminders(env, new Date())).toEqual({ sent: 0, failed: 1 });
    expect(pushes.length).toBe(0);
  });
});
