// Test-only sample data. Never seeded for real users.
import { context } from '../src/seasons.js';
import { seedUser } from '../src/store.js';
import { SEED_TASKS } from '../src/seed.js';
export const SAMPLE_APPLICATIONS = [
  { company: 'บริษัท A', role: 'Data Analyst Intern', status: 'Interview', truth: 'SYSTEM_VERIFIED', next: 'สัมภาษณ์ 11 พ.ย. 10:00', history: [['1 พ.ย.', 'สมัครผ่าน InternMatch'], ['8 พ.ย.', 'บริษัทเปลี่ยนเป็นสัมภาษณ์']] },
  { company: 'บริษัท B', role: 'BI Intern', status: 'Applied', truth: 'USER_REPORTED', url: 'careers.company-b.com', next: 'รอผลพิจารณา', history: [['3 พ.ย.', 'บันทึกเอง: สมัครบนเว็บบริษัท']] },
  { company: 'บริษัท F', role: 'Data Engineer Intern', status: 'Applied', truth: 'USER_REPORTED', url: 'jobs.f.co', next: 'ยังไม่อัปเดต', history: [['20 ต.ค.', 'บันทึกเอง']] },
  { company: 'บริษัท C', role: 'Data Science Intern', status: 'Saved', truth: 'USER_REPORTED', next: 'ปิดรับ 5 ธ.ค.', history: [] },
  { company: 'บริษัท G', role: 'Analyst Intern', status: 'Closed', truth: 'SYSTEM_VERIFIED', next: '—', history: [['15 ต.ค.', 'ไม่ผ่านการคัดเลือก']] },
];
export const SAMPLE_DOCUMENTS = [
  { k: 'resume', title: 'Resume', v: 'v3 · Data (TH/EN)', status: 'ok', note: 'อัปเดต 5 พ.ย. · มี 2 เวอร์ชัน' },
  { k: 'tr', title: 'Transcript', v: 'ภาค 1/2569', status: 'warn', note: 'ใกล้หมดอายุ: บริษัท B ต้องการฉบับไม่เกิน 3 เดือน' },
  { k: 'port', title: 'Portfolio', v: 'ลิงก์ Notion', status: 'ok', note: 'ตรวจลิงก์ได้ 10 พ.ย.' },
  { k: 'cover', title: 'Cover Letter', v: 'Template', status: 'warn', note: 'ยังไม่ได้ปรับให้ตรงกับบริษัท C' },
  { k: 'id', title: 'สำเนาบัตรนักศึกษา', v: '—', status: 'bad', note: 'ยังไม่ได้อัปโหลด' },
];

export async function seedDemo(env, userId) {
  await seedUser(env, userId);
  const seasonId = (await context(env,userId)).season.id;
  const now = new Date().toISOString(), db = env.DB;
  await db.batch([
    ...SEED_TASKS.map((t, i) => db.prepare('INSERT INTO tasks(id,user_id,season_id,title,detail,done,truth_level,sort) VALUES (?,?,?,?,?,0,?,?)')
      .bind(crypto.randomUUID(), userId, seasonId, t.title, t.detail, 'USER_REPORTED', i)),
    ...SAMPLE_APPLICATIONS.map(a => db.prepare('INSERT INTO applications (id,user_id,season_id,company,role,status,next_step,url,truth_level,history_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), userId, seasonId, a.company, a.role, a.status, a.next, a.url || null, a.truth, JSON.stringify(a.history), now)),
    ...SAMPLE_DOCUMENTS.map(d => db.prepare('INSERT INTO documents (id,user_id,season_id,kind,title,status,note,fields_json,truth_level,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), userId, seasonId, 'my_doc', d.title, d.status, d.note, JSON.stringify({ k: d.k, version: d.v }), 'USER_REPORTED', now)),
  ]);
}
