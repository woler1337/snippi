'use strict';
/* ════════════════════════════════════════════════════════════════
   Snip overlay: выделение области экрана → скриншот → OCR → текст
   или → OCR → перевод (в зависимости от режима).
════════════════════════════════════════════════════════════════ */

const {
  BrowserWindow, app, screen, desktopCapturer, clipboard,
  dialog, shell, Notification, systemPreferences,
} = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const storage    = require('./storage');
const ocr        = require('./ocr');
const translator = require('./translator');
const { sendToMainWindow } = require('./mainWindow');
const { t } = require('./i18n');

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
    // skipTaskbar НЕ ставим — это часть causal chain'а с переключением app
    // в accessory-mode и удалением dock-иконки на macOS Tahoe.
    // Снип-окно всё равно скрыто за overlay, в Mission Control его не видно.
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
  // 'floating' вместо 'screen-saver' — последний на macOS Tahoe конвертирует
  // приложение в accessory-mode (и убирает dock-иконку), потому что уровень
  // 'screen-saver' зарезервирован для системного screensaver'а без app entity.
  // 'floating' — стандартный always-on-top, dock остаётся как есть.
  w.setAlwaysOnTop(true, 'floating');
  // setVisibleOnAllWorkspaces НЕ вызываем — на Tahoe эта настройка вместе
  // с visibleOnFullScreen требует accessory activation policy → опять
  // пропадает dock-иконка. UX trade-off: snip из fullscreen-приложений
  // (например YouTube в fullscreen) не сработает — пользователь сначала
  // выйдет из fullscreen.
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
}

// Возврат фокуса НЕ делаем (любая форма hide ломала dock-иконку на Tahoe).
// Зато ПРИНУДИТЕЛЬНО возвращаем dock-иконку: app.dock.show() — на случай,
// если что-то её спрятало во время snip-flow (например ScreenCaptureKit
// в macOS Sequoia/Tahoe иногда временно убирает индикатор приложения).
function returnFocusToPreviousApp() {
  if (process.platform === 'darwin' && app.dock) {
    try { app.dock.show(); } catch {}
  }
}

// Единый диалог для всех случаев когда захват экрана не работает.
// status: 'denied' | 'restricted' | 'not-determined' | 'unknown'
let _screenDialogShown = false; // не показываем подряд если пользователь уже видел
function showScreenRecordingDialog(status) {
  if (_screenDialogShown) return;
  _screenDialogShown = true;
  setTimeout(() => { _screenDialogShown = false; }, 60_000); // сбрасываем через минуту

  const appName = app.isPackaged ? app.getName() : 'Electron';
  const statusDetail = status === 'not-determined'
    ? t('screenRec.notDetermined')
    : t('screenRec.denied');

  dialog.showMessageBox({
    type: 'warning',
    title:   t('screenRec.title'),
    message: t('screenRec.message', { detail: statusDetail }),
    detail:  t('screenRec.detail',  { app: appName }),
    buttons: [t('btn.openSettings'), t('btn.later')],
    defaultId: 0,
    cancelId: 1,
  }).then(r => {
    if (r.response === 0) {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    }
  }).catch(() => {});
}

async function startSnip(mode = 'ocr') {
  if (ocrBusy) return;
  if (snipWindow && !snipWindow.isDestroyed()) return;
  if (mode === 'ocr'       && !storage.getOcrSettings().enabled)       return;
  if (mode === 'translate' && !storage.getTranslateSettings().enabled) return;
  snipMode = mode;

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  snipDisplayId = display.id;

  // Превентивно держим dock-иконку видимой — на случай если snip-window
  // соберётся её спрятать (в macOS 26 Tahoe бывает с overlay-окнами).
  if (process.platform === 'darwin' && app.dock) {
    try { app.dock.show(); } catch {}
  }

  closeSnipWindow();
  snipWindow = createSnipWindow(display);
  snipWindow.once('ready-to-show', () => {
    snipWindow.show();
    // Фокусим ТОЛЬКО оверлей — без `app.focus({ steal: true })`. Это
    // важно: app.focus с steal активирует всё приложение, и потом без
    // app.hide() фокус остаётся у нас, а с app.hide() — теряется dock-иконка.
    // BrowserWindow.focus() на macOS 26 активирует приложение, но это
    // компенсируется отложенным hide-after-pipeline в handleSnipPick.
    snipWindow.focus();
    try { snipWindow.webContents.send('snip-mode', snipMode); } catch {}
  });
}

async function handleSnipPick(bounds) {
  const dpr     = bounds.dpr || 1;
  const display = screen.getAllDisplays().find(d => d.id === snipDisplayId)
                || screen.getPrimaryDisplay();
  closeSnipWindow();
  // ВАЖНО: app.hide() / Menu hide вызывается ПОСЛЕ всего pipeline (в finally),
  // а не здесь. Раньше преждевременный hide ломал desktopCapturer на macOS
  // (иногда возвращал пустой thumbnail) и приводил к пустому буферу обмена.

  if (ocrBusy) return;
  ocrBusy = true;

  let tmpPath = null;
  try {
    // Проверяем разрешение Screen Recording ЗАРАНЕЕ — иначе getSources()
    // на macOS Sequoia/Tahoe просто кидает "Failed to get sources" без
    // объяснений, и пользователь не понимает что нужно сделать.
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('screen');
      if (status !== 'granted') {
        showScreenRecordingDialog(status);
        throw new Error(`Screen Recording permission: ${status}`);
      }
    }

    let sources;
    try {
      sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width:  Math.round(display.size.width  * dpr),
          height: Math.round(display.size.height * dpr),
        },
        fetchWindowIcons: false,
      });
    } catch (capErr) {
      // macOS Sequoia/Tahoe: getSources может упасть с "Failed to get sources"
      // когда разрешение не выдано или сломалось после переустановки бинарника.
      console.warn('[ocr] desktopCapturer.getSources failed:', capErr.message);
      if (process.platform === 'darwin') showScreenRecordingDialog('not-determined');
      throw new Error(t('err.screenAccess', { msg: capErr.message }));
    }

    const src = sources.find(s => s.display_id && Number(s.display_id) === display.id) || sources[0];
    if (!src) {
      if (process.platform === 'darwin') showScreenRecordingDialog('not-determined');
      throw new Error(t('err.noScreenSource'));
    }

    if (src.thumbnail.isEmpty()) {
      console.warn('[ocr] empty thumbnail — Screen Recording permission missing');
      if (process.platform === 'darwin') showScreenRecordingDialog('denied');
      throw new Error(t('err.noScreenPermission'));
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
        sendTranslateResult({ ok: false, message: t('translate.err.noText') });
      } else {
        notifyOcr({ ok: false, message: t('ocr.notify.noText') });
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
        const { text: translated, sourceLang } = await translator.translate(text, { targetLang: target, email: cfg.email });
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
        sendTranslateResult({ ok: false, message: t('translate.err.prefix', { msg: e.message }) });
      }
    } else {
      clipboard.writeText(text);
      console.log(`[ocr] copied ${text.length} chars: "${text.slice(0, 60).replace(/\n/g, ' ')}${text.length > 60 ? '…' : ''}"`);
      notifyOcr({ ok: true, chars: text.length });
    }
  } catch (err) {
    console.error('[ocr] pipeline error:', err);
    if (snipMode === 'translate') {
      sendTranslateResult({ ok: false, message: t('translate.err.generic', { msg: err.message }) });
    } else {
      notifyOcr({ ok: false, message: t('ocr.err.prefix', { msg: err.message }) });
    }
  } finally {
    if (tmpPath) { try { fs.unlinkSync(tmpPath); } catch {} }
    ocrBusy = false;
    // ТОЛЬКО ТЕПЕРЬ возвращаем фокус — после того как буфер обмена
    // гарантированно записан и pipeline закончился.
    returnFocusToPreviousApp();
  }
}

// ── Уведомления о результатах ─────────────────────────────────────────

function notifyOcr(payload) {
  const msg = payload.ok
    ? t('ocr.notify.ok', { chars: payload.chars })
    : (payload.message || t('ocr.notify.fail'));
  sendToMainWindow('ocr-result', payload);
  try {
    if (Notification.isSupported()) {
      new Notification({ title: 'Snippi', body: msg, silent: true }).show();
    }
  } catch {}
}

function sendTranslateResult(payload) {
  sendToMainWindow('translate-result', payload);
  try {
    if (Notification.isSupported()) {
      let title, body;
      if (payload.ok) {
        title = t('translate.notify.title', { lang: payload.targetLang || '', chars: payload.chars });
        const trim = s => (s || '').replace(/\s+/g, ' ').trim();
        body = payload.translated
          ? `${trim(payload.original)}\n→ ${trim(payload.translated)}`
          : t('translate.notify.copied', { chars: payload.chars });
      } else {
        title = t('translate.notify.errTitle');
        body  = payload.message || t('translate.notify.errBody');
      }
      new Notification({ title, body, silent: true }).show();
    }
  } catch {}
}

// Внешний API для cancel-флоу (вызывается по Esc): закрыть оверлей и вернуть
// фокус, без OCR-pipeline'а.
function cancelSnip() {
  closeSnipWindow();
  returnFocusToPreviousApp();
}

module.exports = {
  startSnip,
  handleSnipPick,
  closeSnipWindow,
  cancelSnip,
  getSnipWindow,
  sendTranslateResult,
};
