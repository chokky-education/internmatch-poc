// Channel-neutral card objects. LINE renders them via flex.js, the web via renderCard() in index.html.
export const STAT_TH = { Saved: 'บันทึกไว้', Applied: 'สมัครแล้ว', Interview: 'สัมภาษณ์', Offer: 'ได้รับข้อเสนอ', Closed: 'ปิด/ไม่ผ่าน' };
import { DOCUMENT_STATUS } from './document-checklist.js';
const NEXT = { Saved: 'Applied', Applied: 'Interview', Interview: 'Offer' };

const thDateTime = iso => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
const thDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }) : v);

export function documentItemCard(item) {
  return { kind: 'checklist_item', title: item.title, truth: item.truth_level,
    rows: [['สถานะที่คุณรายงาน', DOCUMENT_STATUS[item.status]], ['ส่งให้', item.recipient || 'ยังไม่ทราบ'],
      ['ส่งทาง', item.submission_method || 'ยังไม่ทราบ'], ['กำหนดส่ง', item.due_date ? thDate(item.due_date) : 'ยังไม่ทราบ'],
      ['ที่มา', item.source || 'ยังไม่ระบุ'], ...(item.source_page ? [['หน้า', item.source_page]] : []),
      ...(item.detail ? [['หมายเหตุ', item.detail]] : [])],
    actions: Object.entries(DOCUMENT_STATUS).filter(([s]) => s !== item.status).map(([s, label]) => ({ label, data: `doc_status:${item.id}:${s}:${item.version}`, style: 'secondary' })) };
}

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

export function reminderDueCard({ id, text, season_name }) {
  return { kind: 'reminder_due', title: `⏰ ${text}`, subtitle:season_name, rows: season_name?[['ฤดู',season_name]]:[], actions: [
    { label: 'ทำแล้ว', data: `rem_done:${id}`, style: 'primary' },
    { label: 'เลื่อน 1 ชม.', data: `rem_snooze:${id}`, style: 'secondary' },
  ] };
}

export function extractionCard({ id, doc_type, fields: f,season_name }, { retype } = {}) {
  const rows = doc_type === 'job_post'
    ? [['บริษัท', f.company], ['ตำแหน่ง', f.role], f.deadline ? ['ปิดรับ', thDate(f.deadline)] : null, f.allowance ? ['ค่าตอบแทน', f.allowance] : null, f.documents?.length ? ['ต้องใช้', f.documents.join(', ')] : null]
    : Object.entries(f).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => [k, Array.isArray(v) ? v.map(x => (typeof x === 'object' ? `${thDate(x.date) || '—'} ${x.task || ''}` : x)).join(', ') : thDate(String(v))]);
  return { kind: 'extraction', title: doc_type === 'job_post' ? 'อ่านโพสต์ประกาศงานแล้ว' : 'อ่านเอกสารแล้ว', truth: 'AI_EXTRACTED', subtitle:season_name, rows: [...(season_name?[['ฤดู',season_name]]:[]),...rows.filter(Boolean).slice(0, 6)], actions: [
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
  const all = o.checklist_items || [];
  return { kind: 'summary', title: `📁 รายการเตรียมเอกสาร (${all.length})`,
    rows: all.length ? capRows(all.map(t => [t.title, `${DOCUMENT_STATUS[t.status]} · ✎ อัปเดตโดยคุณ`])) : [['เริ่มต้น', 'เพิ่มรายการจากข้อมูลที่คุณตรวจแล้ว บอกพี่ได้ว่าต้องเตรียมอะไร']], actions: [] };
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
  const next = (o.checklist_items || []).find(t => t.status !== 'submitted');
  if (next) rows.push(['📁 รายการที่คุณเพิ่ม', next.title]);
  return { kind: 'summary', title: '🏠 วันนี้ต้องทำอะไร', rows, actions: [] };
}

export function proposalCard(p) {
 const f=p.payload.after||p.payload;
 if(!p.kind.startsWith('milestone')){
  const labels={preferred_name:'ชื่อที่อยากให้เรียก',university:'มหาวิทยาลัย',faculty:'คณะ',major:'สาขา',study_year:'ชั้นปี',career_interests:'สายงานที่สนใจ',name:'ชื่อฤดู',type:'ประเภท',other_type:'ประเภทอื่น',hours:'ชั่วโมง',weeks:'สัปดาห์',source:'แหล่งที่มา',start_date:'เริ่มฝึกงาน',end_date:'สิ้นสุดฝึกงาน'};
  const flatten=o=>Object.entries(o||{}).flatMap(([k,v])=>['education','details'].includes(k)?Object.entries(v||{}):[[k,v]]).filter(([k])=>labels[k]);
  const old=Object.fromEntries(flatten(p.payload.before));
  const show=v=>Array.isArray(v)?v.join(', '):String(v??'ยังไม่ระบุ');
  return {kind:'proposal',title:'ตรวจข้อมูลก่อนยืนยัน',subtitle:p.season_name,truth:'USER_REPORTED',rows:[['ฤดูต้นทาง',p.season_name],...flatten(f).filter(([k,v])=>JSON.stringify(old[k])!==JSON.stringify(v)).map(([k,v])=>[labels[k],p.payload.before?show(old[k])+' → '+show(v):show(v)])].slice(0,15),actions:[{label:'ยืนยัน',data:`proposal_confirm:${p.id}`,style:'primary'},{label:'ไม่บันทึก',data:`proposal_discard:${p.id}`,style:'secondary'}]};
 }
 return {kind:'proposal',title:p.kind==='milestone_edit'?'ตรวจวันและการเตือนใหม่':'ตั้งการเตือนวันสำคัญ',subtitle:p.season_name,truth:'USER_REPORTED',
 rows:[['ฤดู',p.season_name],['เรื่อง',f.title||'วันสำคัญ'],['วันที่',f.date||p.payload.anchor||'ยังไม่ทราบ'],...(f.end_date?[['ถึง',f.end_date],['นับเตือนจาก','วันสิ้นสุด']]:[]),...(p.payload.reminders||[]).map(r=>['เตือน',r.due_at?thDateTime(r.due_at):'ยกเลิกรายการที่ยังไม่ส่ง'])],
 actions:[{label:'ยืนยัน',data:`proposal_confirm:${p.id}`,style:'primary'},{label:'ไม่บันทึก',data:`proposal_discard:${p.id}`,style:'secondary'}]};
}
