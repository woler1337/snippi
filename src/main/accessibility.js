'use strict';
/* ════════════════════════════════════════════════════════════════
   Запрос на macOS-разрешение «Универсальный доступ»: нужно для
   перехвата клавиатуры (uiohook).
════════════════════════════════════════════════════════════════ */

const { app, dialog, systemPreferences, shell } = require('electron');

async function checkAccessibilityPermissions() {
  if (process.platform !== 'darwin') return true;
  if (systemPreferences.isTrustedAccessibilityClient(false)) return true;

  const appName = app.isPackaged ? app.getName() : 'Electron';
  const { response } = await dialog.showMessageBox({
    type:      'warning',
    title:     'Нужен доступ к Универсальному доступу',
    message:   `${appName} требует разрешения для перехвата клавиатуры`,
    detail:    `Системные настройки → Конфиденциальность и безопасность → Универсальный доступ → добавьте «${appName}» → перезапустите.`,
    buttons:   ['Открыть настройки', 'Позже'],
    defaultId: 0,
  });

  if (response === 0) {
    systemPreferences.isTrustedAccessibilityClient(true);
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  }
  return false;
}

module.exports = { checkAccessibilityPermissions };
