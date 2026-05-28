#!/usr/bin/env node
/**
 * Генерирует иконки приложения — "Caret + expanding lines" (Icon A):
 *   assets/tray-icon.png      — 22×22, RGBA, прозрачный фон (template image, mac)
 *   assets/tray-icon@2x.png   — 44×44, RGBA, прозрачный фон (template image, Retina)
 *   assets/icon.png           — 1024×1024, charcoal + светлая обводка (macOS / Linux)
 *   assets/icon-win.png       — 1024×1024, чистый чёрный фон без обводки (Windows)
 *
 * Запуск: node scripts/create-icon.js
 *
 * Чистый Node, без зависимостей. PNG-чанки кодируются вручную.
 */

'use strict';

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── PNG encoder ──────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const tb = Buffer.from(type, 'ascii');
  const lb = Buffer.allocUnsafe(4);
  const cb = Buffer.allocUnsafe(4);
  lb.writeUInt32BE(data.length);
  cb.writeUInt32BE(crc32(Buffer.concat([tb, data])));
  return Buffer.concat([lb, tb, data, cb]);
}

function buildPNG_RGB(W, H, pixels) {
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = ihdr[11] = ihdr[12] = 0;
  const rows = [];
  for (let y = 0; y < H; y++) {
    rows.push(0);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      rows.push(pixels[i], pixels[i + 1], pixels[i + 2]);
    }
  }
  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = zlib.deflateSync(Buffer.from(rows), { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

function buildPNG_RGBA(W, H, pixels) {
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = ihdr[11] = ihdr[12] = 0;
  const rows = [];
  for (let y = 0; y < H; y++) {
    rows.push(0);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      rows.push(pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]);
    }
  }
  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = zlib.deflateSync(Buffer.from(rows), { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ── Drawing primitives ───────────────────────────────────────────────────

function roundedCov(px, py, x, y, w, h, r) {
  // Returns AA coverage (0..1) of pixel (px,py) inside a rounded rect.
  const x1 = x, y1 = y, x2 = x + w - 1, y2 = y + h - 1;
  if (px < x1 - 0.5 || px > x2 + 0.5 || py < y1 - 0.5 || py > y2 + 0.5) return 0;
  const il = px < x1 + r, ir = px > x2 - r;
  const it = py < y1 + r, ib = py > y2 - r;
  if ((il || ir) && (it || ib)) {
    const cx = il ? x1 + r : x2 - r;
    const cy = it ? y1 + r : y2 - r;
    return Math.max(0, Math.min(1, r - Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) + 0.5));
  }
  return 1;
}

/** Заливка скруглённого прямоугольника на RGBA-буфер. */
function fillRoundRectRGBA(px, W, H, x, y, w, h, r, color, alpha = 1) {
  for (let py = Math.max(0, Math.floor(y)); py <= Math.min(H - 1, Math.ceil(y + h)); py++) {
    for (let pxX = Math.max(0, Math.floor(x)); pxX <= Math.min(W - 1, Math.ceil(x + w)); pxX++) {
      const cov = roundedCov(pxX, py, x, y, w, h, r);
      if (cov > 0) {
        const a = Math.min(1, cov * alpha);
        const i = (py * W + pxX) * 4;
        const da = px[i + 3] / 255;
        const outA = a + da * (1 - a);
        if (outA > 0) {
          px[i]     = Math.round((color[0] * a + px[i]     * da * (1 - a)) / outA);
          px[i + 1] = Math.round((color[1] * a + px[i + 1] * da * (1 - a)) / outA);
          px[i + 2] = Math.round((color[2] * a + px[i + 2] * da * (1 - a)) / outA);
          px[i + 3] = Math.round(outA * 255);
        }
      }
    }
  }
}

/** Заливка скруглённого прямоугольника на RGB-буфер. fill уже должен быть. */
function fillRoundRectRGB(px, W, H, x, y, w, h, r, color, alpha = 1) {
  for (let py = Math.max(0, Math.floor(y)); py <= Math.min(H - 1, Math.ceil(y + h)); py++) {
    for (let pxX = Math.max(0, Math.floor(x)); pxX <= Math.min(W - 1, Math.ceil(x + w)); pxX++) {
      const cov = roundedCov(pxX, py, x, y, w, h, r);
      if (cov > 0) {
        const a = cov * alpha;
        const i = (py * W + pxX) * 3;
        px[i]     = Math.round(color[0] * a + px[i]     * (1 - a));
        px[i + 1] = Math.round(color[1] * a + px[i + 1] * (1 - a));
        px[i + 2] = Math.round(color[2] * a + px[i + 2] * (1 - a));
      }
    }
  }
}

/**
 * Тонкая внутренняя обводка скруглённого прямоугольника — рисуется как
 * разность покрытий внешнего и внутреннего (уменьшенного на lw) контуров.
 * colorFn(y) -> [r,g,b,alpha] — позволяет градиент сверху-вниз.
 */
function strokeRoundRectInsetRGB(px, W, H, x, y, w, h, r, lw, colorFn) {
  const ix = x + lw, iy = y + lw, iw = w - lw * 2, ih = h - lw * 2;
  const ir = Math.max(0, r - lw);
  for (let py = Math.max(0, Math.floor(y)); py <= Math.min(H - 1, Math.ceil(y + h)); py++) {
    for (let pxX = Math.max(0, Math.floor(x)); pxX <= Math.min(W - 1, Math.ceil(x + w)); pxX++) {
      const outer = roundedCov(pxX, py, x, y, w, h, r);
      if (outer <= 0) continue;
      const inner = roundedCov(pxX, py, ix, iy, iw, ih, ir);
      const cov = Math.max(0, outer - inner);
      if (cov > 0) {
        const c = colorFn(py);
        const a = cov * c[3];
        const i = (py * W + pxX) * 3;
        px[i]     = Math.round(c[0] * a + px[i]     * (1 - a));
        px[i + 1] = Math.round(c[1] * a + px[i + 1] * (1 - a));
        px[i + 2] = Math.round(c[2] * a + px[i + 2] * (1 - a));
      }
    }
  }
}

function save(relPath, buf) {
  const abs = path.join(__dirname, '..', relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);
  console.log('✓', relPath);
}

// ── Caret helper (рисует каретку + хвост на любом фоне) ──────────────────

function drawCaret(px, W, H, S) {
  const k = S / 128;
  const white = [255, 255, 255];
  const fill = (x, y, w, h, r, a = 1) =>
    fillRoundRectRGB(px, W, H, x * k, y * k, w * k, h * k, r * k, white, a);
  // caret stem + serifs
  fill(26, 38,  6, 52, 2.5);
  fill(18, 34, 22,  5, 2);
  fill(18, 89, 22,  5, 2);
  // expanding tail
  fill(44, 60, 32, 3.2, 1.6, 0.95);
  fill(44, 68, 48, 3.2, 1.6, 0.55);
  fill(44, 76, 38, 3.2, 1.6, 0.25);
}

// ── 1. Tray icon — template image, RGBA on transparent ───────────────────

function buildTray(size) {
  const W = size, H = size;
  const px = new Uint8Array(W * H * 4);
  const k = size / 22;
  const black = [0, 0, 0];
  fillRoundRectRGBA(px, W, H, 10 * k,        2 * k,  2 * k, 18 * k, 0.6 * k, black);
  fillRoundRectRGBA(px, W, H,  4 * k,        2 * k, 14 * k, 2.4 * k, 1 * k, black);
  fillRoundRectRGBA(px, W, H,  4 * k, 17.6 * k, 14 * k, 2.4 * k, 1 * k, black);
  return buildPNG_RGBA(W, H, px);
}

save('assets/tray-icon.png',    buildTray(22));
save('assets/tray-icon@2x.png', buildTray(44));

// ── 2. macOS / Linux icon — charcoal squircle + светлая обводка ─────────
//    Тонкий блик сверху, тень снизу, яркая обводка по периметру squircle.
//    macOS сам маскирует к squircle через .icns; Linux DEs обычно тоже.

{
  const S = 1024;
  const R = S * 0.225;
  const bgTop = [42, 44, 51];   // #2a2c33
  const bgBot = [24, 25, 30];   // #18191e
  const px = new Uint8Array(S * S * 3);

  // gradient fill (всё полотно)
  for (let y = 0; y < S; y++) {
    const t = y / (S - 1);
    const r = Math.round(bgTop[0] * (1 - t) + bgBot[0] * t);
    const g = Math.round(bgTop[1] * (1 - t) + bgBot[1] * t);
    const b = Math.round(bgTop[2] * (1 - t) + bgBot[2] * t);
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 3;
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
    }
  }

  // мягкий блик сверху
  const hlH = Math.floor(S * 0.55);
  for (let y = 0; y < hlH; y++) {
    const a = 0.10 * (1 - y / hlH);
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 3;
      px[i]     = Math.round(255 * a + px[i]     * (1 - a));
      px[i + 1] = Math.round(255 * a + px[i + 1] * (1 - a));
      px[i + 2] = Math.round(255 * a + px[i + 2] * (1 - a));
    }
  }

  // тень снизу
  const shStart = Math.floor(S * 0.55);
  for (let y = shStart; y < S; y++) {
    const a = 0.20 * ((y - shStart) / (S - shStart));
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 3;
      px[i]     = Math.round(px[i]     * (1 - a));
      px[i + 1] = Math.round(px[i + 1] * (1 - a));
      px[i + 2] = Math.round(px[i + 2] * (1 - a));
    }
  }

  // каретка
  drawCaret(px, S, S, S);

  // обводка — яркая сверху, мягкая снизу
  const lw = S * 0.014;
  strokeRoundRectInsetRGB(px, S, S, 0, 0, S, S, R, lw, (y) => {
    const t = y / (S - 1);
    let a;
    if (t < 0.35)      a = 0.55 - (0.55 - 0.22) * (t / 0.35);
    else if (t < 0.70) a = 0.22 - (0.22 - 0.10) * ((t - 0.35) / 0.35);
    else               a = 0.10 + (0.18 - 0.10) * ((t - 0.70) / 0.30);
    return [255, 255, 255, a];
  });

  save('assets/icon.png', buildPNG_RGB(S, S, px));
}

// ── 3. Windows icon — чистый тёмный фон без обводки ──────────────────────
//    На Windows иконка отображается «как есть» в панели задач — обводка
//    не нужна, фон сделан темнее, ближе к классическому app-icon чёрному.

{
  const S = 1024;
  const bgTop = [22, 23, 27];   // #16171b
  const bgBot = [10, 11, 13];   // #0a0b0d
  const px = new Uint8Array(S * S * 3);

  for (let y = 0; y < S; y++) {
    const t = y / (S - 1);
    const r = Math.round(bgTop[0] * (1 - t) + bgBot[0] * t);
    const g = Math.round(bgTop[1] * (1 - t) + bgBot[1] * t);
    const b = Math.round(bgTop[2] * (1 - t) + bgBot[2] * t);
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 3;
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
    }
  }

  // очень лёгкий блик
  for (let y = 0; y < S / 2; y++) {
    const a = 0.04 * (1 - y / (S / 2));
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 3;
      px[i]     = Math.round(255 * a + px[i]     * (1 - a));
      px[i + 1] = Math.round(255 * a + px[i + 1] * (1 - a));
      px[i + 2] = Math.round(255 * a + px[i + 2] * (1 - a));
    }
  }

  drawCaret(px, S, S, S);

  save('assets/icon-win.png', buildPNG_RGB(S, S, px));
}

console.log('\nГотово! Дальше:');
console.log('  npm run build:mac    — macOS (.dmg)');
console.log('  npm run build:win    — Windows (.exe)');
console.log('  npm run build:linux  — Linux (.AppImage)');
