'use strict';
/* ════════════════════════════════════════════════════════════════
   Все ipcMain.handle регистрируются здесь. Эта функция должна
   вызываться один раз при старте, после app.whenReady().
════════════════════════════════════════════════════════════════ */

const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const storage      = require('./storage');
const translator   = require('./translator');
const { setAutoLaunch }                  = require('./autolaunch');
const { startSnip, handleSnipPick, closeSnipWindow, cancelSnip } = require('./snip');
const { registerOcrHotkey, registerTranslateHotkey, runTranslate } = require('./hotkeys');
const { updateTrayMenu }                 = require('./tray');
const { getMainWindow }                  = require('./mainWindow');
const { t }                              = require('./i18n');
const updater                            = require('./updater');

function setupIPC() {
  // ── Сниппеты ──
  ipcMain.handle('get-snippets',    ()         => storage.getSnippets());
  ipcMain.handle('add-snippet',     (_, d)     => storage.addSnippet(d));
  ipcMain.handle('update-snippet',  (_, id, d) => storage.updateSnippet(id, d));
  ipcMain.handle('delete-snippet',  (_, id)    => storage.deleteSnippet(id));
  ipcMain.handle('duplicate-snippet',(_, id)   => storage.duplicateSnippet(id));

  // ── Хоткеи (custom keybindings, не глобальные горячие клавиши приложения) ──
  ipcMain.handle('get-keybindings',   ()        => storage.getKeybindings());
  ipcMain.handle('add-keybinding',    (_, d)    => storage.addKeybinding(d));
  ipcMain.handle('update-keybinding', (_, id,d) => storage.updateKeybinding(id, d));
  ipcMain.handle('delete-keybinding', (_, id)   => storage.deleteKeybinding(id));

  // ── Группы ──
  ipcMain.handle('get-groups',    ()        => storage.getGroups());
  ipcMain.handle('add-group',     (_, d)    => storage.addGroup(d));
  ipcMain.handle('update-group',  (_, id,d) => storage.updateGroup(id, d));
  ipcMain.handle('delete-group',  (_, id)   => storage.deleteGroup(id));

  // ── Общие настройки ──
  ipcMain.handle('get-enabled', () => storage.getEnabled());
  ipcMain.handle('set-enabled', (_, v) => {
    storage.setEnabled(v);
    updateTrayMenu();
    return v;
  });

  ipcMain.handle('get-auto-start', () => storage.getAutoStart());
  ipcMain.handle('set-auto-start', async (_, v) => {
    storage.setAutoStart(v);
    await setAutoLaunch(v);
    return v;
  });

  ipcMain.handle('get-trigger-key', () => storage.getTriggerKey());
  ipcMain.handle('set-trigger-key', (_, k) => { storage.setTriggerKey(k); return k; });
  ipcMain.handle('get-available-trigger-keys', () => require('./expander').AVAILABLE_TRIGGER_KEYS);
  ipcMain.handle('get-platform', () => process.platform);

  // ── Тема и язык ──
  ipcMain.handle('get-theme',    ()     => storage.getTheme());
  ipcMain.handle('set-theme',    (_, v) => { storage.setTheme(v); return v; });
  ipcMain.handle('get-language', ()     => storage.getLanguage());
  ipcMain.handle('set-language', (_, v) => {
    storage.setLanguage(v);
    // Перестраиваем меню трея с новыми переводами
    try { updateTrayMenu(); } catch {}
    return v;
  });

  // ── История буфера обмена ──
  ipcMain.handle('get-clipboard-history',   ()      => storage.getClipboardHistory());
  ipcMain.handle('delete-clipboard-entry',  (_, id) => storage.deleteClipboardEntry(id));
  ipcMain.handle('clear-clipboard-history', ()      => storage.clearClipboardHistory());

  // ── Туториал ──
  ipcMain.handle('get-tutorial-shown', ()      => storage.getTutorialShown());
  ipcMain.handle('set-tutorial-shown', (_, v)  => storage.setTutorialShown(v));

  // ── Статистика ──
  ipcMain.handle('get-stats',   () => storage.getStats());
  ipcMain.handle('reset-stats', () => storage.resetStats());

  // ── OCR (скриншот → текст) ──
  ipcMain.handle('get-ocr-settings', ()     => storage.getOcrSettings());
  ipcMain.handle('set-ocr-settings', (_, p) => {
    const s = storage.setOcrSettings(p);
    registerOcrHotkey();
    return s;
  });
  ipcMain.handle('snip-pick',   (_, b) => handleSnipPick(b));
  ipcMain.handle('snip-cancel', ()     => cancelSnip());
  ipcMain.handle('ocr-trigger', ()     => startSnip('ocr'));

  // ── Переводчик ──
  ipcMain.handle('get-translate-settings', ()     => storage.getTranslateSettings());
  ipcMain.handle('set-translate-settings', (_, p) => {
    if (p && p.targetLang !== undefined) {
      console.log('[translate] сохраняю целевой язык →', p.targetLang);
    }
    const s = storage.setTranslateSettings(p);
    registerTranslateHotkey();
    return s;
  });
  ipcMain.handle('translate-trigger',   () => runTranslate());
  ipcMain.handle('get-translate-langs', () => translator.TARGET_LANGS);
  ipcMain.handle('translate-test', async (_, { targetLang, source } = {}) => {
    try {
      const cfg = storage.getTranslateSettings();
      const lang = targetLang || cfg.targetLang || 'EN';
      const sample = source || 'Hello, world!';
      const r = await translator.translate(sample, { targetLang: lang });
      return { ok: true, source: sample, translated: r.text, targetLang: lang };
    } catch (e) {
      return { ok: false, message: e.message || String(e) };
    }
  });

  // ── Авто-обновления ──
  ipcMain.handle('updater-get-state', () => updater.getState());
  ipcMain.handle('updater-check',     () => updater.checkForUpdates({ silent: false }));
  ipcMain.handle('updater-install',   () => updater.installAndRestart());
  ipcMain.handle('app-get-version',   () => require('electron').app.getVersion());

  // ── Импорт / Экспорт ──
  ipcMain.handle('export-data', async () => {
    const win = getMainWindow();
    const defaultName = `snippi-${new Date().toISOString().slice(0,10)}.json`;
    const result = await dialog.showSaveDialog(win || undefined, {
      title:       t('dialog.exportTitle'),
      defaultPath: defaultName,
      filters:     [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    try {
      const data = storage.exportData();
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf8');
      return {
        canceled: false,
        path: result.filePath,
        snippets: data.snippets.length,
        keybindings: data.keybindings.length,
        groups: data.groups.length,
      };
    } catch (err) {
      return { canceled: false, error: err.message };
    }
  });

  ipcMain.handle('import-data', async (_, mode = 'merge') => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win || undefined, {
      title:      t('dialog.importTitle'),
      properties: ['openFile'],
      filters:    [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return { canceled: true };
    try {
      const raw  = fs.readFileSync(result.filePaths[0], 'utf8');
      const data = JSON.parse(raw);
      const stats = storage.importData(data, mode);
      return { canceled: false, ...stats };
    } catch (err) {
      return { canceled: false, error: err.message };
    }
  });
}

module.exports = { setupIPC };
