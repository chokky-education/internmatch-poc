import { context, scoped } from './seasons.js';
import { getOverview, addApplication, updateApplicationStatus, setTask, addReminder, deleteReminder } from './store.js';
import { systemPrompt } from './prompt.js';

const STATUS = ['Saved', 'Applied', 'Interview', 'Offer', 'Closed'];
import { STAT_TH, applicationCard, reminderSetCard } from './cards.js';
export const FALLBACK_REPLY = 'ขอโทษนะ ตอนนี้พี่ตอบไม่ได้ ข้อความนี้ยังไม่ถูกบันทึก ลองส่งใหม่อีกครั้ง หรือกดปุ่มเมนูดูข้อมูลได้เลย';
export const PARTIAL_REPLY = 'ทำรายการให้แล้วนะ ✅ แต่พี่สรุปต่อไม่ได้ ไม่ต้องส่งซ้ำ ดูผลได้จากการ์ดหรือกดเมนูด้านล่าง';
const MAX_TURNS = 5, HISTORY = 20;

export const TOOLS = [{ functionDeclarations: [
  { name: 'get_overview', description: 'ดึงข้อมูลปัจจุบันของผู้ใช้: ใบสมัครทั้งหมด เช็กลิสต์คณะ เอกสาร และการเตือน', parameters: { type: 'object', properties: {} } },
  { name: 'add_application', description: 'เพิ่มใบสมัคร/ตำแหน่งที่สนใจลงบอร์ดติดตาม', parameters: { type: 'object', properties: {
    company: { type: 'string' }, role: { type: 'string', description: 'ตำแหน่ง ถ้าผู้ใช้ไม่บอกให้เว้นไว้' }, status: { type: 'string', enum: STATUS },
    next_step: { type: 'string', description: 'ขั้นตอนถัดไป เช่น ปิดรับ 30 พ.ย.' }, url: { type: 'string' },
    from_document: { type: 'boolean', description: 'true ถ้าข้อมูลมาจากเอกสารที่ AI อ่าน' } }, required: ['company', 'status'] } },
  { name: 'update_application_status', description: 'อัปเดตสถานะใบสมัครที่มีอยู่ (เฉพาะใบสมัครภายนอก)', parameters: { type: 'object', properties: {
    company: { type: 'string', description: 'ชื่อบริษัท (จับคู่แบบบางส่วนได้)' }, status: { type: 'string', enum: STATUS }, next_step: { type: 'string' } }, required: ['company', 'status'] } },
  { name: 'add_reminder', description: 'ตั้งการเตือน', parameters: { type: 'object', properties: {
    text: { type: 'string' }, datetime: { type: 'string', description: 'ISO 8601 เวลาไทย เช่น 2026-11-19T20:00' } }, required: ['text', 'datetime'] } },
  { name: 'delete_reminder', description: 'ลบการเตือนที่ตั้งไว้ (ลบทุกรายการที่ข้อความมีคำนี้)', parameters: { type: 'object', properties: {
    text_keyword: { type: 'string', description: 'คำในข้อความเตือน' } }, required: ['text_keyword'] } },
  { name: 'set_university_task', description: 'ติ๊กหรือยกเลิกติ๊กรายการในเช็กลิสต์คณะ', parameters: { type: 'object', properties: {
    task_keyword: { type: 'string', description: 'คำในชื่อรายการ' }, done: { type: 'boolean' } }, required: ['task_keyword', 'done'] } },
] }];

const toolImpl = {
  get_overview: async (env, u) => { const o = await getOverview(env, u); o.applications.forEach(a => a.status_th = STAT_TH[a.status]); return o; },
  add_application: (env, u, a, ch) => addApplication(env, u, { ...a, truth_level: a.from_document ? 'AI_EXTRACTED' : 'USER_REPORTED' }, ch),
  update_application_status: (env, u, a, ch) => updateApplicationStatus(env, u, a, ch),
  add_reminder: (env, u, a, ch) => addReminder(env, u, a, ch),
  delete_reminder: (env, u, a, ch) => deleteReminder(env, u, { text_keyword: a.text_keyword }, ch),
  set_university_task: (env, u, a, ch) => setTask(env, u, a, ch),
};

async function gemini(env, contents) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt(null) }] }, contents, tools: TOOLS }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Gemini ' + (d.error?.message || r.status));
  const c = d.candidates?.[0]?.content;
  if (!c) throw new Error('Gemini empty response');
  return c;
}

export async function saveMessage(env, userId, channel, role, content, cards = null) {
  const seasonId=(await context(env,userId)).season.id;
  await env.DB.prepare('INSERT INTO messages (id,user_id,season_id,channel,role,content,created_at,cards_json) VALUES (?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), userId, seasonId, channel, role, content, new Date().toISOString(), cards && cards.length ? JSON.stringify(cards) : null).run();
}

function cardFor(name, out, args) {
  if (!out?.ok) return null;
  if (name === 'add_application') return applicationCard({ ...out, truth_level: args.from_document ? 'AI_EXTRACTED' : 'USER_REPORTED' }, { undo: true });
  if (name === 'update_application_status') return applicationCard({ ...out, truth_level: 'USER_REPORTED' });
  if (name === 'add_reminder') return reminderSetCard(out);
  return null;
}

// A tool may already have written data when the model fails. Then say so (ok:true, partial) and keep the cards;
// otherwise nothing happened and nothing is saved (ok:false), so the user can resend.
async function fail(env, userId, channel, text, actions, cards, done) {
  if (done > 0) {
    try {
      await saveMessage(env, userId, channel, 'user', text);
      await saveMessage(env, userId, channel, 'model', PARTIAL_REPLY, cards);
      return { ok: true, partial: true, reply: PARTIAL_REPLY, actions, cards };
    } catch (e) { console.error('assistant partial save error', e.message); }
  }
  return { ok: false, reply: FALLBACK_REPLY, actions: [], cards: [] };
}

export async function runAssistant(env, userId, channel, text) {
  const c=await context(env,userId);
  env=scoped(env,c.season.id);
  const actions = [], cards = [];
  let done = 0;
  try {
    const past = (await env.DB.prepare('SELECT role, content FROM messages WHERE user_id=? AND season_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?').bind(userId, c.season.id, HISTORY).all()).results.reverse();
    const contents = [...past.map(m => ({ role: m.role, parts: [{ text: m.content }] })), { role: 'user', parts: [{ text }] }];
    for (let i = 0; i < MAX_TURNS; i++) {
      const c = await gemini(env, contents);
      contents.push(c);
      const calls = (c.parts || []).filter(p => p.functionCall);
      if (!calls.length) {
        const reply = (c.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join('').trim();
        if (!reply) return await fail(env, userId, channel, text, actions, cards, done);
        await saveMessage(env, userId, channel, 'user', text);
        await saveMessage(env, userId, channel, 'model', reply, cards);
        return { ok: true, reply, actions, cards };
      }
      const resp = [];
      for (const { functionCall: f } of calls) {
        let out;
        try { out = toolImpl[f.name] ? await toolImpl[f.name](env, userId, f.args || {}, channel) : { ok: false, error: 'unknown_tool' }; }
        catch (e) { out = { ok: false, error: e.message }; }
        if (f.name !== 'get_overview') actions.push(f.name);
        if (out?.ok && f.name !== 'get_overview') done++;
        const card = cardFor(f.name, out, f.args || {}); if (card) cards.push(card);
        resp.push({ functionResponse: { name: f.name, response: out, ...(f.id ? { id: f.id } : {}) } });
      }
      contents.push({ role: 'user', parts: resp });
    }
    return await fail(env, userId, channel, text, actions, cards, done);
  } catch (e) {
    console.error('assistant error', e.message);
    return await fail(env, userId, channel, text, actions, cards, done);
  }
}
