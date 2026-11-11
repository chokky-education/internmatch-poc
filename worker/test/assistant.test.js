import { env } from 'cloudflare:test';
import { seedDemo } from './fixtures.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runAssistant } from '../src/assistant.js';

const U = 'user-a';
let queue, geminiBodies, realFetch;
const fc = (name, args) => ({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args } }] } }] });
const text = t => ({ candidates: [{ content: { role: 'model', parts: [{ text: t }] } }] });

beforeEach(async () => {
  await env.DB.exec('DELETE FROM users; DELETE FROM applications; DELETE FROM tasks; DELETE FROM documents; DELETE FROM reminders; DELETE FROM audit_log; DELETE FROM messages;');
  env.GEMINI_API_KEY = 'g-key';
  await env.DB.prepare('INSERT INTO users (id,email,created_at) VALUES (?,?,?)').bind(U, 'ton@example.com', new Date().toISOString()).run();
  await seedDemo(env, U);
  queue = []; geminiBodies = []; realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => {
    if (String(u).includes('generativelanguage.googleapis.com')) {
      geminiBodies.push(JSON.parse(init.body));
      const next = queue.shift();
      if (next === 'ERR') return new Response('{"error":{"message":"boom"}}', { status: 500 });
      return new Response(JSON.stringify(next), { status: 200 });
    }
    return realFetch(u, init);
  });
});
afterEach(() => vi.restoreAllMocks());

const apps = async () => (await env.DB.prepare('SELECT * FROM applications WHERE user_id=? AND company=?').bind(U, 'บริษัท Z').all()).results;
const msgs = async () => (await env.DB.prepare('SELECT channel, role, content FROM messages WHERE user_id=? ORDER BY rowid').bind(U).all()).results;

describe('save-first behaviour', () => {
  it('add_application does not require a role, and the prompt tells the bot to save immediately without asking for the role first', async () => {
    const { TOOLS } = await import('../src/assistant.js');
    const { systemPrompt } = await import('../src/prompt.js');
    const add = TOOLS[0].functionDeclarations.find(f => f.name === 'add_application');
    expect(add.parameters.required).toEqual(['company', 'status']);
    expect(systemPrompt(null)).toContain('เรียก add_application ทันที');
  });
});

describe('runAssistant', () => {
  it('executes add_application as USER_REPORTED, returns the reply and persists both messages with the channel', async () => {
    queue = [fc('add_application', { company: 'บริษัท Z', role: 'Data Intern', status: 'Applied' }), text('บันทึกให้แล้วครับ')];
    const r = await runAssistant(env, U, 'line', 'สมัครบริษัท Z แล้ว');
    expect(r.reply).toBe('บันทึกให้แล้วครับ');
    expect(r.actions).toEqual(['add_application']);
    const rows = await apps();
    expect(rows.length).toBe(1);
    expect(rows[0].truth_level).toBe('USER_REPORTED');
    expect(await msgs()).toEqual([
      { channel: 'line', role: 'user', content: 'สมัครบริษัท Z แล้ว' },
      { channel: 'line', role: 'model', content: 'บันทึกให้แล้วครับ' },
    ]);
  });
  it('on Gemini failure replies with a Thai apology and saves nothing', async () => {
    queue = ['ERR'];
    const r = await runAssistant(env, U, 'web', 'สมัครบริษัท Z แล้ว');
    expect(r.reply).toBe('ขอโทษนะ ตอนนี้พี่ตอบไม่ได้ ลองใหม่อีกครั้งนะ');
    expect(await apps()).toEqual([]);
    expect(await msgs()).toEqual([]);
  });
  it('includes earlier messages from the other channel as history', async () => {
    queue = [text('หนึ่ง'), text('สอง')];
    await runAssistant(env, U, 'line', 'ข้อความแรกจาก LINE');
    await runAssistant(env, U, 'web', 'ข้อความสองจากเว็บ');
    const sent = JSON.stringify(geminiBodies[1].contents);
    expect(sent).toContain('ข้อความแรกจาก LINE');
    expect(geminiBodies[1].contents.at(-1).parts[0].text).toBe('ข้อความสองจากเว็บ');
  });
  it('refuses to change a SYSTEM_VERIFIED application and passes the error to the model', async () => {
    queue = [fc('update_application_status', { company: 'บริษัท A', status: 'Offer' }), text('บริษัทเป็นผู้อัปเดตครับ')];
    await runAssistant(env, U, 'line', 'บริษัท A ให้ offer แล้ว');
    const fr = geminiBodies[1].contents.at(-1).parts[0].functionResponse;
    expect(fr.response.error).toBe('system_verified');
  });
});
