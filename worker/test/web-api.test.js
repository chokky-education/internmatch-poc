import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getOverview } from '../src/store.js';
import { seedDemo } from './fixtures.js';
import { runAssistant } from '../src/assistant.js';

const U = 'user-w', COOKIE = 'im_session=abcdef0123456789';
let realFetch, geminiQueue, paxaBody;
const text = t => ({ candidates: [{ content: { role: 'model', parts: [{ text: t }] } }] });
const api = (path, init = {}) => SELF.fetch('https://x.test' + path, { ...init, headers: { Cookie: COOKIE, ...(init.headers || {}) } });
const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const patch = (path, body) => api(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(async () => {
  await env.DB.exec('DELETE FROM users; DELETE FROM sessions; DELETE FROM applications; DELETE FROM tasks; DELETE FROM documents; DELETE FROM reminders; DELETE FROM messages; DELETE FROM extractions; DELETE FROM audit_log;');
  env.GEMINI_API_KEY = 'g'; env.PAXA_API_KEY = 'p';
  await env.DB.prepare('INSERT INTO users (id,email,created_at) VALUES (?,?,?)').bind(U, 'ton@example.com', new Date().toISOString()).run();
  await env.DB.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').bind('abcdef0123456789', U, new Date(Date.now() + 1e9).toISOString()).run();
  await seedDemo(env, U);
  geminiQueue = []; paxaBody = { status: 'complete', fields: { company: 'ไทยดาต้า', role: 'Intern' } };
  realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => {
    const s = String(u);
    if (s.includes('generativelanguage')) return new Response(JSON.stringify(geminiQueue.shift()), { status: 200 });
    if (s.includes('paxalabs')) return new Response(JSON.stringify(paxaBody), { status: 200 });
    return realFetch(u, init);
  });
});
afterEach(() => vi.restoreAllMocks());

describe('web api', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const r = await SELF.fetch('https://x.test/api/state');
    expect(r.status).toBe(401);
  });
  it('state includes messages from both channels with their channel tag', async () => {
    geminiQueue = [text('ตอบจาก LINE'), text('ตอบจากเว็บ')];
    await runAssistant(env, U, 'line', 'ถามใน LINE');
    await post('/api/chat', { text: 'ถามในเว็บ' });
    const s = await (await api('/api/state')).json();
    expect(s.messages.map(m => [m.channel, m.role])).toEqual([['line', 'user'], ['line', 'model'], ['web', 'user'], ['web', 'model']]);
    expect(s.applications.length).toBe(5);
  });
  it('POST /api/chat returns the assistant reply', async () => {
    geminiQueue = [text('สวัสดีครับ')];
    const r = await (await post('/api/chat', { text: 'หวัดดี' })).json();
    expect(r.reply).toBe('สวัสดีครับ');
  });
  it('PATCH on a SYSTEM_VERIFIED application is 403, on a user-reported one is 200', async () => {
    const o = await getOverview(env, U);
    const sys = o.applications.find(a => a.verified_by_system), usr = o.applications.find(a => !a.verified_by_system && a.status !== 'Closed');
    expect((await patch(`/api/applications/${sys.id}`, { status: 'Offer' })).status).toBe(403);
    expect((await patch(`/api/applications/${usr.id}`, { status: 'Interview' })).status).toBe(200);
    expect((await getOverview(env, U)).applications.find(a => a.id === usr.id).status).toBe('Interview');
  });
  it('POST /api/applications creates a USER_REPORTED card, duplicate is 409', async () => {
    const r = await post('/api/applications', { company: 'บริษัท Z', role: 'Intern', status: 'Saved' });
    expect(r.status).toBe(200);
    expect((await post('/api/applications', { company: 'บริษัท Z', role: 'Intern', status: 'Saved' })).status).toBe(409);
    const a = (await getOverview(env, U)).applications.find(x => x.company === 'บริษัท Z');
    expect(a.truth_level).toBe('USER_REPORTED');
  });
  it('PATCH /api/tasks/:id ticks a checklist item', async () => {
    const t = (await getOverview(env, U)).university_checklist.find(x => !x.done);
    expect((await patch(`/api/tasks/${t.id}`, { done: true })).status).toBe(200);
    expect((await getOverview(env, U)).university_checklist.find(x => x.id === t.id).done).toBe(true);
  });
  it('a failed-delivery reminder is in unseen_reminders until marked seen', async () => {
    await env.DB.prepare("INSERT INTO reminders (id,user_id,text,due_at,sent_at,delivery) VALUES ('r1',?,?,?,?,'failed')").bind(U, 'ส่งเอกสาร', new Date(Date.now() - 1000).toISOString(), new Date().toISOString()).run();
    expect((await (await api('/api/state')).json()).unseen_reminders.map(r => r.id)).toEqual(['r1']);
    await post('/api/reminders/r1/seen', {});
    expect((await (await api('/api/state')).json()).unseen_reminders).toEqual([]);
  });
  it('OCR upload then confirm creates an AI_EXTRACTED application', async () => {
    const fd = new FormData(); fd.append('file', new File([new Uint8Array([1, 2, 3])], 'post.jpg', { type: 'image/jpeg' }));
    const up = await (await api('/api/ocr', { method: 'POST', body: fd })).json();
    expect(up.extraction.fields.company).toBe('ไทยดาต้า');
    expect((await post(`/api/extractions/${up.extraction.id}/confirm`, {})).status).toBe(200);
    const a = (await getOverview(env, U)).applications.find(x => x.company === 'ไทยดาต้า');
    expect(a.truth_level).toBe('AI_EXTRACTED');
    expect((await post(`/api/extractions/${up.extraction.id}/confirm`, {})).status).toBe(409);
  });
  it('DELETE /api/reminders/:id removes it, audits the channel, and 404s for an unknown id', async () => {
    const { id } = await (await post('/api/reminders', { text: 'สร้าง Resume ใหม่', datetime: '2026-11-19T20:00' })).json();
    expect((await api('/api/reminders/' + id, { method: 'DELETE' })).status).toBe(200);
    expect((await (await api('/api/state')).json()).reminders).toEqual([]);
    const a = await env.DB.prepare("SELECT channel, change_json FROM audit_log WHERE entity='reminder' AND entity_id=? ORDER BY rowid DESC").bind(id).first();
    expect(a.channel).toBe('web');
    expect(JSON.parse(a.change_json).op).toBe('delete');
    expect((await api('/api/reminders/nope', { method: 'DELETE' })).status).toBe(404);
  });
  it('GET /api/state messages include cards saved from the other channel', async () => {
    const { saveMessage } = await import('../src/assistant.js');
    await saveMessage(env, U, 'line', 'model', 'บันทึกแล้ว', [{ kind: 'application', title: 'SCB', rows: [], actions: [] }]);
    await saveMessage(env, U, 'line', 'user', 'ธรรมดา');
    const m = (await (await api('/api/state')).json()).messages;
    expect(m[0].cards[0].title).toBe('SCB');
    expect(m[1].cards).toEqual([]);
    expect(m[0].cards_json).toBeUndefined();
  });
  it('POST /api/actions runs a card action as channel web; 400 when data is missing', async () => {
    const a = await post('/api/applications', { company: 'SCB', role: 'DI', status: 'Applied' });
    const { id } = await a.json();
    const r = await (await post('/api/actions', { data: `app_status:${id}:Interview` })).json();
    expect(r.ok).toBe(true);
    expect((await env.DB.prepare("SELECT channel FROM audit_log WHERE entity='application' ORDER BY rowid DESC").first()).channel).toBe('web');
    expect((await post('/api/actions', {})).status).toBe(400);
  });
  it('POST /api/reminders stores a Bangkok-time reminder', async () => {
    const r = await post('/api/reminders', { text: 'สัมภาษณ์', datetime: '2026-11-19T20:00' });
    expect((await r.json()).due_at).toBe('2026-11-19T13:00:00.000Z');
  });
});
