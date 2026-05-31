'use strict';
/* ════════════════════════════════════════════════════════════════
   Импортёры сниппетов из других text-expander'ов.

   Поддерживается:
     • Snippi — нативный JSON-формат (export-data)
     • Espanso — YAML-файлы match (https://espanso.org/docs/matches/basics/)
     • Raycast — JSON-экспорт сниппетов (https://www.raycast.com/manual/snippets)
     • TextExpander → Raycast format — JSON от wesbos/textexpander-to-raycast

   Все парсеры возвращают единый формат:
     [{ trigger, replacement, format: 'plain'|'rich' }, ...]
   Storage сам выкинет дубликаты и невалидные записи.

   Без npm-зависимостей — простые парсеры на регулярках/JSON.parse.
   Для Espanso реализован минимальный YAML-парсер для случая "matches:".
════════════════════════════════════════════════════════════════ */

// ── Snippi (наш собственный формат) ──────────────────────────────
function parseSnippi(text) {
  const data = JSON.parse(text);
  // Возвращаем весь объект — у Snippi есть groups/keybindings, не только сниппеты.
  // Старая логика storage.importData справится сама.
  return { kind: 'snippi-full', data };
}

// ── Raycast JSON-экспорт ─────────────────────────────────────────
// Формат: массив { name, keyword, text } или объект { snippets: [...] }.
function parseRaycast(text) {
  const json = JSON.parse(text);
  const list = Array.isArray(json) ? json : (json.snippets || []);
  const snippets = list
    .filter(s => s && (s.keyword || s.shortcut) && (s.text || s.snippet))
    .map(s => ({
      trigger:     String(s.keyword || s.shortcut).trim(),
      replacement: String(s.text || s.snippet),
      format:      'plain',
    }));
  return { kind: 'snippets-only', snippets };
}

// ── TextExpander (через формат Raycast — wesbos/textexpander-to-raycast) ──
// Поддерживаем тот же JSON-формат, что Raycast — это де-факто стандарт миграции.
function parseTextExpander(text) {
  return parseRaycast(text);
}

// ── Espanso YAML ─────────────────────────────────────────────────
// Espanso поддерживает много сложного (vars, regex, форма) — берём только
// базовое: trigger/triggers (массив) + replace (строка или multi-line block).
function parseEspanso(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const matches = [];

  // Стейт-машина: ищем `matches:`, потом каждый `- trigger:` / `- triggers:` запускает новую запись.
  let inMatches = false;
  let cur = null;          // { trigger, triggers, replace }
  let collecting = null;   // 'literal' | 'folded' | null — collect multi-line `replace: |` / `>`
  let indent = 0;          // базовый отступ для multi-line блока
  let collectedLines = [];

  function commit() {
    if (cur) {
      const triggers = (cur.triggers && cur.triggers.length) ? cur.triggers
                     : (cur.trigger ? [cur.trigger] : []);
      const replace = collecting ? collectMultiline() : cur.replace;
      for (const tr of triggers) {
        if (tr && replace !== undefined && replace !== null) {
          matches.push({
            trigger:     String(tr).trim(),
            replacement: String(replace),
            format:      'plain',
          });
        }
      }
    }
    cur = null;
    collecting = null;
    collectedLines = [];
  }

  function collectMultiline() {
    // literal `|` — переводы строк сохраняются, в конце один \n
    // folded `>` — переводы строк превращаются в пробелы (упрощённо склеиваем)
    const joined = collecting === 'literal'
      ? collectedLines.join('\n')
      : collectedLines.join(' ').replace(/\s+/g, ' ').trim();
    return joined;
  }

  function stripQuotes(s) {
    if (!s) return s;
    if ((s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
    }
    return s;
  }

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];

    // Если идёт мульти-строчный сбор — проверяем отступ
    if (collecting) {
      if (raw.trim() === '') {
        if (collecting === 'literal') collectedLines.push('');
        continue;
      }
      const m = /^(\s*)(.*)$/.exec(raw);
      const lineIndent = m[1].length;
      // Первая непустая строка устанавливает indent блока
      if (indent === 0) indent = lineIndent;
      if (lineIndent >= indent) {
        collectedLines.push(raw.slice(indent));
        continue;
      }
      // Отступ меньше — блок закончился
      cur.replace = collectMultiline();
      collecting = null;
      collectedLines = [];
      indent = 0;
      // не continue — текущая строка должна обработаться ниже
    }

    const trimmed = raw.replace(/\s+$/, '');
    if (trimmed === '' || /^\s*#/.test(trimmed)) continue;

    // Ищем `matches:` на корне
    if (!inMatches) {
      if (/^matches\s*:/.test(trimmed)) inMatches = true;
      continue;
    }

    // Новая запись: `  - trigger: "..."` или `  - triggers:`
    const startMatch = /^\s*-\s+(trigger|triggers)\s*:\s*(.*)$/.exec(trimmed);
    if (startMatch) {
      commit();
      cur = { trigger: null, triggers: [], replace: undefined };
      if (startMatch[1] === 'trigger') {
        cur.trigger = stripQuotes(startMatch[2].trim());
      } else {
        // triggers — массив либо inline [...] либо на след. строках
        const rest = startMatch[2].trim();
        if (rest.startsWith('[') && rest.endsWith(']')) {
          cur.triggers = rest.slice(1, -1).split(',').map(s => stripQuotes(s.trim()));
        }
        // если массив на след. строках с "  - val" — обработаем ниже как доп. триггер
      }
      continue;
    }

    if (!cur) continue;

    // `  - "value"` — продолжение triggers-массива
    const triggerListItem = /^\s*-\s+"?(.+?)"?\s*$/.exec(trimmed);
    if (triggerListItem && cur.triggers && !cur.trigger && cur.replace === undefined) {
      cur.triggers.push(stripQuotes(triggerListItem[1]));
      continue;
    }

    // `    replace: ...`
    const repl = /^\s*replace\s*:\s*(.*)$/.exec(trimmed);
    if (repl) {
      const v = repl[1].trim();
      if (v === '|' || v === '|-' || v === '|+') {
        collecting = 'literal';
        indent = 0; // выставится на первой непустой строке блока
        collectedLines = [];
      } else if (v === '>' || v === '>-' || v === '>+') {
        collecting = 'folded';
        indent = 0;
        collectedLines = [];
      } else {
        cur.replace = stripQuotes(v);
      }
      continue;
    }

    // игнорируем vars, form, label, etc. — мы их не поддерживаем
  }

  commit();

  return { kind: 'snippets-only', snippets: matches };
}

/**
 * Главная точка входа — выбирает парсер по source.
 * @param {string} source — 'snippi' | 'espanso' | 'raycast' | 'textexpander'
 * @param {string} text   — содержимое файла
 */
function parseImport(source, text) {
  switch (source) {
    case 'snippi':       return parseSnippi(text);
    case 'espanso':      return parseEspanso(text);
    case 'raycast':      return parseRaycast(text);
    case 'textexpander': return parseTextExpander(text);
    default: throw new Error('Unknown import source: ' + source);
  }
}

module.exports = { parseImport, parseEspanso, parseRaycast, parseTextExpander, parseSnippi };
