'use strict';
/* ════════════════════════════════════════════════════════════════
   Авто-обновления через electron-updater + GitHub Releases.

   Цикл:
     1. checkForUpdates() — стучимся в GitHub Releases (фид из publish-конфига)
     2. update-available → начинаем скачивать в фоне
     3. download-progress → шлём прогресс в renderer
     4. update-downloaded → показываем юзеру кнопку «Перезапустить»
     5. quitAndInstall() — закрываем приложение и накатываем

   В dev-режиме electron-updater выкидывает ошибку (нет app.asar) —
   полностью пропускаем инициализацию.
════════════════════════════════════════════════════════════════ */

const { app } = require('electron');
const log = require('electron-log/main');
const { sendToMainWindow } = require('./mainWindow');

let autoUpdater = null;
let initialized = false;
let lastState   = { status: 'idle' };  // 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

function getState() { return lastState; }

function setState(patch) {
  lastState = { ...lastState, ...patch };
  sendToMainWindow('update-state', lastState);
}

function initUpdater() {
  if (initialized) return;
  initialized = true;

  // В dev (npm start) — не инициализируем. electron-updater требует валидный
  // app.asar и подписанный/неподписанный, но cобранный бинарник.
  if (!app.isPackaged) {
    console.log('[updater] skipped (dev mode)');
    setState({ status: 'idle', reason: 'dev-mode' });
    return;
  }

  try {
    const updaterMod = require('electron-updater');
    autoUpdater = updaterMod.autoUpdater;
  } catch (e) {
    console.error('[updater] electron-updater not available:', e.message);
    setState({ status: 'error', message: 'electron-updater not installed' });
    return;
  }

  // Логи updater'а пишем в тот же electron-log канал.
  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = 'info';

  // Скачивание — автоматическое, установка — только по согласию пользователя.
  autoUpdater.autoDownload          = true;
  autoUpdater.autoInstallOnAppQuit  = true;
  // Pre-release не показываем стабильным пользователям.
  autoUpdater.allowPrerelease       = false;

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] checking…');
    setState({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] update available:', info.version);
    setState({
      status:  'available',
      version: info.version,
      notes:   info.releaseNotes || '',
      date:    info.releaseDate  || null,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[updater] no updates, current:', info && info.version);
    setState({ status: 'not-available', version: info && info.version });
  });

  autoUpdater.on('download-progress', (p) => {
    setState({
      status:    'downloading',
      percent:   Math.round(p.percent || 0),
      bytesPerSecond: p.bytesPerSecond,
      transferred:    p.transferred,
      total:          p.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] downloaded:', info.version);
    setState({
      status:  'downloaded',
      version: info.version,
      notes:   info.releaseNotes || '',
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err && err.message);
    setState({ status: 'error', message: (err && err.message) || 'Unknown error' });
  });

  // Авто-проверка через 8 секунд после старта (даём окну прогрузиться).
  setTimeout(() => { checkForUpdates({ silent: true }).catch(() => {}); }, 8000);
}

/**
 * Ручная или авто-проверка.
 * @param {object} opts
 * @param {boolean} [opts.silent] — не подсвечивать «not-available» в UI
 */
async function checkForUpdates(opts = {}) {
  if (!autoUpdater) {
    setState({ status: 'idle', reason: 'dev-mode' });
    return { ok: false, reason: 'dev-mode' };
  }
  try {
    const r = await autoUpdater.checkForUpdates();
    return { ok: true, info: r && r.updateInfo };
  } catch (e) {
    console.error('[updater] check failed:', e.message);
    setState({ status: 'error', message: e.message });
    return { ok: false, message: e.message };
  }
}

// Применить скачанное обновление: закрыть приложение и переустановить.
function installAndRestart() {
  if (!autoUpdater) return false;
  // isSilent=false → стандартный installer-UI на Windows, тихая установка на mac
  // isForceRunAfter=true → после установки автоматически запустить новую версию
  setImmediate(() => {
    try { autoUpdater.quitAndInstall(false, true); }
    catch (e) { console.error('[updater] quitAndInstall failed:', e.message); }
  });
  return true;
}

module.exports = { initUpdater, checkForUpdates, installAndRestart, getState };
