'use strict';
/* ════════════════════════════════════════════════════════════════
   Палитра-хаб
     • root      — команды (OCR / перевод / история буфера / открыть
                   приложение) + сниппеты, fuzzy-поиск
     • clipboard — история буфера обмена
     • form      — заполнение полей {?Метка} перед вставкой
   ↑↓ навигация · Enter выбрать · Esc назад/закрыть
════════════════════════════════════════════════════════════════ */

const $q        = document.getElementById('q');
const $list     = document.getElementById('list');
const $empty    = document.getElementById('empty');
const $form     = document.getElementById('form');
const $footer   = document.getElementById('footer');
const $searchRow= document.getElementById('search-row');

let mode      = 'root';     // 'root' | 'clipboard' | 'form'
let snippets  = [];
let groups    = [];
let clips     = [];
let ocrOn     = true;
let translateOn = true;
let filtered  = [];         // элементы текущего списка
let selected  = 0;
let formState = null;       // { rawText, format, trigger, fields:[{label,def}] }

const MAX_VISIBLE = 200;

// ── Иконки команд (inline SVG, stroke=currentColor) ────────────────
const ICON = {
  ocr: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 12h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  translate: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" stroke="currentColor" stroke-width="1.7"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1" stroke="currentColor" stroke-width="1.7"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  app: '<path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
};

function svg(paths) {
  return `<svg viewBox="0 0 24 24" fill="none" width="17" height="17" aria-hidden="true">${paths}</svg>`;
}

// Команды (id совпадает с palette-run; clipboard обрабатывается локально).
function commands() {
  const list = [];
  if (ocrOn)       list.push({ type: 'cmd', id: 'ocr',       label: 'Скриншот → текст',   sub: 'OCR в буфер',        icon: 'ocr' });
  if (translateOn) list.push({ type: 'cmd', id: 'translate', label: 'Скриншот → перевод',  sub: 'Перевести область',  icon: 'translate' });
  list.push({ type: 'cmd', id: 'clipboard', label: 'История буфера', sub: 'Последние копии', icon: 'clipboard' });
  list.push({ type: 'cmd', id: 'open-app',  label: 'Открыть Snippi', sub: 'Главное окно',    icon: 'app' });
  return list;
}

// ── Fuzzy ──────────────────────────────────────────────────────────
function fuzzyScore(query, str) {
  if (!query) return 1;
  const q = query.toLowerCase();
  const s = (str || '').toLowerCase();
  let qi = 0, score = 0, streak = 0;
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) {
      qi++; streak++;
      score += 1 + streak * 2;
      if (i === 0)               score += 10;
      else if (s[i - 1] === ' ') score += 5;
    } else streak = 0;
  }
  return qi === q.length ? score : 0;
}

function highlight(str, query) {
  if (!query) return escapeHtml(str);
  const q = query.toLowerCase();
  const s = String(str);
  let out = '', qi = 0;
  for (let i = 0; i < s.length; i++) {
    if (qi < q.length && s[i].toLowerCase() === q[qi]) {
      out += '<mark>' + escapeHtml(s[i]) + '</mark>'; qi++;
    } else out += escapeHtml(s[i]);
  }
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ── Fill-in поля (зеркало placeholders.js) ─────────────────────────
function fieldRe() { return /\{\?([^}=]+?)(?:=([^}]*))?\}/g; }
function hasFields(text) { return !!text && fieldRe().test(text); }
function extractFields(text) {
  const out = [], seen = new Set(); if (!text) return out;
  const re = fieldRe(); let m;
  while ((m = re.exec(text)) !== null) {
    const label = m[1].trim(); if (!label) continue;
    const key = label.toLowerCase(); if (seen.has(key)) continue;
    seen.add(key); out.push({ label, def: m[2] !== undefined ? m[2] : '' });
  }
  return out;
}
function applyFields(text, values) {
  if (!text) return text;
  const map = {}; for (const k in (values || {})) map[String(k).trim().toLowerCase()] = values[k];
  return text.replace(fieldRe(), (_m, label, def) => {
    const key = String(label).trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(map, key) ? String(map[key]) : (def !== undefined ? def : '');
  });
}

function preview(text) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length > 140 ? t.slice(0, 140) + '…' : t;
}
function groupName(id) {
  if (!id) return '';
  const g = groups.find(g => g.id === id);
  return g ? g.name : '';
}

// ── Построение списков ─────────────────────────────────────────────
function buildRoot() {
  const q = $q.value.trim();
  if (!q) {
    filtered = [
      ...commands(),
      ...snippets.map(s => ({ type: 'snip', s })),
    ].slice(0, MAX_VISIBLE);
  } else {
    const scored = [];
    for (const c of commands()) {
      const sc = Math.max(fuzzyScore(q, c.label), fuzzyScore(q, c.sub));
      if (sc > 0) scored.push({ item: c, score: sc * 2 }); // команды чуть приоритетнее
    }
    for (const s of snippets) {
      const sc = fuzzyScore(q, s.trigger || '') * 3 + fuzzyScore(q, s.replacement || '');
      if (sc > 0) scored.push({ item: { type: 'snip', s }, score: sc });
    }
    scored.sort((a, b) => b.score - a.score);
    filtered = scored.map(x => x.item).slice(0, MAX_VISIBLE);
  }
  selected = 0; render();
}

function buildClipboard() {
  const q = $q.value.trim();
  const scored = clips
    .map(c => ({ c, score: fuzzyScore(q, c.text || '') }))
    .filter(x => x.score > 0);
  if (q) scored.sort((a, b) => b.score - a.score);
  filtered = scored.map(x => ({ type: 'clip', c: x.c })).slice(0, MAX_VISIBLE);
  selected = 0; render();
}

function rebuild() {
  if (mode === 'clipboard') buildClipboard();
  else                      buildRoot();
}

// ── Рендер ─────────────────────────────────────────────────────────
function render() {
  if (!filtered.length) {
    $list.innerHTML = '';
    $empty.classList.remove('hidden');
    return;
  }
  $empty.classList.add('hidden');
  const q = $q.value.trim();
  $list.innerHTML = filtered.map((it, i) => {
    const active = i === selected ? ' active' : '';
    if (it.type === 'cmd') {
      return `<li class="item cmd${active}" data-i="${i}">
        <span class="cmd-icon">${svg(ICON[it.icon] || '')}</span>
        <span class="cmd-text"><span class="cmd-label">${highlight(it.label, q)}</span><span class="cmd-sub">${escapeHtml(it.sub)}</span></span>
        <span class="cmd-chevron">›</span>
      </li>`;
    }
    if (it.type === 'clip') {
      return `<li class="item${active}" data-i="${i}">
        <span class="clip-dot"></span>
        <span class="preview">${highlight(preview(it.c.text), q)}</span>
      </li>`;
    }
    const s = it.s;
    const fieldBadge = hasFields(s.replacement || '') ? '<span class="field-badge">поля</span>' : '';
    const gName = groupName(s.groupId);
    return `<li class="item${active}" data-i="${i}">
      <span class="trigger-chip">${highlight(s.trigger || '', q)}</span>
      <span class="preview">${highlight(preview(s.replacement), q)}</span>
      ${fieldBadge}
      ${gName ? `<span class="group-tag">${escapeHtml(gName)}</span>` : ''}
    </li>`;
  }).join('');
  const el = $list.querySelector('.item.active');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

function setFooter(html) { $footer.innerHTML = html; }
const FOOT_ROOT = '<span class="kbd">↑↓</span> навигация <span class="kbd">↵</span> выбрать <span class="kbd">Esc</span> закрыть';
const FOOT_CLIP = '<span class="kbd">↑↓</span> навигация <span class="kbd">↵</span> вставить <span class="kbd">Esc</span> назад';
const FOOT_FORM = '<span class="kbd">Tab</span> поля <span class="kbd">↵</span> вставить <span class="kbd">Esc</span> назад';

function moveSel(delta) {
  if (!filtered.length) return;
  selected = (selected + delta + filtered.length) % filtered.length;
  render();
}

// ── Действия ───────────────────────────────────────────────────────
function pickCurrent() {
  const it = filtered[selected];
  if (!it) return;
  if (it.type === 'cmd') {
    if (it.id === 'clipboard') return enterClipboard();
    return window.paletteApi.run(it.id);
  }
  if (it.type === 'clip') {
    return window.paletteApi.paste(it.c.text || '');
  }
  if (it.type === 'snip') {
    const s = it.s;
    if (hasFields(s.replacement || '')) {
      return enterForm({ rawText: s.replacement || '', format: s.format || 'plain', trigger: s.trigger || '' });
    }
    return window.paletteApi.paste(s.replacement || '', s.format);
  }
}

// ── Режимы ─────────────────────────────────────────────────────────
function showListUI() {
  $searchRow.classList.remove('hidden');
  $list.classList.remove('hidden');
  $form.classList.add('hidden');
}
function showFormUI() {
  $searchRow.classList.add('hidden');
  $list.classList.add('hidden');
  $empty.classList.add('hidden');
  $form.classList.remove('hidden');
}

function backToRoot() {
  mode = 'root';
  $q.value = '';
  $q.placeholder = 'Поиск сниппетов и команд…';
  showListUI(); setFooter(FOOT_ROOT);
  buildRoot(); $q.focus();
}

async function enterClipboard() {
  mode = 'clipboard';
  $q.value = '';
  $q.placeholder = 'Поиск по истории буфера…';
  try { clips = await window.paletteApi.getClipboard(); } catch { clips = []; }
  showListUI(); setFooter(FOOT_CLIP);
  buildClipboard(); $q.focus();
}

function enterForm(state) {
  mode = 'form';
  formState = { ...state, fields: state.fields || extractFields(state.rawText) };
  showFormUI(); setFooter(FOOT_FORM);
  renderForm();
}

function renderForm() {
  const f = formState;
  const head = f.trigger ? `Заполни поля · <span class="form-trigger">${escapeHtml(f.trigger)}</span>` : 'Заполни поля';
  $form.innerHTML = `
    <div class="form-head">${head}</div>
    <div class="form-fields">
      ${f.fields.map((fl, i) => `
        <label class="form-field">
          <span class="form-label">${escapeHtml(fl.label)}</span>
          <input class="form-input" data-i="${i}" value="${escapeHtml(fl.def)}" autocomplete="off" spellcheck="false" />
        </label>`).join('')}
    </div>
    <div class="form-preview-wrap">
      <div class="form-preview-label">Предпросмотр</div>
      <div class="form-preview" id="form-preview"></div>
    </div>
    <div class="form-actions">
      <button type="button" class="form-btn" id="form-submit">Вставить</button>
    </div>`;

  const inputs = [...$form.querySelectorAll('.form-input')];
  const updatePreview = () => {
    const vals = collectFormValues();
    document.getElementById('form-preview').textContent = applyFields(f.rawText, vals);
  };
  inputs.forEach(inp => inp.addEventListener('input', updatePreview));
  $form.querySelector('#form-submit').addEventListener('click', submitForm);
  updatePreview();
  if (inputs[0]) { inputs[0].focus(); inputs[0].select(); }
}

function collectFormValues() {
  const vals = {};
  $form.querySelectorAll('.form-input').forEach(inp => {
    const i = +inp.dataset.i;
    const fl = formState.fields[i];
    if (fl) vals[fl.label] = inp.value;
  });
  return vals;
}

function submitForm() {
  if (!formState) return;
  window.paletteApi.submitForm(formState.rawText, formState.format, collectFormValues());
}

// ── Ввод ───────────────────────────────────────────────────────────
$q.addEventListener('input', rebuild);

window.addEventListener('keydown', e => {
  if (mode === 'form') {
    if (e.key === 'Escape') { e.preventDefault(); backToRoot(); }
    else if (e.key === 'Enter') { e.preventDefault(); submitForm(); }
    // Tab между полями — поведение браузера по умолчанию
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (mode === 'clipboard') backToRoot(); else window.paletteApi.close();
  } else if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(+1); }
  else if (e.key === 'ArrowUp')     { e.preventDefault(); moveSel(-1); }
  else if (e.key === 'Enter')       { e.preventDefault(); pickCurrent(); }
  else if (e.key === 'Tab')         { e.preventDefault(); moveSel(e.shiftKey ? -1 : +1); }
  else if (e.key === 'Backspace' && mode === 'clipboard' && $q.value === '') {
    e.preventDefault(); backToRoot();
  }
});

$list.addEventListener('click', e => {
  const li = e.target.closest('.item'); if (!li) return;
  selected = +li.dataset.i; pickCurrent();
});
$list.addEventListener('mousemove', e => {
  const li = e.target.closest('.item'); if (!li) return;
  const i = +li.dataset.i;
  if (i !== selected) { selected = i; render(); }
});

// ── Загрузка данных / открытие ─────────────────────────────────────
async function reloadRoot() {
  mode = 'root';
  try {
    const [snips, grps, ocr, tr] = await Promise.all([
      window.paletteApi.getSnippets(),
      window.paletteApi.getGroups(),
      window.paletteApi.getOcr().catch(() => ({ enabled: true })),
      window.paletteApi.getTranslate().catch(() => ({ enabled: true })),
    ]);
    snippets = snips || []; groups = grps || [];
    ocrOn = !ocr || ocr.enabled !== false;
    translateOn = !tr || tr.enabled !== false;
  } catch { snippets = []; groups = []; }
  $q.value = '';
  $q.placeholder = 'Поиск сниппетов и команд…';
  showListUI(); setFooter(FOOT_ROOT);
  buildRoot(); $q.focus();
}

// Открытие в обычном режиме (хоткей).
window.paletteApi.onOpen(() => reloadRoot());

// Открытие сразу в форме (fill-in сниппет сработал по триггеру).
window.paletteApi.onOpenForm(data => {
  // Подтянем группы/настройки для корректного возврата в root по Esc.
  reloadRoot().then(() => {
    enterForm({
      rawText: data.replacement || '',
      format:  data.format || 'plain',
      trigger: data.trigger || '',
      fields:  data.fields && data.fields.length ? data.fields : extractFields(data.replacement || ''),
    });
  });
});

// Первичная загрузка
reloadRoot();
