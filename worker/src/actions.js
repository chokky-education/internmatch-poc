// Card button dispatcher shared by LINE postbacks and POST /api/actions.
import { updateApplicationStatus, deleteApplication, deleteReminder, markReminderSeen, snoozeReminder } from './store.js';
import { confirmExtraction, discardExtraction } from './ocr.js';
import { applicationCard, reminderSetCard, STAT_TH } from './cards.js';
import { saveMessage } from './assistant.js';

const STATUS = ['Saved', 'Applied', 'Interview', 'Offer', 'Closed'];
const GENERIC = 'ทำไม่สำเร็จ ลองใหม่อีกครั้งนะ';
const ERR_TH = { not_found: 'รายการนี้ไม่มีแล้วนะ', system_verified: 'รายการนี้บริษัทเป็นผู้อัปเดต แก้เองไม่ได้นะ' };
const LABEL = { app_status: 'เปลี่ยนสถานะ', app_undo: 'ยกเลิก', rem_delete: 'ลบการเตือน', rem_done: 'ทำแล้ว', rem_snooze: 'เลื่อน 1 ชม.', ext_confirm: 'ยืนยันบันทึก', ext_discard: 'ไม่ใช่' };
const thTime = iso => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
const EXT_ERR = { already_confirmed: 'อันนี้บันทึกไปแล้วนะ', duplicate: 'มีบริษัทนี้อยู่ในบอร์ดแล้วนะ' };

async function dispatch(env, userId, channel, name, id, arg) {
  switch (name) {
    case 'app_status': {
      if (!STATUS.includes(arg)) return { ok: false, reply: GENERIC };
      const r = await updateApplicationStatus(env, userId, { id, status: arg }, channel);
      return r.ok ? { ok: true, reply: `อัปเดต ${r.company} เป็น ${STAT_TH[r.status]} แล้ว`, cards: [applicationCard({ ...r, truth_level: 'USER_REPORTED' })] } : { ok: false, reply: ERR_TH[r.error] || GENERIC };
    }
    case 'app_undo': {
      const r = await deleteApplication(env, userId, id, channel);
      return r.ok ? { ok: true, reply: `ลบ ${r.company} ออกจากบอร์ดแล้ว` } : { ok: false, reply: ERR_TH[r.error] || GENERIC };
    }
    case 'rem_delete': {
      const r = await deleteReminder(env, userId, { id }, channel);
      return r.ok ? { ok: true, reply: 'ลบการเตือนแล้ว' } : { ok: false, reply: ERR_TH[r.error] || GENERIC };
    }
    case 'rem_done': {
      const r = await markReminderSeen(env, userId, id);
      return r.ok ? { ok: true, reply: 'เยี่ยมเลย ✅' } : { ok: false, reply: ERR_TH.not_found };
    }
    case 'rem_snooze': {
      const r = await snoozeReminder(env, userId, id, 60, channel);
      return r.ok ? { ok: true, reply: `เลื่อนไปเตือนอีกครั้ง ${thTime(r.due_at)}`, cards: [reminderSetCard(r)] } : { ok: false, reply: ERR_TH[r.error] || GENERIC };
    }
    case 'ext_confirm': case 'confirm': {
      const r = await confirmExtraction(env, userId, id, channel);
      return r.ok ? { ok: true, reply: 'บันทึกแล้ว ✅ ดูบนบอร์ดได้เลย (ป้าย 🤖 AI อ่าน)', label: 'ext_confirm' } : { ok: false, reply: EXT_ERR[r.error] || 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้งนะ' };
    }
    case 'ext_discard': case 'discard': {
      await discardExtraction(env, userId, id);
      return { ok: true, reply: 'โอเค ไม่บันทึกนะ', label: 'ext_discard' };
    }
    default: return { ok: false, reply: GENERIC };
  }
}

export async function runCardAction(env, userId, channel, data) {
  const [name, id, arg] = String(data || '').split(':');
  let out;
  try { out = await dispatch(env, userId, channel, name, id, arg); } catch (e) { console.error('card action error', e.message); out = { ok: false, reply: GENERIC }; }
  const cards = out.cards || [];
  if (out.ok) {
    const label = LABEL[out.label || name] || name;
    await saveMessage(env, userId, channel, 'user', label);
    await saveMessage(env, userId, channel, 'model', out.reply, cards);
  }
  return { ok: out.ok, reply: out.reply, cards };
}
