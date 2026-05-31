'use strict';
/* ════════════════════════════════════════════════════════════════
   Мини-Markdown парсер для rich-сниппетов.

   Цели и не-цели:
     • Хватает для типичных сниппетов: подписи, шаблоны писем, ссылки,
       списки, выделение жирным/курсивом.
     • НЕ полная CommonMark-реализация — не нужны вложенные блоки,
       таблицы, footnotes. Это сниппеты, не статьи.
     • Без зависимостей — ~3 КБ кода вместо ~50 КБ marked/markdown-it.

   Поддерживается:
     **bold** / __bold__              → <strong>
     *italic* / _italic_              → <em>
     ~~strike~~                       → <del>
     `code`                           → <code>
     [text](url)                      → <a href="url">
     # H1 / ## H2 / ### H3            (в начале строки)
     > quote                          → <blockquote>
     - / * item                       → <ul><li>
     1. item                          → <ol><li>
     ---                              → <hr>
     \n\n                             → разрыв абзаца
     \n                               → <br>
════════════════════════════════════════════════════════════════ */

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[c]));
}

// Инлайн-форматирование (бежит внутри одной строки).
// Делаем в правильном порядке: code сначала (внутри code не должно ничего
// парситься), потом ссылки, потом bold/italic/strike.
function renderInline(s) {
  // Защищаем code-блоки плейсхолдерами чтобы их содержимое не парсилось.
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${escapeHtml(c)}</code>`);
    return `\x00CODE${codes.length - 1}\x00`;
  });

  // Escape всё что осталось (защита от XSS из пользовательских данных в API).
  s = escapeHtml(s);

  // Ссылки [text](url) — url ограничиваем http(s):/mailto:/относительными
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, url) => {
    const safeUrl = /^(https?:|mailto:|\/|#)/i.test(url) ? url : '#';
    return `<a href="${safeUrl}" target="_blank" rel="noopener">${text}</a>`;
  });

  // Bold / italic / strike (порядок важен: жадные ** ДО *)
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_\n]+)__/g,     '<strong>$1</strong>');
  s = s.replace(/~~([^~\n]+)~~/g,     '<del>$1</del>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^_])_([^_\n]+)_/g,   '$1<em>$2</em>');

  // Возвращаем code-блоки
  s = s.replace(/\x00CODE(\d+)\x00/g, (_, i) => codes[+i]);
  return s;
}

/**
 * Markdown → HTML. Минимальный, для rich-сниппетов.
 * @param {string} md
 * @returns {string} HTML (внутри неявного <body>, без обёртки)
 */
function markdownToHtml(md) {
  if (!md) return '';

  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  // Контейнеры для группировки многострочных блоков
  let paragraph = [];
  let list = null; // { type: 'ul'|'ol', items: [...] }

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push('<p>' + paragraph.map(renderInline).join('<br>') + '</p>');
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list.type}>` +
        list.items.map(it => '<li>' + renderInline(it) + '</li>').join('') +
        `</${list.type}>`);
      list = null;
    }
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');

    if (line === '') {
      flushParagraph();
      flushList();
      i++; continue;
    }

    // Заголовки
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      flushParagraph(); flushList();
      const level = h[1].length;
      out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      i++; continue;
    }

    // Горизонтальная линия
    if (/^---+$/.test(line) || /^\*\*\*+$/.test(line)) {
      flushParagraph(); flushList();
      out.push('<hr>');
      i++; continue;
    }

    // Цитата
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      flushParagraph(); flushList();
      // Собираем подряд идущие цитаты в один blockquote
      const quoteLines = [q[1]];
      while (i + 1 < lines.length && /^>\s?/.test(lines[i + 1])) {
        quoteLines.push(lines[i + 1].replace(/^>\s?/, ''));
        i++;
      }
      out.push('<blockquote>' + quoteLines.map(renderInline).join('<br>') + '</blockquote>');
      i++; continue;
    }

    // Маркированный список
    const ul = /^[-*+]\s+(.+)$/.exec(line);
    if (ul) {
      flushParagraph();
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; }
      list.items.push(ul[1]);
      i++; continue;
    }

    // Нумерованный список
    const ol = /^\d+\.\s+(.+)$/.exec(line);
    if (ol) {
      flushParagraph();
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; }
      list.items.push(ol[1]);
      i++; continue;
    }

    // Обычная строка — копим в параграф
    flushList();
    paragraph.push(line);
    i++;
  }

  flushParagraph();
  flushList();
  return out.join('\n');
}

/**
 * Грубая HTML → plain text для clipboard fallback.
 * Не парсим тэги — просто чистим, чтобы Cmd+V в Terminal вставил вменяемое.
 */
function htmlToPlain(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { markdownToHtml, htmlToPlain };
