'use strict';

const Store = require('electron-store');
const { EventEmitter } = require('events');
const crypto = require('crypto');

// Ленивый t() — чтобы избежать циклической зависимости storage ↔ i18n.
// i18n.js при чтении getLang() сам делает require('./storage'), и если бы мы
// делали require('./i18n') на верхнем уровне, до завершения module.exports,
// получили бы пустой объект. Лениво — безопасно.
function t(key, params) { return require('./i18n').t(key, params); }

// Схема хранилища с дефолтными значениями
const store = new Store({
  name: 'snippi-data',
  defaults: {
    enabled: true,
    autoStart: true,
    triggerKey: 'Shift',
    snippets: [],
    keybindings: [],
    groups: [],
    clipboardHistory: [],
    tutorialShown: false,
    theme:            'auto',
    language:         'ru',
    ocrEnabled:        true,
    ocrJoinParagraphs: true,
    ocrHotkey:         'CommandOrControl+Shift+1',
    stats: {
      expansions:   0,   // суммарное число раскрытий (сниппеты + хоткеи)
      snippetFires: 0,
      hotkeyFires:  0,
      charsSaved:   0,   // сумма (replacement.length - trigger.length), не меньше 0
      firstUsedAt:  null // ISO-дата первого срабатывания
    }
  },
  schema: {
    enabled:          { type: 'boolean' },
    autoStart:        { type: 'boolean' },
    triggerKey:       { type: 'string' },
    keybindings:      { type: 'array' },
    groups:           { type: 'array' },
    clipboardHistory: { type: 'array' },
    tutorialShown:    { type: 'boolean' },
    theme:            { type: 'string' },
    language:         { type: 'string' },
    ocrEnabled:        { type: 'boolean' },
    ocrJoinParagraphs: { type: 'boolean' },
    ocrHotkey:         { type: 'string' },
    stats: {
      type: 'object',
      properties: {
        expansions:   { type: 'number' },
        snippetFires: { type: 'number' },
        hotkeyFires:  { type: 'number' },
        charsSaved:   { type: 'number' },
        firstUsedAt:  { type: ['string', 'null'] }
      }
    },
    snippets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:          { type: 'string' },
          trigger:     { type: 'string' },
          replacement: { type: 'string' },
          groupId:     { type: ['string', 'null'] },
          createdAt:   { type: 'string' }
        }
      }
    }
  }
});

class Storage extends EventEmitter {
  // ── Настройки ──────────────────────────────────────────────────────────────

  getEnabled()        { return store.get('enabled'); }
  setEnabled(val)     { store.set('enabled', Boolean(val)); this.emit('settings-changed', { enabled: Boolean(val) }); }
  getAutoStart()      { return store.get('autoStart'); }
  setAutoStart(val)   { store.set('autoStart', Boolean(val)); }
  getTriggerKey()     { return store.get('triggerKey', 'Shift'); }
  setTriggerKey(key)  { store.set('triggerKey', key); }

  getTheme()         { return store.get('theme', 'auto'); }
  setTheme(val)      { store.set('theme', String(val || 'auto')); }
  getLanguage()      { return store.get('language', 'ru'); }
  setLanguage(val)   { store.set('language', String(val || 'ru')); }

  // ── OCR (скриншот → текст) ─────────────────────────────────────────────────
  getOcrSettings() {
    return {
      enabled:        store.get('ocrEnabled',        true),
      joinParagraphs: store.get('ocrJoinParagraphs', true),
      hotkey:         store.get('ocrHotkey',         'CommandOrControl+Shift+1'),
    };
  }
  setOcrSettings(patch) {
    if (patch.enabled        !== undefined) store.set('ocrEnabled',        Boolean(patch.enabled));
    if (patch.joinParagraphs !== undefined) store.set('ocrJoinParagraphs', Boolean(patch.joinParagraphs));
    if (patch.hotkey         !== undefined) store.set('ocrHotkey',         String(patch.hotkey));
    const s = this.getOcrSettings();
    this.emit('ocr-settings-changed', s);
    return s;
  }

  // ── Переводчик (встроенный, без API-ключа) ────────────────────────────────
  getTranslateSettings() {
    return {
      enabled:    store.get('translateEnabled',    true),
      hotkey:     store.get('translateHotkey',     'CommandOrControl+Shift+2'),
      targetLang: store.get('translateTargetLang', 'EN'),
    };
  }
  setTranslateSettings(patch) {
    if (patch.enabled    !== undefined) store.set('translateEnabled',    Boolean(patch.enabled));
    if (patch.hotkey     !== undefined) store.set('translateHotkey',     String(patch.hotkey));
    if (patch.targetLang !== undefined) store.set('translateTargetLang', String(patch.targetLang));
    const s = this.getTranslateSettings();
    this.emit('translate-settings-changed', s);
    return s;
  }

  // ── Статистика ─────────────────────────────────────────────────────────────

  getStats() {
    const s = store.get('stats', {});
    return {
      expansions:   s.expansions   || 0,
      snippetFires: s.snippetFires || 0,
      hotkeyFires:  s.hotkeyFires  || 0,
      charsSaved:   s.charsSaved   || 0,
      firstUsedAt:  s.firstUsedAt  || null,
    };
  }

  /** Инкрементирует статистику. type = 'snippet' | 'hotkey'. chars = длина вставленного текста. */
  bumpStats(type, chars) {
    const s = this.getStats();
    s.expansions += 1;
    if (type === 'snippet') s.snippetFires += 1;
    else if (type === 'hotkey') s.hotkeyFires += 1;
    s.charsSaved += Math.max(0, chars | 0);
    if (!s.firstUsedAt) s.firstUsedAt = new Date().toISOString();
    store.set('stats', s);
    this.emit('stats-changed', s);
    return s;
  }

  resetStats() {
    const s = { expansions: 0, snippetFires: 0, hotkeyFires: 0, charsSaved: 0, firstUsedAt: null };
    store.set('stats', s);
    this.emit('stats-changed', s);
    return s;
  }

  // ── Сниппеты ───────────────────────────────────────────────────────────────

  getSnippets() {
    return store.get('snippets', []);
  }

  addSnippet(data) {
    if (!data.trigger || !data.replacement) {
      throw new Error(t('storage.err.triggerReplaceRequired'));
    }

    const snippets = this.getSnippets();

    if (snippets.some(s => s.trigger === data.trigger)) {
      throw new Error(t('storage.err.triggerExists', { trigger: data.trigger }));
    }

    const snippet = {
      id:          crypto.randomUUID(),
      trigger:     data.trigger.trim(),
      replacement: data.replacement,
      groupId:     data.groupId ?? null,
      createdAt:   new Date().toISOString()
    };

    snippets.push(snippet);
    store.set('snippets', snippets);
    this.emit('snippets-changed', snippets);
    return snippet;
  }

  updateSnippet(id, data) {
    const snippets = this.getSnippets();
    const index = snippets.findIndex(s => s.id === id);

    if (index === -1) throw new Error(t('storage.err.snippetNotFound'));

    if (data.trigger && snippets.some(s => s.trigger === data.trigger && s.id !== id)) {
      throw new Error(t('storage.err.triggerInUse', { trigger: data.trigger }));
    }

    snippets[index] = {
      ...snippets[index],
      trigger:     data.trigger     !== undefined ? data.trigger.trim()  : snippets[index].trigger,
      replacement: data.replacement !== undefined ? data.replacement      : snippets[index].replacement,
      groupId:     data.groupId     !== undefined ? data.groupId          : snippets[index].groupId
    };

    store.set('snippets', snippets);
    this.emit('snippets-changed', snippets);
    return snippets[index];
  }

  deleteSnippet(id) {
    const snippets = this.getSnippets().filter(s => s.id !== id);
    store.set('snippets', snippets);
    this.emit('snippets-changed', snippets);
  }

  duplicateSnippet(id) {
    const snippets = this.getSnippets();
    const original = snippets.find(s => s.id === id);
    if (!original) throw new Error(t('storage.err.snippetNotFound'));

    // Подбираем уникальный триггер: trigger2, trigger3 …
    let i = 2;
    let newTrigger = original.trigger + i;
    while (snippets.some(s => s.trigger === newTrigger)) {
      i++;
      newTrigger = original.trigger + i;
    }

    const dup = {
      id:          crypto.randomUUID(),
      trigger:     newTrigger,
      replacement: original.replacement,
      groupId:     original.groupId ?? null,
      createdAt:   new Date().toISOString()
    };

    snippets.push(dup);
    store.set('snippets', snippets);
    this.emit('snippets-changed', snippets);
    return dup;
  }

  // ── Хоткеи ────────────────────────────────────────────────────────────────

  getKeybindings() {
    return store.get('keybindings', []);
  }

  addKeybinding(data) {
    if (!data.hotkeyData || !data.text) throw new Error(t('storage.err.hotkeyTextRequired'));

    const bindings = this.getKeybindings();

    if (bindings.some(b => isSameHotkey(b.hotkeyData, data.hotkeyData))) {
      throw new Error(t('storage.err.hotkeyInUse', { hotkey: data.hotkey }));
    }

    const binding = {
      id:          crypto.randomUUID(),
      hotkey:      data.hotkey,
      hotkeyData:  data.hotkeyData,
      text:        data.text,
      createdAt:   new Date().toISOString()
    };

    bindings.push(binding);
    store.set('keybindings', bindings);
    this.emit('keybindings-changed', bindings);
    return binding;
  }

  updateKeybinding(id, data) {
    const bindings = this.getKeybindings();
    const idx = bindings.findIndex(b => b.id === id);
    if (idx === -1) throw new Error(t('storage.err.hotkeyNotFound'));

    if (data.hotkeyData && bindings.some(b => b.id !== id && isSameHotkey(b.hotkeyData, data.hotkeyData))) {
      throw new Error(t('storage.err.hotkeyInUse', { hotkey: data.hotkey }));
    }

    bindings[idx] = { ...bindings[idx], ...data };
    store.set('keybindings', bindings);
    this.emit('keybindings-changed', bindings);
    return bindings[idx];
  }

  deleteKeybinding(id) {
    const bindings = this.getKeybindings().filter(b => b.id !== id);
    store.set('keybindings', bindings);
    this.emit('keybindings-changed', bindings);
  }

  // ── Группы ────────────────────────────────────────────────────────────────

  getGroups() {
    return store.get('groups', []);
  }

  addGroup(data) {
    const name = (data.name || '').trim();
    if (!name) throw new Error(t('storage.err.groupNameRequired'));
    if (name.length > 30) throw new Error(t('storage.err.groupNameTooLong'));

    const groups = this.getGroups();
    if (groups.some(g => g.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(t('storage.err.groupExists', { name }));
    }

    const group = {
      id:        crypto.randomUUID(),
      name,
      color:     data.color || null,
      createdAt: new Date().toISOString()
    };
    groups.push(group);
    store.set('groups', groups);
    this.emit('groups-changed', groups);
    return group;
  }

  updateGroup(id, data) {
    const groups = this.getGroups();
    const idx    = groups.findIndex(g => g.id === id);
    if (idx === -1) throw new Error(t('storage.err.groupNotFound'));

    if (data.name) {
      const newName = data.name.trim();
      if (groups.some(g => g.id !== id && g.name.toLowerCase() === newName.toLowerCase())) {
        throw new Error(t('storage.err.groupExists', { name: newName }));
      }
      groups[idx].name = newName;
    }
    if (data.color !== undefined) groups[idx].color = data.color;

    store.set('groups', groups);
    this.emit('groups-changed', groups);
    return groups[idx];
  }

  deleteGroup(id) {
    const groups = this.getGroups().filter(g => g.id !== id);
    store.set('groups', groups);

    // Сниппеты этой группы переносим в "Без группы" (groupId = null)
    const snippets = this.getSnippets().map(s =>
      s.groupId === id ? { ...s, groupId: null } : s
    );
    store.set('snippets', snippets);

    this.emit('groups-changed', groups);
    this.emit('snippets-changed', snippets);
  }

  // ── История буфера обмена ─────────────────────────────────────────────────

  getClipboardHistory() {
    return store.get('clipboardHistory', []);
  }

  addClipboardEntry(text) {
    if (!text || !text.trim()) return null;
    const history = this.getClipboardHistory();
    if (history.length > 0 && history[0].text === text) return null;
    const entry = { id: crypto.randomUUID(), text, ts: Date.now() };
    const updated = [entry, ...history].slice(0, 50);
    store.set('clipboardHistory', updated);
    this.emit('clipboard-history-changed', updated);
    return entry;
  }

  deleteClipboardEntry(id) {
    const updated = this.getClipboardHistory().filter(e => e.id !== id);
    store.set('clipboardHistory', updated);
    this.emit('clipboard-history-changed', updated);
  }

  clearClipboardHistory() {
    store.set('clipboardHistory', []);
    this.emit('clipboard-history-changed', []);
  }

  // ── Туториал ──────────────────────────────────────────────────────────────

  getTutorialShown()    { return store.get('tutorialShown', false); }
  setTutorialShown(val) { store.set('tutorialShown', Boolean(val)); }

  // ── Импорт / Экспорт ──────────────────────────────────────────────────────

  exportData() {
    return {
      version:    1,
      exportedAt: new Date().toISOString(),
      app:        'snippi',
      snippets:   this.getSnippets(),
      keybindings: this.getKeybindings(),
      groups:     this.getGroups()
    };
  }

  /**
   * Импорт данных. mode = 'merge' (по умолчанию) или 'replace'.
   * Возвращает статистику: { snippets, keybindings, groups, skipped }.
   */
  importData(data, mode = 'merge') {
    if (!data || typeof data !== 'object') throw new Error(t('storage.err.invalidFormat'));
    const incomingSnippets = Array.isArray(data.snippets)    ? data.snippets    : [];
    const incomingBindings = Array.isArray(data.keybindings) ? data.keybindings : [];
    const incomingGroups   = Array.isArray(data.groups)      ? data.groups      : [];

    const stats = { snippets: 0, keybindings: 0, groups: 0, skipped: 0 };

    if (mode === 'replace') {
      const newGroups = incomingGroups.map(g => ({
        id:        crypto.randomUUID(),
        name:      g.name,
        color:     g.color || null,
        createdAt: g.createdAt || new Date().toISOString(),
        _oldId:    g.id
      }));
      const groupIdMap = new Map(newGroups.map(g => [g._oldId, g.id]));
      newGroups.forEach(g => delete g._oldId);

      const newSnippets = incomingSnippets.map(s => ({
        id:          crypto.randomUUID(),
        trigger:     s.trigger,
        replacement: s.replacement,
        groupId:     s.groupId ? (groupIdMap.get(s.groupId) ?? null) : null,
        createdAt:   s.createdAt || new Date().toISOString()
      }));

      const newBindings = incomingBindings.map(b => ({
        id:         crypto.randomUUID(),
        hotkey:     b.hotkey,
        hotkeyData: b.hotkeyData,
        text:       b.text,
        createdAt:  b.createdAt || new Date().toISOString()
      }));

      store.set('groups',      newGroups);
      store.set('snippets',    newSnippets);
      store.set('keybindings', newBindings);

      stats.groups      = newGroups.length;
      stats.snippets    = newSnippets.length;
      stats.keybindings = newBindings.length;

    } else {
      // merge: сопоставляем группы по имени, пропускаем дубликаты
      const existingGroups = this.getGroups();
      const groupIdMap = new Map(); // oldId → newId/existingId
      const groupsToAdd = [];

      for (const g of incomingGroups) {
        const existing = existingGroups.find(eg => eg.name.toLowerCase() === (g.name || '').toLowerCase());
        if (existing) {
          groupIdMap.set(g.id, existing.id);
        } else if (g.name) {
          const newId = crypto.randomUUID();
          groupIdMap.set(g.id, newId);
          groupsToAdd.push({ id: newId, name: g.name, color: g.color || null, createdAt: g.createdAt || new Date().toISOString() });
        }
      }
      if (groupsToAdd.length) {
        store.set('groups', [...existingGroups, ...groupsToAdd]);
        stats.groups = groupsToAdd.length;
      }

      // Сниппеты: пропускаем по совпадению триггера
      const existingSnippets = this.getSnippets();
      const triggerSet = new Set(existingSnippets.map(s => s.trigger));
      const snippetsToAdd = [];
      for (const s of incomingSnippets) {
        if (!s.trigger || !s.replacement) { stats.skipped++; continue; }
        if (triggerSet.has(s.trigger))     { stats.skipped++; continue; }
        snippetsToAdd.push({
          id:          crypto.randomUUID(),
          trigger:     s.trigger,
          replacement: s.replacement,
          groupId:     s.groupId ? (groupIdMap.get(s.groupId) ?? null) : null,
          createdAt:   s.createdAt || new Date().toISOString()
        });
        triggerSet.add(s.trigger);
      }
      if (snippetsToAdd.length) {
        store.set('snippets', [...existingSnippets, ...snippetsToAdd]);
        stats.snippets = snippetsToAdd.length;
      }

      // Хоткеи: пропускаем по совпадению hotkeyData
      const existingBindings = this.getKeybindings();
      const bindingsToAdd = [];
      for (const b of incomingBindings) {
        if (!b.hotkeyData || !b.text) { stats.skipped++; continue; }
        if (existingBindings.some(eb => isSameHotkey(eb.hotkeyData, b.hotkeyData)) ||
            bindingsToAdd.some(ab => isSameHotkey(ab.hotkeyData, b.hotkeyData))) {
          stats.skipped++; continue;
        }
        bindingsToAdd.push({
          id:         crypto.randomUUID(),
          hotkey:     b.hotkey,
          hotkeyData: b.hotkeyData,
          text:       b.text,
          createdAt:  b.createdAt || new Date().toISOString()
        });
      }
      if (bindingsToAdd.length) {
        store.set('keybindings', [...existingBindings, ...bindingsToAdd]);
        stats.keybindings = bindingsToAdd.length;
      }
    }

    this.emit('groups-changed',      this.getGroups());
    this.emit('snippets-changed',    this.getSnippets());
    this.emit('keybindings-changed', this.getKeybindings());

    return stats;
  }
}

function isSameHotkey(a, b) {
  return a.code === b.code &&
    a.ctrlKey  === b.ctrlKey  &&
    a.altKey   === b.altKey   &&
    a.shiftKey === b.shiftKey &&
    a.metaKey  === b.metaKey;
}

module.exports = new Storage();
