'use strict';
/* ════════════════════════════════════════════════════════════════
   Snip overlay: выделение области экрана → скриншот → OCR → текст
   или → OCR → перевод (в зависимости от режима).
════════════════════════════════════════════════════════════════ */

const {
  BrowserWindow, app, screen, desktopCapturer, clipboard,
  dialog, shell, Notification,
} = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const storage    = require('./storage');
const ocr        = require('./ocr');
const translator = require('./translator');
const { sendToMainWindow } = require('./mainWindow');

let snipWindow         = null;
let snipDisplayId      = null;
let ocrBusy            = false;
let snipMode           = 'ocr';   // 'ocr' | 'translate'

function getSnipWindow() { return snipWindow; }

function createSnipWindow(display) {
  const { bounds } = display;
  const w = new BrowserWindow({
    x: bounds.x, y: bounds.y,
    width:  bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false, movable: false, minimizable: false, maximizable: false,
    skipTaskbar: true,
    show: false,
    focusable: true,
    acceptFirstMouse: true,
    alwaysOnTop: true,
    hasShadow: false,
    fullscreenable: false,
    enableLargerThanScreen: true,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  });
  w.setAlwaysOnTop(true, 'screen-saver');
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  w.loadFile(path.join(__dirname, '..', 'renderer', 'snip.html'));
  w.on('closed', () => { snipWindow = null; snipDisplayId = null; });
  return w;
}

function closeSnipWindow() {
  if (snipWindow && !snipWindow.isDestroyed()) {
    try { snipWindow.close(); } catch {}
  }
  snipWindow = null;
  snipDisplayId = null;
  // На macOS прячем приложение целиком, чтобы фокус вернулся в то приложение,
  // которое было активно до старта snip.
  if (process.platform === 'darwin') {
    try { app.hide(); } catch {}
  }
}

async function startSnip(mode = 'ocr') {
  // Защита от двойного нажатия хоткея и от запуска поверх существующего оверлея.
  if (ocrBusy) return;
  if (snipWindow && !snipWindow.isDestroyed()) return;
  if (mode === 'ocr'       && !storage.getOcrSettings().enabled)       return;
  if (mode === 'translate' && !storage.getTranslateSettings().enabled) return;
  snipMode = mode;

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  snipDisplayId = display.id;

  closeSnipWindow();
  snipWindow = createSnipWindow(display);
  snipWindow.once('ready-to-show', () => {
    snipWindow.show();
    snipWindow.focus();
    if (process.platform === 'darwin') app.focus({ steal: true });
    try { snipWindow.webContents.send('snip-mode', snipMode); } catch {}
  });
}

async function handleSnipPick(bounds) {
  const dpr     = bounds.dpr || 1;
  const display = screen.getAllDisplays().find(d => d.id === snipDisplayId)
                || screen.getPrimaryDisplay();
  closeSnipWindow();

  if (process.platform === 'darwin') {
    try { app.hide(); } catch {}
  }

  if (ocrBusy) return;
  ocrBusy = true;

  let tmpPath = null;
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width:  Math.round(display.size.width  * dpr),
        height: Math.round(display.size.height * dpr),
      },
      fetchWindowIcons: false,
    });
    const src = sources.find(s => s.display_id && Number(s.display_id) === display.id) || sources[0];
    if (!src) throw new Error('Источник экрана не найден');

    if (src.thumbnail.isEmpty()) {
      console.warn('[ocr] empty thumbnail — Screen Recording permission missing');
      if (process.platform === 'darwin') {
        const appName = app.isPackaged ? app.getName() : 'Electron';
        dialog.showMessageBox({
          type: 'warning',
          title: 'Нужно разрешение Screen Recording',
          message:
            `macOS блокирует захват экрана.\n\n` +
            `1. Откройте «Настройки» → «Конфиденциальность и безопасность» → «Запись экрана и системного звука» (откроем за вас).\n` +
            `2. Найдите «${appName}» в списке (или добавьте кнопкой «+»).\n` +
            `3. Включите тумблер.\n` +
            `4. Перезапустите приложение.`,
          buttons: ['Открыть настройки', 'OK'],
          defaultId: 0,
        }).then(r => {
          if (r.response === 0) {
            shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
          }
        });
      }
      throw new Error('Нет разрешения на запись экрана');
    }

    const cropRect = {
      x:      Math.round(bounds.x      * dpr),
      y:      Math.round(bounds.y      * dpr),
      width:  Math.round(bounds.width  * dpr),
      height: Math.round(bounds.height * dpr),
    };
    const cropped = src.thumbnail.crop(cropRect);
    const png     = cropped.toPNG();

    tmpPath = path.join(os.tmpdir(), `te-snip-${Date.now()}.png`);
    fs.writeFileSync(tmpPath, png);

    const { joinParagraphs } = storage.getOcrSettings();
    const { text } = await ocr.recognize(tmpPath, { joinParagraphs });

    if (!text || !text.trim()) {
      console.log('[ocr] empty result — clipboard NOT modified');
      if (snipMode === 'translate') {
        sendTranslateResult({ ok: false, message: 'Не удалось распознать текст на скриншоте' });
      } else {
        notifyOcr({ ok: false, message: 'OCR: не удалось распознать текст' });
      }
      return;
    }

    if (snipMode === 'translate') {
      // Читаем настройки в момент фактического перевода — пользователь мог
      // поменять язык между нажатием хоткея и завершением OCR.
      const cfg    = storage.getTranslateSettings();
      const target = cfg.targetLang;
      try {
        console.log('[translate] OCR дал', text.length, 'симв., целевой язык:', target);
        const { text: translated, sourceLang } = await translator.translate(text, { targetLang: target });
        clipboard.writeText(translated);
        console.log(`[translate] готово: ${translated.length} симв.`);
        sendTranslateResult({
          ok:         true,
          chars:      translated.length,
          sourceLang,
          targetLang: target,
          original:   text.slice(0, 80),
          translated: translated.slice(0, 80),
        });
      } catch (e) {
        console.error('[translate] error:', e.message);
        sendTranslateResult({ ok: false, message: 'Перевод: ' + e.message });
      }
    } else {
      clipboard.writeText(text);
      console.log(`[ocr] copied ${text.length} chars: "${text.slice(0, 60).replace(/\n/g, ' ')}${text.length > 60 ? '…' : ''}"`);
      notifyOcr({ ok: true, chars: text.length });
    }
  } catch (err) {
    console.error('[ocr] pipeline error:', err);
    if (snipMode === 'translate') {
      sendTranslateResult({ ok: false, message: 'Ошибка: ' + err.message });
    } else {
      notifyOcr({ ok: false, message: 'OCR: ' + err.message });
    }
  } finally {
    if (tmpPath) { try { fs.unlinkSync(tmpPath); } catch {} }
    ocrBusy = false;
  }
}

// ── Уведомления о результатах ─────────────────────────────────────────

function notifyOcr(payload) {
  const msg = payload.ok
    ? `OCR: скопировано ${payload.chars} симв.`
    : (payload.message || 'OCR: ошибка');
  sendToMainWindow('ocr-result', payload);
  try {
    if (Notification.isSupported()) {
      new Notification({ title: 'Text Expander', body: msg, silent: true }).show();
    }
  } catch {}
}

function sendTranslateResult(payload) {
  sendToMainWindow('translate-result', payload);
  try {
    if (Notification.isSupported()) {
      let title, body;
      if (payload.ok) {
        title = `Перевод → ${payload.targetLang || ''} (${payload.chars} симв.)`;
        const trim = s => (s || '').replace(/\s+/g, ' ').trim();
        body = payload.translated
          ? `${trim(payload.original)}\n→ ${trim(payload.translated)}`
          : `${payload.chars} симв. скопировано в буфер обмена`;
      } else {
        title = 'Ошибка перевода';
        body  = payload.message || 'Не удалось перевести';
      }
      new Notification({ title, body, silent: true }).show();
    }
  } catch {}
}

module.exports = {
  startSnip,
  handleSnipPick,
  closeSnipWindow,
  getSnipWindow,
  sendTranslateResult,   // нужен hotkeys.js когда runTranslate проверяет enabled
};
