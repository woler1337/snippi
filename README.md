# Snippi

Кроссплатформенное desktop-приложение на Electron, которое живёт в системном трее и помогает быстро вставлять часто используемые тексты, распознавать текст со скриншотов и переводить любой текст с экрана.

---

## 📥 Скачать

Все версии лежат на странице **[Releases](https://github.com/woler1337/snippi/releases/latest)** — выберите свою систему:

| Платформа | Файл | Архитектура |
|-----------|------|-------------|
| 🍎 **macOS** (Apple Silicon — M1/M2/M3/M4) | `Snippi-X.Y.Z-arm64.dmg` | arm64 |
| 🍎 **macOS** (Intel) | `Snippi-X.Y.Z-x64.dmg` | x64 |
| 🪟 **Windows** (10 / 11) | `Snippi-X.Y.Z-portable.exe` | x64 |
| 🐧 **Linux** | `Snippi-X.Y.Z.AppImage` | x64 |

> Не уверены какой нужен? На macOS — меню Apple → «Об этом Mac», смотрите чип (Apple M-series → arm64; Intel → x64).

📖 **Подробная инструкция установки для каждой ОС:** [INSTALL.md](INSTALL.md)

---

## ✨ Возможности

- **Сниппеты** — короткие триггеры (`gm`, `eml`) автоматически раскрываются в длинный текст по нажатию триггер-клавиши (Tab / Right Shift / Caps Lock и т.п.).
- **Глобальные хоткеи** — назначайте произвольной комбинации клавиш вставку любого текста.
- **Группы сниппетов** — сортируйте по контексту (работа, личное, шаблоны).
- **Скриншот → текст (OCR)** — выделите любую область экрана, текст из неё распознаётся и копируется в буфер обмена. Apple Vision (macOS), Tesseract (Windows/Linux).
- **Скриншот → перевод** — то же самое, но распознанный текст автоматически переводится на выбранный язык (~80 языков, без API-ключа).
- **Палитра быстрого поиска** — `⌘⇧E` / `Ctrl+Shift+E` открывает плавающее окно fuzzy-поиска по сниппетам, как в Raycast/Alfred.
- **История буфера обмена** — последние 50 скопированных текстов.
- **Статистика** — сколько раз сработали сниппеты, сколько времени и символов сэкономлено.
- **Автозапуск, тёмная тема, экспорт/импорт настроек, мультиязычный UI (ru/en/de).**

---

## ⌨️ Хоткеи по умолчанию

| Действие | Хоткей |
| -------- | ------ |
| Раскрыть сниппет | Триггер-клавиша (по умолчанию **Right Shift**) после набора триггера |
| Скриншот → текст | `⌘⇧1` (macOS) / `Ctrl+Shift+1` |
| Скриншот → перевод | `⌘⇧2` (macOS) / `Ctrl+Shift+2` |
| Палитра быстрого поиска | `⌘⇧E` (macOS) / `Ctrl+Shift+E` |

Все хоткеи меняются в окне приложения → «Настройки».

---

## 🛠 Запуск из исходников (для разработчиков)

```bash
git clone https://github.com/woler1337/snippi.git
cd snippi
npm install
npm start              # запуск в dev-режиме
npm run build:mac      # сборка DMG (macOS, x64 + arm64)
npm run build:win      # сборка portable .exe (Windows)
npm run build:linux    # сборка .AppImage (Linux)
```

### Стек

- **Electron 42**, **electron-store**, **electron-log**
- **uiohook-napi** — глобальный перехват клавиатуры
- **tesseract.js** — OCR на Windows/Linux
- **franc-min** — детекция языка для переводчика
- **MyMemory Translation API** — бесплатный переводчик
- **Swift-хелперы** на macOS (`key-helper`, `ocr-helper`) — нативная эмуляция клавиш + OCR через Vision

### Структура проекта

```
src/
├── main/                  # Main-процесс (10 модулей)
│   ├── main.js            # Точка входа, lifecycle
│   ├── tray.js            # Иконка в menu bar
│   ├── mainWindow.js      # Главное окно
│   ├── snip.js            # Выделение области + OCR + перевод
│   ├── palette.js         # Палитра быстрого поиска
│   ├── hotkeys.js         # Глобальные горячие клавиши
│   ├── ipc.js             # Все ipcMain.handle
│   ├── expander.js        # Перехват клавиатуры
│   ├── ocr.js, translator.js, storage.js, stats.js …
│   └── preload.js, palette-preload.js
├── renderer/              # UI (HTML/CSS/JS, без фреймворков)
│   ├── index.html, app.js, styles.css, i18n.js
│   ├── snip.*             # Оверлей выделения области
│   └── palette.*          # Палитра быстрого поиска
└── native/                # Swift-хелперы для macOS
```

---

## 🔒 Конфиденциальность

- **Все данные хранятся локально** — `~/Library/Application Support/snippi/` (macOS), `%APPDATA%/snippi/` (Windows), `~/.config/snippi/` (Linux).
- **OCR работает офлайн** — изображения никуда не отправляются.
- **Перевод** идёт через [MyMemory Translated API](https://mymemory.translated.net/) — бесплатный публичный сервис, без API-ключа. Лимит ~1000 символов/день на IP. Только распознанный текст передаётся в API; скриншоты не загружаются.

### Где смотреть логи

- **macOS:** `~/Library/Logs/snippi/main.log`
- **Windows:** `%APPDATA%\snippi\logs\main.log`
- **Linux:** `~/.config/snippi/logs/main.log`

---

## 📝 Лицензия

MIT
