'use strict';
/* ════════════════════════════════════════════════════════════════
   Лицензирование (Pro). Офлайн-проверка Ed25519-подписи.

   Принцип:
     • Сервер/генератор подписывает payload ПРИВАТНЫМ ключом (его нет в
       приложении и в репозитории — только в scripts/license-private.pem).
     • Приложение проверяет подпись вшитым ПУБЛИЧНЫМ ключом — полностью
       офлайн, мгновенно, без сервера. Подделать ключ нельзя, не зная
       приватный ключ.

   Формат лицензионного ключа:
     base64url(JSON payload) + "." + base64url(signature)
   где payload = { email, plan, issuedAt, [expiresAt] }

   ⚠️ Эта система — ЗАГОТОВКА. Сейчас она НИЧЕГО НЕ БЛОКИРУЕТ: isPro()
   возвращает реальный статус, но Pro-фич, требующих блокировки, пока нет.
   Когда появятся — расставим проверки isPro() в соответствующих местах.
════════════════════════════════════════════════════════════════ */

const crypto = require('crypto');

// Публичный ключ (Ed25519, SPKI/PEM). Приватный — только у генератора.
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA16E4HTddeQznZkPyZjJUqdQ+bjH/buG6mF3xl0VZlcs=
-----END PUBLIC KEY-----`;

// base64url helpers (ключ безопасен для копирования: без +/= и переносов).
function b64urlDecode(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

/**
 * Проверяет лицензионный ключ.
 * @param {string} key — строка вида "<payload>.<signature>"
 * @returns {{ valid: boolean, payload?: object, reason?: string }}
 */
function verifyKey(key) {
  if (!key || typeof key !== 'string') return { valid: false, reason: 'empty' };
  const trimmed = key.trim();
  const dot = trimmed.indexOf('.');
  if (dot === -1) return { valid: false, reason: 'malformed' };

  const payloadPart = trimmed.slice(0, dot);
  const sigPart     = trimmed.slice(dot + 1);

  let payloadBuf, sigBuf, payload;
  try {
    payloadBuf = b64urlDecode(payloadPart);
    sigBuf     = b64urlDecode(sigPart);
    payload    = JSON.parse(payloadBuf.toString('utf8'));
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  // Проверка подписи: подписывается ИМЕННО payloadPart (base64url-строка),
  // ровно то, что подписал генератор.
  let ok = false;
  try {
    ok = crypto.verify(null, Buffer.from(payloadPart), PUBLIC_KEY_PEM, sigBuf);
  } catch {
    ok = false;
  }
  if (!ok) return { valid: false, reason: 'bad-signature' };

  // Срок действия (если задан).
  if (payload.expiresAt) {
    const exp = Date.parse(payload.expiresAt);
    if (!Number.isNaN(exp) && exp < Date.now()) {
      return { valid: false, reason: 'expired', payload };
    }
  }

  return { valid: true, payload };
}

// ── Состояние лицензии в приложении ──────────────────────────────
let _cached = null; // { valid, payload } — кэш после активации/старта

// Лениво читаем сохранённый ключ из storage и валидируем.
function loadFromStorage() {
  try {
    const storage = require('./storage');
    const key = storage.getLicenseKey();
    if (!key) { _cached = { valid: false }; return _cached; }
    _cached = verifyKey(key);
    return _cached;
  } catch {
    _cached = { valid: false };
    return _cached;
  }
}

function getStatus() {
  const r = _cached || loadFromStorage();
  if (r.valid) {
    return {
      pro:   true,
      plan:  r.payload.plan || 'pro',
      email: r.payload.email || '',
      issuedAt:  r.payload.issuedAt || null,
      expiresAt: r.payload.expiresAt || null,
    };
  }
  return { pro: false, reason: r.reason };
}

/** Главный флаг для feature-гейтинга. */
function isPro() {
  return getStatus().pro;
}

/**
 * Активировать ключ: проверяем подпись, при успехе сохраняем в storage.
 * @returns {{ ok: boolean, status?: object, reason?: string }}
 */
function activate(key) {
  const r = verifyKey(key);
  if (!r.valid) return { ok: false, reason: r.reason };
  try {
    require('./storage').setLicenseKey(key.trim());
  } catch (e) {
    return { ok: false, reason: 'storage-error' };
  }
  _cached = r;
  return { ok: true, status: getStatus() };
}

/** Удалить лицензию (вернуться к Free). */
function deactivate() {
  try { require('./storage').setLicenseKey(''); } catch {}
  _cached = { valid: false };
  return { ok: true, status: getStatus() };
}

// Вызывается при старте приложения — прогревает кэш.
function initLicense() {
  loadFromStorage();
  const s = getStatus();
  console.log('[license]', s.pro ? `Pro активна (${s.email || 'no-email'})` : 'Free');
}

module.exports = { verifyKey, getStatus, isPro, activate, deactivate, initLicense };
