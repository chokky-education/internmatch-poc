import { getOverview, addApplication, updateApplicationStatus, setTask, addReminder } from './store.js';
import { systemPrompt } from './prompt.js';

const STATUS = ['Saved', 'Applied', 'Interview', 'Offer', 'Closed'];
const STAT_TH = { Saved: 'บันทึกไว้', Applied: 'สมัครแล้ว', Interview: 'สัมภาษณ์', Offer: 'ได้รับข้อเสนอ', Closed: 'ปิด/ไม่ผ่าน' };
export const FALLBACK_REPLY = 'ขอโทษนะ ตอนนี้พี่ตอบไม่ได้ ลองใหม่อีกครั้งนะ';
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
  { name: 'set_university_task', description: 'ติ๊กหรือยกเลิกติ๊กรายการในเช็กลิสต์คณะ', parameters: { type: 'object', properties: {
    task_keyword: { type: 'string', description: 'คำในชื่อรายการ' }, done: { type: 'boolean' } }, required: ['task_keyword', 'done'] } },
] }];

const toolImpl = {
  get_overview: async (env, u) => { const o = await getOverview(env, u); o.applications.forEach(a => a.status_th = STAT_TH[a.status]); return o; },
  add_application: (env, u, a, ch) => addApplication(env, u, { ...a, truth_level: a.from_document ? 'AI_EXTRACTED' : 'USER_REPORTED' }, ch),
  update_application_status: (env, u, a, ch) => updateApplicationStatus(env, u, a, ch),
  add_reminder: (env, u, a, ch) => addReminder(env, u, a, ch),
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

async function saveMessage(env, userId, channel, role, content) {
  await env.DB.prepare('INSERT INTO messages (id,user_id,channel,role,content,created_at) VALUES (?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), userId, channel, role, content, new Date().toISOString()).run();
}

export async function runAssistant(env, userId, channel, text) {
  try {
    const past = (await env.DB.prepare('SELECT role, content FROM messages WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?').bind(userId, HISTORY).all()).results.reverse();
    const contents = [...past.map(m => ({ role: m.role, parts: [{ text: m.content }] })), { role: 'user', parts: [{ text }] }];
    const actions = [];
    for (let i = 0; i < MAX_TURNS; i++) {
      const c = await gemini(env, contents);
      contents.push(c);
      const calls = (c.parts || []).filter(p => p.functionCall);
      if (!calls.length) {
        const reply = (c.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join('').trim() || FALLBACK_REPLY;
        await saveMessage(env, userId, channel, 'user', text);
        await saveMessage(env, userId, channel, 'model', reply);
        return { reply, actions };
      }
      const resp = [];
      for (const { functionCall: f } of calls) {
        let out;
        try { out = toolImpl[f.name] ? await toolImpl[f.name](env, userId, f.args || {}, channel) : { ok: false, error: 'unknown_tool' }; }
        catch (e) { out = { ok: false, error: e.message }; }
        if (f.name !== 'get_overview') actions.push(f.name);
        resp.push({ functionResponse: { name: f.name, response: out, ...(f.id ? { id: f.id } : {}) } });
      }
      contents.push({ role: 'user', parts: resp });
    }
    return { reply: FALLBACK_REPLY, actions };
  } catch (e) {
    console.error('assistant error', e.message);
    return { reply: FALLBACK_REPLY, actions: [] };
  }
}
