# Text Expander

Кроссплатформенное desktop-приложение на Electron, которое живёт в системном трее и помогает быстро вставлять часто используемые тексты, распознавать текст со скриншотов и переводить любой текст с экрана.

## Возможности

- **Сниппеты** — короткие триггеры (`gm`, `eml`) автоматически раскрываются в длинный текст по нажатию выбранной триггер-клавиши (Tab / Right Shift / Caps Lock и т.п.).
- **Глобальные хоткеи** — назначить произвольной комбинации клавиш вставку любого текста.
- **Группы сниппетов** — сортируйте сниппеты по контексту (работа, личное, шаблоны).
- **Скриншот → текст (OCR)** — выделить любую область экрана, текст из неё распознаётся и копируется в буфер обмена. Работает офлайн (Tesseract на Windows/Linux, Apple Vision на macOS).
- **Скриншот → перевод** — то же самое, но распознанный текст автоматически переводится на выбранный язык (~80 языков, без API-ключа).
- **Палитра быстрого поиска** — `⌘⇧E` / `Ctrl+Shift+E` открывает плавающее окно фуззи-поиска сниппетов, как в Raycast/Alfred.
- **История буфера обмена** — последние 50 скопированных текстов.
- **Статистика** — сколько раз сработали сниппеты, сколько времени и символов сэкономлено.
- **Автозапуск, тёмная тема, экспорт/импорт настроек, мультиязычный UI (ru/en/de).**

## Установка для пользователя

### macOS
1. Скачайте `.dmg` из Releases.
2. Откройте его и перетащите **Text Expander** в папку **Программы**.
3. Запустите через Launchpad (`Cmd+Space → Text Expander`).
4. macOS попросит разрешение «Универсальный доступ» — выдайте.
5. Для OCR/перевода также потребуется «Запись экрана и системного звука».

### Windows
Скачайте `.exe` (portable) из Releases и запустите двойным кликом.

### Linux
Скачайте `.AppImage`, дайте ему права на исполнение, запустите.

## Хоткеи по умолчанию

| Действие | Хоткей |
| -------- | ------ |
| Раскрыть сниппет | Триггер-клавиша (по умолчанию **Right Shift**) после набора триггера |
| Скриншот → текст | `⌘⇧1` / `Ctrl+Shift+1` |
| Скриншот → перевод | `⌘⇧2` / `Ctrl+Shift+2` |
| Палитра быстрого поиска | `⌘⇧E` / `Ctrl+Shift+E` |

Все хоткеи можно поменять в соответствующих разделах настроек.

## Разработка

```bash
git clone <repo>
cd myapp
npm install
npm start
```

### Сборка релизных артефактов

```bash
npm run build:mac     # → dist/Text Expander-X.Y.Z-arm64.dmg
npm run build:win     # → dist/Text Expander-X.Y.Z.exe
npm run build:linux   # → dist/Text Expander-X.Y.Z.AppImage
```

## Стек

- **Electron 42**, **electron-store**, **electron-log**
- **uiohook-napi** — глобальный перехват клавиатуры
- **tesseract.js** — OCR
- **franc-min** — детекция языка для переводчика
- **MyMemory Translation API** — бесплатный переводчик (без API-ключа)
- **Swift-хелперы** на macOS (`key-helper`, `ocr-helper`) — нативная эмуляция клавиш + OCR через Vision

## Архитектура

```
src/
├── main/                # Main-процесс Electron
│   ├── main.js          # Точка входа, lifecycle, IPC, tray, snip, palette
│   ├── expander.js      # Перехват клавиатуры + эмуляция вставки
│   ├── storage.js       # Persistence (electron-store)
│   ├── ocr.js           # Tesseract / Vision wrapper
│   ├── translator.js    # MyMemory + автоопределение языка
│   ├── preload.js       # Безопасный мост в renderer
│   └── palette-preload.js
├── renderer/            # UI (HTML/CSS/JS, без фреймворков)
│   ├── index.html, app.js, styles.css, i18n.js
│   ├── snip.*           # Оверлей выделения области
│   └── palette.*        # Палитра быстрого поиска
└── native/              # Swift-хелперы для macOS
```

## Где смотреть логи

- **macOS:** `~/Library/Logs/Text Expander/main.log`
- **Windows:** `%USERPROFILE%\AppData\Roaming\Text Expander\logs\main.log`
- **Linux:** `~/.config/Text Expander/logs/main.log`

## Лицензия

MIT
