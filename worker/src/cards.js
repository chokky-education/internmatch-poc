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

export function extractionCard({ id, doc_type, fields: f }, { retype } = {}) {
  const rows = doc_type === 'job_post'
    ? [['บริษัท', f.company], ['ตำแหน่ง', f.role], f.deadline ? ['ปิดรับ', thDate(f.deadline)] : null, f.allowance ? ['ค่าตอบแทน', f.allowance] : null, f.documents?.length ? ['ต้องใช้', f.documents.join(', ')] : null]
    : Object.entries(f).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => [k, Array.isArray(v) ? v.map(x => (typeof x === 'object' ? `${thDate(x.date) || '—'} ${x.task || ''}` : x)).join(', ') : thDate(String(v))]);
  return { kind: 'extraction', title: doc_type === 'job_post' ? 'อ่านโพสต์ประกาศงานแล้ว' : 'อ่านเอกสารแล้ว', truth: 'AI_EXTRACTED', rows: rows.filter(Boolean).slice(0, 6), actions: [
    { label: '✅ ยืนยันบันทึก', data: `ext_confirm:${id}`, style: 'primary' },
    { label: '✖ ไม่ใช่', data: `ext_discard:${id}`, style: 'secondary' },
    ...(retype ? [{ label: 'เอกสารชนิดอื่น', data: retype, style: 'secondary' }] : []),
  ] };
}

// Fixed summary cards for the rich menu (and the web's matching chips).
const MAX_ROWS = 10;
const capRows = rows => (rows.length > MAX_ROWS ? [...rows.slice(0, MAX_ROWS - 1), ['…', `และอีก ${rows.length - MAX_ROWS + 1} รายการ (ดูบนเว็บ)`]] : rows);
const ORDER = ['Interview', 'Offer', 'Applied', 'Saved', 'Closed'];
const DAY = 86400e3;

export function applicationsSummaryCard(o) {
  const apps = [...o.applications].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  return { kind: 'summary', title: `📋 ใบสมัครทั้งหมด (${apps.length})`, rows: capRows(apps.map(a => [a.company, STAT_TH[a.status] || a.status])), actions: [] };
}

export function checklistSummaryCard(o) {
  const all = o.university_checklist, left = all.filter(t => !t.done);
  return { kind: 'summary', title: `🎓 เช็กลิสต์คณะ ${all.length - left.length}/${all.length}`, rows: capRows(left.map(t => [t.task, t.detail || ''])), actions: [] };
}

export function upcomingReminders(o, now = Date.now()) {
  return o.reminders.filter(r => Date.parse(r.due_at) > now).sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
}

export function remindersSummaryCard(o, now = Date.now()) {
  const up = upcomingReminders(o, now);
  return { kind: 'summary', title: `🔔 การเตือนที่ตั้งไว้ (${up.length})`, rows: capRows(up.map(r => [r.text, thDateTime(r.due_at)])),
    actions: up.slice(0, 3).map(r => ({ label: `ลบ: ${r.text}`, data: `rem_delete:${r.id}`, style: 'secondary' })) };
}

export function todayCard(o, now = Date.now()) {
  const rows = [];
  for (const r of upcomingReminders(o, now).filter(r => Date.parse(r.due_at) - now < 2 * DAY).slice(0, 3)) rows.push(['⏰ ' + thDateTime(r.due_at), r.text]);
  for (const a of o.applications.filter(a => !a.verified_by_system && ['Saved', 'Applied', 'Interview'].includes(a.status) && now - Date.parse(a.updated_at) > 14 * DAY).slice(0, 2))
    rows.push(['⚠️ ไม่ได้อัปเดตนาน', `${a.company} (${STAT_TH[a.status]})`]);
  const next = o.university_checklist.find(t => !t.done);
  if (next) rows.push(['🎓 ขั้นต่อไป', next.task]);
  return { kind: 'summary', title: '🏠 วันนี้ต้องทำอะไร', rows, actions: [] };
}
