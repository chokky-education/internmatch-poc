export const SEED_APPLICATIONS = [
  { company: 'บริษัท A', role: 'Data Analyst Intern', status: 'Interview', truth: 'SYSTEM_VERIFIED', next: 'สัมภาษณ์ 11 พ.ย. 10:00', history: [['1 พ.ย.', 'สมัครผ่าน InternMatch'], ['8 พ.ย.', 'บริษัทเปลี่ยนเป็นสัมภาษณ์']] },
  { company: 'บริษัท B', role: 'BI Intern', status: 'Applied', truth: 'USER_REPORTED', url: 'careers.company-b.com', next: 'รอผลพิจารณา', history: [['3 พ.ย.', 'บันทึกเอง: สมัครบนเว็บบริษัท']] },
  { company: 'บริษัท F', role: 'Data Engineer Intern', status: 'Applied', truth: 'USER_REPORTED', url: 'jobs.f.co', next: 'ยังไม่อัปเดต', history: [['20 ต.ค.', 'บันทึกเอง']] },
  { company: 'บริษัท C', role: 'Data Science Intern', status: 'Saved', truth: 'USER_REPORTED', next: 'ปิดรับ 5 ธ.ค.', history: [] },
  { company: 'บริษัท G', role: 'Analyst Intern', status: 'Closed', truth: 'SYSTEM_VERIFIED', next: '—', history: [['15 ต.ค.', 'ไม่ผ่านการคัดเลือก']] },
];
export const SEED_TASKS = [
  { title: 'ลงทะเบียนรายวิชาฝึกงาน', detail: 'ภายใน 15 พ.ย.', done: 1 },
  { title: 'อาจารย์ที่ปรึกษาอนุมัติบริษัทเป้าหมาย', detail: 'ก่อนส่งหนังสือขอความอนุเคราะห์', done: 0 },
  { title: 'ยื่นขอหนังสือขอความอนุเคราะห์จากคณะ', detail: 'ใช้เวลาออกเอกสาร 5 วันทำการ', done: 0 },
  { title: 'ได้รับใบตอบรับจากบริษัท', detail: 'ส่งคณะภายใน 31 ม.ค.', done: 0 },
  { title: 'ส่งแบบฟอร์มยืนยันสถานที่ฝึกงาน (ฝง.01)', detail: 'ภายใน 15 ก.พ.', done: 0 },
  { title: 'ปฐมนิเทศก่อนฝึกงาน', detail: '1 มี.ค. ห้อง 301', done: 0 },
];
export const SEED_DOCUMENTS = [
  { k: 'resume', title: 'Resume', v: 'v3 · Data (TH/EN)', status: 'ok', note: 'อัปเดต 5 พ.ย. · มี 2 เวอร์ชัน' },
  { k: 'tr', title: 'Transcript', v: 'ภาค 1/2569', status: 'warn', note: 'ใกล้หมดอายุ: บริษัท B ต้องการฉบับไม่เกิน 3 เดือน' },
  { k: 'port', title: 'Portfolio', v: 'ลิงก์ Notion', status: 'ok', note: 'ตรวจลิงก์ได้ 10 พ.ย.' },
  { k: 'cover', title: 'Cover Letter', v: 'Template', status: 'warn', note: 'ยังไม่ได้ปรับให้ตรงกับบริษัท C' },
  { k: 'id', title: 'สำเนาบัตรนักศึกษา', v: '—', status: 'bad', note: 'ยังไม่ได้อัปโหลด' },
];
