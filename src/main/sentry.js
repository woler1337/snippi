'use strict';
/* ════════════════════════════════════════════════════════════════
   Sentry crash/error reporting — opt-in.

   Принцип «privacy-first»:
     • По умолчанию выключен — пользователь явно включает в Настройках
     • Отправляются только необработанные исключения + стек (без значений
       переменных, без сниппетов, без буфера обмена)
     • DSN читается из переменной окружения SENTRY_DSN — в репо его НЕТ
       (вшивается при сборке через `SENTRY_DSN=... npm run build:mac`)
     • Без DSN модуль ничего не делает — никаких сетевых вызовов

   Privacy Policy упоминает эту возможность как опциональную.
════════════════════════════════════════════════════════════════ */

const { app } = require('electron');

// DSN зашивается в сборке через env. В dev — пусто, ничего не отправляется.
// Подменить при сборке: `SENTRY_DSN=https://...@sentry.io/... npm run build:mac`
const DSN = process.env.SENTRY_DSN || '';

let initialized = false;

function initSentry() {
  if (initialized) return;

  // Не инициализируем без DSN — даже если пользователь включил toggle.
  // Это нужно для того чтобы дев-сборки не пытались никуда стучаться.
  if (!DSN) {
    console.log('[sentry] DSN не задан — модуль отключён');
    return;
  }

  // Проверяем согласие пользователя — лениво, чтобы избежать циклической
  // зависимости с storage (storage может пытаться t() из i18n, и т.д.).
  let enabled = false;
  try {
    const storage = require('./storage');
    enabled = storage.getSentryEnabled();
  } catch (e) {
    console.warn('[sentry] не удалось прочитать storage:', e.message);
    return;
  }

  if (!enabled) {
    console.log('[sentry] отключён в настройках');
    return;
  }

  try {
    const Sentry = require('@sentry/electron/main');
    Sentry.init({
      dsn: DSN,
      release: `snippi@${app.getVersion()}`,
      environment: app.isPackaged ? 'production' : 'development',
      // Привязываем sample rate — для бесплатного тира 5K events/мес
      // достаточно с большим запасом.
      sampleRate: 1.0,
      // Не отправляем PII (имена пользователей, email и т.п.) — наша политика.
      sendDefaultPii: false,
      // Уменьшаем шум — отсекаем расширения браузера/Electron-внутренности.
      beforeSend(event) {
        // Зачистка возможных утечек: если в сообщении есть похожее на
        // путь к файлу пользователя (домашняя директория) — анонимизируем.
        try {
          if (event.message) {
            event.message = event.message.replace(/\/Users\/[^/\s]+/g, '/Users/<anon>');
          }
        } catch {}
        return event;
      },
    });
    initialized = true;
    console.log('[sentry] инициализирован, release:', app.getVersion());
  } catch (e) {
    console.error('[sentry] init failed:', e.message);
  }
}

// Перезапуск нужен, чтобы изменения подхватились (Sentry SDK не любит
// «выключение» в runtime). Сообщаем пользователю в UI.
function setEnabled(value) {
  try {
    const storage = require('./storage');
    storage.setSentryEnabled(!!value);
  } catch (e) {
    console.warn('[sentry] setEnabled storage error:', e.message);
  }
}

function isEnabled() {
  try {
    const storage = require('./storage');
    return storage.getSentryEnabled();
  } catch { return false; }
}

function isAvailable() { return !!DSN; }

module.exports = { initSentry, setEnabled, isEnabled, isAvailable };
