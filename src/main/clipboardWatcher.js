'use strict';
/* ════════════════════════════════════════════════════════════════
   Наблюдатель за буфером обмена: каждые 600 мс смотрит, изменился
   ли текст. Если да — добавляет запись в историю.
════════════════════════════════════════════════════════════════ */

const { clipboard } = require('electron');
const storage = require('./storage');

let _lastClipText = '';
let _paused = false;
let _timer = null;

function setClipboardPaused(v) { _paused = !!v; }

function startClipboardWatcher() {
  if (_timer) return;
  _lastClipText = clipboard.readText() || '';
  _timer = setInterval(() => {
    if (_paused) return;
    try {
      const text = clipboard.readText() || '';
      if (text && text !== _lastClipText) {
        _lastClipText = text;
        storage.addClipboardEntry(text);
      }
    } catch { /* не критично */ }
  }, 600);
}

function stopClipboardWatcher() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { startClipboardWatcher, stopClipboardWatcher, setClipboardPaused };
