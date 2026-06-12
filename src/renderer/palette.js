'use strict';
/* ════════════════════════════════════════════════════════════════
   Палитра быстрого поиска сниппетов
   — fuzzy search по триггеру и тексту замены
   — ↑↓ навигация, Enter вставить, Esc закрыть
════════════════════════════════════════════════════════════════ */

const $q     = document.getElementById('q');
const $list  = document.getElementById('list');
const $empty = document.getElementById('empty');

let snippets   = [];
let groups     = [];
let filtered   = [];
let selected   = 0;
const MAX_VISIBLE = 100;

// Простой fuzzy-скор: возвращает >0 если все буквы query встречаются в
// строке в нужном порядке. Чем плотнее — тем больше score. 0 = нет.
function fuzzyScore(query, str) {
  if (!query) return 1;
  const q = query.toLowerCase();
  const s = str.toLowerCase();
  let qi = 0, score = 0, streak = 0;
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) {
      qi++; streak++;
      score += 1 + streak * 2;            // плотные подряд = бонус
      if (i === 0)                score += 10;  // начало строки
      else if (s[i - 1] === ' ')  score += 5;   // начало слова
    } else {
      streak = 0;
    }
  }
  return qi === q.length ? score : 0;
}

function highlight(str, query) {
  if (!query) return escapeHtml(str);
  const q = query.toLowerCase();
  const s = str;
  let out = ''; let qi = 0;
  for (let i = 0; i < s.length; i++) {
    if (qi < q.length && s[i].toLowerCase() === q[qi]) {
      out += '<mark>' + escapeHtml(s[i]) + '</mark>';
      qi++;
    } else out += escapeHtml(s[i]);
  }
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function snippetPreview(s) {
  const t = (s.replacement || '').replace(/\s+/g, ' ').trim();
  return t.length > 140 ? t.slice(0, 140) + '…' : t;
}

function groupName(id) {
  if (!id) return '';
  const g = groups.find(g => g.id === id);
  return g ? g.name : '';
}

function refilter() {
  const q = $q.value.trim();
  const scored = snippets
    .map(s => {
      const a = fuzzyScore(q, s.trigger || '');
      const b = fuzzyScore(q, s.replacement || '');
      // Триггер важнее (×3), но совпадение в тексте тоже учитывается.
      const score = a * 3 + b;
      return { s, score };
    })
    .filter(x => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, MAX_VISIBLE)
    .map(x => x.s);
  filtered = scored;
  selected = 0;
  render();
}

function render() {
  if (filtered.length === 0) {
    $list.innerHTML = '';
    $empty.classList.remove('hidden');
    return;
  }
  $empty.classList.add('hidden');
  const q = $q.value.trim();
  const html = filtered.map((s, i) => `
    <li class="item${i === selected ? ' active' : ''}" data-i="${i}">
      <span class="trigger-chip">${highlight(s.trigger || '', q)}</span>
      <span class="preview">${highlight(snippetPreview(s), q)}</span>
      ${groupName(s.groupId) ? `<span class="group-tag">${escapeHtml(groupName(s.groupId))}</span>` : ''}
    </li>
  `).join('');
  $list.innerHTML = html;
  // Прокрутить выделенное в видимую область
  const el = $list.querySelector('.item.active');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

function moveSel(delta) {
  if (filtered.length === 0) return;
  selected = (selected + delta + filtered.length) % filtered.length;
  render();
}

function pickCurrent() {
  if (filtered.length === 0) return;
  const s = filtered[selected];
  if (!s) return;
  window.paletteApi.paste(s.replacement || '', s.format);
}

// ── Обработчики ввода ──────────────────────────────────────────

$q.addEventListener('input', refilter);

window.addEventListener('keydown', e => {
  if (e.key === 'Escape')           { e.preventDefault(); window.paletteApi.close(); }
  else if (e.key === 'ArrowDown')   { e.preventDefault(); moveSel(+1); }
  else if (e.key === 'ArrowUp')     { e.preventDefault(); moveSel(-1); }
  else if (e.key === 'Enter')       { e.preventDefault(); pickCurrent(); }
  else if (e.key === 'Tab')         { e.preventDefault(); moveSel(e.shiftKey ? -1 : +1); }
});

$list.addEventListener('click', e => {
  const li = e.target.closest('.item'); if (!li) return;
  selected = +li.dataset.i;
  pickCurrent();
});

$list.addEventListener('mousemove', e => {
  const li = e.target.closest('.item'); if (!li) return;
  const i = +li.dataset.i;
  if (i !== selected) { selected = i; render(); }
});

// ── Получение данных + reset при каждом открытии ───────────────

async function reload() {
  try {
    [snippets, groups] = await Promise.all([
      window.paletteApi.getSnippets(),
      window.paletteApi.getGroups(),
    ]);
  } catch { snippets = []; groups = []; }
  $q.value = '';
  // По умолчанию: показать все сниппеты, отсортированные по последним
  filtered = [...snippets].slice(0, MAX_VISIBLE);
  selected = 0;
  render();
  $q.focus();
}

// Main вызовет 'palette-open' через событие перед каждым показом
window.paletteApi.onOpen(() => reload());

// Первоначальная загрузка
reload();
