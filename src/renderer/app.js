'use strict';

// ══════════════════════════════════════════════════════════════════
//  Snippi — UI-логика
// ══════════════════════════════════════════════════════════════════

// ── Состояние ─────────────────────────────────────────────────────
let allSnippets      = [];
let allKeybindings   = [];
let allGroups        = [];
let allClipboard     = [];
let currentStats     = null;
let snippetSearch    = '';
let kbSearch         = '';
let editingSnippetId = null;
let editingKbId      = null;
let platform         = 'win32';
let currentPanel     = 'snippets';
let activeGroupId    = 'all';   // 'all' | 'none' | <groupId>

// Захват хоткея
let capturing      = false;
let capturedHotkey = null; // { display: 'Ctrl+A', data: { code, ctrlKey, … } }

// Туториал
let tutorialStep = 0;
const TUTORIAL_STEPS = 3;

// ── i18n shortcut ─────────────────────────────────────────────────
const t = (k, p) => window.i18n.t(k, p);

// ── DOM ───────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const dom = {
  // Хедер
  statusDot:        $('status-dot'),
  statusLabel:      $('status-label'),
  statusPill:       $('status-pill'),
  statusTriggerKey: $('status-trigger-key'),
  // Счётчики в сайдбаре
  navCountSnippets:    $('nav-count-snippets'),
  navCountKeybindings: $('nav-count-keybindings'),
  navCountClipboard:   $('nav-count-clipboard'),
  // Бэйджи хоткеев в сайдбаре
  navHotkeyOcr:       $('nav-hotkey-ocr'),
  navHotkeyTranslate: $('nav-hotkey-translate'),
  enabledToggle:    $('enabled-toggle'),
  toggleLabel:      $('toggle-label'),
  helpBtn:          $('help-btn'),
  // Навигация
  navSnippets:      $('nav-snippets'),
  navKeybindings:   $('nav-keybindings'),
  navClipboard:     $('nav-clipboard'),
  navScreenshot:    $('nav-screenshot'),
  navTranslate:     $('nav-translate'),
  navSettings:      $('nav-settings'),
  panelSnippets:    $('panel-snippets'),
  panelKeybindings: $('panel-keybindings'),
  panelClipboard:   $('panel-clipboard'),
  panelScreenshot:  $('panel-screenshot'),
  panelTranslate:   $('panel-translate'),
  panelSettings:    $('panel-settings'),
  shootBtn:         $('shoot-btn'),
  screenshotTriggerBtn: $('screenshot-trigger-btn'),
  screenshotHotkeyChip: $('screenshot-hotkey-chip'),
  // Переводчик
  translateEnabledToggle: $('translate-enabled-toggle'),
  translateTargetLang:    $('translate-target-lang'),
  translateHotkeyInput:   $('translate-hotkey-input'),
  translateTriggerBtn:    $('translate-trigger-btn'),
  translateHotkeyChip:    $('translate-hotkey-chip'),
  translateTestBtn:       $('translate-test-btn'),
  translateKeyStatus:     $('translate-key-status'),
  // Сниппеты
  snippetsSearch:   $('snippets-search'),
  addSnippetBtn:    $('add-snippet-btn'),
  snippetsList:     $('snippets-list'),
  snippetsEmpty:    $('snippets-empty'),
  snippetsEmptyAdd: $('snippets-empty-add'),
  snippetsNoRes:    $('snippets-no-results'),
  groupsBar:        $('groups-bar'),
  snippetGroupSel:  $('snippet-group'),
  // Хоткеи
  kbSearch:         $('keybindings-search'),
  addKbBtn:         $('add-keybinding-btn'),
  kbList:           $('keybindings-list'),
  kbEmpty:          $('keybindings-empty'),
  kbEmptyAdd:       $('keybindings-empty-add'),
  kbNoRes:          $('keybindings-no-results'),
  // Буфер обмена
  clipboardList:    $('clipboard-list'),
  clipboardEmpty:   $('clipboard-empty'),
  clipCount:        $('clip-count'),
  clearClipBtn:     $('clear-clipboard-btn'),
  // Настройки
  languageSelect:   $('language-select'),
  ocrEnabledToggle: $('ocr-enabled-toggle'),
  ocrJoinToggle:    $('ocr-join-toggle'),
  ocrHotkeyInput:   $('ocr-hotkey-input'),
  // Статистика
  statsTime:        $('stats-time'),
  statsExpansions:  $('stats-expansions'),
  statsChars:       $('stats-chars'),
  statsSince:       $('stats-since'),
  statsResetBtn:    $('stats-reset'),
  // Футер
  autostartToggle:  $('autostart-toggle'),
  triggerSelect:    $('trigger-key-select'),
  footerHint:       $('footer-hint'),
  exportBtn:        $('export-btn'),
  importBtn:        $('import-btn'),
  // Модалка группы
  groupBackdrop:    $('group-backdrop'),
  groupForm:        $('group-form'),
  groupName:        $('group-name'),
  groupErr:         $('group-err'),
  groupCancel:      $('group-cancel'),
  groupSave:        $('group-save'),
  groupClose:       $('group-modal-close'),
  // Модалка импорта
  importBackdrop:   $('import-backdrop'),
  importCancel:     $('import-cancel'),
  importConfirm:    $('import-confirm'),
  importClose:      $('import-modal-close'),
  // Экран ошибки
  errorScreen:      $('error-screen'),
  errorMessage:     $('error-message'),
  // Модалка сниппета
  snippetBackdrop:  $('snippet-backdrop'),
  snippetTitle:     $('snippet-modal-title'),
  snippetClose:     $('snippet-modal-close'),
  snippetForm:      $('snippet-form'),
  snippetTrigger:   $('snippet-trigger'),
  snippetTrigErr:   $('snippet-trigger-err'),
  snippetReplace:   $('snippet-replacement'),
  snippetRepErr:    $('snippet-replacement-err'),
  snippetCancel:    $('snippet-cancel'),
  snippetSave:      $('snippet-save'),
  // Модалка хоткея
  kbBackdrop:       $('kb-backdrop'),
  kbModalTitle:     $('kb-modal-title'),
  kbModalClose:     $('kb-modal-close'),
  kbForm:           $('kb-form'),
  kbHotkeyField:    $('kb-hotkey-field'),
  kbHotkeyPh:       $('kb-hotkey-placeholder'),
  kbHotkeyBadge:    $('kb-hotkey-badge'),
  kbHotkeyClear:    $('kb-hotkey-clear'),
  kbHotkeyErr:      $('kb-hotkey-err'),
  kbText:           $('kb-text'),
  kbTextErr:        $('kb-text-err'),
  kbCancel:         $('kb-cancel'),
  kbSave:           $('kb-save'),
  // Туториал
  tutBackdrop:      $('tutorial-backdrop'),
  tutPrev:          $('tut-prev'),
  tutNext:          $('tut-next'),
  // Тост
  toast:            $('toast'),
};

// ══════════════════════════════════════════════════════════════════
//  ИНИЦИАЛИЗАЦИЯ
// ══════════════════════════════════════════════════════════════════

async function init() {
  window.api.onExpanderError(msg => {
    dom.errorMessage.textContent = msg || t('common.unknownError');
    dom.errorScreen.classList.remove('hidden');
  });

  try {
    const [snippets, keybindings, groups, clipHistory, enabled, autoStart,
           triggerKey, availKeys, plt, tutShown,
           theme, language, stats, ocrSettings,
           translateSettings, translateLangs] = await Promise.all([
      window.api.getSnippets(),
      window.api.getKeybindings(),
      window.api.getGroups(),
      window.api.getClipboardHistory(),
      window.api.getEnabled(),
      window.api.getAutoStart(),
      window.api.getTriggerKey(),
      window.api.getAvailableTriggerKeys(),
      window.api.getPlatform(),
      window.api.getTutorialShown(),
      window.api.getTheme(),
      window.api.getLanguage(),
      window.api.getStats(),
      window.api.getOcrSettings(),
      window.api.getTranslateSettings(),
      window.api.getTranslateLangs(),
    ]);

    platform = plt;
    document.documentElement.dataset.platform = plt;

    // ── Тема ──────────────────────────────────────────────────────
    const appliedTheme = theme || 'auto';
    document.documentElement.dataset.theme = appliedTheme;
    const themeRadio = document.querySelector(`input[name="theme"][value="${appliedTheme}"]`);
    if (themeRadio) themeRadio.checked = true;

    // ── Язык ──────────────────────────────────────────────────────
    const appliedLang = language || 'ru';
    window.i18n.setLang(appliedLang);
    dom.languageSelect.value = appliedLang;
    window.i18n.applyTranslations();

    allSnippets    = snippets;
    allKeybindings = keybindings;
    allGroups      = groups;
    allClipboard   = clipHistory;

    applyEnabled(enabled);
    dom.autostartToggle.checked = autoStart;
    buildTriggerSelect(availKeys, triggerKey);

    currentStats = stats;
    renderStats();

    // ── OCR настройки ────────────────────────────────────────────────
    dom.ocrEnabledToggle.checked = !!ocrSettings.enabled;
    dom.ocrJoinToggle.checked    = !!ocrSettings.joinParagraphs;
    dom.ocrHotkeyInput.value     = formatHotkeyForUi(ocrSettings.hotkey, plt);
    updateScreenshotHotkeyChip();

    // ── Переводчик ───────────────────────────────────────────────────
    if (dom.translateTargetLang) {
      dom.translateTargetLang.innerHTML = (translateLangs || [])
        .map(([code, name]) => `<option value="${code}">${name}</option>`).join('');
    }
    if (dom.translateEnabledToggle) dom.translateEnabledToggle.checked = !!translateSettings.enabled;
    if (dom.translateTargetLang)    dom.translateTargetLang.value      = translateSettings.targetLang || 'EN';
    if (dom.translateHotkeyInput)   dom.translateHotkeyInput.value     = formatHotkeyForUi(translateSettings.hotkey, plt);
    updateTranslateHotkeyChip();

    renderGroups();
    renderSnippets();
    renderKeybindings();
    renderClipboard();
    updateSidebarCounts();
    updateSidebarStatusInfo(triggerKey);
    updateSidebarHotkeys(ocrSettings.hotkey, translateSettings.hotkey, plt);
    bindEvents();

    // Показываем туториал при первом запуске
    if (!tutShown) openTutorial();

  } catch (err) {
    console.error('[app] init error:', err);
  }

  window.api.onSnippetsChanged(d         => { allSnippets    = d; renderGroups(); renderSnippets(); updateSidebarCounts(); });
  window.api.onKeybindingsChanged(d      => { allKeybindings = d; renderKeybindings(); updateSidebarCounts(); });
  window.api.onGroupsChanged(d           => { allGroups      = d; renderGroups(); renderSnippets(); });
  window.api.onSettingsChanged(s         => { if (s.enabled !== undefined) applyEnabled(s.enabled); });
  window.api.onClipboardHistoryChanged(d => { allClipboard   = d; renderClipboard(); updateSidebarCounts(); });
  window.api.onStatsChanged(s            => { currentStats   = s; renderStats(); });
  window.api.onOcrResult(r => {
    if (r && r.ok) showToast(t('ocr.toast.ok', { n: r.chars }));
    else           showToast(r && r.message ? r.message : t('ocr.toast.fail'));
  });
  window.api.onTranslateResult(r => {
    if (r && r.ok) {
      const lang = r.targetLang || '';
      showToast(t('translate.toast.ok', { n: r.chars, lang }));
    } else {
      showToast(r && r.message ? r.message : t('translate.toast.fail'));
    }
  });
  window.api.onHotkeyConflict(d => {
    if (!d) return;
    showToast(t('hotkey.conflict', { feature: d.feature, hotkey: d.hotkey }));
  });
}

// ── Хоткей-форматтер для UI (показываем как Cmd+Shift+1 на маке) ──
function formatHotkeyForUi(accel, plt) {
  if (!accel) return '';
  return accel
    .replace(/\bCommandOrControl\b/g, plt === 'darwin' ? 'Cmd' : 'Ctrl')
    .replace(/\bCmdOrCtrl\b/g,        plt === 'darwin' ? 'Cmd' : 'Ctrl')
    .replace(/\bMeta\b/g,             plt === 'darwin' ? 'Cmd' : 'Win')
    .replace(/\bSuper\b/g,            plt === 'darwin' ? 'Cmd' : 'Win')
    .replace(/\bAlt\b/g,              plt === 'darwin' ? 'Option' : 'Alt');
}

// Конвертирует пользовательский ввод "Cmd+Shift+1" → акселератор Electron
function parseHotkeyFromUi(input) {
  if (!input) return '';
  return input.split('+').map(p => p.trim()).filter(Boolean).map(p => {
    const l = p.toLowerCase();
    if (l === 'cmd' || l === 'command' || l === 'win' || l === 'meta' || l === 'super') return 'CommandOrControl';
    if (l === 'ctrl' || l === 'control') return 'CommandOrControl';
    if (l === 'option' || l === 'opt' || l === 'alt') return 'Alt';
    if (l === 'shift') return 'Shift';
    return p.length === 1 ? p.toUpperCase() : p;
  }).join('+');
}

// ══════════════════════════════════════════════════════════════════
//  НАВИГАЦИЯ
// ══════════════════════════════════════════════════════════════════

function switchPanel(id) {
  currentPanel = id;
  ['snippets', 'keybindings', 'clipboard', 'screenshot', 'translate', 'settings'].forEach(p => {
    const nav = $(`nav-${p}`); if (nav) nav.classList.toggle('active', p === id);
    const pan = $(`panel-${p}`); if (pan) pan.classList.toggle('active', p === id);
  });
}

// Обновляет «чип» с текущим хоткеем рядом с кнопкой «Сделать скриншот»
function updateScreenshotHotkeyChip() {
  if (!dom.screenshotHotkeyChip || !dom.ocrHotkeyInput) return;
  const v = (dom.ocrHotkeyInput.value || '').trim();
  dom.screenshotHotkeyChip.textContent = v;
  dom.screenshotHotkeyChip.classList.toggle('hidden', !v);
}

// То же самое для кнопки «Перевести выделение»
function updateTranslateHotkeyChip() {
  if (!dom.translateHotkeyChip || !dom.translateHotkeyInput) return;
  const v = (dom.translateHotkeyInput.value || '').trim();
  dom.translateHotkeyChip.textContent = v;
  dom.translateHotkeyChip.classList.toggle('hidden', !v);
}

// Обновляет счётчики «Сниппеты 28», «Хоткеи 4», «Буфер 50» в сайдбаре.
function updateSidebarCounts() {
  if (dom.navCountSnippets)    dom.navCountSnippets.textContent    = (allSnippets    || []).length;
  if (dom.navCountKeybindings) dom.navCountKeybindings.textContent = (allKeybindings || []).length;
  if (dom.navCountClipboard)   dom.navCountClipboard.textContent   = (allClipboard   || []).length;
}

// Показывает текущую триггер-клавишу в карточке статуса сайдбара.
function updateSidebarStatusInfo(triggerKey) {
  if (dom.statusTriggerKey) dom.statusTriggerKey.textContent = triggerKey || '—';
}

// Бэйджи с хоткеями для секции «Инструменты» (Скриншот / Перевод).
function updateSidebarHotkeys(ocrHotkey, translateHotkey, plt) {
  const fmt = h => h ? formatHotkeyForUi(h, plt).replace(/CommandOrControl/g, plt === 'darwin' ? '⌘' : 'Ctrl')
                                                 .replace(/Cmd/g, '⌘')
                                                 .replace(/Shift/g, '⇧')
                                                 .replace(/Alt|Option/g, '⌥')
                                                 .replace(/\+/g, '') : '';
  if (dom.navHotkeyOcr)       dom.navHotkeyOcr.textContent       = fmt(ocrHotkey);
  if (dom.navHotkeyTranslate) dom.navHotkeyTranslate.textContent = fmt(translateHotkey);
}

// Отображает статус проверки DeepL-ключа («loading» / «ok» / «err»).
function setKeyStatus(kind, text) {
  if (!dom.translateKeyStatus) return;
  dom.translateKeyStatus.className = 'api-key-status ' + (kind || '');
  dom.translateKeyStatus.textContent = text || '';
}

// ══════════════════════════════════════════════════════════════════
//  РЕНДЕР: СНИППЕТЫ
// ══════════════════════════════════════════════════════════════════

function snippetMatchesGroup(s) {
  if (activeGroupId === 'all')  return true;
  if (activeGroupId === 'none') return !s.groupId;
  return s.groupId === activeGroupId;
}

function renderSnippets() {
  const q        = snippetSearch.toLowerCase();
  const inGroup  = allSnippets.filter(snippetMatchesGroup);
  const filtered = q
    ? inGroup.filter(s => s.trigger.toLowerCase().includes(q) || s.replacement.toLowerCase().includes(q))
    : inGroup;

  dom.snippetsEmpty.classList.toggle('hidden', inGroup.length > 0);
  dom.snippetsNoRes.classList.toggle('hidden', !(inGroup.length > 0 && filtered.length === 0));
  dom.snippetsList.classList.toggle('hidden', filtered.length === 0);

  dom.snippetsList.innerHTML = '';
  filtered.forEach(s => dom.snippetsList.appendChild(makeSnippetCard(s)));
}

// ── Лента групп ──
function renderGroups() {
  const totalCount   = allSnippets.length;
  const noneCount    = allSnippets.filter(s => !s.groupId).length;
  const groupCounts  = new Map();
  for (const s of allSnippets) {
    if (s.groupId) groupCounts.set(s.groupId, (groupCounts.get(s.groupId) || 0) + 1);
  }

  // Если активная группа удалена — переключаемся на "Все"
  if (activeGroupId !== 'all' && activeGroupId !== 'none' &&
      !allGroups.some(g => g.id === activeGroupId)) {
    activeGroupId = 'all';
  }

  const chips = [];
  chips.push(makeChip('all',  t('group.all'),     totalCount, false));
  for (const g of allGroups) {
    chips.push(makeChip(g.id, g.name, groupCounts.get(g.id) || 0, true));
  }
  if (noneCount > 0 || activeGroupId === 'none') {
    chips.push(makeChip('none', t('group.noGroup'), noneCount, false));
  }

  dom.groupsBar.innerHTML = '';
  chips.forEach(c => dom.groupsBar.appendChild(c));

  // Кнопка "+"
  const addBtn = document.createElement('button');
  addBtn.className = 'group-add-btn';
  addBtn.title     = t('group.newTitle');
  addBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" width="13" height="13">
    <line x1="8" y1="3" x2="8" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
  addBtn.addEventListener('click', openGroupModal);
  dom.groupsBar.appendChild(addBtn);
}

function makeChip(id, name, count, deletable) {
  const chip = document.createElement('div');
  chip.className = 'group-chip' + (id === activeGroupId ? ' active' : '');
  chip.dataset.id = id;
  chip.innerHTML = `
    <span class="group-chip-name">${esc(name)}</span>
    <span class="group-chip-count">${count}</span>
    ${deletable ? `<button class="group-chip-del" title="${t('common.delete')}">×</button>` : ''}
  `;
  chip.addEventListener('click', e => {
    if (e.target.closest('.group-chip-del')) return;
    activeGroupId = id;
    renderGroups();
    renderSnippets();
  });
  if (deletable) {
    chip.querySelector('.group-chip-del').addEventListener('click', async e => {
      e.stopPropagation();
      if (!await confirm(t('group.confirmDelete', { name }))) return;
      try {
        await window.api.deleteGroup(id);
        if (activeGroupId === id) activeGroupId = 'all';
        showToast(t('group.deleted'));
      } catch (err) { showToast(t('common.error') + ': ' + err.message); }
    });
  }
  return chip;
}

// ── Модалка группы ──
function openGroupModal() {
  dom.groupName.value = '';
  dom.groupErr.textContent = '';
  dom.groupBackdrop.classList.remove('hidden');
  setTimeout(() => dom.groupName.focus(), 60);
}
function closeGroupModal() {
  dom.groupBackdrop.classList.add('hidden');
}
async function saveGroup() {
  dom.groupErr.textContent = '';
  const name = dom.groupName.value.trim();
  if (!name) { dom.groupErr.textContent = t('group.errEmpty'); return; }
  dom.groupSave.disabled = true;
  try {
    const g = await window.api.addGroup({ name });
    activeGroupId = g.id;
    showToast(t('group.created'));
    closeGroupModal();
  } catch (err) {
    dom.groupErr.textContent = err.message;
  } finally {
    dom.groupSave.disabled = false;
  }
}

function makeSnippetCard(s) {
  const card = document.createElement('div');
  card.className = 'snippet-card';

  const hl = (str, max = 80) => {
    const safe = esc(str.length > max ? str.slice(0, max) + '…' : str);
    if (!snippetSearch) return safe;
    return safe.replace(new RegExp(`(${escRe(snippetSearch)})`, 'gi'), '<mark>$1</mark>');
  };

  const groupName = s.groupId ? (allGroups.find(g => g.id === s.groupId)?.name) : null;
  const groupBadge = groupName ? `<span class="snippet-group-badge">${esc(groupName)}</span>` : '';

  card.innerHTML = `
    <span class="snippet-trigger">${hl(s.trigger, 20)}</span>
    <span class="snippet-arrow">→</span>
    <span class="snippet-replacement">${hl(s.replacement)}</span>
    ${groupBadge}
    <div class="snippet-actions">
      <button class="btn btn-icon" data-id="${s.id}" data-action="dup-snippet" title="${t('action.duplicate')}">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
          <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
          <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </button>
      <button class="btn btn-icon" data-id="${s.id}" data-action="edit-snippet" title="${t('action.edit')}">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
          <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="btn btn-icon del" data-id="${s.id}" data-action="del-snippet" title="${t('common.delete')}">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
          <path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5l.5-9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>`;

  card.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'edit-snippet') { openSnippetModal(s); return; }
    if (action === 'del-snippet')  { deleteSnippet(s.id, s.trigger); return; }
    if (action === 'dup-snippet')  { duplicateSnippet(s.id); return; }
    openSnippetModal(s);
  });
  return card;
}

async function duplicateSnippet(id) {
  try {
    await window.api.duplicateSnippet(id);
    showToast(t('snippet.duplicated'));
  } catch (err) { showToast(t('common.error') + ': ' + err.message); }
}

// ══════════════════════════════════════════════════════════════════
//  РЕНДЕР: ХОТКЕИ
// ══════════════════════════════════════════════════════════════════

function renderKeybindings() {
  const q        = kbSearch.toLowerCase();
  const filtered = q
    ? allKeybindings.filter(b => b.hotkey.toLowerCase().includes(q) || b.text.toLowerCase().includes(q))
    : allKeybindings;

  dom.kbEmpty.classList.toggle('hidden', allKeybindings.length > 0);
  dom.kbNoRes.classList.toggle('hidden', !(allKeybindings.length > 0 && filtered.length === 0));
  dom.kbList.classList.toggle('hidden', filtered.length === 0);

  dom.kbList.innerHTML = '';
  filtered.forEach(b => dom.kbList.appendChild(makeKbCard(b)));
}

function makeKbCard(b) {
  const card = document.createElement('div');
  card.className = 'kb-card';

  const q      = kbSearch.toLowerCase();
  const hlKb   = str => {
    const safe = esc(str);
    if (!q) return safe;
    return safe.replace(new RegExp(`(${escRe(q)})`, 'gi'), '<mark>$1</mark>');
  };
  const hlText = str => {
    const safe = esc(str.length > 80 ? str.slice(0, 80) + '…' : str);
    if (!q) return safe;
    return safe.replace(new RegExp(`(${escRe(q)})`, 'gi'), '<mark>$1</mark>');
  };

  card.innerHTML = `
    <kbd class="kb-hotkey-badge">${hlKb(b.hotkey)}</kbd>
    <span class="kb-arrow">→</span>
    <span class="kb-text">${hlText(b.text)}</span>
    <div class="kb-actions">
      <button class="btn btn-icon" data-id="${b.id}" data-action="edit-kb" title="${t('action.edit')}">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
          <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="btn btn-icon del" data-id="${b.id}" data-action="del-kb" title="${t('common.delete')}">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
          <path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5l.5-9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>`;

  card.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'edit-kb') { openKbModal(b); return; }
    if (action === 'del-kb')  { deleteKeybinding(b.id, b.hotkey); return; }
    openKbModal(b);
  });
  return card;
}

// ══════════════════════════════════════════════════════════════════
//  РЕНДЕР: БУФЕР ОБМЕНА
// ══════════════════════════════════════════════════════════════════

function renderClipboard() {
  const count = allClipboard.length;
  dom.clipCount.textContent = count === 0 ? t('clip.records.zero')
    : count === 1 ? t('clip.records.one')
    : count < 5  ? t('clip.records.few',  { n: count })
    : t('clip.records.many', { n: count });

  dom.clipboardEmpty.classList.toggle('hidden', count > 0);
  dom.clipboardList.classList.toggle('hidden', count === 0);
  dom.clearClipBtn.disabled = count === 0;

  dom.clipboardList.innerHTML = '';
  allClipboard.forEach(entry => dom.clipboardList.appendChild(makeClipCard(entry)));
}

function makeClipCard(entry) {
  const card = document.createElement('div');
  card.className = 'clip-card';

  const preview  = entry.text.replace(/\s+/g, ' ').trim();
  const isLong   = preview.length > 120;
  const short    = isLong ? preview.slice(0, 120) + '…' : preview;
  const timeStr  = relativeTime(entry.ts);
  const lines    = entry.text.split('\n').length;
  const lineHint = lines > 1 ? ` · ${t('clip.linesHint', { n: lines })}` : '';

  card.innerHTML = `
    <div class="clip-body">
      <span class="clip-text">${esc(short)}</span>
      <span class="clip-meta">${esc(timeStr)}${lineHint}</span>
    </div>
    <div class="clip-actions">
      <button class="btn btn-icon clip-copy" data-id="${entry.id}" title="${t('action.copy')}">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
          <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
          <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </button>
      <button class="btn btn-icon del clip-del" data-id="${entry.id}" title="${t('common.delete')}">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
          <path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5l.5-9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>`;

  card.addEventListener('click', async e => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.classList.contains('clip-copy') || (!btn.classList.contains('clip-del') && !btn.classList.contains('btn-icon'))) {
      try {
        await navigator.clipboard.writeText(entry.text);
        showToast(t('clip.copied'));
      } catch { showToast(t('clip.copyFailed')); }
      return;
    }
    if (btn.classList.contains('clip-del')) {
      try { await window.api.deleteClipboardEntry(id); }
      catch (err) { showToast(t('common.error') + ': ' + err.message); }
    }
  });

  // Клик по карточке (не по кнопкам) = скопировать
  card.querySelector('.clip-body').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(entry.text);
      showToast(t('clip.copied'));
    } catch { showToast(t('clip.copyFailed')); }
  });

  return card;
}

// ══════════════════════════════════════════════════════════════════
//  СТАТИСТИКА (сэкономленное время)
// ══════════════════════════════════════════════════════════════════

// Средняя скорость набора 200 cpm = 200/60 cps ≈ 3.33 символа/сек.
// Используем 3 символа/сек чтобы не завышать.
const TYPING_CHARS_PER_SEC = 3;

function formatSavedTime(charsSaved) {
  if (!charsSaved) return t('stats.timeZero');
  const totalSec = Math.floor(charsSaved / TYPING_CHARS_PER_SEC);
  if (totalSec < 60) return t('stats.timeSeconds', { s: totalSec });
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return t('stats.timeMinutes', { m: totalMin, s: totalSec % 60 });
  const hours = Math.floor(totalMin / 60);
  return t('stats.timeHours', { h: hours, m: totalMin % 60 });
}

function formatSinceDate(iso) {
  if (!iso) return t('stats.sinceNever');
  const ts   = new Date(iso).getTime();
  if (isNaN(ts)) return t('stats.sinceNever');
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return t('stats.sinceToday');
  if (days === 1) return t('stats.sinceYesterday');
  return t('stats.sinceDays', { n: days });
}

function renderStats() {
  if (!currentStats) return;
  dom.statsTime.textContent       = formatSavedTime(currentStats.charsSaved);
  dom.statsExpansions.textContent = currentStats.expansions.toLocaleString();
  dom.statsChars.textContent      = currentStats.charsSaved.toLocaleString();
  dom.statsSince.textContent      = formatSinceDate(currentStats.firstUsedAt);
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const sec  = Math.floor(diff / 1000);
  if (sec < 60)   return t('clip.relTime.justNow');
  const min = Math.floor(sec / 60);
  if (min < 60)   return t('clip.relTime.min', { n: min });
  const hr  = Math.floor(min / 60);
  if (hr < 24)    return t('clip.relTime.hr',  { n: hr });
  const day = Math.floor(hr / 24);
  return t('clip.relTime.day', { n: day });
}

// ══════════════════════════════════════════════════════════════════
//  ТУТОРИАЛ
// ══════════════════════════════════════════════════════════════════

function openTutorial() {
  tutorialStep = 0;
  applyTutorialStep();
  dom.tutBackdrop.classList.remove('hidden');
}

function closeTutorial() {
  dom.tutBackdrop.classList.add('hidden');
  window.api.setTutorialShown(true);
}

function applyTutorialStep() {
  // Слайды
  for (let i = 0; i < TUTORIAL_STEPS; i++) {
    $(`tslide-${i}`).classList.toggle('active', i === tutorialStep);
  }
  // Точки прогресса
  document.querySelectorAll('.tpip').forEach((pip, i) => {
    pip.classList.toggle('active', i === tutorialStep);
    pip.classList.toggle('done',   i < tutorialStep);
  });
  // Кнопки
  dom.tutPrev.classList.toggle('hidden', tutorialStep === 0);
  dom.tutNext.textContent = tutorialStep === TUTORIAL_STEPS - 1 ? t('tutorial.done') : t('tutorial.next');
}

// ══════════════════════════════════════════════════════════════════
//  МОДАЛКА: СНИППЕТ
// ══════════════════════════════════════════════════════════════════

function openSnippetModal(s = null) {
  editingSnippetId             = s ? s.id : null;
  dom.snippetTitle.textContent = s ? t('snippet.modal.edit') : t('snippet.modal.new');
  dom.snippetTrigger.value     = s ? s.trigger      : '';
  dom.snippetReplace.value     = s ? s.replacement  : '';

  // Заполняем селект групп
  const sel = dom.snippetGroupSel;
  sel.innerHTML = '';
  const noneOpt = document.createElement('option');
  noneOpt.value = ''; noneOpt.textContent = t('snippet.group.none');
  sel.appendChild(noneOpt);
  allGroups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id; opt.textContent = g.name;
    sel.appendChild(opt);
  });
  // Авто-предзаполнение текущей группой при создании
  let preselect = '';
  if (s) preselect = s.groupId || '';
  else if (activeGroupId !== 'all' && activeGroupId !== 'none') preselect = activeGroupId;
  sel.value = preselect;

  clearSnippetErrors();
  dom.snippetBackdrop.classList.remove('hidden');
  setTimeout(() => dom.snippetTrigger.focus(), 60);
}

function closeSnippetModal() {
  dom.snippetBackdrop.classList.add('hidden');
  editingSnippetId = null;
}

function clearSnippetErrors() {
  dom.snippetTrigErr.textContent = '';
  dom.snippetRepErr.textContent  = '';
  dom.snippetTrigger.classList.remove('err');
  dom.snippetReplace.classList.remove('err');
}

async function saveSnippet() {
  clearSnippetErrors();
  const trigger     = dom.snippetTrigger.value.trim();
  const replacement = dom.snippetReplace.value;
  let ok = true;

  if (!trigger) {
    dom.snippetTrigErr.textContent = t('snippet.err.noTrigger'); dom.snippetTrigger.classList.add('err'); ok = false;
  } else if (!/^[a-zA-Z0-9]+$/.test(trigger)) {
    dom.snippetTrigErr.textContent = t('snippet.err.onlyAZ09'); dom.snippetTrigger.classList.add('err'); ok = false;
  } else if (trigger.length < 2) {
    dom.snippetTrigErr.textContent = t('snippet.err.minLen'); dom.snippetTrigger.classList.add('err'); ok = false;
  }
  if (!replacement.trim()) {
    dom.snippetRepErr.textContent = t('snippet.err.noReplace'); dom.snippetReplace.classList.add('err'); ok = false;
  }
  if (!ok) return;

  dom.snippetSave.disabled = true;
  const groupId = dom.snippetGroupSel.value || null;
  try {
    if (editingSnippetId) {
      await window.api.updateSnippet(editingSnippetId, { trigger, replacement, groupId });
      showToast(t('snippet.updated'));
    } else {
      await window.api.addSnippet({ trigger, replacement, groupId });
      showToast(t('snippet.created'));
    }
    closeSnippetModal();
  } catch (err) {
    dom.snippetTrigErr.textContent = err.message || t('common.error');
    dom.snippetTrigger.classList.add('err');
  } finally {
    dom.snippetSave.disabled = false;
  }
}

async function deleteSnippet(id, trigger) {
  if (!await confirm(t('snippet.confirmDelete', { name: trigger }))) return;
  try { await window.api.deleteSnippet(id); showToast(t('snippet.deleted')); }
  catch (e) { showToast(t('common.error') + ': ' + e.message); }
}

// ══════════════════════════════════════════════════════════════════
//  МОДАЛКА: ХОТКЕЙ
// ══════════════════════════════════════════════════════════════════

function openKbModal(b = null) {
  editingKbId = b ? b.id : null;
  dom.kbModalTitle.textContent = b ? t('kb.modal.edit') : t('kb.modal.new');
  dom.kbText.value             = b ? b.text : '';

  if (b) {
    capturedHotkey = { display: b.hotkey, data: b.hotkeyData };
    showHotkeyBadge(b.hotkey);
  } else {
    capturedHotkey = null;
    resetHotkeyField();
  }

  clearKbErrors();
  dom.kbBackdrop.classList.remove('hidden');
  setTimeout(() => dom.kbHotkeyField.focus(), 60);
}

function closeKbModal() {
  dom.kbBackdrop.classList.add('hidden');
  stopCapture(false);
  editingKbId    = null;
  capturedHotkey = null;
}

function clearKbErrors() {
  dom.kbHotkeyErr.textContent = '';
  dom.kbTextErr.textContent   = '';
  dom.kbHotkeyField.classList.remove('err');
  dom.kbText.classList.remove('err');
}

async function saveKeybinding() {
  clearKbErrors();
  const text = dom.kbText.value;
  let ok = true;

  if (!capturedHotkey) {
    dom.kbHotkeyErr.textContent = t('kb.err.noKey'); dom.kbHotkeyField.classList.add('err'); ok = false;
  }
  if (!text.trim()) {
    dom.kbTextErr.textContent = t('kb.err.noText'); dom.kbText.classList.add('err'); ok = false;
  }
  if (!ok) return;

  dom.kbSave.disabled = true;
  const data = { hotkey: capturedHotkey.display, hotkeyData: capturedHotkey.data, text };

  try {
    if (editingKbId) {
      await window.api.updateKeybinding(editingKbId, data);
      showToast(t('kb.updated'));
    } else {
      await window.api.addKeybinding(data);
      showToast(t('kb.created'));
    }
    closeKbModal();
  } catch (err) {
    dom.kbHotkeyErr.textContent = err.message || t('common.error');
  } finally {
    dom.kbSave.disabled = false;
  }
}

async function deleteKeybinding(id, hotkey) {
  if (!await confirm(t('kb.confirmDelete', { name: hotkey }))) return;
  try { await window.api.deleteKeybinding(id); showToast(t('kb.deleted')); }
  catch (e) { showToast(t('common.error') + ': ' + e.message); }
}

// ══════════════════════════════════════════════════════════════════
//  ЗАХВАТ КЛАВИШИ
// ══════════════════════════════════════════════════════════════════

function startCapture() {
  capturing = true;
  dom.kbHotkeyField.classList.add('capturing');
  dom.kbHotkeyBadge.classList.add('hidden');
  dom.kbHotkeyClear.classList.add('hidden');
  dom.kbHotkeyPh.classList.remove('hidden');
  dom.kbHotkeyPh.textContent = t('kb.field.capturing');
  dom.kbHotkeyPh.className   = 'capturing-hint';
}

function stopCapture(success) {
  capturing = false;
  dom.kbHotkeyField.classList.remove('capturing');
  if (!success) {
    if (capturedHotkey) { showHotkeyBadge(capturedHotkey.display); }
    else                { resetHotkeyField(); }
  }
}

function resetHotkeyField() {
  dom.kbHotkeyPh.className   = 'hotkey-placeholder';
  dom.kbHotkeyPh.textContent = t('kb.field.placeholderClick');
  dom.kbHotkeyPh.classList.remove('hidden');
  dom.kbHotkeyBadge.classList.add('hidden');
  dom.kbHotkeyClear.classList.add('hidden');
}

function showHotkeyBadge(display) {
  dom.kbHotkeyPh.classList.add('hidden');
  dom.kbHotkeyBadge.textContent = display;
  dom.kbHotkeyBadge.classList.remove('hidden');
  dom.kbHotkeyClear.classList.remove('hidden');
}

function buildHotkeyDisplay(e) {
  const parts = [];
  if (e.ctrlKey)  parts.push('Ctrl');
  if (e.altKey)   parts.push(platform === 'darwin' ? 'Option' : 'Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey)  parts.push(platform === 'darwin' ? 'Cmd' : 'Win');
  parts.push(keyDisplayName(e.code));
  return parts.join('+');
}

function keyDisplayName(code) {
  if (/^Key([A-Z])$/.test(code))  return code.slice(3).toUpperCase();
  if (/^Digit(\d)$/.test(code))   return code.slice(5);
  if (/^F(\d{1,2})$/.test(code))  return code;
  const map = {
    Space:'Space', Tab:'Tab', Backquote:'`', Minus:'-', Equal:'=',
    BracketLeft:'[', BracketRight:']', Backslash:'\\', Semicolon:';',
    Quote:"'", Comma:',', Period:'.', Slash:'/',
    Delete:'Del', Insert:'Ins', Home:'Home', End:'End',
    PageUp:'PgUp', PageDown:'PgDn',
    NumpadEnter:'Num↵', NumpadAdd:'Num+', NumpadSubtract:'Num-',
    NumpadMultiply:'Num*', NumpadDivide:'Num/',
  };
  return map[code] ?? code;
}

function onCaptureKeydown(e) {
  if (!capturing) return;
  if (['Control','Shift','Alt','Meta'].includes(e.key)) return;

  if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation();
    stopCapture(false);
    return;
  }

  e.preventDefault(); e.stopPropagation();

  const data = { code: e.code, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, metaKey: e.metaKey };
  const display  = buildHotkeyDisplay(e);
  capturedHotkey = { display, data };

  stopCapture(true);
  showHotkeyBadge(display);
}

// ══════════════════════════════════════════════════════════════════
//  ВКЛЮЧЕНИЕ / СОСТОЯНИЕ
// ══════════════════════════════════════════════════════════════════

function applyEnabled(enabled) {
  dom.enabledToggle.checked   = enabled;
  dom.toggleLabel.textContent = enabled ? t('header.enabled') : t('header.disabled');
  dom.statusDot.classList.toggle('disabled', !enabled);
  if (dom.statusPill) dom.statusPill.classList.toggle('disabled', !enabled);
  dom.statusLabel.textContent = enabled ? t('header.active') : t('header.paused');
}

// ══════════════════════════════════════════════════════════════════
//  ТРИГГЕР-КЛАВИША (ФУТЕР)
// ══════════════════════════════════════════════════════════════════

function buildTriggerSelect(keys, current) {
  dom.triggerSelect.innerHTML = '';
  keys.forEach(k => {
    const o = document.createElement('option');
    o.value = k; o.textContent = k;
    if (k === current) o.selected = true;
    dom.triggerSelect.appendChild(o);
  });
  dom.footerHint.textContent = t('footer.triggerHint', { key: current });
}

// ══════════════════════════════════════════════════════════════════
//  ПРИВЯЗКА СОБЫТИЙ
// ══════════════════════════════════════════════════════════════════

function bindEvents() {
  // Навигация
  dom.navSnippets.addEventListener('click',    () => switchPanel('snippets'));
  dom.navKeybindings.addEventListener('click', () => switchPanel('keybindings'));
  dom.navClipboard.addEventListener('click',   () => switchPanel('clipboard'));
  if (dom.navScreenshot) dom.navScreenshot.addEventListener('click', () => switchPanel('screenshot'));
  if (dom.navTranslate)  dom.navTranslate.addEventListener('click',  () => switchPanel('translate'));
  dom.navSettings.addEventListener('click',    () => switchPanel('settings'));

  // Быстрая кнопка-камера в шапке: мгновенно запускаем OCR
  if (dom.shootBtn) {
    dom.shootBtn.addEventListener('click', () => { try { window.api.ocrTrigger(); } catch {} });
    // Подсказка с текущим хоткеем (читаем из настроек OCR)
    try {
      window.api.getOcrSettings().then(s => {
        if (s && s.hotkey) {
          const human = formatHotkeyForUi(s.hotkey, platform);
          dom.shootBtn.title = `${t('ocr.quick.title')} (${human})`;
        }
      }).catch(() => {});
    } catch {}
  }
  if (dom.screenshotTriggerBtn) {
    dom.screenshotTriggerBtn.addEventListener('click', () => { try { window.api.ocrTrigger(); } catch {} });
  }

  // Кнопка помощи
  dom.helpBtn.addEventListener('click', openTutorial);

  // Туториал
  dom.tutNext.addEventListener('click', () => {
    if (tutorialStep < TUTORIAL_STEPS - 1) { tutorialStep++; applyTutorialStep(); }
    else closeTutorial();
  });
  dom.tutPrev.addEventListener('click', () => {
    if (tutorialStep > 0) { tutorialStep--; applyTutorialStep(); }
  });
  dom.tutBackdrop.addEventListener('click', e => { if (e.target === dom.tutBackdrop) closeTutorial(); });

  // Тумблер
  dom.enabledToggle.addEventListener('change', async () => {
    await window.api.setEnabled(dom.enabledToggle.checked);
    applyEnabled(dom.enabledToggle.checked);
  });

  // Автозапуск
  dom.autostartToggle.addEventListener('change', () =>
    window.api.setAutoStart(dom.autostartToggle.checked));

  // ── Настройки: тема ──────────────────────────────────────────────
  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener('change', async () => {
      const v = radio.value;
      document.documentElement.dataset.theme = v;
      await window.api.setTheme(v);
    });
  });

  // ── Настройки: сброс статистики ──────────────────────────────────
  dom.statsResetBtn.addEventListener('click', async () => {
    if (!await confirm(t('stats.confirmReset'))) return;
    currentStats = await window.api.resetStats();
    renderStats();
    showToast(t('stats.resetDone'));
  });

  // ── Настройки: OCR (скриншот → текст) ─────────────────────────────
  dom.ocrEnabledToggle.addEventListener('change', () =>
    window.api.setOcrSettings({ enabled: dom.ocrEnabledToggle.checked }));

  dom.ocrJoinToggle.addEventListener('change', () =>
    window.api.setOcrSettings({ joinParagraphs: dom.ocrJoinToggle.checked }));

  // Захват хоткея в поле: кликнул → нажал комбу → сохранили
  dom.ocrHotkeyInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') { dom.ocrHotkeyInput.blur(); return; }
    if (['Control','Shift','Alt','Meta','Command','Option'].includes(e.key)) return;
    e.preventDefault();
    const parts = [];
    if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl');
    if (e.altKey)               parts.push('Alt');
    if (e.shiftKey)             parts.push('Shift');
    let main = e.key;
    if (main === ' ') main = 'Space';
    else if (main.length === 1) main = main.toUpperCase();
    parts.push(main);
    const accel = parts.join('+');
    dom.ocrHotkeyInput.value = formatHotkeyForUi(accel, platform);
    window.api.setOcrSettings({ hotkey: accel });
    updateScreenshotHotkeyChip();
  });
  // Запрещаем ручной ввод текста
  dom.ocrHotkeyInput.addEventListener('input', e => { e.target.value = e.target._lastValue || ''; });
  dom.ocrHotkeyInput.addEventListener('focus', () => { dom.ocrHotkeyInput._lastValue = dom.ocrHotkeyInput.value; });

  // ── Настройки: переводчик (DeepL) ────────────────────────────────
  if (dom.translateEnabledToggle) {
    dom.translateEnabledToggle.addEventListener('change', () =>
      window.api.setTranslateSettings({ enabled: dom.translateEnabledToggle.checked }));
  }
  if (dom.translateTargetLang) {
    dom.translateTargetLang.addEventListener('change', async () => {
      const v = dom.translateTargetLang.value;
      console.log('[ui] target lang →', v);
      // Дожидаемся подтверждения от main, чтобы хоткей,
      // нажатый сразу после смены, гарантированно прочитал свежий язык.
      try { await window.api.setTranslateSettings({ targetLang: v }); }
      catch (e) { console.error('[ui] save lang failed:', e); }
    });
  }
  if (dom.translateHotkeyInput) {
    dom.translateHotkeyInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') { dom.translateHotkeyInput.blur(); return; }
      if (['Control','Shift','Alt','Meta','Command','Option'].includes(e.key)) return;
      e.preventDefault();
      const parts = [];
      if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl');
      if (e.altKey)               parts.push('Alt');
      if (e.shiftKey)             parts.push('Shift');
      let main = e.key;
      if (main === ' ') main = 'Space';
      else if (main.length === 1) main = main.toUpperCase();
      parts.push(main);
      const accel = parts.join('+');
      dom.translateHotkeyInput.value = formatHotkeyForUi(accel, platform);
      window.api.setTranslateSettings({ hotkey: accel });
      updateTranslateHotkeyChip();
    });
    dom.translateHotkeyInput.addEventListener('input', e => { e.target.value = e.target._lastValue || ''; });
    dom.translateHotkeyInput.addEventListener('focus', () => { dom.translateHotkeyInput._lastValue = dom.translateHotkeyInput.value; });
  }
  if (dom.translateTriggerBtn) {
    dom.translateTriggerBtn.addEventListener('click', () => { try { window.api.translateTrigger(); } catch {} });
  }
  if (dom.translateTestBtn) {
    dom.translateTestBtn.addEventListener('click', async () => {
      const targetLang = dom.translateTargetLang ? dom.translateTargetLang.value : 'EN';
      setKeyStatus('loading', 'Перевожу «Hello, world!»…');
      dom.translateTestBtn.disabled = true;
      try {
        const r = await window.api.translateTest({ targetLang });
        if (r && r.ok) {
          setKeyStatus('ok', `✓ "${r.source}" → "${r.translated}"`);
        } else {
          setKeyStatus('err', `✗ ${r && r.message ? r.message : 'Ошибка'}`);
        }
      } catch (e) {
        setKeyStatus('err', `✗ ${e.message || 'Ошибка'}`);
      } finally {
        dom.translateTestBtn.disabled = false;
      }
    });
  }

  // ── Настройки: язык ──────────────────────────────────────────────
  dom.languageSelect.addEventListener('change', async () => {
    const lang = dom.languageSelect.value;
    window.i18n.setLang(lang);
    window.i18n.applyTranslations();
    await window.api.setLanguage(lang);
    // Перерисовываем динамический контент
    renderGroups();
    renderSnippets();
    renderKeybindings();
    renderClipboard();
    renderStats();
    applyEnabled(dom.enabledToggle.checked);
    // Обновляем подсказку триггера
    const currentKey = dom.triggerSelect.value;
    dom.footerHint.textContent = t('footer.triggerHint', { key: currentKey });
    // Кнопка туториала
    applyTutorialStep();
  });

  // Экспорт
  dom.exportBtn.addEventListener('click', async () => {
    try {
      const r = await window.api.exportData();
      if (r.canceled) return;
      if (r.error)    { showToast(t('common.error') + ': ' + r.error); return; }
      showToast(t('export.saved', { s: r.snippets, k: r.keybindings }));
    } catch (err) { showToast(t('common.error') + ': ' + err.message); }
  });

  // Импорт — открываем модалку выбора режима
  dom.importBtn.addEventListener('click', () => {
    dom.importBackdrop.classList.remove('hidden');
  });
  dom.importClose.addEventListener('click', () => dom.importBackdrop.classList.add('hidden'));
  dom.importCancel.addEventListener('click', () => dom.importBackdrop.classList.add('hidden'));
  dom.importBackdrop.addEventListener('click', e => {
    if (e.target === dom.importBackdrop) dom.importBackdrop.classList.add('hidden');
  });
  dom.importConfirm.addEventListener('click', async () => {
    const mode = document.querySelector('input[name="import-mode"]:checked')?.value || 'merge';
    dom.importBackdrop.classList.add('hidden');
    try {
      const r = await window.api.importData(mode);
      if (r.canceled) return;
      if (r.error)    { showToast(t('common.error') + ': ' + r.error); return; }
      const parts = [];
      if (r.snippets)    parts.push(t('import.partsSnippets',    { n: r.snippets }));
      if (r.keybindings) parts.push(t('import.partsKeybindings', { n: r.keybindings }));
      if (r.groups)      parts.push(t('import.partsGroups',      { n: r.groups }));
      const msg = parts.length ? t('import.added', { parts: parts.join(', ') }) : t('import.nothing');
      showToast(msg + (r.skipped ? t('import.skipped', { n: r.skipped }) : ''));
    } catch (err) { showToast(t('common.error') + ': ' + err.message); }
  });

  // Модалка группы
  dom.groupClose.addEventListener('click', closeGroupModal);
  dom.groupCancel.addEventListener('click', closeGroupModal);
  dom.groupBackdrop.addEventListener('click', e => { if (e.target === dom.groupBackdrop) closeGroupModal(); });
  dom.groupForm.addEventListener('submit', e => { e.preventDefault(); saveGroup(); });

  // Триггер-клавиша
  dom.triggerSelect.addEventListener('change', async () => {
    const k = dom.triggerSelect.value;
    await window.api.setTriggerKey(k);
    dom.footerHint.textContent = t('footer.triggerHint', { key: k });
    showToast(t('footer.triggerSet', { key: k }));
  });

  // ── Сниппеты ──
  dom.snippetsSearch.addEventListener('input', () => {
    snippetSearch = dom.snippetsSearch.value.trim();
    renderSnippets();
  });
  dom.addSnippetBtn.addEventListener('click',    () => openSnippetModal());
  dom.snippetsEmptyAdd.addEventListener('click', () => openSnippetModal());

  dom.snippetClose.addEventListener('click', closeSnippetModal);
  dom.snippetCancel.addEventListener('click', closeSnippetModal);
  dom.snippetBackdrop.addEventListener('click', e => { if (e.target === dom.snippetBackdrop) closeSnippetModal(); });
  dom.snippetForm.addEventListener('submit', e => { e.preventDefault(); saveSnippet(); });

  dom.snippetReplace.addEventListener('input', () => {
    dom.snippetReplace.style.height = 'auto';
    dom.snippetReplace.style.height = Math.min(dom.snippetReplace.scrollHeight, 220) + 'px';
  });

  // ── Хоткеи ──
  dom.kbSearch.addEventListener('input', () => {
    kbSearch = dom.kbSearch.value.trim();
    renderKeybindings();
  });
  dom.addKbBtn.addEventListener('click',   () => openKbModal());
  dom.kbEmptyAdd.addEventListener('click', () => openKbModal());

  dom.kbModalClose.addEventListener('click', closeKbModal);
  dom.kbCancel.addEventListener('click', closeKbModal);
  dom.kbBackdrop.addEventListener('click', e => { if (e.target === dom.kbBackdrop) closeKbModal(); });
  dom.kbForm.addEventListener('submit', e => { e.preventDefault(); saveKeybinding(); });

  dom.kbText.addEventListener('input', () => {
    dom.kbText.style.height = 'auto';
    dom.kbText.style.height = Math.min(dom.kbText.scrollHeight, 220) + 'px';
  });

  dom.kbHotkeyField.addEventListener('click', () => { if (!capturing) startCapture(); });
  dom.kbHotkeyField.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!capturing) startCapture(); }
  });
  dom.kbHotkeyClear.addEventListener('click', e => {
    e.stopPropagation();
    capturedHotkey = null;
    resetHotkeyField();
  });

  // ── Буфер обмена ──
  dom.clearClipBtn.addEventListener('click', async () => {
    if (!await confirm(t('clip.confirmClear'))) return;
    await window.api.clearClipboardHistory();
    showToast(t('clip.cleared'));
  });

  // ── Глобальные клавиши ──
  document.addEventListener('keydown', e => {
    if (capturing) { onCaptureKeydown(e); return; }

    // Туториал
    if (!dom.tutBackdrop.classList.contains('hidden')) {
      if (e.key === 'Escape')      { closeTutorial(); return; }
      if (e.key === 'ArrowRight')  { if (tutorialStep < TUTORIAL_STEPS - 1) { tutorialStep++; applyTutorialStep(); } else closeTutorial(); return; }
      if (e.key === 'ArrowLeft')   { if (tutorialStep > 0) { tutorialStep--; applyTutorialStep(); } return; }
    }

    if (!dom.snippetBackdrop.classList.contains('hidden')) {
      if (e.key === 'Escape')                            { closeSnippetModal(); return; }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveSnippet(); return; }
    }

    if (!dom.kbBackdrop.classList.contains('hidden')) {
      if (e.key === 'Escape')                            { closeKbModal(); return; }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveKeybinding(); return; }
    }

    if (!dom.groupBackdrop.classList.contains('hidden')) {
      if (e.key === 'Escape') { closeGroupModal(); return; }
    }

    if (!dom.importBackdrop.classList.contains('hidden')) {
      if (e.key === 'Escape') { dom.importBackdrop.classList.add('hidden'); return; }
    }
  });
}

// ══════════════════════════════════════════════════════════════════
//  УТИЛИТЫ
// ══════════════════════════════════════════════════════════════════

function confirm(msg) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';
    overlay.style.zIndex = '150';
    overlay.innerHTML = `
      <div class="modal" style="max-width:320px">
        <div class="modal-header"><h2 class="modal-title">${t('common.confirm')}</h2></div>
        <div style="padding:12px 20px 20px">
          <p style="font-size:13px;color:var(--text-2);margin-bottom:14px">${esc(msg)}</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" id="c-no">${t('common.cancel')}</button>
            <button class="btn btn-primary" id="c-yes" style="background:var(--red)">${t('common.delete')}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const done = r => { document.body.removeChild(overlay); resolve(r); };
    overlay.querySelector('#c-yes').onclick = () => done(true);
    overlay.querySelector('#c-no').onclick  = () => done(false);
    overlay.addEventListener('click', e => { if (e.target === overlay) done(false); });
    document.addEventListener('keydown', function h(e) {
      if (e.key === 'Escape') { done(false); document.removeEventListener('keydown', h); }
    });
  });
}

let toastTimer;
function showToast(msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.remove('hidden');
  dom.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove('show');
    setTimeout(() => dom.toast.classList.add('hidden'), 200);
  }, 2200);
}

function esc(s)   { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ══════════════════════════════════════════════════════════════════
// Глобальная защита от падений в renderer: если что-то крашит init или
// фоновый обработчик, показываем понятное сообщение вместо чёрного окна.
function showFatal(message) {
  try {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;'
      + 'background:rgba(0,0,0,.6);z-index:99999;padding:24px;text-align:center;color:#fff;'
      + 'font-family:-apple-system,Segoe UI,sans-serif;';
    box.innerHTML = `<div style="background:#2a2a2e;border-radius:12px;padding:24px 28px;max-width:520px">
      <div style="font-size:28px;margin-bottom:8px">⚠️</div>
      <div style="font-size:15px;font-weight:600;margin-bottom:8px">Что-то пошло не так</div>
      <div style="font-size:12.5px;opacity:.8;line-height:1.5;white-space:pre-wrap;word-break:break-word">${
        (String(message || '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])))
      }</div>
    </div>`;
    document.body.appendChild(box);
  } catch {}
}
window.addEventListener('error', e => {
  console.error('[renderer] uncaught error:', e.error || e.message);
  showFatal(e.error?.stack || e.message || 'Неизвестная ошибка');
});
window.addEventListener('unhandledrejection', e => {
  console.error('[renderer] unhandled rejection:', e.reason);
  showFatal(e.reason?.stack || e.reason?.message || String(e.reason));
});

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error('[renderer] init failed:', err);
    showFatal(err?.stack || err?.message || String(err));
  });
});
