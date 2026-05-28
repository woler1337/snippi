'use strict';
/* ════════════════════════════════════════════════════════════════
   Глобальные горячие клавиши OCR и Translate.
   Конфликты (хоткей занят системой) — уведомляем пользователя.
════════════════════════════════════════════════════════════════ */

const { globalShortcut, Notification } = require('electron');
const storage = require('./storage');
const { startSnip } = require('./snip');
const { sendToMainWindow } = require('./mainWindow');

let registeredOcrAccel       = null;
let registeredTranslateAccel = null;

function notifyHotkeyConflict(feature, hotkey) {
  sendToMainWindow('hotkey-conflict', { feature, hotkey });
  try {
    if (Notification.isSupported()) {
      new Notification({
        title: 'Хоткей занят',
        body:  `«${hotkey}» уже используется системой или другим приложением. Поменяйте комбинацию для «${feature}» в настройках.`,
        silent: true,
      }).show();
    }
  } catch {}
}

async function runTranslate() {
  const cfg = storage.getTranslateSettings();
  console.log('[translate] hotkey fired. enabled:', cfg.enabled, 'target:', cfg.targetLang);
  if (!cfg.enabled) { console.log('[translate] disabled in settings'); return; }
  startSnip('translate');
}

function registerTranslateHotkey() {
  if (registeredTranslateAccel) {
    try { globalShortcut.unregister(registeredTranslateAccel); } catch {}
    registeredTranslateAccel = null;
  }
  const cfg = storage.getTranslateSettings();
  if (!cfg.enabled || !cfg.hotkey) return;
  try {
    const ok = globalShortcut.register(cfg.hotkey, () => { runTranslate(); });
    if (ok) {
      registeredTranslateAccel = cfg.hotkey;
    } else {
      console.warn('[translate] hotkey registration failed:', cfg.hotkey);
      notifyHotkeyConflict('Перевод', cfg.hotkey);
    }
  } catch (err) {
    console.warn('[translate] hotkey error:', err.message);
    notifyHotkeyConflict('Перевод', cfg.hotkey);
  }
}

function registerOcrHotkey() {
  if (registeredOcrAccel) {
    try { globalShortcut.unregister(registeredOcrAccel); } catch {}
    registeredOcrAccel = null;
  }
  const { enabled, hotkey } = storage.getOcrSettings();
  if (!enabled || !hotkey) return;
  try {
    const ok = globalShortcut.register(hotkey, () => { startSnip('ocr'); });
    if (ok) {
      registeredOcrAccel = hotkey;
    } else {
      console.warn('[ocr] hotkey registration failed:', hotkey);
      notifyHotkeyConflict('Скриншот', hotkey);
    }
  } catch (err) {
    console.warn('[ocr] hotkey error:', err.message);
    notifyHotkeyConflict('Скриншот', hotkey);
  }
}

module.exports = {
  registerOcrHotkey,
  registerTranslateHotkey,
  runTranslate,
};
