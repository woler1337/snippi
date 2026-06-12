'use strict';
/* ════════════════════════════════════════════════════════════════
   Генератор лицензионных ключей Snippi Pro.

   Подписывает payload ПРИВАТНЫМ ключом (scripts/license-private.pem).
   Этот скрипт запускается ТОЛЬКО у владельца (локально или на сервере,
   куда приходит webhook от платёжки). Приватный ключ НИКОГДА не попадает
   в приложение или публичный репозиторий.

   Использование:
     node scripts/gen-license.js <email> [plan] [daysValid]

   Примеры:
     node scripts/gen-license.js user@example.com
     node scripts/gen-license.js user@example.com pro
     node scripts/gen-license.js user@example.com pro 365   # с истечением
════════════════════════════════════════════════════════════════ */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PRIV_PATH = path.join(__dirname, 'license-private.pem');

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function main() {
  const [email, plan = 'pro', daysValid] = process.argv.slice(2);

  if (!email) {
    console.error('Usage: node scripts/gen-license.js <email> [plan] [daysValid]');
    process.exit(1);
  }
  if (!fs.existsSync(PRIV_PATH)) {
    console.error('Приватный ключ не найден:', PRIV_PATH);
    console.error('Сгенерируйте пару ключей (см. license.js) перед использованием.');
    process.exit(1);
  }

  const privateKey = fs.readFileSync(PRIV_PATH, 'utf8');

  const payload = {
    email,
    plan,
    issuedAt: new Date().toISOString(),
  };
  if (daysValid && !Number.isNaN(Number(daysValid))) {
    const exp = new Date(Date.now() + Number(daysValid) * 86400_000);
    payload.expiresAt = exp.toISOString();
  }

  const payloadPart = b64url(JSON.stringify(payload));
  const signature   = crypto.sign(null, Buffer.from(payloadPart), privateKey);
  const key = payloadPart + '.' + b64url(signature);

  console.log('\n─────────────────────────────────────────────');
  console.log(' Snippi Pro — лицензионный ключ');
  console.log('─────────────────────────────────────────────');
  console.log(' email:', payload.email);
  console.log(' plan: ', payload.plan);
  console.log(' issued:', payload.issuedAt);
  if (payload.expiresAt) console.log(' expires:', payload.expiresAt);
  console.log('─────────────────────────────────────────────');
  console.log('\n' + key + '\n');
}

main();
