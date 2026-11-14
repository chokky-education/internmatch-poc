# วิจัย: ใช้ Gemini Decisions API แยกชนิดเอกสารก่อน OCR ดีไหม

วันที่ค้น: 2026-11-12 · แหล่งข้อมูล: เฉพาะเอกสารของ Google เอง (blog.google, aistudio.google.com/docs, ai.google.dev)

## สรุปสั้น

- API มีอยู่จริง เปิดตัว 11 พ.ย. 2026 โมเดล `gemini-decision-1` endpoint `POST https://generativelanguage.googleapis.com/v1beta/decisions` [1][2]
- ใช้คำถามชนิด `choice` ตัวเดียวก็แยก 4 ชนิดเอกสาร (`job_post`, `handbook`, `transcript`, `acceptance`) จากรูปได้ พร้อมความน่าจะเป็นและ `confidence` [2]
- ถูกมาก ($0.10 ต่อ 1M input token, output ไม่คิดเงิน) และมี free tier [3]
- **ไม่มีข้อมูลจากแหล่งหลักเรื่องความแม่นยำภาษาไทย** ต้องทดสอบเองก่อนใช้
- คำแนะนำ: ทดลองใช้แทนการเดาว่าเป็น `job_post` ใน LINE โดยผูกกับเกณฑ์ confidence แล้วถามผู้ใช้เมื่อไม่มั่นใจ ใช้ paid tier ไม่ใช่ free tier เพราะ free tier นำข้อมูลไปปรับปรุงผลิตภัณฑ์ (ดูข้อ 2)

## 1. API มีจริงไหม และรูปแบบ request เป็นอย่างไร

- ประกาศใน Google blog วันที่ 11 พ.ย. 2026 ชื่อ "Gemini Decisions API" โมเดล `gemini-decision-1` ใช้ผ่าน Gemini API ใน Google AI Studio [1]
- Endpoint REST: `POST https://generativelanguage.googleapis.com/v1beta/decisions` ยืนยันตัว header `x-goog-api-key: $GEMINI_API_KEY` จากตัวอย่าง curl ในหน้า docs (แท็บ REST) [2]
- ใช้ได้เฉพาะ Gemini Developer API `v1beta` เท่านั้น [2] ไม่พบป้าย "preview" หรือ "GA" ระบุชัดในหน้า docs, หน้าโมเดล และหน้า pricing [2][3][4] — **สถานะ preview/GA ยืนยันจากแหล่งหลักไม่ได้** ระบุได้แค่ว่าอยู่บน `v1beta`
- Request มี 3 ฟิลด์: `model`, `input` (string / Content / Content[]), `questions` (map 1–1,000 คำถาม key ตาม `[A-Za-z0-9_-]+` ≤64 ตัว) [2]
- ชนิดคำถาม: `noul` (ใช่/ไม่ใช่ คืนค่า 0.01–0.99), `choice` (2–255 ตัวเลือก ส่งผ่าน `criteria` เป็น map `option_key → คำอธิบาย`), `score` (rubric เรียงลำดับ) [2]
- คำตอบ `choice` คืน `choice`, `probabilities` (รวมเป็น 1) และ `confidence` = ความน่าจะเป็นของตัวเลือกบนสุด [2]
- API เรียง option key ตามตัวอักษร (UTF-8 byte) และ probability จะกระจายลงตัวเลือกเสมอแม้ไม่มีอันไหนตรง docs แนะนำให้เพิ่มตัวเลือก `other` หรือถามคำถาม `noul` แยกเพื่อเช็กขอบเขต [2]
- รับรูปเป็น block `{"type":"image","data":<base64>,"mime_type":"image/jpeg","resolution":"low|medium|high|ultra_high"}` รองรับ png/jpeg/webp/heic ฯลฯ inline สูงสุด 100 MB ต่อ request ต้องใส่ MIME จริง (ปฏิเสธ octet-stream) [2]
- ถ้า safety filter บล็อก จะได้ HTTP 400 พร้อม `error.code` เช่น `safety`, `image_safety` [2]
- ไม่รองรับ context caching, Batch API, Flex/Priority [2] และโมเดลไม่รองรับ function calling / structured output / text generation [4]
- ตัวเลข benchmark ที่ถูกอ้างถึง (Top-1 ECE 0.0250, ราคารวม $0.88 บน 7 eval) อยู่ในรูปตารางในบล็อก [1] ไม่ได้อยู่ในข้อความ — **ตรวจตัวเลขในรูปนั้นจากข้อความไม่ได้** ข้อความในบล็อกบอกเพียงว่า "lowest calibration error" และ "nearly 5x cheaper" กว่า Gemini 3.5 Flash-Lite บนชุด benchmark ของ Google เอง [1]
- Latency ที่ Google อ้าง: 150–250 ms end-to-end [1]

## 2. ราคา, rate limit, free tier, ภูมิภาค

- Paid: $0.10 ต่อ 1M input token ทุก modality, output = 0 [3] Free tier: ไม่เสียเงิน [3]
- **Free tier: "Used to improve our products" = Yes, paid tier = No** [3] — สำคัญสำหรับ Transcript (มีชื่อ, รหัสนักศึกษา, GPAX) และหนังสือตอบรับ
- Input ร่วมคิดครั้งเดียวต่อ request ไม่ว่าจะถามกี่ข้อ [1][3]
- Rate limit ของ Gemini Decision [5]:

| Tier | RPM | TPM | RPD |
|---|---|---|---|
| Free | 200 | 50,000 | 10,000 |
| Tier 1 | 1,500 | 1,000,000 | 50,000 |
| Tier 2 | 5,000 | 4,000,000 | ไม่จำกัด |
| Tier 3 | 15,000 | 10,000,000 | ไม่จำกัด |

- ภูมิภาค: Thailand อยู่ในรายชื่อภูมิภาคที่ใช้ Google AI Studio และ Gemini API ได้ และหน้านั้นไม่มีข้อยกเว้นเฉพาะ Gemini Decision [6]
- บน Google Cloud (Vertex) ยัง "coming soon" [1]

## 3. ภาษาไทย / ภาษาอื่นนอกจากอังกฤษ

- **ไม่พบข้อมูลใดในแหล่งหลัก** (บล็อก, docs, หน้าโมเดล) ที่พูดถึงภาษาที่รองรับ หรือความแม่นยำภาษาไทย [1][2][4]
- ข้อจำกัดที่เกี่ยวข้อง: option key รับ UTF-8 ได้ (≤128 ตัวอักษร / 512 byte, ห้าม space ที่ไม่ใช่ ASCII) [2] แต่แนะนำใช้ key ภาษาอังกฤษตรงกับ `DOCTYPES` แล้วใส่คำอธิบายไทย+อังกฤษใน `criteria`
- Google เคลมว่าไม่ต้องจ่ายค่า OCR แยก [1] แต่ไม่ได้บอกว่าอ่านอักษรไทยในรูปได้ดีแค่ไหน → ต้องทำชุดทดสอบเองจากรูปจริงของ InternMatch

## 4. เรียกจาก Cloudflare Worker ด้วย fetch ได้ไหม

- ได้ เป็น REST JSON ธรรมดา auth ด้วย API key ใน header `x-goog-api-key` [2] เหมือน Gemini API ตัวอื่น ไม่ต้องใช้ SDK
- Key เก็บเป็น Worker secret ได้ตามกฎของโปรเจกต์ (`wrangler secret put`) — โปรเจกต์มี key Gemini อยู่แล้วสำหรับ `assistant.js` (ควรตรวจว่า key เดิมอยู่ใน paid tier)
- รูปจาก LINE มีเป็น bytes อยู่แล้วใน `readLineImage` (`worker/src/line.js`) แปลง base64 แล้วส่ง inline ได้ ไม่ต้องใช้ Files API

## 5. เทียบกับ Gemini API ปกติ (structured output แบบ enum)

- ทำได้ด้วย Interactions API + `response_format` JSON schema ที่มีฟิลด์ `Literal`/enum [7]
- Google เองแนะนำในหน้า structured output ว่า ถ้าต้องการ single-select พร้อม calibrated confidence และ output 0 token ให้ใช้ Decisions API [7] และตารางใน docs บอกว่า Decisions เหมาะกับ "one option from a fixed set" + "calibrated probabilities you can threshold" ส่วน Interactions เหมาะกับการดึงค่าตาม JSON schema [2]
- สิ่งที่เสียถ้าใช้ enum ปกติ: ได้แค่ label เดียว ไม่มี probability ที่ calibrate แล้วให้ตั้ง threshold, มีค่า output token และ latency ของการ generate [1][2] (ความ calibrate ของ "ความมั่นใจ" ที่ให้โมเดลเขียนเองไม่มีเอกสารรับรอง — ไม่ได้ยืนยันจากแหล่งหลัก)
- สิ่งที่ได้ถ้าใช้ enum ปกติ: โมเดลเดียวกับที่ใช้อยู่ และทำ classify + extract ในครั้งเดียวได้ แต่ InternMatch ใช้ Paxa สำหรับ extract อยู่แล้ว จึงไม่ได้ประโยชน์ข้อนี้มากนัก

## 6. คำแนะนำสำหรับ InternMatch

**ควรทดลอง (ไม่ใช่เปลี่ยนทันที)** ใน flow LINE ที่ตอนนี้เดาว่าทุกรูปเป็น `job_post` (`worker/src/line.js` ฟังก์ชัน `readLineImage`) เพราะ:

1. ลดรอบ OCR เสีย: ตอนนี้ถ้าไม่ใช่โพสต์งาน ต้องเรียก Paxa หนึ่งรอบ ทิ้งผล แล้วถามผู้ใช้ classify ก่อนช่วยเลือก `docType` ถูกตั้งแต่แรก
2. Confidence ต่ำ → ใช้ `askDocType` ที่มีอยู่แล้ว ไม่ต้องสร้าง UI ใหม่
3. ต้นทุนต่ำ รูปหนึ่งรูปใช้ token น้อย (ใช้ `resolution: "low"`)

เงื่อนไขก่อนใช้จริง:
- ใช้ paid tier เท่านั้น (free tier นำข้อมูลไปใช้ปรับปรุงผลิตภัณฑ์ [3])
- เก็บรูปตัวอย่างไทยจริง ~20–40 รูปต่อชนิด วัดความแม่นยำและตั้ง threshold จากข้อมูลจริงตามที่ docs แนะนำ [2]
- ผลจาก classifier ไม่ต้องติดป้ายใหม่ เพราะผลสุดท้ายยังผ่าน OCR และการ์ดยืนยัน `AI_EXTRACTED` เหมือนเดิม และยังมีปุ่มเปลี่ยนชนิด (`ocr_ask`) ให้ผู้ใช้แก้ได้
- ถ้า Decisions API ล้มหรือโดน 400 safety ให้ fallback เป็น `job_post` ตามพฤติกรรมเดิม
- ฝั่งเว็บที่ผู้ใช้เลือกชนิดเองอยู่แล้ว อาจใช้แค่ "เลือกให้ล่วงหน้า" ไม่ต้องบังคับ
- ตามกฎ 2.4 ใส่ logic ไว้ใน `worker/` (เช่น `worker/src/classify.js`) ให้ LINE และเว็บเรียกฟังก์ชันเดียวกัน

### ร่างการเชื่อมต่อ (ยังไม่ได้แก้โค้ดใน repo)

```js
// worker/src/classify.js (sketch)
import { DOCTYPES } from './doctypes.js';

const CRITERIA = {
  job_post: 'Internship/job posting (โพสต์ประกาศรับสมัครฝึกงาน): company, role, how to apply.',
  handbook: 'Faculty handbook or announcement (คู่มือ/ประกาศคณะ): course, required hours, deadlines, forms.',
  transcript: 'Academic transcript (ใบแสดงผลการเรียน): student name, ID, courses, grades, GPAX.',
  acceptance: 'Company acceptance letter (หนังสือตอบรับเข้าฝึกงาน) addressed to a student or university.',
  other: 'Anything else: selfie, screenshot of chat, receipt, unrelated photo.',
};

export async function classifyDocType(env, bytes, mime, threshold = 0.7) {
  const data = btoa(String.fromCharCode(...new Uint8Array(bytes))); // ใช้ chunked encode จริงสำหรับรูปใหญ่
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/decisions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      model: 'gemini-decision-1',
      input: [{ type: 'image', data, mime_type: mime, resolution: 'low' }],
      questions: {
        doc_type: { type: 'choice', instructions: 'Which kind of document is shown in this image? The text is usually Thai.', criteria: CRITERIA },
      },
    }),
  });
  if (!r.ok) return { docType: null, reason: 'api_error' };
  const a = (await r.json()).answers.doc_type;
  const ok = a.confidence >= threshold && DOCTYPES[a.choice];
  return { docType: ok ? a.choice : null, confidence: a.confidence, probabilities: a.probabilities };
}
```

ใน `readLineImage`: ถ้าไม่ได้ส่ง `docType` มา (รูปใหม่) ให้เรียก `classifyDocType` ก่อน ถ้าได้ `null` เพราะ confidence ต่ำหรือเป็น `other` → `askDocType(...)` ถ้า `api_error` → ใช้ `job_post` ตามเดิม

## แหล่งอ้างอิง

1. Google blog, "Gemini Decisions API: Fast, calibrated multimodal decisions" (2026-11-11): https://blog.google/innovation-and-ai/technology/developers-tools/gemini-decisions-api/
2. Decisions API docs: https://aistudio.google.com/docs/decisions-api
3. Pricing (ส่วน Gemini Decision): https://aistudio.google.com/docs/pricing#gemini-decision
4. Model page `gemini-decision-1`: https://aistudio.google.com/docs/models/gemini-decision-1
5. Rate limits: https://aistudio.google.com/docs/rate-limits#gemini-decision
6. Available regions: https://aistudio.google.com/docs/available-regions
7. Structured outputs: https://ai.google.dev/gemini-api/docs/structured-output/
