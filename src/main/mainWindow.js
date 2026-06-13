'use strict';
/* ════════════════════════════════════════════════════════════════
   Главное окно приложения. Создаётся лениво при первом запросе.
   Закрытие красной кнопкой = скрытие в трей, не выход.
════════════════════════════════════════════════════════════════ */

const { BrowserWindow, app } = require('electron');
const path    = require('path');
const storage = require('./storage');

let mainWindow   = null;
let storageWired = false;  // подписываемся на события storage один раз
let expanderError = null;  // ошибка перехватчика, показывается при первом открытии окна

function getMainWindow() { return mainWindow; }

// Безопасная отправка IPC-сообщения в окно. Если окно ещё не создано или
// закрыто — просто проглатываем (вызывающему не надо проверять).
function sendToMainWindow(channel, data) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  try { mainWindow.webContents.send(channel, data); return true; }
  catch { return false; }
}

function setExpanderError(msg) { expanderError = msg; }

function createMainWindow() {
  const win = new BrowserWindow({
    width: 800, height: 600, minWidth: 600, minHeight: 440,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 18, y: 18 } : undefined,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
      backgroundThrottling: true,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
    if (process.env.DEV_TOOLS === '1') win.webContents.openDevTools({ mode: 'detach' });
    if (expanderError) {
      win.webContents.send('expander-error', expanderError);
      expanderError = null;
    }
  });

  win.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) console.log(`[renderer ${source}:${line}] ${message}`);
  });

  win.on('close', e => {
    if (!app.isQuitting) { e.preventDefault(); win.hide(); }
  });

  win.on('hide', () => { if (!win.isDestroyed()) win.webContents.setBackgroundThrottling(true); });
  win.on('show', () => { if (!win.isDestroyed()) win.webContents.setBackgroundThrottling(false); });

  // Подключаем события storage один раз при первом создании окна.
  if (!storageWired) {
    storageWired = true;
    const send = (ch, d) => sendToMainWindow(ch, d);
    storage.on('snippets-changed',          d => send('snippets-changed', d));
    storage.on('keybindings-changed',       d => send('keybindings-changed', d));
    storage.on('groups-changed',            d => send('groups-changed', d));
    storage.on('clipboard-history-changed', d => send('clipboard-history-changed', d));
  }

  mainWindow = win;
  return win;
}

async function getOrCreateWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }
  return mainWindow;
}

module.exports = {
  createMainWindow,
  getOrCreateWindow,
  getMainWindow,
  sendToMainWindow,
  setExpanderError,
};
