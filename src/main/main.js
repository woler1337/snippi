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

// ВАЖНО: hardware acceleration ВКЛЮЧЕНА намеренно. Раньше она была отключена,
// но это превращало все backdrop-filter blur, анимации и градиенты в CPU-работу,
// что делало UI заметно лаганым. С новым стеклянным дизайном (blur(40px) в шапке,
// status-pulse, ambient градиенты) hardware acceleration обязателен.
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
const { initUpdater } = require('./updater');
const sentry = require('./sentry');
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
  // нашу. Подменяем + добавляем 12% прозрачных полей программно — иначе
  // squircle растягивается на всю ячейку Dock'а и визуально крупнее соседей.
  //
  // Наш icon.png — 1024×1024 без Retina-метки → s.width === bitmap stride,
  // никакой DIP/physical путаницы. Тот старый bug с «хвостами» был на другом
  // PNG, который был Retina-tagged. Текущий icon.png — обычный, проверено.
  if (process.platform === 'darwin' && app.dock) {
    try {
      const path = require('path');
      const { nativeImage } = require('electron');
      const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
      const src = nativeImage.createFromPath(iconPath);
      if (!src.isEmpty()) {
        const s = src.getSize();
        const pad = Math.round(s.width * 0.12);
        const W = s.width + pad * 2, H = s.height + pad * 2;
        const out = Buffer.alloc(W * H * 4);   // transparent
        const srcBytes = src.toBitmap();
        // Защита: если по факту stride отличается (Retina-PNG), просто
        // отдаём оригинал без padding'а — лучше «слишком большая», чем артефакты.
        if (srcBytes.length === s.width * s.height * 4) {
          for (let y = 0; y < s.height; y++) {
            const srcRow = y * s.width * 4;
            const dstRow = ((y + pad) * W + pad) * 4;
            srcBytes.copy(out, dstRow, srcRow, srcRow + s.width * 4);
          }
          const padded = nativeImage.createFromBitmap(out, { width: W, height: H });
          app.dock.setIcon(padded);
        } else {
          console.warn('[dock] неожиданный stride, использую оригинал без padding');
          app.dock.setIcon(src);
        }
      }
    } catch (e) { console.warn('[dock] setIcon failed:', e.message); }
  }

  // Sentry — максимально рано, до создания окон. Сам пропустится если
  // DSN не задан или пользователь не дал согласия в Настройках.
  sentry.initSentry();

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

  // Авто-обновления через electron-updater (внутри сам пропустит в dev-режиме)
  initUpdater();

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
