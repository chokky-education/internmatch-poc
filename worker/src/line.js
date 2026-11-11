import { requestOtp, verifyOtp } from './auth.js';
import { runAssistant } from './assistant.js';
import { extractDocument, confirmExtraction, discardExtraction, formatExtraction } from './ocr.js';

const MAX_TEXT = 4900;
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
    if (r.ok) return reply(env, e.replyToken, [msg('ผูกบัญชีเรียบร้อย ✅ ต่อไปบอกพี่ได้เลยว่าสมัครที่ไหน หรือส่งรูปโพสต์งานมาให้พี่อ่านก็ได้นะ')]);
    return reply(env, e.replyToken, [msg(OTP_ERR[r.error] || OTP_ERR.invalid)]);
  }
  return reply(env, e.replyToken, [msg(ASK_EMAIL)]);
}

async function handleImage(env, e, user) {
  const r = await fetch(`https://api-data.line.me/v2/bot/message/${e.message.id}/content`, { headers: { Authorization: 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN } });
  if (!r.ok) return reply(env, e.replyToken, [msg('โหลดรูปไม่สำเร็จ ลองส่งใหม่อีกครั้งนะ')]);
  const out = await extractDocument(env, user.id, 'line', { bytes: await r.arrayBuffer(), mime: r.headers.get('Content-Type') || 'image/jpeg' });
  if (!out.ok) return reply(env, e.replyToken, [msg('อ่านรูปไม่สำเร็จ ลองส่งใหม่ หรือพิมพ์ข้อมูลมาให้พี่ได้เลย')]);
  const id = out.extraction.id;
  return reply(env, e.replyToken, [{ ...msg(formatExtraction(out.extraction)), quickReply: { items: [
    { type: 'action', action: { type: 'postback', label: '✅ ยืนยันบันทึก', data: `confirm:${id}`, displayText: 'ยืนยันบันทึก' } },
    { type: 'action', action: { type: 'postback', label: '✖ ไม่ใช่', data: `discard:${id}`, displayText: 'ไม่ใช่' } },
  ] } }]);
}

async function handlePostback(env, e, user) {
  const [op, id] = String(e.postback?.data || '').split(':');
  if (op === 'confirm') {
    const r = await confirmExtraction(env, user.id, id, 'line');
    const t = r.ok ? 'บันทึกแล้ว ✅ ดูบนบอร์ดได้เลย (ป้าย 🤖 AI อ่าน)' : r.error === 'already_confirmed' ? 'อันนี้บันทึกไปแล้วนะ' : r.error === 'duplicate' ? 'มีบริษัทนี้อยู่ในบอร์ดแล้วนะ' : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้งนะ';
    return reply(env, e.replyToken, [msg(t)]);
  }
  if (op === 'discard') { await discardExtraction(env, user.id, id); return reply(env, e.replyToken, [msg('โอเค ไม่บันทึกนะ')]); }
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
    if (e.type === 'follow') return await reply(env, e.replyToken, [msg('ยินดีต้อนรับกลับมานะ 👋 ถามหรือสั่งงานพี่ได้เลย')]);
    if (e.type === 'postback') return await handlePostback(env, e, user);
    if (e.message?.type === 'image') return await handleImage(env, e, user);
    if (e.message?.type === 'text') {
      const r = await runAssistant(env, user.id, 'line', e.message.text);
      return await reply(env, e.replyToken, [msg(r.reply)]);
    }
    return await reply(env, e.replyToken, [msg('ตอนนี้พี่อ่านได้เฉพาะข้อความและรูปนะ')]);
  } catch (err) {
    console.error('line event error', err.message);
    try { await reply(env, e.replyToken, [msg('ขอโทษนะ ตอนนี้พี่ขัดข้อง ลองใหม่อีกครั้งนะ')]); } catch {}
  }
}
