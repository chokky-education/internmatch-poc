# InternMatch: AI Agent Instructions & Operating Manual

> ไฟล์นี้คือคำสั่งชุดเดียวสำหรับทุก harness (Claude Code อ่านผ่าน `CLAUDE.md`, Gemini CLI ผ่าน `GEMINI.md`, Codex/Cursor/Copilot อ่านไฟล์นี้ตรง) แก้ที่นี่ที่เดียว อย่าเพิ่มคำสั่งในไฟล์ชี้ทาง

> **สำหรับ AI Agent ทุกตัวที่เข้ามารับช่วงต่อ (Continuation Guide)**  
> โครงการนี้คือ **InternMatch (ผู้ช่วยพาคุณผ่านฤดูฝึกงาน)** แพลตฟอร์มช่วยนักศึกษาไทยบริหารจัดการการฝึกงานภาคบังคับและสหกิจศึกษา

---

## 1. ค้นหาบริบทก่อนเริ่มทำงาน (Find Context First)

1. อ่าน `docs/STATUS.md` ก่อน: งานอยู่ตรงไหน, อะไรค้างอยู่, ทำอะไรต่อ แล้วอ่าน `INDEX.md` เพื่อดูแผนผังไฟล์และสถาปัตยกรรมภาพรวม
2. **ค้นหาด้วยคำสั่ง Index ก่อนอ่านไฟล์ดิบเสมอ** (ต้องใช้ Node 24+ เพราะใช้ `node:sqlite` ถ้ารันไม่ได้ให้ใช้ `rg` แทน):
   - ค้นหาตามเนื้อหา: `node scripts/index.mjs search "คำค้น" [--kind doc|spec|code]`
   - ค้นหารายชื่อไฟล์: `node scripts/index.mjs files "ชื่อไฟล์" [--path src/]`
   - เปิดดูเนื้อหาเฉพาะส่วน: `node scripts/index.mjs show <chunk-id> [--around "คำค้น"] [--context 3]`
   - ผลลัพธ์ถูกจำกัดความยาวไม่เกิน 2,500 ตัวอักษร เพื่อประหยัด Token Budget
3. **ก่อนเปลี่ยนสถาปัตยกรรมหรือขอบเขต ให้อ่าน `docs/adr/`** ทุกไฟล์บันทึกการตัดสินใจที่ตั้งใจไว้แล้ว ถ้าจะทำต่างออกไปต้องถามเจ้าของก่อน ถ้าตัดสินใจเรื่องที่ย้อนกลับยากใหม่ ให้เพิ่ม ADR (รูปแบบสั้น 1 ย่อหน้า เลขเรียงต่อกัน)
4. ไฟล์หลักที่ต้องอ่านเพื่อเข้าใจงาน:
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

## 4. ส่งงานจนตรวจระบบจริงเสร็จ (Required release workflow)

**ทุกงานที่เปลี่ยน repo หรือ production ใช้ลำดับ PR → CI → merge → deploy → ตรวจระบบจริง** รวมเอกสาร, config, secrets และการแก้ข้อมูล ไม่มีการ push เข้า `main` ตรงหรือใช้ admin ข้ามกฎ

1. **เตรียม:** อ่าน [docs/release-workflow.md](docs/release-workflow.md) ก่อนเปลี่ยนไฟล์/ตั้งค่าระบบจริง เช็กสถานะ Git และ PR ปัจจุบัน ใช้ branch `codex/…` หรือ branch ของ PR ที่รับช่วง เก็บงานอื่นของผู้ใช้ไว้ตามเดิม
2. **แก้และตรวจ:** อัปเดต `docs/STATUS.md` ตามสิ่งที่ทำจริงและ `INDEX.md` เมื่อแผนผังเปลี่ยน รัน backend tests, syntax, guardrails, release-tool tests และ index ตามคำสั่งใน workflow รีวิว diff ตาม `CODING_STANDARDS.md` และแก้ประเด็นที่พบ
3. **PR → CI:** push เฉพาะ branch งาน → สร้างหรืออัปเดต PR → รอ required check ชื่อ `check` ของ GitHub Actions ผ่านบน revision ล่าสุด ถ้า base เปลี่ยนให้อัปเดต branch และรันใหม่
4. **Merge:** เมื่อทำงานที่ผู้ใช้อนุมัติครบและ CI ผ่าน ให้ Agent merge PR เองตาม runbook ผู้ใช้อนุมัติขั้นตอนประจำนี้ไว้แล้ว ไม่หยุดรอให้ผู้ใช้ merge หรือยืนยัน deploy ซ้ำ ถ้าผู้ใช้สั่งให้ส่งแค่ draft/รีวิว ให้รักษาขอบเขตนั้น
5. **Deploy:** ตามงานของ merged commit จนจบ CI บน `main` ต้องผ่านก่อน Pages deploy; Agent รับผิดชอบ deploy Worker/DB/secret ที่ PR ต้องใช้จาก merged checkout ด้วยเครื่องมือที่ล็อกอินไว้ ดูเงื่อนไขแต่ละชนิดใน runbook
6. **ตรวจระบบจริง:** ยืนยัน Pages เป็น merged SHA และเนื้อหาตรง artifact, รัน production smoke, ตรวจ release/version ของ Worker ถ้าเปลี่ยน และตรวจ flow ที่แก้จริงทั้งเว็บ/LINE ตามผลกระทบ เก็บหลักฐานและข้อจำกัดในรายงานงาน อย่าใช้แค่ health endpoint แทนการตรวจฟีเจอร์
7. **ปิดงาน:** รายงาน PR, merged SHA, CI, deploy และผลตรวจจริงอย่างแยกกัน งานยังไม่เสร็จถ้า CI/deploy/verification ล้มเหลว ให้ตามแก้ต่อ หากขาดสิทธิ์/OTP/credential ที่จำเป็น ให้ระบุสิ่งที่ขาดและขอเฉพาะส่วนนั้น

ค่าลับไม่อยู่ใน Git: PR ของงาน secrets/ข้อมูลจริงต้องมีแผนที่ไม่เปิดเผยค่า เป้าหมาย ผลที่คาด วิธีตรวจ และวิธีย้อนกลับ ผ่าน CI/merge ก่อนใช้ค่าจริง ห้ามเดา LINE ID, เปิดสิทธิ์เพิ่ม หรือเปลี่ยน API key นอกขอบเขตที่ผู้ใช้อนุมัติ

---

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `chokky-education/internmatch-poc` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
