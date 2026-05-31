'use strict';
/* ════════════════════════════════════════════════════════════════
   Main-side i18n. Используется в:
     • системных Notification
     • dialog.showMessageBox / showSaveDialog / showOpenDialog
     • меню трея
     • сообщениях об ошибках, всплывающих в UI

   Renderer имеет собственный src/renderer/i18n.js (запускается в browser
   context, не имеет доступа к storage). Здесь — короткий main-side
   словарь, читает текущий язык лениво из storage.
════════════════════════════════════════════════════════════════ */

const DICT = {
  ru: {
    // Accessibility (macOS permission)
    'accessibility.title':   'Нужен доступ к Универсальному доступу',
    'accessibility.message': '{app} требует разрешения для перехвата клавиатуры',
    'accessibility.detail':  'Системные настройки → Конфиденциальность и безопасность → Универсальный доступ → добавьте «{app}» → перезапустите.',

    // Screen Recording (macOS)
    'screenRec.title':      'Нужно разрешение «Запись экрана»',
    'screenRec.message':    'Snippi не может сделать скриншот для распознавания текста.\n\n{detail}',
    'screenRec.notDetermined': 'macOS ещё не запросил разрешение, либо оно потеряно после переустановки приложения.',
    'screenRec.denied':     'Разрешение «Запись экрана» сейчас выключено или отозвано.',
    'screenRec.detail':
      'Чтобы исправить:\n' +
      '1. Нажмите «Открыть настройки» ниже.\n' +
      '2. Найдите «{app}» в списке (или добавьте кнопкой «+»).\n' +
      '3. Включите тумблер рядом с «{app}».\n' +
      '4. Полностью закройте и перезапустите приложение.',

    // Common buttons
    'btn.openSettings': 'Открыть настройки',
    'btn.later':        'Позже',

    // Tray menu
    'tray.open':         'Открыть Snippi',
    'tray.palette':      'Быстрый поиск сниппета ({hotkey})',
    'tray.enabled':      'Включён',
    'tray.resetMenuBar': 'Сбросить menu bar (если иконка пропала)',
    'tray.quit':         'Выйти',

    // Hotkey conflicts
    'hotkey.conflictTitle': 'Хоткей занят',
    'hotkey.conflictBody':  '«{hotkey}» уже используется системой или другим приложением. Поменяйте комбинацию для «{feature}» в настройках.',
    'hotkey.feature.translate': 'Перевод',
    'hotkey.feature.ocr':       'Скриншот',

    // OCR notifications
    'ocr.notify.ok':        'OCR: скопировано {chars} симв.',
    'ocr.notify.fail':      'OCR: ошибка',
    'ocr.notify.noText':    'OCR: не удалось распознать текст',
    'ocr.err.prefix':       'OCR: {msg}',

    // Translate notifications
    'translate.notify.title':    'Перевод → {lang} ({chars} симв.)',
    'translate.notify.copied':   '{chars} симв. скопировано в буфер обмена',
    'translate.notify.errTitle': 'Ошибка перевода',
    'translate.notify.errBody':  'Не удалось перевести',
    'translate.err.noText':      'Не удалось распознать текст на скриншоте',
    'translate.err.prefix':      'Перевод: {msg}',
    'translate.err.generic':     'Ошибка: {msg}',

    // Errors (OCR engine / files)
    'err.ocrHelperMissing':   'ocr-helper не найден. Скомпилируйте через `bash scripts/build-helper.sh`',
    'err.fileNotFound':       'Файл не найден: {path}',
    'err.screenAccess':       'Не удалось получить доступ к экрану: {msg}',
    'err.noScreenSource':     'Источник экрана не найден (вероятно нет разрешения Screen Recording)',
    'err.noScreenPermission': 'Нет разрешения на запись экрана',

    // Translator errors
    'translator.err.empty':   'Пустой текст',
    'translator.err.parse':   'Не удалось разобрать ответ: {msg}',
    'translator.err.network': 'Сеть: {msg}',
    'translator.err.emptyResponse': 'Пустой ответ от переводчика',

    // Export / Import dialogs
    'dialog.exportTitle': 'Сохранить настройки',
    'dialog.importTitle': 'Выбрать файл с настройками',

    // Storage validation errors
    'storage.err.triggerReplaceRequired': 'Триггер и замена обязательны',
    'storage.err.triggerExists':          'Триггер "{trigger}" уже существует',
    'storage.err.triggerInUse':           'Триггер "{trigger}" уже используется',
    'storage.err.snippetNotFound':        'Сниппет не найден',
    'storage.err.hotkeyTextRequired':     'Клавиша и текст обязательны',
    'storage.err.hotkeyInUse':            'Комбинация «{hotkey}» уже используется',
    'storage.err.hotkeyNotFound':         'Хоткей не найден',
    'storage.err.groupNameRequired':      'Введите название группы',
    'storage.err.groupNameTooLong':       'Максимум 30 символов',
    'storage.err.groupExists':            'Группа «{name}» уже существует',
    'storage.err.groupNotFound':          'Группа не найдена',
    'storage.err.invalidFormat':          'Неверный формат файла',
  },

  en: {
    'accessibility.title':   'Accessibility permission required',
    'accessibility.message': '{app} needs permission to intercept keystrokes',
    'accessibility.detail':  'System Settings → Privacy & Security → Accessibility → add "{app}" → restart.',

    'screenRec.title':      'Screen Recording permission required',
    'screenRec.message':    'Snippi cannot take a screenshot for text recognition.\n\n{detail}',
    'screenRec.notDetermined': 'macOS has not requested permission yet, or it was lost after reinstalling the app.',
    'screenRec.denied':     'Screen Recording permission is currently disabled or revoked.',
    'screenRec.detail':
      'To fix:\n' +
      '1. Click "Open Settings" below.\n' +
      '2. Find "{app}" in the list (or add it with the "+" button).\n' +
      '3. Toggle the switch next to "{app}".\n' +
      '4. Fully quit and restart the app.',

    'btn.openSettings': 'Open Settings',
    'btn.later':        'Later',

    'tray.open':         'Open Snippi',
    'tray.palette':      'Quick snippet search ({hotkey})',
    'tray.enabled':      'Enabled',
    'tray.resetMenuBar': 'Reset menu bar (if icon disappeared)',
    'tray.quit':         'Quit',

    'hotkey.conflictTitle': 'Hotkey is taken',
    'hotkey.conflictBody':  '"{hotkey}" is already in use by the system or another app. Change the combination for "{feature}" in settings.',
    'hotkey.feature.translate': 'Translate',
    'hotkey.feature.ocr':       'Screenshot',

    'ocr.notify.ok':        'OCR: {chars} chars copied',
    'ocr.notify.fail':      'OCR: error',
    'ocr.notify.noText':    'OCR: could not recognize text',
    'ocr.err.prefix':       'OCR: {msg}',

    'translate.notify.title':    'Translate → {lang} ({chars} chars)',
    'translate.notify.copied':   '{chars} chars copied to clipboard',
    'translate.notify.errTitle': 'Translation error',
    'translate.notify.errBody':  'Translation failed',
    'translate.err.noText':      'Could not recognize text on the screenshot',
    'translate.err.prefix':      'Translate: {msg}',
    'translate.err.generic':     'Error: {msg}',

    'err.ocrHelperMissing':   'ocr-helper not found. Build it via `bash scripts/build-helper.sh`',
    'err.fileNotFound':       'File not found: {path}',
    'err.screenAccess':       'Could not access the screen: {msg}',
    'err.noScreenSource':     'Screen source not found (Screen Recording permission likely missing)',
    'err.noScreenPermission': 'Screen Recording permission denied',

    'translator.err.empty':   'Empty text',
    'translator.err.parse':   'Failed to parse response: {msg}',
    'translator.err.network': 'Network: {msg}',
    'translator.err.emptyResponse': 'Empty response from translator',

    'dialog.exportTitle': 'Export settings',
    'dialog.importTitle': 'Choose a settings file',

    'storage.err.triggerReplaceRequired': 'Trigger and replacement are required',
    'storage.err.triggerExists':          'Trigger "{trigger}" already exists',
    'storage.err.triggerInUse':           'Trigger "{trigger}" is already in use',
    'storage.err.snippetNotFound':        'Snippet not found',
    'storage.err.hotkeyTextRequired':     'Key combination and text are required',
    'storage.err.hotkeyInUse':            'Combination "{hotkey}" is already in use',
    'storage.err.hotkeyNotFound':         'Hotkey not found',
    'storage.err.groupNameRequired':      'Enter a group name',
    'storage.err.groupNameTooLong':       'Maximum 30 characters',
    'storage.err.groupExists':            'Group "{name}" already exists',
    'storage.err.groupNotFound':          'Group not found',
    'storage.err.invalidFormat':          'Invalid file format',
  },

  de: {
    'accessibility.title':   'Bedienungshilfen-Berechtigung erforderlich',
    'accessibility.message': '{app} benötigt die Berechtigung zum Abfangen von Tastatureingaben',
    'accessibility.detail':  'Systemeinstellungen → Datenschutz & Sicherheit → Bedienungshilfen → „{app}" hinzufügen → neu starten.',

    'screenRec.title':      'Bildschirmaufnahme-Berechtigung erforderlich',
    'screenRec.message':    'Snippi kann keinen Screenshot zur Texterkennung erstellen.\n\n{detail}',
    'screenRec.notDetermined': 'macOS hat die Berechtigung noch nicht angefordert oder sie ging nach einer Neuinstallation verloren.',
    'screenRec.denied':     'Die Bildschirmaufnahme-Berechtigung ist derzeit deaktiviert oder entzogen.',
    'screenRec.detail':
      'So beheben Sie das Problem:\n' +
      '1. Klicken Sie unten auf „Einstellungen öffnen".\n' +
      '2. Finden Sie „{app}" in der Liste (oder fügen Sie sie mit „+" hinzu).\n' +
      '3. Aktivieren Sie den Schalter neben „{app}".\n' +
      '4. App vollständig beenden und neu starten.',

    'btn.openSettings': 'Einstellungen öffnen',
    'btn.later':        'Später',

    'tray.open':         'Snippi öffnen',
    'tray.palette':      'Snippet-Schnellsuche ({hotkey})',
    'tray.enabled':      'Aktiviert',
    'tray.resetMenuBar': 'Menüleiste zurücksetzen (falls Symbol fehlt)',
    'tray.quit':         'Beenden',

    'hotkey.conflictTitle': 'Tastenkürzel belegt',
    'hotkey.conflictBody':  '„{hotkey}" wird bereits vom System oder einer anderen App verwendet. Ändern Sie die Kombination für „{feature}" in den Einstellungen.',
    'hotkey.feature.translate': 'Übersetzung',
    'hotkey.feature.ocr':       'Screenshot',

    'ocr.notify.ok':        'OCR: {chars} Zeichen kopiert',
    'ocr.notify.fail':      'OCR: Fehler',
    'ocr.notify.noText':    'OCR: Text konnte nicht erkannt werden',
    'ocr.err.prefix':       'OCR: {msg}',

    'translate.notify.title':    'Übersetzung → {lang} ({chars} Zeichen)',
    'translate.notify.copied':   '{chars} Zeichen in die Zwischenablage kopiert',
    'translate.notify.errTitle': 'Übersetzungsfehler',
    'translate.notify.errBody':  'Übersetzung fehlgeschlagen',
    'translate.err.noText':      'Text im Screenshot konnte nicht erkannt werden',
    'translate.err.prefix':      'Übersetzung: {msg}',
    'translate.err.generic':     'Fehler: {msg}',

    'err.ocrHelperMissing':   'ocr-helper nicht gefunden. Bauen Sie es mit `bash scripts/build-helper.sh`',
    'err.fileNotFound':       'Datei nicht gefunden: {path}',
    'err.screenAccess':       'Bildschirmzugriff fehlgeschlagen: {msg}',
    'err.noScreenSource':     'Bildschirmquelle nicht gefunden (vermutlich fehlt die Bildschirmaufnahme-Berechtigung)',
    'err.noScreenPermission': 'Keine Berechtigung zur Bildschirmaufnahme',

    'translator.err.empty':   'Leerer Text',
    'translator.err.parse':   'Antwort konnte nicht verarbeitet werden: {msg}',
    'translator.err.network': 'Netzwerk: {msg}',
    'translator.err.emptyResponse': 'Leere Antwort vom Übersetzer',

    'dialog.exportTitle': 'Einstellungen exportieren',
    'dialog.importTitle': 'Einstellungsdatei auswählen',

    'storage.err.triggerReplaceRequired': 'Trigger und Ersatztext sind erforderlich',
    'storage.err.triggerExists':          'Trigger „{trigger}" existiert bereits',
    'storage.err.triggerInUse':           'Trigger „{trigger}" wird bereits verwendet',
    'storage.err.snippetNotFound':        'Snippet nicht gefunden',
    'storage.err.hotkeyTextRequired':     'Tastenkombination und Text sind erforderlich',
    'storage.err.hotkeyInUse':            'Kombination „{hotkey}" wird bereits verwendet',
    'storage.err.hotkeyNotFound':         'Tastenkürzel nicht gefunden',
    'storage.err.groupNameRequired':      'Gruppennamen eingeben',
    'storage.err.groupNameTooLong':       'Maximal 30 Zeichen',
    'storage.err.groupExists':            'Gruppe „{name}" existiert bereits',
    'storage.err.groupNotFound':          'Gruppe nicht gefunden',
    'storage.err.invalidFormat':          'Ungültiges Dateiformat',
  },
};

// Подстановка {key} → params[key]. Если ключ не найден — оставляем как есть.
function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
}

// Лениво читаем язык из storage — иначе циклический require.
function getLang() {
  try {
    const storage = require('./storage');
    const l = (storage.getLanguage() || '').toLowerCase();
    if (DICT[l]) return l;
  } catch { /* storage недоступен на самом раннем bootstrap'е */ }
  return 'en';
}

/**
 * Перевести ключ.
 * @param {string} key — например 'tray.open'
 * @param {object} [params] — для {placeholder}-подстановок
 */
function t(key, params) {
  const lang = getLang();
  const tpl = (DICT[lang] && DICT[lang][key]) || (DICT.en && DICT.en[key]) || key;
  return interpolate(tpl, params);
}

module.exports = { t, getLang };
