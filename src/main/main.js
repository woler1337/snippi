'use strict';
/* ════════════════════════════════════════════════════════════════
   ТОЧКА ВХОДА. Только bootstrap + lifecycle.
   Вся реальная логика разнесена по модулям:
     ./mainWindow      — главное окно
     ./tray            — иконка в menu bar + системные слушатели
     ./snip            — оверлей выделения + OCR + перевод
     ./palette         — палитра быстрого поиска сниппетов
     ./hotkeys         — глобальные горячие клавиши OCR / Translate
     ./autolaunch      — автозапуск при логине
     ./accessibility   — запрос macOS-разрешения для перехвата клавиш
     ./clipboardWatcher— наблюдатель за буфером обмена
     ./ipc             — все ipcMain.handle
     ./stats           — счётчик раскрытий
════════════════════════════════════════════════════════════════ */

const { app, Menu, globalShortcut } = require('electron');
const log = require('electron-log/main');

// Файловые логи: ~/Library/Logs/Snippi/main.log (mac),
// %APPDATA%/Snippi/logs (windows).
log.initialize();
log.transports.file.level    = 'info';
log.transports.console.level = 'debug';
Object.assign(console, log.functions);

// ── Process-level настройки до создания app ──────────────────────────────

app.disableHardwareAcceleration();
// 256 МБ — разумный минимум: V8 при 96 МБ непрерывно GC-ит, что
// блокирует поток с глобальным хуком клавиатуры.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
app.commandLine.appendSwitch('disable-features', 'BackForwardCache');

// ── Одиночный экземпляр ──────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

// На macOS НЕ скрываем dock и не меняем активационную политику.
// Ранние манипуляции с LSUIElement/accessory ломают регистрацию NSStatusItem
// (иконка трея получает x:0 и уезжает за границы экрана). Dock-иконка служит
// надёжным fallback'ом для открытия приложения.

// ── Подгружаем модули после блокировки одиночного экземпляра ─────────────

const { createMainWindow, getOrCreateWindow, getMainWindow, setExpanderError } = require('./mainWindow');
const { createTray, destroyTray, registerSystemListeners } = require('./tray');
const { setupIPC } = require('./ipc');
const { registerOcrHotkey, registerTranslateHotkey } = require('./hotkeys');
const { registerPaletteHotkey, setupPaletteIPC } = require('./palette');
const { startClipboardWatcher } = require('./clipboardWatcher');
const { initAutoLaunch } = require('./autolaunch');
const { checkAccessibilityPermissions } = require('./accessibility');
const { onExpanderFire } = require('./stats');
const ocr = require('./ocr');

app.on('second-instance', () => {
  getOrCreateWindow().then(w => {
    if (w.isMinimized()) w.restore();
    w.show(); w.focus();
  });
});

// ── Точка входа ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Удаляем дефолтное Electron-меню (App/File/Edit/View/Window/Help) — на
  // MacBook с notch оно отъедает место в menu bar.
  Menu.setApplicationMenu(null);

  // В dev-режиме (npm start) Electron показывает в Dock свою иконку, а не
  // нашу из assets/icon.png. Подменяем явно. В собранной .app — Electron
  // подхватит .icns автоматически, но повторный вызов не повредит.
  if (process.platform === 'darwin' && app.dock) {
    try {
      const path = require('path');
      const { nativeImage } = require('electron');
      const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
      const src = nativeImage.createFromPath(iconPath);
      if (!src.isEmpty()) {
        // Иконка нарисована «в край» squircle. macOS-iconography требует
        // прозрачные поля ~10-12% по периметру (как Chrome/Telegram/Discord),
        // иначе визуально иконка крупнее соседних в Dock. Композируем
        // оригинал в центр большего прозрачного canvas через bitmap-буфер.
        const s = src.getSize();
        const pad = Math.round(s.width * 0.12);
        const W = s.width + pad * 2, H = s.height + pad * 2;
        const out = Buffer.alloc(W * H * 4); // все байты 0 → прозрачно
        const srcBytes = src.toBitmap();      // BGRA на macOS
        for (let y = 0; y < s.height; y++) {
          const srcRow = y * s.width * 4;
          const dstRow = ((y + pad) * W + pad) * 4;
          srcBytes.copy(out, dstRow, srcRow, srcRow + s.width * 4);
        }
        const padded = nativeImage.createFromBitmap(out, { width: W, height: H });
        app.dock.setIcon(padded);
      }
    } catch (e) { console.warn('[dock] setIcon failed:', e.message); }
  }

  setupIPC();
  setupPaletteIPC();

  createTray();
  registerSystemListeners();

  startClipboardWatcher();
  await initAutoLaunch();
  await checkAccessibilityPermissions();

  try {
    const { initExpander, setOnFire } = require('./expander');
    setOnFire(onExpanderFire);
    await initExpander();
  } catch (err) {
    console.error('[main] Перехватчик не запустился:', err.message);
    setExpanderError(err.message);
  }

  registerOcrHotkey();
  registerTranslateHotkey();
  registerPaletteHotkey();

  // Открываем окно сразу при запуске
  getOrCreateWindow().then(w => { w.show(); w.focus(); });
});

// ── Lifecycle ─────────────────────────────────────────────────────────────

app.on('window-all-closed', e => e.preventDefault());
app.on('activate', () => getOrCreateWindow().then(w => { w.show(); w.focus(); }));

app.on('before-quit', () => {
  app.isQuitting = true;
  try { require('./expander').stopExpander(); } catch {}
  // Уничтожаем трей сразу — макс. время для macOS освободить NSStatusItem,
  // иначе при следующем запуске иконка окажется невидимой.
  destroyTray();
});

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch {}
  try { ocr.shutdown(); } catch {}
  destroyTray();
});

// Перехват SIGINT/SIGTERM (например при pkill из терминала).
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    destroyTray();
    app.quit();
  });
}
