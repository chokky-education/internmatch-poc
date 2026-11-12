# InternMatch: ตั้งค่า Key และ Deploy (เอกสารแผ่นเดียว)

ทุก key อยู่ที่นี่ที่เดียว ห้ามเอา key ใดๆ ลง Git, แชท หรือโค้ดฝั่งเบราว์เซอร์ key ทั้งหมดเก็บเป็น Cloudflare Worker secret เท่านั้น

## ตารางสรุป

| Secret (ชื่อที่ใส่ใน wrangler) | ได้จากที่ไหน | จำเป็นในเฟสนี้ | ถ้าไม่ใส่ |
|---|---|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey → Create API key | ✅ จำเป็น | บอทตอบไม่ได้ (ตอบข้อความสำรอง) |
| `LINE_CHANNEL_SECRET` | LINE Developers → Channel → Basic settings → Channel secret | ✅ จำเป็น | webhook ปฏิเสธทุกข้อความ (401) |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers → Channel → Messaging API → Channel access token (long-lived) → Issue | ✅ จำเป็น | บอทตอบกลับ LINE และส่งเตือนไม่ได้ |
| `ALLOWED_EMAILS` | พิมพ์เอง: อีเมลทีม 4 คน คั่นด้วย `,` | ✅ จำเป็น | ไม่มีใครล็อกอินได้ |
| `BREVO_API_KEY` | https://app.brevo.com → SMTP & API → API Keys → Generate (v3) | ⚠️ **ต้องมี** (ดูหมายเหตุ) | ไม่มีรหัส OTP → ล็อกอินเว็บและผูก LINE ไม่ได้ |
| `BREVO_SENDER_EMAIL` | Gmail ของคุณที่ยืนยันเป็นผู้ส่งใน Brevo (Senders & IP → Senders) | ⚠️ **ต้องมี** | เหมือนข้างบน |
| `PAXA_API_KEY` | Paxa Labs | ⏸️ เลื่อนได้ | เฉพาะ OCR อ่านรูปใช้ไม่ได้ ส่วนอื่นทำงานปกติ |

> **หมายเหตุเรื่อง Brevo:** คุณบอกว่าเลื่อนอีก 2 key ได้ Paxa เลื่อนได้จริง แต่ Brevo **เลื่อนไม่ได้** เพราะระบบล็อกอินด้วยอีเมล + OTP (ทั้งเว็บและผูก LINE) ถ้าไม่มี Brevo จะเข้าใช้งานไม่ได้เลย Brevo ฟรี ไม่ต้องมีโดเมน ใช้เวลาตั้งค่า ~5 นาที (สมัคร → ยืนยัน Gmail ผู้ส่ง → สร้าง API key)

ค่าที่ไม่ลับ (อยู่ใน `worker/wrangler.toml` แล้ว): `GEMINI_MODEL`, `PAXA_MODEL`, `WEB_ORIGIN`

## ขั้นที่ 1: เตรียมเครื่อง (ครั้งเดียว)
```bash
cd worker
npx wrangler login
npx wrangler d1 create internmatch
```
คัดลอก `database_id` ที่ได้ ไปแทนค่า `0000…` ใน `worker/wrangler.toml`

## ขั้นที่ 2: ใส่ secret ทั้งหมดรวดเดียว
รันทีละบรรทัด wrangler จะถามค่าให้วาง (ค่าไม่แสดงบนจอและไม่ถูกบันทึกใน history)
```bash
cd worker
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put ALLOWED_EMAILS          # a@x.com,b@y.com,c@z.com,d@w.com
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put BREVO_SENDER_EMAIL
# เลื่อนได้: npx wrangler secret put PAXA_API_KEY
```
ตรวจว่าครบ (แสดงเฉพาะชื่อ ไม่แสดงค่า): `npx wrangler secret list`

**เพิ่มสมาชิกทีม:** `wrangler secret put ALLOWED_EMAILS` เขียนทับรายชื่อทั้งหมด ไม่ได้เพิ่มต่อท้าย ต้องใส่อีเมลเดิมทุกคนพร้อมอีเมลใหม่ในครั้งเดียว ห้ามใส่เฉพาะคนใหม่ และห้ามเก็บรายชื่อจริงใน Git เพราะ repo เป็นสาธารณะ หลังแก้ให้ตรวจสิทธิ์ทั้งสมาชิกเดิมและสมาชิกใหม่ การที่ `secret list` แสดงชื่อ `ALLOWED_EMAILS` ไม่ได้ยืนยันว่ารายชื่อข้างในครบ

## ขั้นที่ 3: Deploy ครั้งแรก

การแก้ระบบที่มีอยู่แล้วต้องผ่าน [release workflow](release-workflow.md) ก่อน ใช้คำสั่งด้านล่างจาก merged checkout เท่านั้น Agent ทำ merge/deploy และตรวจจริงต่อเองภายในงานที่อนุมัติแล้ว
```bash
cd worker
npx wrangler d1 migrations apply internmatch --remote
npx wrangler deploy        # ได้ URL https://internmatch-api.<account>.workers.dev
```
แก้ `config.js` ที่รากโปรเจกต์: `window.IM_API = 'https://internmatch-api.<account>.workers.dev'`
ตรวจ: เปิด `<URL>/api/health` ต้องได้ `ok`

## ขั้นที่ 4: LINE Developers Console
1. Webhook URL = `<URL>/line/webhook` → กด **Verify** (ต้องขึ้น Success)
2. เปิด **Use webhook**
3. LINE Official Account Manager → ปิด **Auto-reply** และ **Greeting message**
4. แจก QR ของ OA ให้ทีม

## ขั้นที่ 4.5: Rich Menu (ทำแล้ว 11 พ.ย. 2569)
- เมนูหลัก 6 ช่อง (คนที่ผูกบัญชีแล้ว) และเมนูเริ่มต้น 2 ช่อง (ผูกบัญชี / เปิดเว็บ) สำหรับคนใหม่ ระบบสลับเป็นเมนูหลักให้เองหลังยืนยัน OTP
- ปุ่ม 🏠 📋 🎓 🔔 ตอบด้วยการ์ดสรุปแบบตายตัว ไม่ผ่าน Gemini ผลเหมือนกันทุกครั้ง หน้าแชทบนเว็บมีปุ่มเดียวกัน
- แก้รูป: แก้ `worker/richmenu/*.html` แล้วถ่ายภาพใหม่ด้วย Chrome headless (`--window-size=2500,1686` หรือ `2500,843`)
- สร้างเมนูใหม่: `cd worker && LINE_TOKEN=<access token> node scripts/richmenu.mjs <line_user_id ที่ผูกแล้ว...>` แล้วนำ `RICHMENU_MAIN` ที่ได้ไปใส่ใน `wrangler.toml` และ `npx wrangler deploy`

## ขั้นที่ 5: ทดสอบรับของ
- เพิ่มเพื่อน OA → พิมพ์อีเมลทีม → ใส่รหัส OTP → พิมพ์ "สมัคร SCB ตำแหน่ง Data intern แล้ว" → การ์ดขึ้นบนเว็บ
- **จำลอง LINE ล่ม:** ปิด Use webhook → ล็อกอินเว็บด้วยอีเมล → ทำทุกอย่างบนเว็บ → เปิด webhook กลับ → LINE เห็นข้อมูลเดียวกัน
- ตั้งเตือน → ได้ push ใน LINE (ถ้าส่งไม่ได้ ขึ้นแบนเนอร์บนเว็บ)
- (ถ้าใส่ Paxa แล้ว) ส่งรูปโพสต์งาน → บอทตอบพร้อม 🤖 และปุ่มยืนยัน

## แก้ปัญหา
- **ทุกอุปกรณ์แจ้ง “อีเมลนี้ยังไม่เปิดให้ใช้ในช่วงทดลอง” แต่ session เก่ายังใช้ได้:** ตรวจ `ALLOWED_EMAILS` ก่อน เพราะระบบเช็กสิทธิ์ตอนขอ OTP การเพิ่มสมาชิกด้วยรายชื่อไม่ครบอาจทำให้สมาชิกเดิมขอรหัสใหม่ไม่ได้ คืนรายชื่อทีมทั้งหมดใน secret เดียวโดยไม่ต้องลบบัญชีหรือ session
- **LINE ถามให้ผูกบัญชีอีกครั้ง:** ตรวจว่าบัญชียังมี `users.line_user_id` หรือไม่ การ logout บนเว็บลบเฉพาะ web session ไม่ได้ยกเลิกการผูก LINE แต่ถ้าเคยสั่ง `UPDATE users SET line_user_id=NULL ...` จะต้องยืนยันอีเมลด้วย OTP ใน LINE อีกครั้ง หลังผูกแล้วให้ลองกดเมนูและส่งข้อความต่อเพื่อตรวจว่าไม่ถูกถามซ้ำ ถ้าผู้ใช้ยืนยันว่าผูกใหม่สำเร็จแล้วยังถูกถามซ้ำ ให้ตรวจการบันทึกและเวลาที่ข้อมูลเปลี่ยนต่อ อย่าสรุปจากการยกเลิกครั้งก่อนเพียงอย่างเดียว ห้ามเดา LINE ID หรือผูกบัญชีจากอีเมลอย่างเดียว
- **OTP ไม่เข้า:** ดู Spam ก่อน แล้วรัน `npx wrangler tail` ดู log ตอนกดขอรหัส (มักเป็นเพราะยังไม่ยืนยัน Gmail ผู้ส่งใน Brevo)
- **Verify webhook ไม่ผ่าน:** เช็ก `LINE_CHANNEL_SECRET` ว่าตรงกับ channel เดียวกับ token
- **เปลี่ยน/หมุน key:** ทำ PR แผนที่ไม่เปิดเผยค่า ผ่าน CI และ merge ก่อน แล้วใช้ `wrangler secret put <ชื่อ>` (คำสั่งนี้ deploy ทันที) และตรวจจริงตาม [release workflow](release-workflow.md) ไม่เก็บค่าจริงใน Git
- **ทดสอบในเครื่อง:** สร้าง `worker/.dev.vars` (git ignore แล้ว) ใส่ `ชื่อ=ค่า` บรรทัดละตัว แล้ว `npx wrangler dev`
- **ข้ามล็อกอินตอนทดสอบในเครื่อง:** เพิ่ม `LOCAL_DEV_LOGIN=true` ใน `worker/.dev.vars` แล้วรัน `npx wrangler dev --port 8787 --var WEB_ORIGIN:http://localhost:8000` หน้า localhost จะใช้บัญชี `local-dev@example.test` อัตโนมัติ พร้อมเช็กลิสต์ตั้งต้น ข้อมูลที่แก้จะเก็บใน D1 ของเครื่อง บัญชีจริงที่มี session อยู่แล้วจะยังใช้บัญชีเดิม ลบค่านี้หรือเปลี่ยนเป็น `false` เพื่อกลับไปใช้ OTP โหมดนี้ทำงานเฉพาะ hostname `localhost`, `127.0.0.1` และ `[::1]` ไม่ต้องตั้งค่านี้บน production
