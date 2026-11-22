# เจ้าของเป็นคน merge และ deploy เอง Agent เตรียม PR และตรวจระบบจริงเท่านั้น

เดิม (2026-11-12) เจ้าของอนุญาตให้ Agent ทำครบ PR → CI → merge → deploy เองโดยไม่ต้องถามซ้ำ วันที่ 2026-11-22 เจ้าของย้ายทุกโปรเจกต์ไปใช้แม่แบบความจำกลางของ Agent ซึ่งค่าเริ่มต้นคือ "ถามก่อน commit / push และห้าม merge / deploy เอง" ให้ตรงกับคู่มือ Modern Web AI Workflow ที่ห้าม AI deploy ขึ้น production เอง เพราะ merge และ deploy ย้อนกลับยาก และเจ้าของอยากเห็นทุกอย่างก่อนถึงผู้ใช้จริง

**ผลที่ตามมา:** Agent ห้ามรัน `gh pr merge`, `wrangler deploy`, `wrangler d1 migrations apply`, `wrangler secret put` หรือคำสั่งที่เปลี่ยน production แม้มี login อยู่ในเครื่อง Agent commit / push / เปิด PR เมื่อเจ้าของสั่ง เขียนคำสั่ง deploy ไว้ใน PR และรัน `verify-production.mjs` หลังเจ้าของบอกว่า deploy แล้ว Worker ยังไม่มี deploy อัตโนมัติจาก CI จึงเป็นขั้นที่เจ้าของรันเอง ที่มา: `docs/release-workflow.md` · วันที่: 2026-11-22
