# Project Map & Index: InternMatch

Generated locally. Search automatically refreshes changed project files and specifications.

`node scripts/index.mjs search "คำค้น" [--kind doc|spec|code]`
`node scripts/index.mjs files "filename" [--path src/]`
`node scripts/index.mjs show <id> [--around keyword] [--context 3]`

Output is capped at 2,500 characters to protect AI context budgets.

## File & Module Map

| Component / Task | File / Path | Type | Description |
| --- | --- | --- | --- |
| **Interactive Web App (POC)** | `index.html` | Code | Complete single-page app (All 8 screens, Kanban, AI Chatbot, Paxa OCR, Admin Portal) |
| **Product Requirements (PRD)** | `PRD.md` | Spec | Full Product Requirements Document (Positioning, Features, Data Pipeline, Metrics) |
| **UI/UX Design Spec** | `UI_UX_SPEC.md` | Spec | Screen-by-screen UX/UI specifications, design tokens, component interactions & AI prompts |
| **Agent Instructions** | `AGENTS.md` | Doc | Guidance for incoming AI Agents on rules, architecture invariants, and tools |
| **Indexing Script** | `scripts/index.mjs` | Code | FTS5 trigram SQLite local indexer CLI for seamless AI agent navigation |
| **Live Deployed App** | [GitHub Pages](https://chokky-education.github.io/internmatch-poc/) | Live | Deployed public demo running on GitHub Pages |

## Key Concepts & Truth Hierarchy
- **Positioning:** "ผู้ช่วยพาคุณผ่านฤดูฝึกงาน" (ไม่ใช่แค่ Job Board แต่เป็น Action-first Project Manager สำหรับนักศึกษาไทย)
- **Truth Levels:**
  - `SYSTEM_VERIFIED` (เขียว): ได้รับการยืนยันจากคณะ หรือส่งผ่านระบบ InternMatch
  - `USER_REPORTED` (เทา/น้ำเงิน): ข้อมูลที่นักศึกษากรอกหรือย้ายการ์ดเอง
  - `AI_EXTRACTED` (เหลือง): สกัดจากรูปภาพโพสต์งานหรือเอกสาร ต้องรอผู้ใช้ตรวจก่อน
- **Dual AI Engine:**
  - **Paxa Labs Document Extraction API** (`paxa-doc-extract-v1`): อ่านรูปภาพโพสต์งาน, คู่มือคณะ, Transcript, หนังสือตอบรับ
  - **Gemini 3.8 Flash**: สมองแชทบอท "พี่ฝึกงาน" พร้อม Function Calling จัดการ State บอร์ดและเช็กลิสต์
