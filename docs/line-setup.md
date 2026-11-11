# คู่มือตั้งค่า InternMatch (LINE หลัก / เว็บสำรอง)

ทำตามลำดับนี้ครั้งเดียว ใช้เวลาประมาณ 30 นาที ห้ามเอา key ใดๆ ลง Git

## 0. เตรียม
- บัญชี Cloudflare + `wrangler` (ล็อกอินแล้ว: `npx wrangler login`)
- LINE Official Account ที่มีอยู่แล้ว
- Gemini API key, Paxa API key

## 1. Brevo (ส่งอีเมล OTP ไม่ต้องมีโดเมน)
1. สมัคร https://www.brevo.com (ฟรี)
2. Senders → เพิ่ม Gmail ของคุณเป็นผู้ส่ง แล้วกดลิงก์ยืนยันในอีเมล
3. SMTP & API → สร้าง **API key** (v3)

## 2. สร้างฐานข้อมูลและ deploy Worker
```bash
cd worker
npx wrangler d1 create internmatch          # คัดลอก database_id ไปใส่ใน wrangler.toml
npx wrangler d1 migrations apply internmatch --remote
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put PAXA_API_KEY
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put BREVO_SENDER_EMAIL   # Gmail ที่ยืนยันกับ Brevo
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put ALLOWED_EMAILS       # อีเมลทีม คั่นด้วย , (ห้าม commit)
npx wrangler deploy                          # จะได้ URL https://internmatch-api.<account>.workers.dev
```
แล้วแก้ `config.js` ให้ `window.IM_API` เป็น URL นั้น

## 3. LINE Developers Console
1. Messaging API → Channel secret / Channel access token (long-lived) → ใช้ใน `wrangler secret put` ข้างบน
2. Webhook URL = `https://<worker-url>/line/webhook` → กด **Verify** (ต้องขึ้น Success)
3. เปิด **Use webhook**
4. LINE Official Account Manager → ปิด **Auto-reply** และ **Greeting message**
5. แจก QR ของ OA ให้ทีม

## 4. ทดสอบรับของ (ตาม spec §8)
- เพิ่มเพื่อน OA → พิมพ์อีเมลทีม → ใส่รหัส OTP → พิมพ์ "สมัคร SCB ตำแหน่ง Data intern แล้ว" → การ์ดขึ้นบนเว็บ
- ส่งรูปโพสต์งาน → บอทตอบพร้อม 🤖 และปุ่มยืนยัน → ยืนยันแล้วเห็นบนเว็บ
- **จำลอง LINE ล่ม:** ปิด Use webhook → ล็อกอินเว็บด้วยอีเมล → ทำทุกอย่างบนเว็บ → เปิด webhook กลับ แล้วเช็กว่า LINE เห็นข้อมูลเดียวกัน
- ตั้งเตือน → ได้ push ใน LINE (ถ้าส่งไม่ได้ จะขึ้นแบนเนอร์บนเว็บ)

## ถ้า OTP ไม่เข้าอีเมล
ดูโฟลเดอร์ Spam ก่อน ถ้ายังไม่มา ให้ทีมแจ้งคุณ แล้วตรวจ log: `npx wrangler tail`
