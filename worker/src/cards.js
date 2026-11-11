// Channel-neutral card objects. LINE renders them via flex.js, the web via renderCard() in index.html.
export const STAT_TH = { Saved: 'บันทึกไว้', Applied: 'สมัครแล้ว', Interview: 'สัมภาษณ์', Offer: 'ได้รับข้อเสนอ', Closed: 'ปิด/ไม่ผ่าน' };
const NEXT = { Saved: 'Applied', Applied: 'Interview', Interview: 'Offer' };

const thDateTime = iso => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
const thDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }) : v);

export function applicationCard({ id, company, role, status, truth_level }, { undo = false } = {}) {
  const actions = [];
  const verified = truth_level === 'SYSTEM_VERIFIED';
  if (NEXT[status] && !verified) actions.push({ label: `→ ${STAT_TH[NEXT[status]]}`, data: `app_status:${id}:${NEXT[status]}`, style: 'primary' });
  if (undo && !verified) actions.push({ label: 'ยกเลิก', data: `app_undo:${id}`, style: 'secondary' });
  return { kind: 'application', title: company, subtitle: role, truth: truth_level, rows: [['สถานะ', STAT_TH[status] || status]], actions };
}

export function reminderSetCard({ id, text, due_at }) {
  return { kind: 'reminder_set', title: text, truth: 'USER_REPORTED', rows: [['เวลา', thDateTime(due_at)]], actions: [{ label: 'ลบ', data: `rem_delete:${id}`, style: 'secondary' }] };
}

export function reminderDueCard({ id, text }) {
  return { kind: 'reminder_due', title: `⏰ ${text}`, rows: [], actions: [
    { label: 'ทำแล้ว', data: `rem_done:${id}`, style: 'primary' },
    { label: 'เลื่อน 1 ชม.', data: `rem_snooze:${id}`, style: 'secondary' },
  ] };
}

export function extractionCard({ id, doc_type, fields: f }) {
  const rows = doc_type === 'job_post'
    ? [['บริษัท', f.company], ['ตำแหน่ง', f.role], f.deadline ? ['ปิดรับ', thDate(f.deadline)] : null, f.allowance ? ['ค่าตอบแทน', f.allowance] : null, f.documents?.length ? ['ต้องใช้', f.documents.join(', ')] : null]
    : Object.entries(f).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => [k, Array.isArray(v) ? v.map(x => (typeof x === 'object' ? `${thDate(x.date) || '—'} ${x.task || ''}` : x)).join(', ') : thDate(String(v))]);
  return { kind: 'extraction', title: doc_type === 'job_post' ? 'อ่านโพสต์ประกาศงานแล้ว' : 'อ่านเอกสารแล้ว', truth: 'AI_EXTRACTED', rows: rows.filter(Boolean).slice(0, 6), actions: [
    { label: '✅ ยืนยันบันทึก', data: `ext_confirm:${id}`, style: 'primary' },
    { label: '✖ ไม่ใช่', data: `ext_discard:${id}`, style: 'secondary' },
  ] };
}
