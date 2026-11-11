import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleEvent, verifySignature } from '../src/line.js';
import { seedDemo } from './fixtures.js';

const LU = 'Uline1', USER = 'user-l';
let menuLinks = [], rejectFlex = false, realFetch, replies, geminiCalls, brevo, geminiQueue, paxaBody, paxaBodies;
const text = t => ({ candidates: [{ content: { role: 'model', parts: [{ text: t }] } }] });
const ev = (over, extra = {}) => ({ type: 'message', webhookEventId: crypto.randomUUID(), replyToken: 'rt-' + Math.random(), source: { userId: LU }, message: { type: 'text', id: 'm1', text: 'หวัดดี' }, ...over, ...extra });
const lastReply = () => replies.at(-1).messages.map(m => m.text).join('\n');
async function sign(body, secret = 'line-secret') {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)))));
}
async function linkUser() {
  await env.DB.prepare('INSERT INTO users (id,email,line_user_id,created_at) VALUES (?,?,?,?)').bind(USER, 'ton@example.com', LU, new Date().toISOString()).run();
  await seedDemo(env, USER);
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM users; DELETE FROM sessions; DELETE FROM otps; DELETE FROM applications; DELETE FROM tasks; DELETE FROM documents; DELETE FROM reminders; DELETE FROM messages; DELETE FROM extractions; DELETE FROM audit_log; DELETE FROM line_events;');
  env.GEMINI_API_KEY = 'g'; env.PAXA_API_KEY = 'p';
  menuLinks = []; delete env.RICHMENU_MAIN; rejectFlex = false; replies = []; geminiCalls = 0; brevo = []; geminiQueue = [text('ตอบแล้ว')];
  paxaBody = { status: 'complete', fields: { company: 'ไทยดาต้า', role: 'Intern', deadline: '2026-11-30' } };
  paxaBodies = [];
  realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => {
    const s = String(u);
    if (s.includes('api.line.me/v2/bot/message/reply')) { const b = JSON.parse(init.body); replies.push(b); return new Response('{}', { status: rejectFlex && JSON.stringify(b).includes('"flex"') ? 400 : 200 }); }
    if (s.includes('/v2/bot/user/') && s.includes('/richmenu/')) { menuLinks.push(s); return new Response('{}', { status: 200 }); }
    if (s.includes('api-data.line.me')) return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
    if (s.includes('generativelanguage')) { geminiCalls++; return new Response(JSON.stringify(geminiQueue.shift() || text('ok')), { status: 200 }); }
    if (s.includes('paxalabs')) { paxaBodies.push(JSON.parse(init.body)); return new Response(JSON.stringify(paxaBody), { status: 200 }); }
    if (s.includes('api.brevo.com')) { brevo.push(JSON.parse(init.body)); return new Response('{}', { status: 201 }); }
    return realFetch(u, init);
  });
});
afterEach(() => vi.restoreAllMocks());

describe('signature + webhook route', () => {
  it('verifySignature accepts a correct HMAC and rejects a wrong one', async () => {
    expect(await verifySignature('{"a":1}', await sign('{"a":1}'), 'line-secret')).toBe(true);
    expect(await verifySignature('{"a":1}', await sign('{"a":2}'), 'line-secret')).toBe(false);
  });
  it('bad signature is 401, good signature is 200', async () => {
    const body = JSON.stringify({ events: [] });
    expect((await SELF.fetch('https://x.test/line/webhook', { method: 'POST', headers: { 'x-line-signature': 'nope' }, body })).status).toBe(401);
    expect((await SELF.fetch('https://x.test/line/webhook', { method: 'POST', headers: { 'x-line-signature': await sign(body) }, body })).status).toBe(200);
  });
});

describe('dedupe', () => {
  it('the same webhookEventId is processed once', async () => {
    await linkUser();
    const e = ev();
    await handleEvent(env, e); await handleEvent(env, e);
    expect(geminiCalls).toBe(1);
    expect(replies.length).toBe(1);
  });
});

describe('unlinked users', () => {
  it('plain text asks for the university email and never calls Gemini', async () => {
    await handleEvent(env, ev());
    expect(geminiCalls).toBe(0);
    expect(lastReply()).toContain('อีเมล');
  });
  it('a non-allowlisted email gets the trial-only message and no OTP email', async () => {
    await handleEvent(env, ev({ message: { type: 'text', id: 'm', text: 'stranger@example.com' } }));
    expect(lastReply()).toBe('ตอนนี้ InternMatch เปิดให้ทีมทดลองใช้เท่านั้นนะ');
    expect(brevo.length).toBe(0);
    expect(geminiCalls).toBe(0);
  });
  it('allowlisted email then the OTP links the LINE account', async () => {
    await handleEvent(env, ev({ message: { type: 'text', id: 'm', text: 'Ton@Example.com' } }));
    expect(brevo.length).toBe(1);
    const code = JSON.stringify(brevo[0]).match(/\b(\d{6})\b/)[1];
    await handleEvent(env, ev({ message: { type: 'text', id: 'm', text: code } }));
    const u = await env.DB.prepare('SELECT line_user_id FROM users WHERE email=?').bind('ton@example.com').first();
    expect(u.line_user_id).toBe(LU);
    expect(lastReply()).toContain('ผูกบัญชี');
  });
  it('after linking, the user is switched to the main rich menu when RICHMENU_MAIN is set', async () => {
    env.RICHMENU_MAIN = 'richmenu-main123';
    await handleEvent(env, ev({ message: { type: 'text', id: 'm', text: 'ton@example.com' } }));
    const code = JSON.stringify(brevo[0]).match(/\b(\d{6})\b/)[1];
    await handleEvent(env, ev({ message: { type: 'text', id: 'm', text: code } }));
    expect(menuLinks).toEqual([`https://api.line.me/v2/bot/user/${LU}/richmenu/richmenu-main123`]);
  });
  it('no rich menu call when RICHMENU_MAIN is not set, and linking still works', async () => {
    await handleEvent(env, ev({ message: { type: 'text', id: 'm', text: 'ton@example.com' } }));
    const code = JSON.stringify(brevo[0]).match(/\b(\d{6})\b/)[1];
    await handleEvent(env, ev({ message: { type: 'text', id: 'm', text: code } }));
    expect(menuLinks).toEqual([]);
    expect(lastReply()).toContain('ผูกบัญชี');
  });
  it('a menu postback from a linked user returns the fixed summary card without calling Gemini', async () => {
    await linkUser();
    await handleEvent(env, ev({ type: 'postback', message: undefined, postback: { data: 'menu:checklist' } }));
    expect(geminiCalls).toBe(0);
    expect(replies.at(-1).messages.map(m => m.type)).toEqual(['text', 'flex']);
  });
  it('a menu postback from an unlinked user asks for the email', async () => {
    await handleEvent(env, ev({ type: 'postback', message: undefined, postback: { data: 'menu:today' } }));
    expect(lastReply()).toContain('อีเมล');
  });
  it('a wrong code is rejected and does not link', async () => {
    await handleEvent(env, ev({ message: { type: 'text', id: 'm', text: 'ton@example.com' } }));
    await handleEvent(env, ev({ message: { type: 'text', id: 'm', text: '000000' } }));
    expect(await env.DB.prepare('SELECT 1 FROM users WHERE line_user_id=?').bind(LU).first()).toBeNull();
  });
});

describe('linked users', () => {
  it('text goes to the assistant and the reply is sent', async () => {
    await linkUser();
    await handleEvent(env, ev({ message: { type: 'text', id: 'm', text: 'สรุปให้หน่อย' } }));
    expect(lastReply()).toBe('ตอบแล้ว');
  });
  it('an image is read by OCR and replies with a flex card holding the AI badge and confirm/discard buttons', async () => {
    await linkUser();
    await handleEvent(env, ev({ message: { type: 'image', id: 'img1' } }));
    const flex = replies.at(-1).messages.find(m => m.type === 'flex');
    expect(JSON.stringify(flex)).toContain('🤖 อ่านโดย AI');
    const data = flex.contents.footer.contents.map(b => b.action.data);
    expect(data.map(d => d.split(':')[0])).toEqual(['ext_confirm', 'ext_discard', 'ocr_ask']);
    expect(replies.at(-1).messages.some(m => m.quickReply)).toBe(false);
  });
  it('an image Paxa cannot read as a job post asks which document it is, with 4 quick replies, and keeps nothing pending', async () => {
    await linkUser();
    paxaBody = { status: 'complete', fields: { company: null, role: null } };
    await handleEvent(env, ev({ message: { type: 'image', id: 'img1' } }));
    const q = replies.at(-1).messages.find(m => m.quickReply).quickReply.items;
    expect(q.length).toBe(4);
    expect(q.every(i => i.action.data.startsWith('ocr_pick:img1:'))).toBe(true);
    expect(q.map(i => i.action.data.split(':')[2])).toEqual(['handbook', 'transcript', 'acceptance', 'job_post']);
    expect((await env.DB.prepare('SELECT status FROM extractions WHERE user_id=?').bind(USER).first()).status).toBe('discarded');
  });
  it('picking a document type re-reads the same image with that type schema and shows a confirmable card', async () => {
    await linkUser();
    paxaBody = { status: 'complete', fields: { student_name: 'สมชาย' } };
    await handleEvent(env, ev({ type: 'postback', message: undefined, postback: { data: 'ocr_pick:img1:transcript' } }));
    expect(JSON.stringify(paxaBodies.at(-1).schema)).toContain('student_name');
    const flex = replies.at(-1).messages.find(m => m.type === 'flex');
    expect(flex.contents.footer.contents.map(b => b.action.data.split(':')[0])).toContain('ext_confirm');
  });
  it('the other-type button on the card asks for the type, and a made-up type is a generic failure', async () => {
    await linkUser();
    await handleEvent(env, ev({ type: 'postback', message: undefined, postback: { data: 'ocr_ask:img1' } }));
    expect(replies.at(-1).messages.find(m => m.quickReply).quickReply.items.length).toBe(4);
    await handleEvent(env, ev({ type: 'postback', message: undefined, postback: { data: 'ocr_pick:img1:hack' } }));
    expect(lastReply()).toContain('ทำไม่สำเร็จ');
  });
  it('a text that makes the bot save an application replies with text plus a flex card with undo', async () => {
    await linkUser();
    geminiQueue = [{ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'add_application', args: { company: 'Agoda', status: 'Applied' } } }] } }] }, text('บันทึกแล้ว')];
    await handleEvent(env, ev({ message: { type: 'text', id: 'm', text: 'สมัคร Agoda แล้ว' } }));
    const msgs = replies.at(-1).messages;
    expect(msgs[0]).toMatchObject({ type: 'text', text: 'บันทึกแล้ว' });
    expect(msgs[1].type).toBe('flex');
    expect(msgs[1].contents.footer.contents.map(b => b.action.data.split(':')[0])).toEqual(['app_status', 'app_undo']);
  });
  it('postback app_status updates the DB and replies with text and a new flex card', async () => {
    await linkUser();
    const { addApplication } = await import('../src/store.js');
    const a = await addApplication(env, USER, { company: 'SCB', role: 'DI', status: 'Applied', truth_level: 'USER_REPORTED' }, 'line');
    await handleEvent(env, ev({ type: 'postback', message: undefined, postback: { data: `app_status:${a.id}:Interview` } }));
    expect((await env.DB.prepare('SELECT status FROM applications WHERE id=?').bind(a.id).first()).status).toBe('Interview');
    expect(replies.at(-1).messages.map(m => m.type)).toEqual(['text', 'flex']);
  });
  it('when LINE rejects the flex message the reply is retried as text only', async () => {
    await linkUser();
    rejectFlex = true;
    geminiQueue = [{ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'add_application', args: { company: 'Agoda', status: 'Applied' } } }] } }] }, text('บันทึกแล้ว')];
    await handleEvent(env, ev({ message: { type: 'text', id: 'm', text: 'สมัคร Agoda แล้ว' } }));
    expect(replies.length).toBe(2);
    expect(replies.at(-1).messages).toEqual([{ type: 'text', text: 'บันทึกแล้ว' }]);
  });
  it('postback confirm creates the application with channel line', async () => {
    await linkUser();
    await handleEvent(env, ev({ message: { type: 'image', id: 'img1' } }));
    const confirm = replies.at(-1).messages.find(m => m.type === 'flex').contents.footer.contents.map(b => b.action.data).find(d => d.startsWith('ext_confirm:'));
    await handleEvent(env, ev({ type: 'postback', message: undefined, postback: { data: confirm } }));
    const a = await env.DB.prepare("SELECT * FROM applications WHERE user_id=? AND company='ไทยดาต้า'").bind(USER).first();
    expect(a.truth_level).toBe('AI_EXTRACTED');
    const au = await env.DB.prepare("SELECT channel FROM audit_log WHERE entity='application' AND entity_id=?").bind(a.id).first();
    expect(au.channel).toBe('line');
  });
});
