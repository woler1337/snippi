'use strict';
/* ════════════════════════════════════════════════════════════════
   Колбэк после успешного раскрытия сниппета / хоткея / вставки
   через палитру. Считает статистику и сообщает renderer-у.
════════════════════════════════════════════════════════════════ */

const storage = require('./storage');
const { sendToMainWindow } = require('./mainWindow');

function onExpanderFire({ type, chars } = {}) {
  try {
    const stats = storage.bumpStats(type, chars);
    sendToMainWindow('stats-changed', stats);
  } catch { /* не критично */ }
}

module.exports = { onExpanderFire };
