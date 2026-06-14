'use strict';
/* ════════════════════════════════════════════════════════════════
   Палитра-хаб (по умолчанию Cmd/Ctrl+Shift+E).
     • root      — поиск по командам (OCR / перевод / история буфера /
                   открыть приложение) и сниппетам
     • clipboard — под-режим истории буфера
     • form      — заполнение полей {?Метка} перед вставкой
   Форма открывается двумя путями: выбором fill-in сниппета в палитре и
   срабатыванием такого сниппета по триггеру (openSnippetForm из expander).
════════════════════════════════════════════════════════════════ */

const { BrowserWindow, app, screen, globalShortcut, ipcMain } = require('electron');
const path = require('path');

let paletteWindow = null;
const PALETTE_HOTKEY = 'CommandOrControl+Shift+E';

// Контекст отложенной вставки fill-in сниппета, запущенного по ТРИГГЕРУ:
// backspaces сотрут напечатанный триггер при финальной вставке.
let pendingExpansion = null;

const isMac = process.platform === 'darwin';
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function positionPalette(w) {
  try {
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    const [W, H] = w.getSize();
    w.setPosition(Math.round((sw - W) / 2), Math.round((sh - H) / 3));
  } catch {}
}

function createPaletteWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const W = 640, H = 460;
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
    titleBarStyle: isMac ? 'customButtonsOnHover' : undefined,
    webPreferences: {
      preload:          path.join(__dirname, 'palette-preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'palette.html'));
  try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch {}
  if (isMac) {
    try { win.setAlwaysOnTop(true, 'screen-saver'); } catch {}
  }
  // Прячем при потере фокуса (как Spotlight / Raycast).
  win.on('blur', () => { if (!win.isDestroyed() && win.isVisible()) hidePalette(); });
  return win;
}

function ensureWindow() {
  if (!paletteWindow || paletteWindow.isDestroyed()) {
    paletteWindow = createPaletteWindow();
  }
  return paletteWindow;
}

// Отправить сообщение в окно, дождавшись загрузки если нужно.
function sendWhenReady(w, channel, payload) {
  const send = () => { try { w.webContents.send(channel, payload); } catch {} };
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send);
  else send();
}

function showPalette() {
  pendingExpansion = null;            // обычное открытие — не fill-in контекст
  const w = ensureWindow();
  positionPalette(w);
  w.show();
  w.focus();
  sendWhenReady(w, 'palette-open');
}

// Открыть палитру сразу в режиме формы для конкретного сниппета.
// opts.backspaces — сколько символов триггера стереть при вставке (0 для
// выбора из палитры; >0 когда сниппет сработал по триггеру).
function openSnippetForm(snippet, opts = {}) {
  pendingExpansion = {
    replacement: snippet.replacement || '',
    format:      snippet.format || 'plain',
    backspaces:  opts.backspaces || 0,
  };
  const w = ensureWindow();
  positionPalette(w);
  w.show();
  w.focus();
  const { extractFields } = require('./placeholders');
  sendWhenReady(w, 'palette-open-form', {
    trigger:     snippet.trigger || '',
    replacement: snippet.replacement || '',
    format:      snippet.format || 'plain',
    fields:      extractFields(snippet.replacement || ''),
  });
}

function hidePalette() {
  pendingExpansion = null;
  if (paletteWindow && !paletteWindow.isDestroyed() && paletteWindow.isVisible()) {
    paletteWindow.hide();
  }
  // На macOS прячем приложение целиком, чтобы фокус вернулся в приложение,
  // которое было активно до открытия палитры (иначе Cmd+V улетит к нам).
  if (isMac) { try { app.hide(); } catch {} }
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
      try {
        const { sendToMainWindow } = require('./mainWindow');
        sendToMainWindow('hotkey-conflict', { feature: 'palette', hotkey: PALETTE_HOTKEY });
      } catch {}
    }
  } catch (e) { console.warn('[palette] hotkey error:', e.message); }
}

function setupPaletteIPC() {
  ipcMain.handle('palette-close', () => { hidePalette(); });

  // Вставка готового текста (сниппет без полей / элемент истории буфера).
  ipcMain.handle('palette-paste', async (_, text, format) => {
    if (!text) return false;
    hidePalette();
    await delay(isMac ? 180 : 130);
    try {
      const { pasteText } = require('./expander');
      await pasteText(text, format);
      try { require('./stats').onExpanderFire({ type: 'snippet', chars: text.length }); } catch {}
      return true;
    } catch (e) {
      console.error('[palette] paste failed:', e.message);
      return false;
    }
  });

  // Запуск команды из палитры.
  ipcMain.handle('palette-run', async (_, cmd) => {
    if (cmd === 'open-app') {
      pendingExpansion = null;
      if (paletteWindow && !paletteWindow.isDestroyed()) paletteWindow.hide();
      try {
        const { getOrCreateWindow } = require('./mainWindow');
        const w = await getOrCreateWindow();
        if (isMac) { try { app.show(); } catch {} }
        if (w) { w.show(); w.focus(); }
      } catch (e) { console.error('[palette] open-app failed:', e.message); }
      return true;
    }
    // ocr / translate — вернуть фокус прежнему приложению, затем overlay.
    hidePalette();
    await delay(isMac ? 180 : 130);
    try {
      if (cmd === 'ocr')            require('./snip').startSnip('ocr');
      else if (cmd === 'translate') require('./hotkeys').runTranslate();
    } catch (e) { console.error('[palette] run', cmd, 'failed:', e.message); }
    return true;
  });

  // Вставка fill-in сниппета после заполнения формы.
  ipcMain.handle('palette-submit-form', async (_, rawText, format, values) => {
    const pe = pendingExpansion;
    pendingExpansion = null;
    const backspaces = pe ? pe.backspaces : 0;
    const fmt = format || (pe && pe.format) || 'plain';
    const { applyFields } = require('./placeholders');
    const text = applyFields(rawText || (pe && pe.replacement) || '', values || {});
    hidePalette();
    await delay(isMac ? 180 : 130);
    try {
      const { pasteText } = require('./expander');
      await pasteText(text, fmt, backspaces);
      try { require('./stats').onExpanderFire({ type: 'snippet', chars: text.length }); } catch {}
      return true;
    } catch (e) {
      console.error('[palette] form paste failed:', e.message);
      return false;
    }
  });
}

module.exports = {
  showPalette,
  hidePalette,
  openSnippetForm,
  registerPaletteHotkey,
  setupPaletteIPC,
};
