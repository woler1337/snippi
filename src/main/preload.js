'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ── Сниппеты ──────────────────────────────────────────────────────────────
  getSnippets:    ()        => ipcRenderer.invoke('get-snippets'),
  addSnippet:     (data)    => ipcRenderer.invoke('add-snippet', data),
  updateSnippet:  (id, d)   => ipcRenderer.invoke('update-snippet', id, d),
  deleteSnippet:  (id)      => ipcRenderer.invoke('delete-snippet', id),

  // ── Хоткеи ────────────────────────────────────────────────────────────────
  getKeybindings:   ()       => ipcRenderer.invoke('get-keybindings'),
  addKeybinding:    (data)   => ipcRenderer.invoke('add-keybinding', data),
  updateKeybinding: (id, d)  => ipcRenderer.invoke('update-keybinding', id, d),
  deleteKeybinding: (id)     => ipcRenderer.invoke('delete-keybinding', id),

  // ── Группы ────────────────────────────────────────────────────────────────
  getGroups:    ()        => ipcRenderer.invoke('get-groups'),
  addGroup:     (data)    => ipcRenderer.invoke('add-group', data),
  updateGroup:  (id, d)   => ipcRenderer.invoke('update-group', id, d),
  deleteGroup:  (id)      => ipcRenderer.invoke('delete-group', id),

  // ── Дубликат сниппета ─────────────────────────────────────────────────────
  duplicateSnippet: (id)  => ipcRenderer.invoke('duplicate-snippet', id),

  // ── Тема и язык ───────────────────────────────────────────────────────────
  getTheme:    ()  => ipcRenderer.invoke('get-theme'),
  setTheme:    (v) => ipcRenderer.invoke('set-theme', v),
  getLanguage: ()  => ipcRenderer.invoke('get-language'),
  setLanguage: (v) => ipcRenderer.invoke('set-language', v),

  // ── Импорт / Экспорт ──────────────────────────────────────────────────────
  exportData: ()        => ipcRenderer.invoke('export-data'),
  importData: (mode)    => ipcRenderer.invoke('import-data', mode),

  // ── Настройки ─────────────────────────────────────────────────────────────
  getEnabled:              ()    => ipcRenderer.invoke('get-enabled'),
  setEnabled:              (v)   => ipcRenderer.invoke('set-enabled', v),
  getAutoStart:            ()    => ipcRenderer.invoke('get-auto-start'),
  setAutoStart:            (v)   => ipcRenderer.invoke('set-auto-start', v),
  getTriggerKey:           ()    => ipcRenderer.invoke('get-trigger-key'),
  setTriggerKey:           (k)   => ipcRenderer.invoke('set-trigger-key', k),
  getAvailableTriggerKeys: ()    => ipcRenderer.invoke('get-available-trigger-keys'),
  getPlatform:             ()    => ipcRenderer.invoke('get-platform'),

  // ── История буфера обмена ─────────────────────────────────────────────────
  getClipboardHistory:   ()       => ipcRenderer.invoke('get-clipboard-history'),
  deleteClipboardEntry:  (id)     => ipcRenderer.invoke('delete-clipboard-entry', id),
  clearClipboardHistory: ()       => ipcRenderer.invoke('clear-clipboard-history'),

  // ── Туториал ──────────────────────────────────────────────────────────────
  getTutorialShown: ()    => ipcRenderer.invoke('get-tutorial-shown'),
  setTutorialShown: (v)   => ipcRenderer.invoke('set-tutorial-shown', v),

  // ── Статистика ────────────────────────────────────────────────────────────
  getStats:   ()  => ipcRenderer.invoke('get-stats'),
  resetStats: ()  => ipcRenderer.invoke('reset-stats'),

  // ── OCR (скриншот → текст) ────────────────────────────────────────────────
  getOcrSettings: ()      => ipcRenderer.invoke('get-ocr-settings'),
  setOcrSettings: (patch) => ipcRenderer.invoke('set-ocr-settings', patch),
  ocrTrigger:     ()      => ipcRenderer.invoke('ocr-trigger'),
  snipPick:       (b)     => ipcRenderer.invoke('snip-pick',   b),
  snipCancel:     ()      => ipcRenderer.invoke('snip-cancel'),
  onSnipMode:     (cb)    => ipcRenderer.on('snip-mode', (_, m) => cb(m)),

  // ── Переводчик (DeepL) ────────────────────────────────────────────────────
  getTranslateSettings: ()      => ipcRenderer.invoke('get-translate-settings'),
  setTranslateSettings: (patch) => ipcRenderer.invoke('set-translate-settings', patch),
  translateTrigger:     ()      => ipcRenderer.invoke('translate-trigger'),
  getTranslateLangs:    ()      => ipcRenderer.invoke('get-translate-langs'),
  translateTest:        (p)     => ipcRenderer.invoke('translate-test', p || {}),


  // ── События из main-процесса ──────────────────────────────────────────────
  onSnippetsChanged:          (cb) => ipcRenderer.on('snippets-changed',          (_, d) => cb(d)),
  onKeybindingsChanged:       (cb) => ipcRenderer.on('keybindings-changed',       (_, d) => cb(d)),
  onGroupsChanged:            (cb) => ipcRenderer.on('groups-changed',            (_, d) => cb(d)),
  onSettingsChanged:          (cb) => ipcRenderer.on('settings-changed',          (_, d) => cb(d)),
  onExpanderError:            (cb) => ipcRenderer.on('expander-error',            (_, m) => cb(m)),
  onClipboardHistoryChanged:  (cb) => ipcRenderer.on('clipboard-history-changed', (_, d) => cb(d)),
  onStatsChanged:             (cb) => ipcRenderer.on('stats-changed',             (_, d) => cb(d)),
  onOcrResult:                (cb) => ipcRenderer.on('ocr-result',                (_, d) => cb(d)),
  onTranslateResult:          (cb) => ipcRenderer.on('translate-result',          (_, d) => cb(d)),
  onHotkeyConflict:           (cb) => ipcRenderer.on('hotkey-conflict',           (_, d) => cb(d)),
});
