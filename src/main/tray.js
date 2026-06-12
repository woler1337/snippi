'use strict';
/* ════════════════════════════════════════════════════════════════
   Tray icon + системные события для пересоздания трея на macOS.
════════════════════════════════════════════════════════════════ */

const { Tray, Menu, nativeImage, app, powerMonitor, screen } = require('electron');
const path = require('path');
const zlib = require('zlib');
const storage = require('./storage');
const { getOrCreateWindow, sendToMainWindow } = require('./mainWindow');
const { t } = require('./i18n');

let tray = null;
let _trayRetryCount = 0;
const TRAY_MAX_RETRIES = 6;
let _recreateTimer = null;

// Возвращает текущий объект трея (для cleanup в lifecycle hooks).
function getTray() { return tray; }

// Безопасное уничтожение трея (используется в before-quit / will-quit).
function destroyTray() {
  try { if (tray && !tray.isDestroyed()) tray.destroy(); } catch {}
  tray = null;
}

// ── Генерация fallback-иконки PNG (если файла assets/tray-icon.png нет) ──

function buildTrayIconBuffer() {
  const W = 16, H = 16;
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const tb = Buffer.from(type), lb = Buffer.allocUnsafe(4), cb = Buffer.allocUnsafe(4);
    lb.writeUInt32BE(data.length); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])));
    return Buffer.concat([lb, tb, data, cb]);
  };
  const px = new Uint8Array(W * H * 4);
  function fillRR(x1, y1, x2, y2, r) {
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        let cov = 1.0;
        const il = x < x1+r, ir = x > x2-r, it = y < y1+r, ib = y > y2-r;
        if ((il||ir) && (it||ib)) {
          const cx = il ? x1+r : x2-r, cy = it ? y1+r : y2-r;
          cov = Math.max(0, Math.min(1, r - Math.sqrt((x-cx)**2+(y-cy)**2) + 0.5));
        }
        if (cov > 0) {
          const i = (y*W+x)*4;
          px[i] = 0; px[i+1] = 0; px[i+2] = 0; px[i+3] = Math.round(255*cov);
        }
      }
    }
  }
  function fillR(x1, y1, x2, y2) {
    for (let y = y1; y <= y2; y++)
      for (let x = x1; x <= x2; x++) {
        const i = (y*W+x)*4; px[i]=0; px[i+1]=0; px[i+2]=0; px[i+3]=255;
      }
  }
  fillR (7,  1, 8, 14);
  fillRR(2,  1, 13,  2, 1);
  fillRR(2, 13, 13, 14, 1);
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = ihdr[11] = ihdr[12] = 0;
  const rows = [];
  for (let y = 0; y < H; y++) {
    rows.push(0);
    for (let x = 0; x < W; x++) {
      const i = (y*W+x)*4;
      rows.push(px[i], px[i+1], px[i+2], px[i+3]);
    }
  }
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))]);
}

// Перекрашивает непрозрачные пиксели nativeImage в белый, сохраняя alpha.
// Нужно для Windows/Linux, где чёрная template-иконка не видна на тёмной панели.
function recolorOpaqueToWhite(img) {
  try {
    const s = img.getSize();
    const bmp = img.toBitmap();          // BGRA
    if (!s.width || !s.height || bmp.length !== s.width * s.height * 4) return img;
    for (let i = 0; i < bmp.length; i += 4) {
      if (bmp[i + 3] > 0) {              // есть alpha → красим в белый
        bmp[i] = 255; bmp[i + 1] = 255; bmp[i + 2] = 255;
      }
    }
    return nativeImage.createFromBitmap(bmp, { width: s.width, height: s.height });
  } catch {
    return img;                          // при любой ошибке отдаём оригинал
  }
}

// ── Контекстное меню ──────────────────────────────────────────────────

function buildTrayMenu() {
  const enabled = storage.getEnabled();
  const paletteHotkeyLabel = process.platform === 'darwin' ? '⌘⇧E' : 'Ctrl+Shift+E';
  const items = [
    { label: t('tray.open'), click: () => getOrCreateWindow().then(w => { w.show(); w.focus(); }) },
    { label: t('tray.palette', { hotkey: paletteHotkeyLabel }), click: () => {
        // Ленивый require — palette модуль зависит от mainWindow и переменных.
        try { require('./palette').showPalette(); } catch (e) { console.error(e); }
      }
    },
    { type: 'separator' },
    {
      label: t('tray.enabled'), type: 'checkbox', checked: enabled,
      click: item => {
        storage.setEnabled(item.checked);
        sendToMainWindow('settings-changed', { enabled: item.checked });
        if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu());
      }
    },
    { type: 'separator' },
  ];
  if (process.platform === 'darwin') {
    items.push({
      label: t('tray.resetMenuBar'),
      click: () => {
        const { execFile } = require('child_process');
        execFile('killall', ['SystemUIServer'], () => {
          setTimeout(() => recreateTray('user-requested reset'), 1500);
        });
      },
    });
    items.push({ type: 'separator' });
  }
  items.push({ label: t('tray.quit'), click: () => { app.isQuitting = true; app.quit(); } });
  return Menu.buildFromTemplate(items);
}

// Перерисовать меню (например когда меняется enabled-флаг из renderer).
function updateTrayMenu() {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu());
}

// ── Создание и поддержка видимости ────────────────────────────────────

function createTray() {
  const assets = path.join(__dirname, '..', '..', 'assets');
  const fs = require('fs');

  let icon1x = null, icon2x = null;
  try {
    icon1x = nativeImage.createFromPath(path.join(assets, 'tray-icon.png'));
    if (icon1x.isEmpty()) icon1x = null;
  } catch {}
  try {
    const p2x = path.join(assets, 'tray-icon@2x.png');
    if (fs.existsSync(p2x)) {
      icon2x = nativeImage.createFromPath(p2x);
      if (icon2x.isEmpty()) icon2x = null;
    }
  } catch {}

  // Fallback: если ассеты не загрузились, генерим иконку из кода.
  if (!icon1x) icon1x = nativeImage.createFromBuffer(buildTrayIconBuffer());

  // Windows/Linux: наша tray-иконка нарисована ЧЁРНОЙ (это macOS template).
  // На тёмной панели задач Windows 10/11 чёрная иконка невидима. Перекрашиваем
  // непрозрачные пиксели в белый (форма сохраняется, alpha не трогаем).
  if (process.platform !== 'darwin') {
    icon1x = recolorOpaqueToWhite(icon1x);
    if (icon2x) icon2x = recolorOpaqueToWhite(icon2x);
  }

  // Собираем nativeImage с @1x и @2x представлениями. На обычных дисплеях macOS
  // возьмёт @1x, на Retina — @2x (если есть). Без явного @2x иконка размывается.
  // PNG-ассеты от дизайнера уже нарисованы с правильным запасом поля по периметру,
  // поэтому никакой дополнительный programmatic padding не нужен.
  const templateIcon = nativeImage.createEmpty();
  templateIcon.addRepresentation({ scaleFactor: 1.0, buffer: icon1x.toPNG() });
  if (icon2x) {
    templateIcon.addRepresentation({ scaleFactor: 2.0, buffer: icon2x.toPNG() });
  } else {
    // @2x отсутствует — ресайзим @1x в 2x как fallback.
    const s = icon1x.getSize();
    const x2 = icon1x.resize({ width: s.width * 2, height: s.height * 2 });
    templateIcon.addRepresentation({ scaleFactor: 2.0, buffer: x2.toPNG() });
  }
  if (process.platform === 'darwin') templateIcon.setTemplateImage(true);

  tray = new Tray(templateIcon);
  tray.setToolTip('Snippi');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => getOrCreateWindow().then(w => {
    if (w.isVisible()) w.hide(); else { w.show(); w.focus(); }
  }));

  if (process.platform === 'darwin') scheduleTrayVisibilityCheck();
}

// Проверка: status item получил видимое место в menu bar?
function scheduleTrayVisibilityCheck(initialDelay = 1200) {
  setTimeout(() => {
    if (!tray || tray.isDestroyed()) return;
    let b;
    try { b = tray.getBounds(); } catch { return; }
    // На notched MacBook + macOS Tahoe getBounds возвращает x:0 даже для
    // нормально видимой иконки. Надёжный признак невидимости — height/width=0.
    const invisible = !b || b.height < 4 || b.width < 4;
    if (!invisible) { _trayRetryCount = 0; return; }
    if (_trayRetryCount >= TRAY_MAX_RETRIES) {
      console.warn('[tray] исчерпаны попытки, сбрасываю SystemUIServer как крайнюю меру…');
      try {
        const { execFile } = require('child_process');
        execFile('killall', ['SystemUIServer'], () => {
          _trayRetryCount = 0;
          setTimeout(() => {
            try { if (tray && !tray.isDestroyed()) tray.destroy(); } catch {}
            tray = null;
            try { createTray(); } catch (e) { console.error('[tray] recreate after killall failed:', e.message); }
          }, 1500);
        });
      } catch (e) {
        console.error('[tray] killall SystemUIServer failed:', e.message);
      }
      return;
    }
    _trayRetryCount += 1;
    console.log(`[tray] невидим (bounds ${JSON.stringify(b)}), пересоздаю — попытка ${_trayRetryCount}/${TRAY_MAX_RETRIES}`);
    try { tray.destroy(); } catch {}
    tray = null;
    setTimeout(() => { try { createTray(); } catch (e) { console.error('[tray] recreate failed:', e.message); } },
               Math.min(400 * _trayRetryCount, 2500));
  }, initialDelay);
}

function recreateTray(reason) {
  if (_recreateTimer) clearTimeout(_recreateTimer);
  _recreateTimer = setTimeout(() => {
    _recreateTimer = null;
    console.log(`[tray] пересоздание трея (${reason})`);
    _trayRetryCount = 0;
    try { if (tray && !tray.isDestroyed()) tray.destroy(); } catch {}
    tray = null;
    try { createTray(); } catch (e) { console.error('[tray] recreate failed:', e.message); }
  }, 800);
}

// Подписка на системные события, после которых NSStatusItem зависает.
function registerSystemListeners() {
  if (process.platform !== 'darwin') return;
  try {
    powerMonitor.on('resume',        () => recreateTray('resume from sleep'));
    powerMonitor.on('unlock-screen', () => recreateTray('screen unlock'));
  } catch (e) { console.warn('[tray] powerMonitor unavailable:', e.message); }
  screen.on('display-added',           () => recreateTray('display added'));
  screen.on('display-removed',         () => recreateTray('display removed'));
  screen.on('display-metrics-changed', () => recreateTray('display metrics changed'));
}

module.exports = {
  createTray,
  recreateTray,
  destroyTray,
  updateTrayMenu,
  registerSystemListeners,
  getTray,
};
