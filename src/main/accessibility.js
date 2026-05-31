'use strict';
/* ════════════════════════════════════════════════════════════════
   Запрос на macOS-разрешение «Универсальный доступ»: нужно для
   перехвата клавиатуры (uiohook).
════════════════════════════════════════════════════════════════ */

const { app, dialog, systemPreferences, shell } = require('electron');
const { t } = require('./i18n');

async function checkAccessibilityPermissions() {
  if (process.platform !== 'darwin') return true;
  if (systemPreferences.isTrustedAccessibilityClient(false)) return true;

  const appName = app.isPackaged ? app.getName() : 'Electron';
  const { response } = await dialog.showMessageBox({
    type:      'warning',
    title:     t('accessibility.title'),
    message:   t('accessibility.message', { app: appName }),
    detail:    t('accessibility.detail',  { app: appName }),
    buttons:   [t('btn.openSettings'), t('btn.later')],
    defaultId: 0,
  });

  if (response === 0) {
    systemPreferences.isTrustedAccessibilityClient(true);
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  }
  return false;
}

module.exports = { checkAccessibilityPermissions };
