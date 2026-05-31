'use strict';

// ══════════════════════════════════════════════════════════════════
//  OCR — распознавание текста из PNG-файла.
//  macOS: нативный Swift-хелпер с Vision Framework (нулевые зависимости)
//  Windows/Linux: tesseract.js (загружается лениво, language pack качается
//  при первом использовании)
// ══════════════════════════════════════════════════════════════════

const { spawn } = require('child_process');
const fs        = require('fs');
const path      = require('path');
const { t }     = require('./i18n');

// ── Путь к Swift-хелперу (macOS) ──────────────────────────────────
function getMacOcrHelper() {
  if (process.platform !== 'darwin') return null;
  try {
    const { app } = require('electron');
    return app.isPackaged
      ? path.join(process.resourcesPath, 'ocr-helper')
      : path.join(__dirname, '..', 'native', 'ocr-helper');
  } catch {
    return path.join(__dirname, '..', 'native', 'ocr-helper');
  }
}

// ── macOS: Apple Vision Framework через ocr-helper ────────────────
function ocrMac(imagePath) {
  const helper = getMacOcrHelper();
  if (!helper || !fs.existsSync(helper)) {
    return Promise.reject(new Error(t('err.ocrHelperMissing')));
  }
  return new Promise((resolve, reject) => {
    const proc = spawn(helper, [imagePath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    proc.stdout.on('data', d => { out += d.toString('utf8'); });
    proc.stderr.on('data', d => { err += d.toString('utf8'); });
    const t = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      reject(new Error('OCR timeout'));
    }, 15000);
    proc.on('error', e => { clearTimeout(t); reject(e); });
    proc.on('exit', code => {
      clearTimeout(t);
      if (code === 0) resolve(out);
      else            reject(new Error(`ocr-helper exited ${code}: ${err.trim()}`));
    });
  });
}

// ── Windows / Linux: tesseract.js ─────────────────────────────────
// Используем eng+rus как разумный default — Tesseract нормально работает
// со смешанным контентом и без auto-detect.
let _tesseractWorker = null;
async function ocrTesseract(imagePath) {
  // Ленивая загрузка модуля чтобы не платить памятью на macOS
  const Tesseract = require('tesseract.js');
  if (!_tesseractWorker) {
    // eng + rus + ukr + deu — наиболее частый набор для нашей аудитории
    _tesseractWorker = await Tesseract.createWorker(['eng', 'rus', 'ukr', 'deu'], 1, {
      // Прячем шумный лог в консоль
      logger: () => {},
    });
  }
  const { data } = await _tesseractWorker.recognize(imagePath);
  return data.text || '';
}

// ── Пост-обработка: dehyphenation (убрать переносы слов) ──────────
// В книжных изданиях слова часто переносятся дефисом на следующую строку:
//   "Начинает-\nся" → должно стать "Начинается"
// Эвристика: буква + дефис (или soft-hyphen) + перевод строки + строчная буква
// → склеиваем без дефиса. Если после дефиса заглавная буква — это составное
// слово (например, "Мамина-Сибиряк"), не трогаем.
function dehyphenate(text) {
  if (!text) return text;
  return text.replace(/(\p{L})[-­]\s*\n\s*(\p{Ll})/gu, '$1$2');
}

// ── Пост-обработка: «склеить параграфы» ───────────────────────────
// OCR возвращает каждую визуальную строку отдельно. Чистая склейка через
// пробел плохо работает с UI (кнопки, лейблы), хорошо — с прозой.
// Эвристика:
//   • строка короткая (<40 симв) ИЛИ заканчивается на ".", "!", "?" → новый абзац
//   • длинная и без терминатора → объединяем со следующей через пробел
// Это сохраняет переносы для UI-элементов и склеивает текст в прозе.
function joinParagraphs(text) {
  if (!text) return '';
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
                    .map(l => l.replace(/\s+$/, ''));   // trim только справа

  const out = [];
  let cur = '';
  const flush = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };

  const TERMINATORS = /[.!?…»\)"\]]$/;       // конец мысли
  const SHORT_LINE  = 40;                     // короче — это UI-элемент / заголовок

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') { flush(); out.push(''); continue; }

    if (!cur) {
      cur = line;
      continue;
    }

    // Решаем: продолжение текущей мысли или новый абзац
    const prevIsShort = cur.length < SHORT_LINE;
    const prevEndsSentence = TERMINATORS.test(cur);
    const curIsShort = line.length < SHORT_LINE;

    // UI-эвристика: если предыдущая или текущая строка короткая ИЛИ
    // предыдущая закончилась знаком препинания → новая строка
    if (prevIsShort || curIsShort || prevEndsSentence) {
      flush();
      cur = line;
    } else {
      // Длинная проза без терминатора → продолжение
      cur += ' ' + line;
    }
  }
  flush();

  // Сворачиваем серии пустых строк
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Главная точка входа ───────────────────────────────────────────
async function recognize(imagePath, { joinParagraphs: doJoin = true } = {}) {
  if (!fs.existsSync(imagePath)) throw new Error(t('err.fileNotFound', { path: imagePath }));

  let raw;
  if (process.platform === 'darwin') {
    try {
      raw = await ocrMac(imagePath);
    } catch (err) {
      // Если Swift-хелпер не скомпилирован — fallback на tesseract.js
      console.warn('[ocr] mac helper failed, falling back to tesseract:', err.message);
      raw = await ocrTesseract(imagePath);
    }
  } else {
    raw = await ocrTesseract(imagePath);
  }
  // Сначала убираем переносы слов (raw-уровень — здесь видны переводы строк)
  const dehyphenated = dehyphenate(raw);
  const processed = doJoin
    ? joinParagraphs(dehyphenated)
    : dehyphenated.replace(/\r\n?/g, '\n').trim();
  return { text: processed, raw };
}

async function shutdown() {
  if (_tesseractWorker) {
    try { await _tesseractWorker.terminate(); } catch {}
    _tesseractWorker = null;
  }
}

module.exports = { recognize, joinParagraphs, shutdown };
