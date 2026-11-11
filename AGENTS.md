# InternMatch: AI Agent Instructions & Operating Manual

> **สำหรับ AI Agent ทุกตัวที่เข้ามารับช่วงต่อ (Continuation Guide)**  
> โครงการนี้คือ **InternMatch (ผู้ช่วยพาคุณผ่านฤดูฝึกงาน)** แพลตฟอร์มช่วยนักศึกษาไทยบริหารจัดการการฝึกงานภาคบังคับและสหกิจศึกษา

---

## 1. ค้นหาบริบทก่อนเริ่มทำงาน (Find Context First)

1. อ่าน `INDEX.md` เพื่อดูแผนผังไฟล์และสถาปัตยกรรมภาพรวม
2. **ค้นหาด้วยคำสั่ง Index ก่อนอ่านไฟล์ดิบเสมอ:**
   - ค้นหาตามเนื้อหา: `node scripts/index.mjs search "คำค้น" [--kind doc|spec|code]`
   - ค้นหารายชื่อไฟล์: `node scripts/index.mjs files "ชื่อไฟล์" [--path src/]`
   - เปิดดูเนื้อหาเฉพาะส่วน: `node scripts/index.mjs show <chunk-id> [--around "คำค้น"] [--context 3]`
   - ผลลัพธ์ถูกจำกัดความยาวไม่เกิน 2,500 ตัวอักษร เพื่อประหยัด Token Budget
3. ไฟล์หลักที่ต้องอ่านเพื่อเข้าใจงาน:
   - สเปก UI/UX และระบบดีไซน์ทั้งหมด: `UI_UX_SPEC.md`
   - ข้อกำหนดผลิตภัณฑ์และ Data Pipeline: `PRD.md`
   - โค้ดต้นแบบระบบที่รันได้จริง: `index.html`
   - ลิงก์เดโมออนไลน์: https://chokky-education.github.io/internmatch-poc/

---

## 2. กฎเหล็กของสถาปัตยกรรม (Architectural Invariants)

### 2.1 ตำแหน่งผลิตภัณฑ์ (Positioning)
- **ไม่ใช่ Job Board:** ห้ามเปลี่ยนแอปเป็นหน้ารวมประกาศงาน 200 รายการ InternMatch คือ "ผู้ช่วยโครงการฝึกงาน (Seasonal Project Manager)" ที่เน้น **"วันนี้ต้องทำอะไร"**, **"เอกสารคณะ"**, และ **"การเตือนวันสำคัญ"**

### 2.2 ลำดับชั้นความน่าเชื่อถือของข้อมูล (Truth Hierarchy)
ข้อมูลทุกจุดบน UI ต้องติดป้ายระดับความน่าเชื่อถือตาม PRD เสมอ ห้ามละเมิด:
- 🟢 `✔ ยืนยันโดยระบบ (SYSTEM_VERIFIED)`: ออกโดยคณะ หรือสมัครผ่าน InternMatch (นักศึกษาแก้ไขเองไม่ได้)
- 🔵 `✎ อัปเดตโดยคุณ (USER_REPORTED)`: ข้อมูลที่นักศึกษากรอกหรือย้ายการ์ดเอง (ต้องมี Audit Trail บันทึก)
- 🟡 `🤖 อ่านโดย AI (AI_EXTRACTED)`: สกัดจากรูปภาพหรือเอกสารโดย AI (ต้องแสดงป้ายเตือนให้ตรวจก่อนยืนยันเสมอ)

### 2.3 การทำงานร่วมของ AI Engine
- **Paxa Labs OCR (`paxa-doc-extract-v1` / `paxa-ocr-lite-v1`):** ใช้สำหรับอ่านรูปภาพโพสต์งาน, คู่มือคณะ, Transcript และหนังสือตอบรับเป็นภาษาไทย
- **Google Gemini (`gemini-3.8-flash`):** สมองของแชทบอท "พี่ฝึกงาน" จัดการ Function Calling (`get_overview`, `add_application`, `update_application_status`, `add_reminder`, `set_university_task`)
- **ความปลอดภัยของ Key:** ห้าม Hardcode API Key ลงใน Git สาธารณะ และห้ามอยู่ในโค้ดฝั่งเบราว์เซอร์ ทุก key เป็น Cloudflare Worker secret (`wrangler secret put`) รายชื่ออีเมลที่เข้าใช้ได้เก็บใน secret `ALLOWED_EMAILS`

### 2.4 สถาปัตยกรรม "LINE หลัก เว็บสำรอง" (Single Backend, Two Front Doors)
- **LINE OA เป็นช่องทางหลัก** ทุกบทสนทนาเกิดที่นั่น **เว็บทำได้ทุกอย่างเท่ากับ LINE** (แชทพี่ฝึกงาน, ส่งรูปให้ OCR, บอร์ด, เช็กลิสต์, เตือน) เพื่อใช้ตอน LINE Messaging API ล่ม
- ตรรกะทั้งหมดอยู่ใน `worker/` (Cloudflare Worker + D1): auth, store, Gemini assistant, Paxa OCR, LINE webhook, cron เตือน ห้ามมี logic ซ้ำในเบราว์เซอร์ LINE webhook (`src/line.js`) และ Web API (`src/web-api.js`) เรียกฟังก์ชันชุดเดียวกัน โดยส่ง `channel` = `line`|`web` ลง audit log
- **ล็อกอินเว็บด้วยอีเมล + OTP ไม่พึ่ง LINE** ช่วง prototype ใช้ได้เฉพาะอีเมลใน `ALLOWED_EMAILS` การผูก LINE ทำโดยพิมพ์อีเมลและ OTP ในแชท
- ข้อมูลที่ AI อ่านต้องกดยืนยัน (postback ใน LINE หรือปุ่มบนเว็บ) ก่อนบันทึกเสมอ ติดป้าย `AI_EXTRACTED`
- **การ์ดตอบกลับ:** คำตอบที่ต้องตรวจหรือกดต่อ (บันทึก/เปลี่ยนสถานะใบสมัคร, ตั้งเตือน, เตือนถึงเวลา, ผล OCR) เป็น card object กลางใน `worker/src/cards.js` แล้ว LINE แปลงเป็น Flex ด้วย `flex.js` ส่วนเว็บแสดงด้วย `renderCard()` ใน `index.html` ปุ่มทุกปุ่มเรียก `runCardAction` (`worker/src/actions.js`) ผ่าน postback ใน LINE หรือ `POST /api/actions` บนเว็บ ห้ามเขียน logic ของปุ่มแยกตามช่องทาง
- **ไม่มีส่วนอาจารย์/Admin/Approval** ในผลิตภัณฑ์นี้
- เตือน: Cron ทุก 15 นาที push ทาง LINE ถ้าส่งไม่สำเร็จจะแสดงเป็นแบนเนอร์บนเว็บ
- วิธีตั้งค่าและ deploy: `docs/line-setup.md` · สเปก: `docs/superpowers/specs/2026-11-11-line-primary-web-fallback-design.md`

---

## 3. แผนที่หน้าจอ (Screen Directory)

เมนูมี 5 หน้า + ตั้งค่า แต่ละหน้ารวมหลาย `<section class="screen">` ตาม `GROUPS` ใน `index.html` · `go('<screen id>')` เดิมยังใช้ได้ทุกตัว จะเปิดหน้าที่รวมไว้แล้วเลื่อนไปที่ section นั้น

| เมนู | Screen ID ในหน้านั้น | หน้าที่หลัก |
|---|---|---|
| 🏠 หน้าหลัก | `dash` | Dashboard 2 คอลัมน์: ซ้าย "สิ่งที่ต้องทำ" (เมื่อบอร์ดว่างจะแสดงขั้นเริ่มต้นแทน) และ "เร็ว ๆ นี้" · ขวา "โปรไฟล์ของฉัน" พร้อมกล่อง Alert และ "เริ่มฝึกงาน" (6-phase journey + ความคืบหน้าเอกสารคณะ) |
| 📋 ติดตามการสมัคร | `tracker`, `saved` | Kanban Board 5 สเตจ (Saved ➔ Applied ➔ Interview ➔ Offer ➔ Closed) ตามด้วยตำแหน่งที่กดบันทึกไว้จากหน้าค้นหา |
| 📁 เอกสาร | `uni`, `docs` | เช็กลิสต์ตั้งต้นทั่วไป 6 ข้อ (ยังไม่ผูกกับคณะจริง) ตามด้วยเอกสารของฉัน 5 ชนิดและตาราง Matrix ความพร้อม |
| 💬 พี่ฝึกงาน | `chat`, `ocr` | แชทจริง แสดงบทสนทนาร่วมกับ LINE พร้อมป้ายช่องทาง ตามด้วย Dropzone ส่งเอกสาร 4 ชนิดให้ Paxa Labs OCR อ่าน (ปุ่ม 📷 ในแชทเลื่อนลงไปที่ส่วนนี้) |
| 🔎 ค้นหาฝึกงาน | `discover` | ตัวค้นหาประกาศงานพร้อมลิงก์ต้นทางและปุ่ม "รายงานข้อมูลผิด" |
| ⚙️ ตั้งค่า & LINE (ท้ายเมนู) | `notif`, `onboard` | ตั้งค่าการแจ้งเตือนและการเชื่อมบัญชี LINE OA ตามด้วยการตั้งค่าฤดูฝึกงาน (มหาวิทยาลัย/คณะ/ประเภท) ซึ่งยังเป็นหน้าตัวอย่างที่ไม่บันทึก |

*นอกจากนี้ยังมี Floating Action Button (`#aiFab`) สำหรับเปิด Drawer แชทบอท AI "พี่ฝึกงาน" ได้จากทุกหน้า*

---

## 4. ขั้นตอนก่อนรายงานผลงานสำเร็จ (Before Reporting Success)

เมื่อทำการแก้ไขหรือพัฒนาฟีเจอร์ใหม่เสร็จสิ้น ให้ปฏิบัติตามขั้นตอนต่อไปนี้เสมอ:
0. **รันเทสต์ backend:** `cd worker && npx vitest run` (ต้องผ่านทั้งหมด)
1. **ตรวจสอบความถูกต้องของ Syntax:**  
   `node -e "const h=require('fs').readFileSync('index.html','utf8');[...h.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)].forEach(m=>new Function(m[1]));console.log('OK')"`
2. **รีเฟรชระบบ Index:**  
   `node scripts/index.mjs refresh`  
   ตรวจสอบให้แน่ใจว่าไฟล์ที่ถูกเพิ่มหรือแก้ไขถูกอัปเดตลง Index
3. **Commit และ Push ขึ้น GitHub:**  
   `git add . && git commit -m "คำอธิบายงาน" && git push origin main`
4. **ตรวจสอบการ Deploy:**  
   ระบบจะ Deploy ขึ้น GitHub Pages โดยอัตโนมัติภายใน 30-45 วินาที

---

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `chokky-education/internmatch-poc` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
