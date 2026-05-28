'use strict';

// ══════════════════════════════════════════════════════════════════
//  Snip overlay — выделение прямоугольной области экрана
// ══════════════════════════════════════════════════════════════════

const $ = id => document.getElementById(id);
const rectEl = $('snip-rect');
const sizeEl = $('snip-size');

let startX = 0, startY = 0;
let dragging = false;
let pickedBounds = null;

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function updateRect(x1, y1, x2, y2) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  rectEl.style.left   = x + 'px';
  rectEl.style.top    = y + 'px';
  rectEl.style.width  = w + 'px';
  rectEl.style.height = h + 'px';
  sizeEl.textContent = `${w} × ${h}`;
  // Размер рендерим под рамкой, но если близко к низу экрана — над
  const overY = (y + h + 30) < window.innerHeight ? (y + h + 6) : (y - 26);
  sizeEl.style.left = x + 'px';
  sizeEl.style.top  = overY + 'px';
  return { x, y, w, h };
}

function onMouseDown(e) {
  if (e.button !== 0) return;
  dragging = true;
  startX = e.clientX;
  startY = e.clientY;
  updateRect(startX, startY, startX, startY);
  show(rectEl);
  show(sizeEl);
}

function onMouseMove(e) {
  if (!dragging) return;
  updateRect(startX, startY, e.clientX, e.clientY);
}

function onMouseUp(e) {
  if (!dragging) return;
  dragging = false;
  const b = updateRect(startX, startY, e.clientX, e.clientY);
  // Игнорируем «случайный клик»
  if (b.w < 8 || b.h < 8) {
    hide(rectEl); hide(sizeEl);
    window.api.snipCancel();
    return;
  }
  pickedBounds = b;
  // Прячем UI чтобы при захвате экрана не попало в кадр
  hide(rectEl); hide(sizeEl);
  document.body.style.background = 'transparent';
  // Чуть подождём чтобы кадр без оверлея успел отрендериться
  setTimeout(() => {
    window.api.snipPick({
      x:      b.x,
      y:      b.y,
      width:  b.w,
      height: b.h,
      dpr:    window.devicePixelRatio || 1,
    });
  }, 60);
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    window.api.snipCancel();
  }
}

// Получаем режим (ocr | translate) от main и красим рамку в соответствующий цвет.
try {
  window.api.onSnipMode(mode => {
    document.body.classList.toggle('snip-mode-translate', mode === 'translate');
  });
} catch {}

window.addEventListener('mousedown', onMouseDown);
window.addEventListener('mousemove', onMouseMove);
window.addEventListener('mouseup',   onMouseUp);
window.addEventListener('keydown',   onKeyDown);
