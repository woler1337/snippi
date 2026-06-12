/* ════════════════════════════════════════════════════════════════
   Snippi licensing backend — Cloudflare Worker.

   Поток:
     1. Lemon Squeezy шлёт webhook `order_created` после оплаты
     2. Worker проверяет HMAC-подпись webhook'а (X-Signature)
     3. Генерирует Ed25519-подписанный лицензионный ключ (тот же формат,
        что проверяет приложение в src/main/license.js)
     4. Кладёт ключ в KV (по email и по order id) + опционально шлёт письмо
     5. Покупатель получает ключ и вставляет в Настройки → Лицензия

   Секреты (wrangler secret put):
     • LICENSE_PRIVATE_KEY  — Ed25519 приватный ключ, PKCS8 DER в base64
     • LS_WEBHOOK_SECRET    — signing secret вебхука Lemon Squeezy
     • RESEND_API_KEY       — (опц.) ключ Resend для отправки писем
     • RESEND_FROM          — (опц.) адрес отправителя, напр. "Snippi <license@yourdomain>"

   KV namespace (binding): LICENSES
════════════════════════════════════════════════════════════════ */

// ── base64url helpers ──────────────────────────────────────────
function b64urlFromBytes(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bytesFromB64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function hex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Ed25519: генерация лицензионного ключа ─────────────────────
async function generateLicenseKey(privateKeyB64, payload) {
  const keyData = bytesFromB64(privateKeyB64);          // PKCS8 DER
  const key = await crypto.subtle.importKey(
    'pkcs8', keyData, { name: 'Ed25519' }, false, ['sign']
  );
  const payloadPart = b64urlFromBytes(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, key, new TextEncoder().encode(payloadPart));
  return payloadPart + '.' + b64urlFromBytes(new Uint8Array(sig));
}

// ── Проверка подписи вебхука Lemon Squeezy (HMAC-SHA256 hex) ────
async function verifyLemonSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  return timingSafeEqual(hex(mac), signatureHeader.trim().toLowerCase());
}

// ── Отправка письма с ключом через Resend (опционально) ────────
async function sendLicenseEmail(env, toEmail, licenseKey) {
  if (!env.RESEND_API_KEY) return { sent: false, reason: 'no-resend' };
  const from = env.RESEND_FROM || 'Snippi <onboarding@resend.dev>';
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#10b981">Спасибо за покупку Snippi Pro!</h2>
      <p>Ваш лицензионный ключ:</p>
      <pre style="background:#0b0d0c;color:#34d399;padding:14px 16px;border-radius:8px;
                  font-size:12px;white-space:pre-wrap;word-break:break-all">${licenseKey}</pre>
      <p>Откройте Snippi → <b>Настройки → Лицензия</b>, вставьте ключ и нажмите «Активировать».</p>
      <p style="color:#888;font-size:13px">Если потеряете ключ — он останется привязан к вашему email.</p>
    </div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [toEmail], subject: 'Ваш ключ Snippi Pro', html }),
  });
  return { sent: r.ok, status: r.status };
}

// ── Обработчик вебхука ─────────────────────────────────────────
async function handleWebhook(request, env) {
  const rawBody = await request.text();
  const sig = request.headers.get('X-Signature');

  if (!env.LS_WEBHOOK_SECRET) return json({ error: 'server not configured' }, 500);
  const valid = await verifyLemonSignature(rawBody, sig, env.LS_WEBHOOK_SECRET);
  if (!valid) return json({ error: 'invalid signature' }, 401);

  let event;
  try { event = JSON.parse(rawBody); } catch { return json({ error: 'bad json' }, 400); }

  const eventName = event?.meta?.event_name;
  // Реагируем на оплату заказа (разовая покупка) и создание подписки.
  if (eventName !== 'order_created' && eventName !== 'subscription_created') {
    return json({ ok: true, ignored: eventName });
  }

  const attrs = event?.data?.attributes || {};
  const email   = (attrs.user_email || attrs.customer_email || '').trim().toLowerCase();
  const orderId = String(event?.data?.id || attrs.order_id || Date.now());
  if (!email) return json({ error: 'no email in event' }, 400);

  // Идемпотентность: если ключ для этого order уже есть — не плодим новый.
  const existing = await env.LICENSES.get(`order:${orderId}`);
  if (existing) return json({ ok: true, duplicate: true });

  const payload = {
    email,
    plan: 'pro',
    issuedAt: new Date().toISOString(),
    orderId,
  };
  const licenseKey = await generateLicenseKey(env.LICENSE_PRIVATE_KEY, payload);

  // Сохраняем по order и по email (для восстановления).
  await env.LICENSES.put(`order:${orderId}`, licenseKey);
  await env.LICENSES.put(`email:${email}`, licenseKey);

  const mail = await sendLicenseEmail(env, email, licenseKey);

  return json({ ok: true, emailed: mail.sent });
}

// ── Восстановление ключа: GET /key?email=...&order=... ─────────
// Требуем И email, И order id (минимальная защита от перебора).
async function handleRetrieve(request, env) {
  const url = new URL(request.url);
  const email   = (url.searchParams.get('email') || '').trim().toLowerCase();
  const orderId = (url.searchParams.get('order') || '').trim();
  if (!email || !orderId) return json({ error: 'email and order required' }, 400);

  const byOrder = await env.LICENSES.get(`order:${orderId}`);
  if (!byOrder) return json({ error: 'not found' }, 404);

  // Сверяем, что заказ принадлежит этому email (ключ содержит email в payload).
  try {
    const payloadPart = byOrder.split('.')[0];
    const payload = JSON.parse(new TextDecoder().decode(bytesFromB64(
      payloadPart.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - payloadPart.length % 4) % 4)
    )));
    if ((payload.email || '').toLowerCase() !== email) return json({ error: 'not found' }, 404);
  } catch { return json({ error: 'not found' }, 404); }

  return json({ ok: true, key: byOrder });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/webhook') {
        return await handleWebhook(request, env);
      }
      if (request.method === 'GET' && url.pathname === '/key') {
        return await handleRetrieve(request, env);
      }
      if (url.pathname === '/' || url.pathname === '/health') {
        return json({ ok: true, service: 'snippi-license', ts: Date.now() });
      }
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: 'internal', message: e.message }, 500);
    }
  },
};
