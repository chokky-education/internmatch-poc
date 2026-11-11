import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { seedUser, addReminder } from '../src/store.js';
import { sendDueReminders } from '../src/reminders.js';

const U = 'user-r', LU = 'Uremind';
let pushes, pushOk, realFetch;

beforeEach(async () => {
  await env.DB.exec('DELETE FROM users; DELETE FROM sessions; DELETE FROM reminders; DELETE FROM audit_log;');
  await env.DB.prepare('INSERT INTO users (id,email,line_user_id,created_at) VALUES (?,?,?,?)').bind(U, 'ton@example.com', LU, new Date().toISOString()).run();
  await env.DB.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').bind('abcdef0123456789', U, new Date(Date.now() + 1e9).toISOString()).run();
  pushes = []; pushOk = true; realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => {
    if (String(u).includes('api.line.me/v2/bot/message/push')) { pushes.push(JSON.parse(init.body)); return new Response('{}', { status: pushOk ? 200 : 500 }); }
    return realFetch(u, init);
  });
});
afterEach(() => vi.restoreAllMocks());

const row = id => env.DB.prepare('SELECT * FROM reminders WHERE id=?').bind(id).first();

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
