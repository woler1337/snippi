'use strict';

const { uIOhook, UiohookKey } = require('uiohook-napi');
const { clipboard }           = require('electron');
const { execFile }            = require('child_process');
const path                    = require('path');
const storage                 = require('./storage');

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

function sendKeysMac(n) {
  const h = ensureMacHelper();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { _macCb = null; reject(new Error('helper timeout')); }, 5000);
    _macCb = () => { clearTimeout(t); resolve(); };
    h.stdin.write(`${n}\n`);
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

  // Загружаем сборку один раз при старте
  _ps.stdin.write('Add-Type -AssemblyName System.Windows.Forms\n');

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

function sendKeysWin(backspaceCount) {
  const ps    = ensurePS();
  const token = `K${++_psId}`;
  const keys  = backspaceCount > 0
    ? `{BACKSPACE ${backspaceCount}}^v`
    : `^v`;

  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      _psCbs.delete(token);
      reject(new Error(`PowerShell timeout (token=${token})`));
    }, 8000);

    _psCbs.set(token, () => { clearTimeout(t); resolve(); });
    ps.stdin.write(
      `[System.Windows.Forms.SendKeys]::SendWait('${keys}'); Write-Host '${token}'\n`
    );
  });
}

// ── Универсальная функция вставки ─────────────────────────────────────────

async function sendBackspacesAndPaste(backspaceCount, text) {
  const saved = clipboard.readText();
  clipboard.writeText(text);

  try {
    if (process.platform === 'darwin') {
      // Постоянный Swift-хелпер: команда идёт по pipe ~0.5 мс, нет запуска процесса
      await sendKeysMac(backspaceCount);

    } else if (process.platform === 'win32') {
      // PowerShell SendWait — надёжная отправка в активное окно
      await sendKeysWin(backspaceCount);

    } else {
      // Linux: xdotool
      const keys = Array(backspaceCount).fill('BackSpace');
      keys.push('ctrl+v');
      await execCmd('xdotool', ['key', '--clearmodifiers', ...keys]);
    }
  } finally {
    // Время, нужное целевому приложению чтобы прочитать буфер обмена
    // после получения Cmd+V / Ctrl+V. На macOS NSPasteboard читается
    // практически мгновенно (~10-20 мс). На Windows под нагрузкой
    // цикл WM_KEYDOWN → чтение буфера занимает 80–150 мс.
    await delay(process.platform === 'darwin' ? 60 : 200);
    clipboard.writeText(saved);
  }
}

// ── Остальная логика ───────────────────────────────────────────────────────

let buffer          = '';
let expanding       = false;
let modifierPending = false;

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
      await sendBackspacesAndPaste(backspaceCount, match.replacement);
      _fireNotify('snippet', match.replacement.length - match.trigger.length);
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
    // Пауза перед вставкой нужна только на Windows: SendWait может отправить
    // Ctrl+V пока физический Ctrl от хоткея ещё зажат — часть приложений
    // трактует это как двойной Ctrl и отклоняет вставку со звуком ошибки.
    // На macOS постоянный Swift-хелпер посылает Cmd+V сразу — задержка не нужна
    // и заметна как лаг.
    if (process.platform === 'win32') await delay(30);
    const extraBs = hotkeyTypesChar(binding.hotkeyData) ? 1 : 0;
    await sendBackspacesAndPaste(extraBs, binding.text);
    _fireNotify('hotkey', binding.text.length);
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
          if (event.shiftKey) char = char.toUpperCase();
          buffer += char;
          if (buffer.length > 50) buffer = buffer.slice(-50);
        }
      });

      uIOhook.on('keyup', (event) => {
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
async function pasteText(text) {
  if (!text) return;
  await sendBackspacesAndPaste(0, text);
}

module.exports = { initExpander, stopExpander, setOnFire, pasteText, AVAILABLE_TRIGGER_KEYS };
