import {context,scoped} from './seasons.js';
import { requestOtp, verifyOtp } from './auth.js';
import { runAssistant } from './assistant.js';
import { extractDocument, discardExtraction } from './ocr.js';
import { DOCTYPES } from './doctypes.js';
import { runCardAction } from './actions.js';
import { extractionCard } from './cards.js';
import { toFlex } from './flex.js';

const MAX_TEXT = 4900;
const DOC_PICK = [['handbook', 'คู่มือ/ประกาศคณะ'], ['transcript', 'Transcript'], ['acceptance', 'หนังสือตอบรับ'], ['job_post', 'โพสต์ประกาศงาน']];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const msg = t => ({ type: 'text', text: String(t).slice(0, MAX_TEXT) });

export async function verifySignature(body, signature, secret) {
  if (!signature || !secret) return false;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)))));
  if (expected.length !== signature.length) return false;
  let diff = 0; for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export async function replyWithCards(env, replyToken, text, cards = []) {
  const flex = cards.slice(0, 4).map(toFlex);
  const ok = await reply(env, replyToken, [msg(text), ...flex]);
  if (!ok && flex.length) return reply(env, replyToken, [msg(text)]);
  return ok;
}

const authHeaders = env => ({ Authorization: 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN, 'Content-Type': 'application/json' });
export async function reply(env, replyToken, messages) {
  const r = await fetch('https://api.line.me/v2/bot/message/reply', { method: 'POST', headers: authHeaders(env), body: JSON.stringify({ replyToken, messages }) });
  return r.ok;
}
export async function push(env, lineUserId, messages) {
  try {
    const r = await fetch('https://api.line.me/v2/bot/message/push', { method: 'POST', headers: authHeaders(env), body: JSON.stringify({ to: lineUserId, messages }) });
    return r.ok;
  } catch { return false; }
}

async function linkMainMenu(env, lineUserId) {
  if (!env.RICHMENU_MAIN) return;
  try {
    const r = await fetch(`https://api.line.me/v2/bot/user/${lineUserId}/richmenu/${env.RICHMENU_MAIN}`, { method: 'POST', headers: { Authorization: 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN } });
    if (!r.ok) console.error('rich menu link failed', r.status);
  } catch (e) { console.error('rich menu link error', e.message); }
}

const ASK_EMAIL = 'สวัสดีครับ พี่ฝึกงานเองนะ 👋\nก่อนเริ่ม ขอผูกบัญชีหน่อยนะ พิมพ์ "อีเมล" ที่ทีมลงทะเบียนไว้มาได้เลย';
const OTP_ERR = { invalid: 'รหัสไม่ถูกต้อง ลองใหม่อีกครั้งนะ', expired: 'รหัสหมดอายุแล้ว พิมพ์อีเมลมาใหม่เพื่อขอรหัสใหม่นะ', locked: 'ใส่รหัสผิดหลายครั้งแล้ว พิมพ์อีเมลมาใหม่เพื่อขอรหัสใหม่นะ' };

async function handleUnlinked(env, e, lineUserId) {
  const t = e.message?.type === 'text' ? e.message.text.trim() : '';
  if (EMAIL_RE.test(t)) {
    const r = await requestOtp(env, t, { purpose: 'line', lineUserId });
    if (r.ok) return reply(env, e.replyToken, [msg('ส่งรหัส 6 หลักไปที่อีเมลแล้วนะ 📧 (ถ้าไม่เห็น ลองดูในโฟลเดอร์ Spam) พิมพ์รหัสนั้นมาตรงนี้ได้เลย')]);
    if (r.error === 'not_allowed') return reply(env, e.replyToken, [msg('ตอนนี้ InternMatch เปิดให้ทีมทดลองใช้เท่านั้นนะ')]);
    if (r.error === 'too_soon') return reply(env, e.replyToken, [msg('เพิ่งส่งรหัสไปเมื่อกี้นะ รอซักครู่แล้วลองใหม่ได้')]);
    return reply(env, e.replyToken, [msg('ส่งอีเมลไม่สำเร็จ ลองใหม่อีกครั้งนะ')]);
  }
  if (/^\d{6}$/.test(t)) {
    const pend = await env.DB.prepare('SELECT email FROM otps WHERE line_user_id=?').bind(lineUserId).first();
    if (!pend) return reply(env, e.replyToken, [msg(ASK_EMAIL)]);
    const r = await verifyOtp(env, pend.email, t);
    if (r.ok) await linkMainMenu(env, lineUserId);
    if (r.ok) return reply(env, e.replyToken, [msg('ผูกบัญชีเรียบร้อย ✅ ต่อไปบอกพี่ได้เลยว่าสมัครที่ไหน หรือส่งรูปโพสต์งานมาให้พี่อ่านก็ได้นะ')]);
    return reply(env, e.replyToken, [msg(OTP_ERR[r.error] || OTP_ERR.invalid)]);
  }
  return reply(env, e.replyToken, [msg(ASK_EMAIL)]);
}

// The image id rides in the button data, so no extra table is needed to re-read it as another type.
async function askDocType(env, replyToken, messageId, lead, seasonId) {
  const items = DOC_PICK.map(([k, label]) => ({ type: 'action', action: { type: 'postback', label, data: `ocr_pick:${messageId}:${k}:${seasonId}`, displayText: label } }));
  return reply(env, replyToken, [{ ...msg(lead), quickReply: { items } }]);
}

async function readLineImage(env, replyToken, user, messageId, docType = 'job_post') {
  const origin=await context(env,user.id);env=scoped(env,origin.season.id);
  const r = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, { headers: { Authorization: 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN } });
  if (!r.ok) return reply(env, replyToken, [msg('โหลดรูปไม่สำเร็จ ลองส่งใหม่อีกครั้งนะ')]);
  const out = await extractDocument(env, user.id, 'line', { bytes: await r.arrayBuffer(), mime: r.headers.get('Content-Type') || 'image/jpeg', docType });
  if (!out.ok) return reply(env, replyToken, [msg(out.error === 'too_large' ? 'รูปใหญ่เกิน 10MB ลองส่งรูปที่เล็กลง หรืออัปโหลดบนเว็บนะ' : 'อ่านรูปไม่สำเร็จ ลองส่งใหม่ หรือพิมพ์ข้อมูลมาให้พี่ได้เลย')]);
  const f = out.extraction.fields;
  if (docType === 'job_post' && !f.company && !f.role) {
    await discardExtraction(env, user.id, out.extraction.id);
    return askDocType(env, replyToken, messageId, 'พี่อ่านเป็นโพสต์งานไม่ออก รูปนี้คือเอกสารอะไร เลือกด้านล่างได้เลย',origin.season.id);
  }
  return replyWithCards(env, replyToken, '📸 อ่านเอกสารแล้ว ตรวจข้อมูลในการ์ดก่อนยืนยันนะ', [extractionCard(out.extraction, { retype: `ocr_ask:${messageId}:${origin.season.id}` })]);
}

async function handlePostback(env, e, user) {
  const [name, id, arg, target] = String(e.postback?.data || '').split(':');
  if (name === 'ocr_ask' && id){const c=await context(scoped(env,arg),user.id);return askDocType(env,e.replyToken,id,'รูปนี้คือเอกสารอะไร เลือกด้านล่างได้เลย',c.season.id);}
  if (name === 'ocr_pick' && id && DOCTYPES[arg]){await context(scoped(env,target),user.id);return readLineImage(scoped(env,target),e.replyToken,user,id,arg);}
  const r = await runCardAction(env, user.id, 'line', String(e.postback?.data || ''));
  return replyWithCards(env, e.replyToken, r.reply, r.cards);
}

export async function handleEvent(env, e) {
  try {
    if (e.webhookEventId) {
      const ins = await env.DB.prepare('INSERT OR IGNORE INTO line_events (webhook_event_id, at) VALUES (?,?)').bind(e.webhookEventId, new Date().toISOString()).run();
      if (!ins.meta.changes) return;
    }
    const lineUserId = e.source?.userId;
    if (!lineUserId || !e.replyToken) return;
    if (!['message', 'postback', 'follow'].includes(e.type)) return;
    const user = await env.DB.prepare('SELECT * FROM users WHERE line_user_id=?').bind(lineUserId).first();
    if (!user) return await handleUnlinked(env, e, lineUserId);
    const c=await context(env,user.id);env=scoped(env,c.season.id);
    if (e.type === 'follow') return await reply(env, e.replyToken, [msg('ยินดีต้อนรับกลับมานะ 👋 ถามหรือสั่งงานพี่ได้เลย')]);
    if (e.type === 'postback') return await handlePostback(env, e, user);
    if (e.message?.type === 'image') return await readLineImage(env, e.replyToken, user, e.message.id);
    if (e.message?.type === 'text') {
      const r = await runAssistant(env, user.id, 'line', e.message.text);
      return await replyWithCards(env, e.replyToken, r.reply, r.cards);
    }
    return await reply(env, e.replyToken, [msg('ตอนนี้พี่อ่านได้เฉพาะข้อความและรูปนะ')]);
  } catch (err) {
    console.error('line event error', err.message);
    try { await reply(env, e.replyToken, [msg('ขอโทษนะ ตอนนี้พี่ขัดข้อง ลองใหม่อีกครั้งนะ')]); } catch {}
  }
}
