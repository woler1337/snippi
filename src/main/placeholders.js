'use strict';
/* ════════════════════════════════════════════════════════════════
   Динамические плейсхолдеры в сниппетах.

   Поддерживается:
     {date}                       — текущая дата (YYYY-MM-DD)
     {time}                       — текущее время (HH:mm:ss)
     {datetime}                   — дата+время (YYYY-MM-DD HH:mm:ss)
     {date:YYYY.MM.DD}            — кастомный формат (токены: YYYY YY MM DD HH mm ss)
     {date:+7d}                   — арифметика: +7 дней (s/m/h/d/M/y)
     {date:-1M:YYYY-MM-DD}        — арифметика + кастомный формат

     {clipboard} / {clip}         — последний элемент истории буфера
     {clip:0} / {clip:1} / …      — N-й элемент истории (0 — самый свежий)

     {uuid}                       — случайный UUID v4
     {random:1-100}               — случайное число в диапазоне (включительно)

     {upper:текст}                — ВЕРХНИЙ РЕГИСТР
     {lower:текст}                — нижний регистр
     {capitalize:текст}           — Первая буква заглавная
     {reverse:текст}              — обратный порядок символов
     {trim:текст}                 — обрезать пробелы по краям

   Маркер курсора {|} обрабатывается ОТДЕЛЬНО, после раскрытия плейсхолдеров,
   в expander.js → parseCursorMarker.
════════════════════════════════════════════════════════════════ */

const crypto = require('crypto');

const PAD = n => String(n).padStart(2, '0');

const DATE_TOKENS = {
  YYYY: d => d.getFullYear(),
  YY:   d => PAD(d.getFullYear() % 100),
  MM:   d => PAD(d.getMonth() + 1),
  DD:   d => PAD(d.getDate()),
  HH:   d => PAD(d.getHours()),
  mm:   d => PAD(d.getMinutes()),
  ss:   d => PAD(d.getSeconds()),
};

function formatDate(d, format) {
  // Регулярка собрана так, чтобы YYYY матчилось ДО YY (длина сортирует).
  return format.replace(/YYYY|YY|MM|DD|HH|mm|ss/g, tok => DATE_TOKENS[tok](d));
}

// expr: +7d, -1m, +2h, -30s, +1M (Month), +1y, +1y …
// Единицы: s, m, h, d, M (месяц), y. m — минуты, M — месяцы (как в moment).
function applyArithmetic(d, expr) {
  const m = /^([+-])(\d+)([smhdMy])$/.exec(expr);
  if (!m) return d;
  const sign = m[1] === '+' ? 1 : -1;
  const n = parseInt(m[2], 10) * sign;
  const out = new Date(d);
  switch (m[3]) {
    case 's': out.setSeconds(out.getSeconds() + n); break;
    case 'm': out.setMinutes(out.getMinutes() + n); break;
    case 'h': out.setHours  (out.getHours()   + n); break;
    case 'd': out.setDate   (out.getDate()    + n); break;
    case 'M': out.setMonth  (out.getMonth()   + n); break;
    case 'y': out.setFullYear(out.getFullYear() + n); break;
  }
  return out;
}

// spec: undefined | "format" | "arithmetic" | "arithmetic:format"
function resolveDateTime(type, spec, now) {
  let d = now;
  let format = null;

  if (spec) {
    // Берём первый кусок до ":" — если это арифметика, применяем.
    // Иначе ВСЯ spec считается форматом (формат может содержать ":" — например "HH:mm").
    const colonIdx = spec.indexOf(':');
    const head = colonIdx === -1 ? spec : spec.slice(0, colonIdx);
    if (/^[+-]\d+[smhdMy]$/.test(head)) {
      d = applyArithmetic(d, head);
      format = colonIdx === -1 ? null : spec.slice(colonIdx + 1);
    } else {
      format = spec;
    }
  }

  if (!format) {
    if      (type === 'date') format = 'YYYY-MM-DD';
    else if (type === 'time') format = 'HH:mm:ss';
    else                      format = 'YYYY-MM-DD HH:mm:ss';
  }

  return formatDate(d, format);
}

function applyModifier(mod, text) {
  switch (mod.toLowerCase()) {
    case 'upper':      return text.toUpperCase();
    case 'lower':      return text.toLowerCase();
    case 'capitalize': return text.length ? text[0].toUpperCase() + text.slice(1) : text;
    case 'reverse':    return [...text].reverse().join('');
    case 'trim':       return text.trim();
    default:           return text;
  }
}

/**
 * Раскрыть все плейсхолдеры в тексте.
 * @param {string} text — исходный шаблон сниппета.
 * @param {object} [ctx]
 * @param {Array<{text:string}>} [ctx.clipboardHistory] — для {clip:N}.
 * @param {Date} [ctx.now] — для тестов; по умолчанию new Date().
 * @returns {string}
 */
function processPlaceholders(text, ctx = {}) {
  if (!text || text.indexOf('{') === -1) return text;

  const clipboardHistory = ctx.clipboardHistory || [];
  const now              = ctx.now             || new Date();

  return text
    // {date} / {time} / {datetime} с опциональными арифметикой и форматом
    .replace(/\{(date|time|datetime)(?::([^}]+))?\}/g, (m, type, spec) => {
      try   { return resolveDateTime(type, spec, now); }
      catch { return m; }
    })
    // {clipboard} / {clip} / {clip:N}
    .replace(/\{(?:clipboard|clip)(?::(\d+))?\}/g, (_, idx) => {
      const i = idx ? parseInt(idx, 10) : 0;
      const entry = clipboardHistory[i];
      return entry && typeof entry.text === 'string' ? entry.text : '';
    })
    // {uuid}
    .replace(/\{uuid\}/g, () => crypto.randomUUID())
    // {random:a-b}
    .replace(/\{random:(-?\d+)-(-?\d+)\}/g, (_, a, b) => {
      const lo = Math.min(+a, +b);
      const hi = Math.max(+a, +b);
      return String(Math.floor(Math.random() * (hi - lo + 1)) + lo);
    })
    // {upper|lower|capitalize|reverse|trim:текст}
    .replace(/\{(upper|lower|capitalize|reverse|trim):([^}]*)\}/g,
             (_, mod, t) => applyModifier(mod, t));
}

// ── Заполняемые поля (fill-in) ────────────────────────────────────
// Синтаксис: {?Метка} или {?Метка=значение по умолчанию}.
// При вставке такого сниппета приложение спрашивает значения через форму.
// Одинаковые метки заполняются один раз и подставляются во все вхождения.
// Префикс `?` выбран чтобы не конфликтовать с {date}/{clip}/{upper:…} и т.п.
function fieldRe() { return /\{\?([^}=]+?)(?:=([^}]*))?\}/g; }

function hasFields(text) {
  return !!text && fieldRe().test(text);
}

// Возвращает упорядоченный список уникальных полей: [{ label, def }].
function extractFields(text) {
  const out = [];
  const seen = new Set();
  if (!text) return out;
  const re = fieldRe();
  let m;
  while ((m = re.exec(text)) !== null) {
    const label = m[1].trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, def: m[2] !== undefined ? m[2] : '' });
  }
  return out;
}

// Подставляет значения полей. values — объект { метка: значение } (регистр метки не важен).
function applyFields(text, values) {
  if (!text) return text;
  const map = {};
  for (const k in (values || {})) map[String(k).trim().toLowerCase()] = values[k];
  return text.replace(fieldRe(), (_m, label, def) => {
    const key = String(label).trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(map, key)) return String(map[key]);
    return def !== undefined ? def : '';
  });
}

module.exports = { processPlaceholders, hasFields, extractFields, applyFields };
