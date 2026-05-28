'use strict';
/* ════════════════════════════════════════════════════════════════
   Автозапуск приложения при логине пользователя.
   В dev-режиме (npm start) намеренно ничего не прописываем — иначе
   ОС стартует голый Electron без аргументов.
════════════════════════════════════════════════════════════════ */

const { app } = require('electron');
const storage = require('./storage');

let autoLauncher = null;

async function initAutoLaunch() {
  if (!app.isPackaged) {
    console.log('[auto-launch] skipped in dev mode');
    return;
  }
  try {
    const AutoLaunch = require('auto-launch');
    autoLauncher = new AutoLaunch({ name: 'Text Expander', path: app.getPath('exe') });
    const want = storage.getAutoStart();
    const has  = await autoLauncher.isEnabled();
    if (want && !has) await autoLauncher.enable();
    if (!want && has) await autoLauncher.disable();
  } catch (err) {
    console.error('[auto-launch]', err.message);
  }
}

async function setAutoLaunch(want) {
  if (!app.isPackaged || !autoLauncher) return;
  try {
    const has = await autoLauncher.isEnabled();
    if (want && !has) await autoLauncher.enable();
    if (!want && has) await autoLauncher.disable();
  } catch (err) {
    console.error('[auto-launch] set:', err.message);
  }
}

module.exports = { initAutoLaunch, setAutoLaunch };
