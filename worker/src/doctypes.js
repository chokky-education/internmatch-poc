const S = (t, d, x = {}) => ({ type: t, ...(d ? { description: d } : {}), ...x });
const arr = (d, n = 10) => ({ type: 'array', max_items: n, items: { type: 'string' }, description: d });

export const DOCTYPES = {
  job_post: { label: 'โพสต์ประกาศงาน', fields: {
    company: S('string', 'ชื่อบริษัท', { required: true }), role: S('string', 'ชื่อตำแหน่งฝึกงาน', { required: true }), location: S('string', 'สถานที่ทำงาน'),
    work_mode: S('enum', 'รูปแบบการทำงาน', { values: ['Onsite', 'Hybrid', 'Remote'] }), period: S('string', 'ช่วงเวลาฝึกงาน'), allowance: S('string', 'เบี้ยเลี้ยง/ค่าตอบแทน'),
    deadline: S('date', 'วันปิดรับสมัคร'), skills: arr('ทักษะ/คุณสมบัติที่ต้องการ'), documents: arr('เอกสารที่ต้องใช้สมัคร'), email: S('email'), phone: S('phone'), apply_url: S('string', 'ลิงก์สมัคร') } },
  handbook: { label: 'คู่มือ/ประกาศคณะ', fields: {
    program: S('string', 'ชื่อหลักสูตรหรือรายวิชาฝึกงาน'), min_hours: S('integer', 'จำนวนชั่วโมงฝึกงานขั้นต่ำ'),
    milestones: { type: 'array', max_items: 15, description: 'กำหนดการ/วันสำคัญทั้งหมดในเอกสาร', items: { type: 'object', fields: { task: S('string', 'สิ่งที่ต้องทำ'), date: S('date', 'วันที่กำหนด') } } },
    required_forms: arr('แบบฟอร์มหรือเอกสารที่ต้องส่ง', 15), contact: S('string', 'ผู้ประสานงาน/เจ้าหน้าที่') } },
  transcript: { label: 'Transcript', fields: {
    student_name: S('string', 'ชื่อนักศึกษา', { required: true }), student_id: S('id', 'รหัสนักศึกษา'), university: S('string'), major: S('string', 'สาขาวิชา'),
    gpax: S('number', 'เกรดเฉลี่ยสะสม'), issue_date: S('date', 'วันที่ออกเอกสาร') } },
  acceptance: { label: 'หนังสือตอบรับ', fields: {
    company: S('string', 'บริษัทที่ตอบรับ', { required: true }), student_name: S('string', 'ชื่อนักศึกษาที่ได้รับการตอบรับ'), start_date: S('date', 'วันเริ่มฝึกงาน'),
    end_date: S('date', 'วันสิ้นสุดฝึกงาน'), position: S('string', 'ตำแหน่ง'), signer: S('string', 'ผู้ลงนาม'), issue_date: S('date', 'วันที่ของหนังสือ') } },
};
