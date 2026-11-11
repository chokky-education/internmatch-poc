export async function sendOtpEmail(env, to, code) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'InternMatch', email: env.BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject: `รหัสเข้าใช้งาน InternMatch: ${code}`,
      textContent: `รหัสเข้าใช้งานของคุณคือ ${code}\nใช้ได้ 10 นาที ถ้าไม่ได้ขอ ไม่ต้องทำอะไร`,
    }),
  });
  return r.ok;
}
