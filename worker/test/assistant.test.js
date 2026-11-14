import { env } from 'cloudflare:test';
import { seedDemo } from './fixtures.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runAssistant } from '../src/assistant.js';

const U = 'user-a';
let queue, geminiBodies, realFetch;
const fc = (name, args) => ({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args } }] } }] });
const text = t => ({ candidates: [{ content: { role: 'model', parts: [{ text: t }] } }] });

beforeEach(async () => {
  await env.DB.exec('DELETE FROM users; DELETE FROM seasons; DELETE FROM milestones; DELETE FROM pending_actions; DELETE FROM applications; DELETE FROM tasks; DELETE FROM documents; DELETE FROM reminders; DELETE FROM audit_log; DELETE FROM messages;');
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

describe('delete_reminder tool', () => {
  it('deletes the reminder matching the keyword from LINE', async () => {
    const { addReminder } = await import('../src/store.js');
    await addReminder(env, U, { text: 'สร้าง Resume ใหม่', datetime: '2026-11-19T20:00' }, 'line');
    queue = [fc('delete_reminder', { text_keyword: 'Resume' }), text('ลบแล้วค่ะ')];
    const r = await runAssistant(env, U, 'line', 'ลบเตือนเรื่อง resume');
    expect(r.actions).toEqual(['delete_reminder']);
    expect((await env.DB.prepare('SELECT count(*) c FROM reminders WHERE user_id=?').bind(U).first()).c).toBe(0);
  });
});

describe('cards from tools', () => {
  it('replays a partial document request before asking the model for a reordered tool plan', async () => {
    const { getOverview } = await import('../src/store.js');
    const a = { title: 'รายการ A', from_document: false }, b = { title: 'รายการ B', from_document: false };
    queue = [fc('save_document_item', a), 'ERR'];
    const first = await runAssistant(env, U, 'web', 'เพิ่มรายการ A และ B', { request_id: 'partial-document-request' });
    expect(first.partial).toBe(true);
    const modelCalls = geminiBodies.length;
    queue = [fc('save_document_item', b), fc('save_document_item', a), text('บันทึกแล้ว')];
    const retry = await runAssistant(env, U, 'web', 'เพิ่มรายการ A และ B', { request_id: 'partial-document-request' });
    expect(retry).toEqual(first);
    expect(geminiBodies).toHaveLength(modelCalls);
    expect((await getOverview(env, U)).checklist_items).toEqual([expect.objectContaining({ title: 'รายการ A' })]);
  });
  it('replays a manual document command with the same request id without creating a second item', async () => {
    const { getOverview } = await import('../src/store.js');
    const command = { title: 'รายการที่บอกเอง', from_document: false };
    for (let n = 0; n < 2; n++) {
      queue = [fc('save_document_item', command), text('บันทึกแล้ว')];
      await runAssistant(env, U, 'web', 'ช่วยจดรายการนี้', { request_id: 'same-document-command' });
    }
    expect((await getOverview(env, U)).checklist_items).toEqual([expect.objectContaining({ title: 'รายการที่บอกเอง' })]);
    queue = [fc('save_document_item', { ...command, title: 'ข้อความที่ต่างจากคำขอเดิม' }), text('ร่างเปลี่ยนไป ตรวจรายการก่อนนะ')];
    const changed = await runAssistant(env, U, 'web', 'ช่วยจดรายการนี้', { request_id: 'same-document-command' });
    expect(changed.cards[0].title).toBe('รายการที่บอกเอง');
    expect((await getOverview(env, U)).checklist_items).toEqual([expect.objectContaining({ title: 'รายการที่บอกเอง' })]);
  });
  it('adds a student document item through LINE and keeps document-derived content behind confirmation', async () => {
    const { getOverview } = await import('../src/store.js');
    queue = [fc('save_document_item', { title: 'ส่งคำร้อง', source: 'คำแนะนำที่ได้รับจากคณะ', from_document: false }), text('เพิ่มรายการแล้ว')];
    const result = await runAssistant(env, U, 'line', 'ช่วยจดว่าต้องส่งคำร้อง ยังไม่รู้วันส่ง');
    expect(result.cards[0]).toMatchObject({ kind: 'checklist_item', truth: 'USER_REPORTED' });
    expect((await getOverview(env, U)).checklist_items[0]).toMatchObject({ title: 'ส่งคำร้อง', due_date: null });
    queue = [fc('save_document_item', { title: 'รายการจากคู่มือ', from_document: true }), text('ตรวจรายการจากคู่มือก่อนนะ')];
    const blocked = await runAssistant(env, U, 'line', 'เพิ่มจากคู่มือเลย');
    expect(blocked.cards).toEqual([]);
    expect((await getOverview(env, U)).checklist_items).toHaveLength(1);
  });
  it('add_application returns one application card with undo and saves it in cards_json', async () => {
    queue = [fc('add_application', { company: 'บริษัท Z', role: 'Data Intern', status: 'Applied' }), text('บันทึกแล้ว')];
    const r = await runAssistant(env, U, 'line', 'สมัครบริษัท Z แล้ว');
    expect(r.cards.length).toBe(1);
    expect(r.cards[0].actions.map(a => a.data.split(':')[0])).toEqual(['app_status', 'app_undo']);
    const row = await env.DB.prepare("SELECT cards_json FROM messages WHERE user_id=? AND role='model'").bind(U).first();
    expect(JSON.parse(row.cards_json)[0].title).toBe('บริษัท Z');
  });
  it('a failed tool (duplicate) produces no card', async () => {
    queue = [fc('add_application', { company: 'บริษัท B', status: 'Applied' }), text('มีอยู่แล้ว')];
    const r = await runAssistant(env, U, 'line', 'สมัครบริษัท B แล้ว');
    expect(r.cards).toEqual([]);
  });
  it('add_reminder returns a reminder card with a delete button', async () => {
    queue = [fc('add_reminder', { text: 'ส่งเอกสาร', datetime: '2026-11-19T20:00' }), text('ตั้งแล้ว')];
    const r = await runAssistant(env, U, 'web', 'เตือนส่งเอกสาร');
    expect(r.cards[0].actions[0].data.startsWith('rem_delete:')).toBe(true);
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
    const { FALLBACK_REPLY } = await import('../src/assistant.js');
    const r = await runAssistant(env, U, 'web', 'สมัครบริษัท Z แล้ว');
    expect(r.ok).toBe(false);
    expect(r.reply).toBe(FALLBACK_REPLY);
    expect(await apps()).toEqual([]);
    expect(await msgs()).toEqual([]);
  });
  it('a tool saved the data but Gemini then failed: partial success, card kept, both messages saved, told not to resend', async () => {
    const { PARTIAL_REPLY } = await import('../src/assistant.js');
    queue = [fc('add_application', { company: 'บริษัท Z', status: 'Applied' }), 'ERR'];
    const r = await runAssistant(env, U, 'web', 'สมัครบริษัท Z แล้ว');
    expect(r.ok).toBe(true);
    expect(r.partial).toBe(true);
    expect(r.reply).toBe(PARTIAL_REPLY);
    expect(r.cards.length).toBe(1);
    expect((await apps()).length).toBe(1);
    expect((await msgs()).map(m => m.role)).toEqual(['user', 'model']);
  });
  it('a failed tool (duplicate) followed by a Gemini failure is a full failure and saves nothing', async () => {
    queue = [fc('add_application', { company: 'บริษัท B', status: 'Applied' }), 'ERR'];
    const r = await runAssistant(env, U, 'web', 'สมัครบริษัท B แล้ว');
    expect(r.ok).toBe(false);
    expect(await msgs()).toEqual([]);
  });
  it('running out of tool turns with nothing saved is a full failure', async () => {
    queue = Array.from({ length: 5 }, () => fc('get_overview', {}));
    const r = await runAssistant(env, U, 'web', 'ขอดูข้อมูล');
    expect(r.ok).toBe(false);
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
it('never lets a model document flag bypass OCR confirmation',async()=>{
 queue=[fc('add_application',{company:'บริษัท Z',status:'Saved',from_document:true}),text('กรุณาตรวจและยืนยันผล OCR ก่อนบันทึก')];
 await runAssistant(env,U,'line','ข้อมูลจากเอกสาร');
 expect(await apps()).toHaveLength(0);
 const response=geminiBodies[1].contents.at(-1).parts[0].functionResponse.response;
 expect(response.error).toBe('confirmation_required');
});

it('get_overview surfaces unconfirmed milestones only for the selected internship season', async () => {
  const { context, createSeason, selectSeason } = await import('../src/seasons.js');
  const { saveMilestone } = await import('../src/milestones.js');
  const selectedId = (await context(env, U)).season.id;
  await saveMilestone(env, U, { title: 'ส่งใบตอบรับคณะ', date: '2099-03-20' }, 'web');
  const other = await createSeason(env, U, { name: 'สหกิจศึกษา' }, 'web');
  await selectSeason(env, U, other.season.id, 0, 'web');
  await saveMilestone(env, U, { title: 'กำหนดการฤดูอื่น', date: '2099-05-01' }, 'web');
  await selectSeason(env, U, selectedId, 1, 'web');

  queue = [fc('get_overview', {}), text('มีวันสำคัญส่งใบตอบรับคณะ 20 มี.ค. 2099')];
  const r = await runAssistant(env, U, 'line', 'ช่วงนี้มีกำหนดการอะไรบ้าง');
  expect(r.ok).toBe(true);
  const overview = geminiBodies[1].contents.at(-1).parts[0].functionResponse.response;
  expect(overview.milestones.map(m => ({ title: m.title, date: m.date, truth_level: m.truth_level }))).toEqual([
    { title: 'ส่งใบตอบรับคณะ', date: '2099-03-20', truth_level: 'USER_REPORTED' },
  ]);
  expect(overview.reminders).toEqual([]);
});
