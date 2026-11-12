# Agent Kickoff Prompts

Copy one of these as the **first message** to any agent (Claude Code, Codex, Cursor, Gemini CLI, Copilot, …) opened at the repo root. Replace the text in `<…>`.

## 1. Start a new task

```text
คุณกำลังทำงานในโปรเจกต์ InternMatch (repo นี้) ต่อจาก Agent ตัวก่อน

ก่อนแตะโค้ด ให้ทำตามลำดับนี้:
1. อ่าน AGENTS.md ให้ครบ แล้วอ่าน docs/STATUS.md, INDEX.md และทุกไฟล์ใน docs/adr/
2. หาบริบทด้วย `node scripts/index.mjs search "<คำค้น>"` ก่อนเปิดไฟล์ดิบ
3. สรุปกลับมาให้ฉันสั้น ๆ: งานอยู่ตรงไหน, อะไรค้าง, และคุณจะทำงานนี้อย่างไร (ไฟล์ไหน, เทสต์อะไร) แล้วลงมือทำงานที่ฉันอนุมัติให้จนจบตาม docs/release-workflow.md

งานของรอบนี้: <อธิบายงาน>

กติกา:
- ห้ามขัดกับ ADR ถ้าคิดว่าควรเปลี่ยน ให้ถามฉันก่อน
- ทำบน branch งาน ส่งผ่าน PR → CI → merge → deploy → ตรวจระบบจริง ตาม AGENTS.md และ docs/release-workflow.md Agent รับผิดชอบขั้นตอนประจำทั้งหมด
- ก่อนบอกว่าเสร็จ ให้รัน `cd worker && npx vitest run` และ `node scripts/check-docs.mjs --base origin/main` จนผ่าน
- จบงานด้วยการเขียน docs/STATUS.md ใหม่ (Now / In flight / Next + 1 บรรทัดใน Log) และแก้ INDEX.md ถ้ามีไฟล์เพิ่มหรือย้าย
- ถ้าไม่แน่ใจเรื่องไหนที่เป็นการตัดสินใจของฉัน ให้ถาม อย่าเดา
```

## 2. Continue where the last agent stopped

```text
อ่าน AGENTS.md แล้วอ่าน docs/STATUS.md ให้ละเอียด จากนั้นเช็ก `git log --oneline -10` และ PR ที่เปิดอยู่ (`gh pr list`)
บอกฉันว่า: Agent ตัวก่อนทำอะไรไปแล้ว, อะไรที่ STATUS.md บอกว่าค้าง, และ STATUS.md ตรงกับโค้ดจริงไหม ถ้าไม่ตรงให้ชี้จุด
แล้วเสนองานถัดไป 1 อย่างจากหัวข้อ Next พร้อมแผนสั้น ๆ ถ้ามีงานที่ฉันสั่งไว้แล้ว ให้ทำต่อจนตรวจระบบจริงเสร็จ; ถ้ายังไม่มีงานที่อนุมัติ ให้รอฉันเลือกงาน
```

## 3. Review someone else's PR

```text
รีวิว PR #<เลข> ของ repo นี้ อ่าน AGENTS.md, docs/adr/ และ CODING_STANDARDS.md ก่อน
ตรวจ diff ตาม CODING_STANDARDS.md ทีละข้อ รายงานเฉพาะปัญหาที่เจอจริง พร้อมไฟล์ บรรทัด และเลขกฎ
เช็กด้วยว่า docs/STATUS.md ใน PR ตรงกับสิ่งที่ diff ทำจริง ห้ามแก้โค้ดเอง แค่รายงาน
```

## When the agent finishes

The agent follows `docs/release-workflow.md` through review, current CI, merge, deployment and feature-specific production checks. The owner receives the PR/CI/deployment evidence and any concrete blocker; the owner does not have to remind the agent to finish routine release steps.
