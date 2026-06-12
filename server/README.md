# Snippi License Backend (Cloudflare Worker)

Принимает webhook от Lemon Squeezy после оплаты → генерирует Ed25519-подписанный
лицензионный ключ → сохраняет в KV и (опционально) шлёт покупателю письмо.

Ключ проверяется приложением **офлайн** (`src/main/license.js`) — серверу не нужно
быть онлайн для валидации, только для выдачи ключа в момент покупки.

---

## Что уже готово и протестировано

- ✅ Проверка HMAC-подписи вебхука Lemon Squeezy
- ✅ Генерация Ed25519-ключа (Web Crypto) — формат совместим с приложением
- ✅ Идемпотентность (повторный webhook не плодит ключи)
- ✅ Восстановление ключа по email + order id
- ✅ Опциональная отправка письма через Resend

---

## Развёртывание (когда зарегистрируешь Lemon Squeezy)

### 1. Установить Wrangler и войти в Cloudflare

```bash
cd server
npm install
npx wrangler login
```

### 2. Создать KV-хранилище

```bash
npx wrangler kv namespace create LICENSES
```

Скопируй выданный `id` в `wrangler.toml` (замени `REPLACE_WITH_KV_NAMESPACE_ID`).

### 3. Залить секреты

**Приватный ключ** (тот же, что подписывает ключи; берётся из `scripts/license-private.pem`):

```bash
# Конвертируем PEM → PKCS8 DER base64 (одной строкой):
node -e "const c=require('crypto'),fs=require('fs');console.log(c.createPrivateKey(fs.readFileSync('../scripts/license-private.pem','utf8')).export({type:'pkcs8',format:'der'}).toString('base64'))"
# Скопируй вывод, затем:
npx wrangler secret put LICENSE_PRIVATE_KEY
# (вставь base64-строку)
```

**Webhook secret Lemon Squeezy** (создашь на шаге 5):

```bash
npx wrangler secret put LS_WEBHOOK_SECRET
```

**(Опционально) Resend для писем** — если хочешь автоматически слать ключ на email:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM   # напр. "Snippi <license@твойдомен>"
```

Без Resend ключ всё равно сохраняется в KV — покупатель получит его на странице
благодарности Lemon Squeezy или через восстановление.

### 4. Задеплоить

```bash
npx wrangler deploy
```

Получишь URL вида `https://snippi-license.<твой>.workers.dev`.

### 5. Настроить webhook в Lemon Squeezy

В дашборде Lemon Squeezy → **Settings → Webhooks → Add webhook**:
- **URL:** `https://snippi-license.<твой>.workers.dev/webhook`
- **Signing secret:** придумай и впиши его же в `LS_WEBHOOK_SECRET` (шаг 3)
- **Events:** отметь `order_created` (для разовой покупки) и/или `subscription_created`

---

## Эндпоинты

| Метод | Путь | Назначение |
|-------|------|-----------|
| `GET`  | `/` `/health` | Health-check |
| `POST` | `/webhook` | Webhook Lemon Squeezy (проверяет подпись) |
| `GET`  | `/key?email=X&order=Y` | Восстановление ключа (нужны email И order id) |

---

## Локальный тест без деплоя

Логика проверена скриптом (см. историю). Для ручной проверки:

```bash
npx wrangler dev
# затем curl на localhost с эмуляцией webhook (нужна правильная HMAC-подпись)
```

---

## Доставка ключа покупателю — варианты

1. **Resend-письмо** (настроено выше) — автоматически, лучший UX.
2. **Lemon Squeezy thank-you page** — можно вывести инструкцию «проверьте почту».
3. **Восстановление** — если ключ потерян, покупатель вводит email+order на твоей
   странице, которая дёргает `GET /key`.

> ⚠️ Приватный ключ (`scripts/license-private.pem`) — единственный секрет, которым
> подписываются лицензии. Он в `.gitignore`, не коммить его. Бэкап храни надёжно:
> потеряешь — не сможешь выдавать новые ключи (старые продолжат работать).
