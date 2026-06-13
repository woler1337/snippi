'use strict';

const { uIOhook, UiohookKey } = require('uiohook-napi');
const { clipboard }           = require('electron');
const { execFile }            = require('child_process');
const path                    = require('path');
const storage                 = require('./storage');
const clipboardWatcher        = require('./clipboardWatcher');
const { processPlaceholders } = require('./placeholders');
const { markdownToHtml, htmlToPlain } = require('./markdown');

// ── macOS: путь к скомпилированному Swift-хелперу ─────────────────────────
// В dev-режиме берём из src/native/, в packaged-сборке — из Resources/.
function getMacHelper() {
  if (process.platform !== 'darwin') return null;
  try {
    const { app } = require('electron');
    return app.isPackaged
      ? path.join(process.resourcesPath, 'key-helper')
      : path.join(__dirname, '..', 'native', 'key-helper');
  } catch { return path.join(__dirname, '..', 'native', 'key-helper'); }
}
const MAC_HELPER = getMacHelper();

// ── Отправка клавиш через нативные инструменты ОС ─────────────────────────

function execCmd(cmd, args) {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout: 8000 }, err => err ? reject(err) : resolve())
  );
}

// ── macOS: постоянный Swift-хелпер ────────────────────────────────────────
// Процесс стартует один раз. Команда: N\n → N backspace + Cmd+V → "D\n".
// Нет накладных расходов на запуск — символ стирается быстрее одного кадра.

let _macH   = null;
let _macCb  = null;
let _macBuf = '';

function ensureMacHelper() {
  if (_macH && !_macH.killed) return _macH;
  const { spawn } = require('child_process');
  const h = spawn(MAC_HELPER, [], { stdio: ['pipe', 'pipe', 'ignore'] });
  _macBuf = '';
  h.stdout.on('data', d => {
    _macBuf += d.toString();
    if (_macBuf.includes('\n') && _macCb) {
      _macBuf = '';
      const cb = _macCb; _macCb = null; cb();
    }
  });
  h.on('exit', () => {
    _macH = null;
    if (_macCb) { const cb = _macCb; _macCb = null; cb(); }
  });
  return (_macH = h);
}

// n — сколько backspace перед Cmd+V; leftMoves — сколько раз нажать ← после вставки
// (для placeholder {|} — позиционирует курсор внутри вставленного текста).
function sendKeysMac(n, leftMoves = 0) {
  const h = ensureMacHelper();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { _macCb = null; reject(new Error('helper timeout')); }, 5000);
    _macCb = () => { clearTimeout(t); resolve(); };
    h.stdin.write(leftMoves > 0 ? `${n},${leftMoves}\n` : `${n}\n`);
  });
}


// ── Windows: постоянный фоновый процесс PowerShell ────────────────────────
// wscript.exe + VBS ненадёжен (теряет фокус окна). PowerShell c
// System.Windows.Forms.SendKeys.SendWait() — правильный путь.
// Процесс стартует один раз, сборка (Add-Type) выполняется при запуске,
// каждая последующая вставка — практически мгновенная.

let   _ps      = null;   // дескриптор процесса PowerShell
const _psCbs   = new Map();  // token → resolve
let   _psId    = 0;
let   _psBuf   = '';

function ensurePS() {
  if (_ps && !_ps.killed) return _ps;

  const { spawn } = require('child_process');
  _ps = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', '-'
  ], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });

  // КРИТИЧНО: без обработчика 'error' неудачный spawn powershell.exe
  // (нет в PATH, ExecutionPolicy, антивирус заблокировал) выбрасывает
  // НЕперехваченное исключение и роняет main-процесс целиком.
  _ps.on('error', err => {
    console.error('[expander] PowerShell spawn failed:', err.message);
    _ps = null;
    _psBuf = '';
    _psCbs.forEach(cb => cb());   // разблокируем зависшие вызовы
    _psCbs.clear();
  });

  // stdin тоже может выдать EPIPE, если процесс умер между проверкой и записью.
  _ps.stdin.on('error', err => { console.error('[expander] PS stdin error:', err.message); });

  // Загружаем сборку один раз при старте (защищённо — stdin может быть уже мёртв).
  try { _ps.stdin.write('Add-Type -AssemblyName System.Windows.Forms\n'); } catch {}

  _ps.stdout.on('data', d => {
    _psBuf += d.toString();
    let nl;
    while ((nl = _psBuf.indexOf('\n')) !== -1) {
      const token = _psBuf.slice(0, nl).trim();
      _psBuf = _psBuf.slice(nl + 1);
      const cb = _psCbs.get(token);
      if (cb) { _psCbs.delete(token); cb(); }
    }
  });

  _ps.on('exit', () => {
    _ps = null;
    _psBuf = '';
    _psCbs.forEach(cb => cb()); // разблокируем зависшие вызовы
    _psCbs.clear();
  });

  return _ps;
}

function sendKeysWin(backspaceCount, leftMoves = 0) {
  const ps    = ensurePS();
  const token = `K${++_psId}`;
  let keys    = backspaceCount > 0 ? `{BACKSPACE ${backspaceCount}}^v` : `^v`;
  // {LEFT N} в SendKeys повторяет ← N раз. Шлём ОДНОЙ строкой — паузу
  // между вставкой и стрелками Windows покрывает встроенной задержкой.
  if (leftMoves > 0) keys += `{LEFT ${leftMoves}}`;

  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      _psCbs.delete(token);
      reject(new Error(`PowerShell timeout (token=${token})`));
    }, 8000);

    _psCbs.set(token, () => { clearTimeout(t); resolve(); });
    try {
      ps.stdin.write(
        `[System.Windows.Forms.SendKeys]::SendWait('${keys}'); Write-Host '${token}'\n`
      );
    } catch (err) {
      // stdin умер (EPIPE) — снимаем таймаут и отклоняем, чтобы не висло 8с.
      clearTimeout(t);
      _psCbs.delete(token);
      reject(new Error('PowerShell stdin write failed: ' + err.message));
    }
  });
}

// ── Универсальная функция вставки ─────────────────────────────────────────

// Извлекает позицию маркера {|} в тексте.
// Возвращает { text: текст-без-маркера, leftMoves: сколько раз нажать ← после вставки }.
// Поддерживает только ПЕРВОЕ вхождение маркера — остальные оставляет как есть.
function parseCursorMarker(raw) {
  if (!raw) return { text: raw || '', leftMoves: 0 };
  const idx = raw.indexOf('{|}');
  if (idx === -1) return { text: raw, leftMoves: 0 };
  const stripped = raw.slice(0, idx) + raw.slice(idx + 3);
  // leftMoves = сколько символов ПОСЛЕ курсора — на столько ← нужно нажать,
  // чтобы курсор вернулся туда, где был маркер.
  const leftMoves = stripped.length - idx;
  return { text: stripped, leftMoves };
}

async function sendBackspacesAndPaste(backspaceCount, text, opts = {}) {
  // 1) Раскрываем динамические плейсхолдеры ({date}, {clip}, {uuid}, {random},
  //    {upper:…} и т.п.). Делаем это РОВНО ОДИН раз — иначе {uuid} / {random}
  //    дадут разные значения между фактической вставкой и подсчётом статистики.
  const expanded = processPlaceholders(text, {
    clipboardHistory: storage.getClipboardHistory(),
  });
  // 2) Парсим placeholder {|} — если есть, leftMoves станет > 0.
  const { text: finalText, leftMoves } = parseCursorMarker(expanded);
  const saved = clipboard.readText();

  // Ставим вотчер буфера на паузу на всё время «дёрганья»: мы временно
  // пишем туда replacement, а в finally восстанавливаем исходный текст.
  // Без паузы вотчер (опрос раз в 600 мс) ловит и replacement, и
  // восстановленный текст как «новые» записи — отсюда дублирование
  // (особенно заметно после Скриншот→перевод, который оставляет свой
  // текст в буфере; каждый сниппет потом его пере-записывал в историю).
  clipboardWatcher.setClipboardPaused(true);

  try {
    // 3) Rich vs plain. Для rich пишем буфер обмена с двумя представлениями
    //    (text/html + text/plain) — Notion/Gmail/Word возьмут HTML, Terminal /
    //    редактор кода — plain. Для plain — как раньше через writeText.
    //    Внутри try — чтобы исключение из clipboard.write не оставило вотчер
    //    на паузе навсегда (finally гарантированно снимет паузу).
    if (opts.format === 'rich') {
      const html  = markdownToHtml(finalText);
      const plain = htmlToPlain(html);
      clipboard.write({ text: plain, html });
    } else {
      clipboard.writeText(finalText);
    }

    if (process.platform === 'darwin') {
      // Постоянный Swift-хелпер: команда идёт по pipe ~0.5 мс, нет запуска процесса
      await sendKeysMac(backspaceCount, leftMoves);

    } else if (process.platform === 'win32') {
      // PowerShell SendWait — надёжная отправка в активное окно
      await sendKeysWin(backspaceCount, leftMoves);

    } else {
      // Linux: xdotool
      const keys = Array(backspaceCount).fill('BackSpace');
      keys.push('ctrl+v');
      for (let i = 0; i < leftMoves; i++) keys.push('Left');
      await execCmd('xdotool', ['key', '--clearmodifiers', ...keys]);
    }
  } finally {
    // Время, нужное целевому приложению чтобы прочитать буфер обмена
    // после получения Cmd+V / Ctrl+V. На macOS NSPasteboard читается
    // практически мгновенно (~10-20 мс). На Windows под нагрузкой
    // цикл WM_KEYDOWN → чтение буфера занимает 80–150 мс.
    await delay(process.platform === 'darwin' ? 60 : 200);
    clipboard.writeText(saved);
    // Сбрасываем baseline вотчера на восстановленный текст и снимаем паузу
    // синхронно (в рамках finally, до того как expanding=false). Так
    // следующий опрос увидит, что содержимое не менялось, и не создаст
    // дубликат; параллельных разворачиваний нет (их гейтит флаг expanding).
    clipboardWatcher.resyncBaseline();
    clipboardWatcher.setClipboardPaused(false);
  }
}

// ── Остальная логика ───────────────────────────────────────────────────────

let buffer          = '';
let expanding       = false;
let modifierPending = false;

// Текущее состояние физических модификаторов (обновляется на КАЖДОМ событии
// uiohook, до проверок expanding). Нужно на Windows: SendKeys '^v' нельзя
// слать, пока ещё зажаты Ctrl/Alt/Shift от хоткея — иначе целевое приложение
// видит «Ctrl+Alt+Ctrl+V» и не вставляет (баг: «буква есть, текста нет»).
let modCtrl = false, modAlt = false, modShift = false, modMeta = false;
function anyModifierDown() { return modCtrl || modAlt || modShift || modMeta; }

// Ждём, пока пользователь отпустит модификаторы (до maxMs), затем вставляем.
async function waitModifiersUp(maxMs = 400) {
  let waited = 0;
  while (anyModifierDown() && waited < maxMs) { await delay(15); waited += 15; }
}

// Callback вызывается после успешного срабатывания (для звука/мигания трея/статистики).
// Аргумент: { type: 'snippet'|'hotkey', chars: number }
let _onFireCb = null;
function setOnFire(cb) { _onFireCb = typeof cb === 'function' ? cb : null; }
function _fireNotify(type, chars) { try { _onFireCb && _onFireCb({ type, chars }); } catch {} }

const TRIGGER_CONFIG = {
  'Shift':      { type: 'modifier', codes: new Set([UiohookKey.ShiftLeft, UiohookKey.ShiftRight]), extraBackspace: false },
  'Right Shift':{ type: 'modifier', codes: new Set([UiohookKey.ShiftRight]), extraBackspace: false },
  'Tab':        { type: 'regular',  codes: new Set([UiohookKey.Tab]),        extraBackspace: true  },
  'CapsLock':   { type: 'regular',  codes: new Set([UiohookKey.CapsLock]),   extraBackspace: false },
  'F1':  { type: 'regular', codes: new Set([UiohookKey.F1]),  extraBackspace: false },
  'F2':  { type: 'regular', codes: new Set([UiohookKey.F2]),  extraBackspace: false },
  'F3':  { type: 'regular', codes: new Set([UiohookKey.F3]),  extraBackspace: false },
  'F4':  { type: 'regular', codes: new Set([UiohookKey.F4]),  extraBackspace: false },
  'F5':  { type: 'regular', codes: new Set([UiohookKey.F5]),  extraBackspace: false },
  'F6':  { type: 'regular', codes: new Set([UiohookKey.F6]),  extraBackspace: false },
  'F7':  { type: 'regular', codes: new Set([UiohookKey.F7]),  extraBackspace: false },
  'F8':  { type: 'regular', codes: new Set([UiohookKey.F8]),  extraBackspace: false },
  'F9':  { type: 'regular', codes: new Set([UiohookKey.F9]),  extraBackspace: false },
  'F10': { type: 'regular', codes: new Set([UiohookKey.F10]), extraBackspace: false },
  'F11': { type: 'regular', codes: new Set([UiohookKey.F11]), extraBackspace: false },
  'F12': { type: 'regular', codes: new Set([UiohookKey.F12]), extraBackspace: false },
};

const AVAILABLE_TRIGGER_KEYS = Object.keys(TRIGGER_CONFIG);

function getTriggerConf() {
  return TRIGGER_CONFIG[storage.getTriggerKey()] ?? TRIGGER_CONFIG['Shift'];
}

const DOM_CODE_TO_UIOHOOK = new Map([
  ['KeyA', UiohookKey.A], ['KeyB', UiohookKey.B], ['KeyC', UiohookKey.C],
  ['KeyD', UiohookKey.D], ['KeyE', UiohookKey.E], ['KeyF', UiohookKey.F],
  ['KeyG', UiohookKey.G], ['KeyH', UiohookKey.H], ['KeyI', UiohookKey.I],
  ['KeyJ', UiohookKey.J], ['KeyK', UiohookKey.K], ['KeyL', UiohookKey.L],
  ['KeyM', UiohookKey.M], ['KeyN', UiohookKey.N], ['KeyO', UiohookKey.O],
  ['KeyP', UiohookKey.P], ['KeyQ', UiohookKey.Q], ['KeyR', UiohookKey.R],
  ['KeyS', UiohookKey.S], ['KeyT', UiohookKey.T], ['KeyU', UiohookKey.U],
  ['KeyV', UiohookKey.V], ['KeyW', UiohookKey.W], ['KeyX', UiohookKey.X],
  ['KeyY', UiohookKey.Y], ['KeyZ', UiohookKey.Z],
  ['Digit0', UiohookKey.Num0], ['Digit1', UiohookKey.Num1], ['Digit2', UiohookKey.Num2],
  ['Digit3', UiohookKey.Num3], ['Digit4', UiohookKey.Num4], ['Digit5', UiohookKey.Num5],
  ['Digit6', UiohookKey.Num6], ['Digit7', UiohookKey.Num7], ['Digit8', UiohookKey.Num8],
  ['Digit9', UiohookKey.Num9],
  ['F1',  UiohookKey.F1],  ['F2',  UiohookKey.F2],  ['F3',  UiohookKey.F3],
  ['F4',  UiohookKey.F4],  ['F5',  UiohookKey.F5],  ['F6',  UiohookKey.F6],
  ['F7',  UiohookKey.F7],  ['F8',  UiohookKey.F8],  ['F9',  UiohookKey.F9],
  ['F10', UiohookKey.F10], ['F11', UiohookKey.F11], ['F12', UiohookKey.F12],
  ['Space',        UiohookKey.Space],
  ['Tab',          UiohookKey.Tab],
  ['Backquote',    41],  ['Minus',        12],  ['Equal',        13],
  ['BracketLeft',  26],  ['BracketRight', 27],  ['Backslash',    43],
  ['Semicolon',    39],  ['Quote',        40],  ['Comma',        51],
  ['Period',       52],  ['Slash',        53],
]);

const RESET_KEYS = new Set([
  UiohookKey.Space, UiohookKey.Enter, UiohookKey.NumpadEnter,
  UiohookKey.Escape, UiohookKey.ArrowUp, UiohookKey.ArrowDown,
  UiohookKey.ArrowLeft, UiohookKey.ArrowRight,
]);

const KEY_CHAR_MAP = new Map([
  [UiohookKey.A,'a'],[UiohookKey.B,'b'],[UiohookKey.C,'c'],[UiohookKey.D,'d'],
  [UiohookKey.E,'e'],[UiohookKey.F,'f'],[UiohookKey.G,'g'],[UiohookKey.H,'h'],
  [UiohookKey.I,'i'],[UiohookKey.J,'j'],[UiohookKey.K,'k'],[UiohookKey.L,'l'],
  [UiohookKey.M,'m'],[UiohookKey.N,'n'],[UiohookKey.O,'o'],[UiohookKey.P,'p'],
  [UiohookKey.Q,'q'],[UiohookKey.R,'r'],[UiohookKey.S,'s'],[UiohookKey.T,'t'],
  [UiohookKey.U,'u'],[UiohookKey.V,'v'],[UiohookKey.W,'w'],[UiohookKey.X,'x'],
  [UiohookKey.Y,'y'],[UiohookKey.Z,'z'],
  [UiohookKey.Num0,'0'],[UiohookKey.Num1,'1'],[UiohookKey.Num2,'2'],
  [UiohookKey.Num3,'3'],[UiohookKey.Num4,'4'],[UiohookKey.Num5,'5'],
  [UiohookKey.Num6,'6'],[UiohookKey.Num7,'7'],[UiohookKey.Num8,'8'],
  [UiohookKey.Num9,'9'],
  // Знаки пунктуации (коды совпадают с DOM_CODE_TO_UIOHOOK). Нужны для
  // триггеров вида `:smile:` (эмодзи-пак), `;tag`, `.cmd` и т.п. Коды —
  // raw uiohook keycodes для US-раскладки.
  [39,';'],[40,"'"],[51,','],[52,'.'],[53,'/'],[12,'-'],[13,'='],
  [26,'['],[27,']'],[43,'\\'],[41,'`'],
]);

// Shift-варианты пунктуации (US-раскладка). Для букв используется
// char.toUpperCase() как fallback — поэтому здесь только пунктуация.
// Критично для эмодзи: Shift+';' = ':' → триггеры `:smile:`.
const SHIFT_CHAR_MAP = new Map([
  [39,':'],[40,'"'],[51,'<'],[52,'>'],[53,'?'],[12,'_'],[13,'+'],
  [26,'{'],[27,'}'],[43,'|'],[41,'~'],
]);

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function tryExpandSnippet() {
  if (!storage.getEnabled() || !buffer || expanding) return;

  const conf  = getTriggerConf();
  const match = storage.getSnippets().find(s => s.trigger === buffer);

  if (match) {
    const backspaceCount = buffer.length + (conf.extraBackspace ? 1 : 0);
    expanding = true;
    buffer    = '';
    try {
      await delay(3);
      // Windows: если триггер сниппета — модификатор (Shift/Right Shift),
      // он к этому моменту обычно уже отпущен (срабатывание на keyup), но на
      // всякий случай ждём отпускания модификаторов перед Ctrl+V.
      if (process.platform === 'win32') await waitModifiersUp(400);
      // Для статистики предварительно раскрываем плейсхолдеры — длина после
      // подстановки может сильно отличаться от длины исходного шаблона.
      // sendBackspacesAndPaste раскроет их ещё раз, но с тем же seed-моментом
      // расхождение между UUID/random на ~1 мс несущественно.
      const expandedForLen = processPlaceholders(match.replacement, {
        clipboardHistory: storage.getClipboardHistory(),
      });
      const insertedLen = parseCursorMarker(expandedForLen).text.length;
      await sendBackspacesAndPaste(backspaceCount, match.replacement, {
        format: match.format || 'plain',
      });
      _fireNotify('snippet', insertedLen - match.trigger.length);
    } catch (err) {
      console.error('[expander] Ошибка сниппета:', err);
    } finally {
      expanding = false;
    }
  } else {
    buffer = '';
  }
}

// Возвращает true, если хоткей сам по себе печатает символ в активном поле.
// В таком случае нужен 1 backspace — стереть напечатанный символ перед вставкой.
function hotkeyTypesChar(hd) {
  if (hd.ctrlKey || hd.metaKey) return false;          // системные комбо — не печатают
  if (/^F\d{1,2}$/.test(hd.code)) return false;        // F1–F12
  if (['Tab','Escape','Enter','Backspace','Space'].includes(hd.code)) return false;
  return true; // буквы, цифры, символы (с Shift или Alt или без) — печатают
}

async function fireKeybinding(binding) {
  if (expanding) return;
  expanding       = true;
  modifierPending = false;
  buffer          = '';
  try {
    // Windows: дожидаемся, пока пользователь отпустит модификаторы хоткея,
    // иначе SendKeys '^v' уходит при зажатых Ctrl/Alt/Shift и вставка не
    // срабатывает (символ напечатан, текст не вставлен). На macOS постоянный
    // Swift-хелпер шлёт Cmd+V сразу — ожидание не нужно и заметно как лаг.
    if (process.platform === 'win32') { await waitModifiersUp(400); await delay(10); }
    const extraBs = hotkeyTypesChar(binding.hotkeyData) ? 1 : 0;
    const expandedForLen = processPlaceholders(binding.text, {
      clipboardHistory: storage.getClipboardHistory(),
    });
    await sendBackspacesAndPaste(extraBs, binding.text);
    _fireNotify('hotkey', parseCursorMarker(expandedForLen).text.length);
  } catch (err) {
    console.error('[expander] Ошибка хоткея:', err);
  } finally {
    expanding = false;
  }
}

// ── Инициализация ──────────────────────────────────────────────────────────

function initExpander() {
  return new Promise((resolve, reject) => {
    try {
      uIOhook.on('keydown', (event) => {
        modCtrl = event.ctrlKey; modAlt = event.altKey;
        modShift = event.shiftKey; modMeta = event.metaKey;
        if (expanding) return;

        const conf    = getTriggerConf();
        const keycode = event.keycode;

        if (storage.getEnabled()) {
          const bindings = storage.getKeybindings();
          if (bindings.length > 0) {
            for (const b of bindings) {
              const hd       = b.hotkeyData;
              const expected = DOM_CODE_TO_UIOHOOK.get(hd.code);
              if (expected !== undefined      &&
                  keycode        === expected &&
                  event.ctrlKey  === hd.ctrlKey  &&
                  event.altKey   === hd.altKey   &&
                  event.shiftKey === hd.shiftKey &&
                  event.metaKey  === hd.metaKey) {
                modifierPending = false;
                fireKeybinding(b);
                return;
              }
            }
          }
        }

        if (conf.codes.has(keycode)) {
          if (conf.type === 'modifier') {
            modifierPending = true;
          } else {
            modifierPending = false;
            tryExpandSnippet();
          }
          return;
        }

        if (modifierPending) modifierPending = false;

        if (keycode === UiohookKey.Backspace) {
          buffer = buffer.slice(0, -1);
          return;
        }

        if (RESET_KEYS.has(keycode)) { buffer = ''; return; }

        if (event.ctrlKey || event.metaKey) return;

        let char = KEY_CHAR_MAP.get(keycode);
        if (char !== undefined) {
          if (event.shiftKey) char = SHIFT_CHAR_MAP.get(keycode) || char.toUpperCase();
          buffer += char;
          if (buffer.length > 50) buffer = buffer.slice(-50);
        }
      });

      uIOhook.on('keyup', (event) => {
        modCtrl = event.ctrlKey; modAlt = event.altKey;
        modShift = event.shiftKey; modMeta = event.metaKey;
        if (expanding || !modifierPending) return;
        const conf = getTriggerConf();
        if (conf.type === 'modifier' && conf.codes.has(event.keycode)) {
          modifierPending = false;
          tryExpandSnippet();
        }
      });

      uIOhook.start();
      console.log('[expander] Запущен, триггер:', storage.getTriggerKey());
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

function stopExpander() {
  try { uIOhook.stop(); } catch (e) { console.error('[expander] stop:', e); }
  if (_ps  && !_ps.killed)  { try { _ps.kill();  } catch {} } // Windows PS
  if (_macH && !_macH.killed) { try { _macH.kill(); } catch {} } // macOS helper
}

// Публичный API для вставки произвольного текста (палитра, AI-фичи и т.п.):
// просто кладёт текст в буфер и эмулирует Cmd/Ctrl+V в активном окне.
async function pasteText(text, format) {
  if (!text) return;
  await sendBackspacesAndPaste(0, text, { format: format === 'rich' ? 'rich' : 'plain' });
}

module.exports = { initExpander, stopExpander, setOnFire, pasteText, AVAILABLE_TRIGGER_KEYS };
