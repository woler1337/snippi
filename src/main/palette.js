'use strict';
/* ════════════════════════════════════════════════════════════════
   Палитра быстрого поиска сниппетов (по умолчанию Cmd/Ctrl+Shift+E).
════════════════════════════════════════════════════════════════ */

const { BrowserWindow, app, screen, globalShortcut, ipcMain } = require('electron');
const path = require('path');

let paletteWindow = null;
const PALETTE_HOTKEY = 'CommandOrControl+Shift+E';

function createPaletteWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const W = 640, H = 440;
  const win = new BrowserWindow({
    width: W, height: H,
    x: Math.round((sw - W) / 2),
    y: Math.round((sh - H) / 3),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    hasShadow: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    titleBarStyle: process.platform === 'darwin' ? 'customButtonsOnHover' : undefined,
    webPreferences: {
      preload:          path.join(__dirname, 'palette-preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'palette.html'));
  // На Windows — no-op, на части Linux-WM может бросить → защищаем.
  try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch {}
  if (process.platform === 'darwin') {
    try { win.setAlwaysOnTop(true, 'screen-saver'); } catch {}
  }
  // Прячем при потере фокуса (как Spotlight / Raycast). Без app.hide() —
  // blur уже значит, что фокус ушёл на другое приложение.
  win.on('blur', () => { if (!win.isDestroyed() && win.isVisible()) win.hide(); });
  return win;
}

function showPalette() {
  if (!paletteWindow || paletteWindow.isDestroyed()) {
    paletteWindow = createPaletteWindow();
  }
  const w = paletteWindow;
  try {
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    const [W, H] = w.getSize();
    w.setPosition(Math.round((sw - W) / 2), Math.round((sh - H) / 3));
  } catch {}
  w.show();
  w.focus();
  try { w.webContents.send('palette-open'); } catch {}
}

function hidePalette() {
  if (paletteWindow && !paletteWindow.isDestroyed() && paletteWindow.isVisible()) {
    paletteWindow.hide();
  }
  // На macOS прячем приложение целиком, чтобы фокус вернулся в то приложение,
  // которое было активно до открытия палитры (иначе Cmd+V улетит к нам).
  if (process.platform === 'darwin') {
    try { app.hide(); } catch {}
  }
}

function registerPaletteHotkey() {
  try {
    const ok = globalShortcut.register(PALETTE_HOTKEY, () => {
      if (paletteWindow && !paletteWindow.isDestroyed() && paletteWindow.isVisible()) {
        hidePalette();
      } else {
        showPalette();
      }
    });
    if (!ok) {
      console.warn('[palette] хоткей', PALETTE_HOTKEY, 'уже занят');
      // Best-effort уведомление в окно
      try {
        const { sendToMainWindow } = require('./mainWindow');
        sendToMainWindow('hotkey-conflict', { feature: 'palette', hotkey: PALETTE_HOTKEY });
      } catch {}
    }
  } catch (e) { console.warn('[palette] hotkey error:', e.message); }
}

function setupPaletteIPC() {
  ipcMain.handle('palette-close', () => { hidePalette(); });
  ipcMain.handle('palette-paste', async (_, text, format) => {
    if (!text) return false;
    hidePalette();
    // Ждём, пока macOS реально переведёт фокус (app.hide имеет анимацию).
    await new Promise(r => setTimeout(r, process.platform === 'darwin' ? 180 : 130));
    try {
      const { pasteText } = require('./expander');
      await pasteText(text, format);
      // Засчитываем как expansion в статистику.
      try { require('./stats').onExpanderFire({ type: 'snippet', chars: text.length }); } catch {}
      return true;
    } catch (e) {
      console.error('[palette] paste failed:', e.message);
      return false;
    }
  });
}

module.exports = {
  showPalette,
  hidePalette,
  registerPaletteHotkey,
  setupPaletteIPC,
};
