'use strict';
/* ════════════════════════════════════════════════════════════════
   Встроенный переводчик.
   Текущий движок: MyMemory Translation API (бесплатный, без ключа,
   разрешён для коммерческого использования, лимит 5000 символов/день анонимно,
   50 000 символов/день с указанным email).

   В будущем планируется заменить на Apple Translation framework
   через нативный Swift-хелпер для полностью офлайн-перевода на macOS.
════════════════════════════════════════════════════════════════ */

const { net } = require('electron');
const { t }   = require('./i18n');

// MyMemory принимает не более ~500 символов за запрос. Длинный текст
// делим на куски по границам предложений и переводим параллельно.
const MAX_CHUNK = 480;

function splitIntoChunks(text) {
  const t = text.trim();
  if (t.length <= MAX_CHUNK) return [t];
  // Разбиваем по точкам / переводам строки, не разрывая слова.
  const sentences = t.split(/(?<=[.!?…]\s|\n)/);
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > MAX_CHUNK) {
      if (cur) chunks.push(cur);
      // Если одно «предложение» само длиннее — режем по словам.
      if (s.length > MAX_CHUNK) {
        const words = s.split(/(\s+)/);
        let buf = '';
        for (const w of words) {
          if ((buf + w).length > MAX_CHUNK) { chunks.push(buf); buf = w; }
          else buf += w;
        }
        if (buf) cur = buf; else cur = '';
      } else {
        cur = s;
      }
    } else cur += s;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// Простая валидация email — MyMemory строго проверяет формат и иначе
// возвращает ошибку. Лучше не слать кривой email вовсе.
function isValidEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

// Один запрос к MyMemory.
// email (опц.) — параметр `de`. Указание валидного email поднимает дневной
// лимит с 5000 символов (анонимно) до 50 000 символов/день. Передаётся ТОЛЬКО
// если пользователь сам ввёл его в настройках (явное согласие).
function requestOne(text, sourceLang, targetLang, email) {
  return new Promise((resolve, reject) => {
    let url = 'https://api.mymemory.translated.net/get?'
      + 'q='        + encodeURIComponent(text)
      + '&langpair=' + encodeURIComponent(sourceLang) + '%7C' + encodeURIComponent(targetLang);
    if (isValidEmail(email)) {
      url += '&de=' + encodeURIComponent(email.trim());
    }

    const req = net.request({ method: 'GET', url });
    req.setHeader('User-Agent', 'Snippi/1.0');

    let raw = '';
    let status = 0;

    req.on('response', (res) => {
      status = res.statusCode;
      res.on('data', chunk => { raw += chunk.toString('utf8'); });
      res.on('end', () => {
        if (status < 200 || status >= 300) {
          return reject(new Error(`HTTP ${status}`));
        }
        try {
          const parsed = JSON.parse(raw);
          const out = parsed && parsed.responseData && parsed.responseData.translatedText;
          if (typeof out !== 'string' || !out) {
            return reject(new Error(parsed && parsed.responseDetails ? parsed.responseDetails : t('translator.err.emptyResponse')));
          }
          // MyMemory иногда возвращает «MYMEMORY WARNING: ... » в начале при ошибках конфигурации,
          // и капсом «ENGLISH» если язык неверный. Отфильтруем явные ошибки.
          if (/^MYMEMORY\s+WARNING/i.test(out)) {
            return reject(new Error(out));
          }
          resolve(out);
        } catch (e) {
          reject(new Error(t('translator.err.parse', { msg: e.message })));
        }
      });
    });
    req.on('error', err => reject(new Error(t('translator.err.network', { msg: err.message }))));
    req.end();
  });
}

// ISO 639-3 (franc) → ISO 639-1 (MyMemory). Покрываем самые ходовые языки.
const ISO3_TO_ISO1 = {
  eng:'en', rus:'ru', ukr:'uk', bel:'be', deu:'de', fra:'fr', spa:'es',
  ita:'it', por:'pt', pol:'pl', nld:'nl', tur:'tr', ces:'cs', slk:'sk',
  hun:'hu', ron:'ro', bul:'bg', srp:'sr', hrv:'hr', slv:'sl', fin:'fi',
  swe:'sv', dan:'da', nor:'no', nob:'no', isl:'is', ell:'el', lit:'lt',
  lav:'lv', est:'et', cmn:'zh', zho:'zh', jpn:'ja', kor:'ko', ara:'ar',
  heb:'he', hin:'hi', ben:'bn', tha:'th', vie:'vi', ind:'id', msa:'ms',
  fil:'tl', tgl:'tl', kat:'ka', hye:'hy', aze:'az', fas:'fa', urd:'ur',
  pus:'ps', mlt:'mt', cat:'ca', glg:'gl', eus:'eu', sqi:'sq', mkd:'mk',
  swa:'sw', amh:'am', mar:'mr', tam:'ta', tel:'te', kan:'kn', mal:'ml',
  guj:'gu', pan:'pa', sin:'si', mya:'my', khm:'km', lao:'lo', kaz:'kk',
  uzb:'uz', kir:'ky', mon:'mn', tat:'tt',
};

let _francPromise = null;
function getFranc() {
  if (!_francPromise) _francPromise = import('franc-min').then(m => m.franc);
  return _francPromise;
}

// Запасная эвристика для случаев когда franc вернул 'und' (неопределено) —
// смотрим на самый частый Unicode-скрипт.
function fallbackDetect(text) {
  const t = text.slice(0, 400);
  const counts = {
    cyrillic:   (t.match(/[Ѐ-ӿ]/g) || []).length,
    latin:      (t.match(/[A-Za-z]/g) || []).length,
    chinese:    (t.match(/[一-鿿]/g) || []).length,
    japanese:   (t.match(/[぀-ヿ]/g) || []).length,
    korean:     (t.match(/[가-힯]/g) || []).length,
    arabic:     (t.match(/[؀-ۿ]/g) || []).length,
    hebrew:     (t.match(/[֐-׿]/g) || []).length,
    devanagari: (t.match(/[ऀ-ॿ]/g) || []).length,
    greek:      (t.match(/[Ͱ-Ͽ]/g) || []).length,
  };
  let best = 'latin', max = -1;
  for (const [k, v] of Object.entries(counts)) if (v > max) { best = k; max = v; }
  return ({
    cyrillic:'ru', latin:'en', chinese:'zh', japanese:'ja', korean:'ko',
    arabic:'ar', hebrew:'he', devanagari:'hi', greek:'el',
  })[best] || 'en';
}

async function detectLang(text) {
  try {
    const franc = await getFranc();
    const iso3 = franc(text);
    if (iso3 && iso3 !== 'und' && ISO3_TO_ISO1[iso3]) return ISO3_TO_ISO1[iso3];
  } catch (e) { /* fallthrough */ }
  return fallbackDetect(text);
}

// Основная функция: переводит произвольный текст (длинный — кусками).
// email (опц.) пробрасывается в MyMemory для повышенного лимита.
async function translate(text, { targetLang, sourceLang, email } = {}) {
  if (!text || !text.trim()) throw new Error(t('translator.err.empty'));
  const target = normalizeLang(targetLang) || 'en';
  // Если язык-источник не задан или 'auto' — определяем через franc.
  let source = normalizeLang(sourceLang);
  if (!source || source === 'auto') source = await detectLang(text);

  // Если исходный совпал с целевым — MyMemory вернёт ошибку
  // «two distinct languages». Подбираем разумный fallback.
  if (source === target) {
    // Если переводим на английский, но текст уже английский — переводить нечего,
    // вернём оригинал и сообщим что языки совпали.
    if (target === 'en') {
      return { text, sourceLang: source, targetLang: target, sameLang: true };
    }
    // Иначе считаем что текст английский (типичный случай: пользователь
    // переводит англоязычный контент на ru/de/fr/etc., но эвристика дала
    // тот же язык что и target). Подменяем source на 'en'.
    source = 'en';
    if (source === target) {
      return { text, sourceLang: source, targetLang: target, sameLang: true };
    }
  }
  const chunks = splitIntoChunks(text);
  const translatedChunks = [];
  // Делаем последовательно, чтобы не превышать rate-limit бесплатного API.
  // Переменную НЕ называем `t` — это затенило бы импортированную i18n-функцию t().
  for (const c of chunks) {
    const tr = await requestOne(c, source, target, email);
    translatedChunks.push(tr);
  }
  return {
    text:       translatedChunks.join(''),
    sourceLang: source,
    targetLang: target,
  };
}

// Нормализуем код языка к двухбуквенному ISO-639-1, который понимает MyMemory.
function normalizeLang(code) {
  if (!code) return null;
  const c = String(code).trim().toLowerCase();
  if (c === 'auto') return 'auto';
  // EN-US → en, EN-GB → en, PT-PT → pt, ZH-HANS → zh и т.п.
  return c.split(/[-_]/)[0];
}

// Список поддерживаемых языков для UI.
// Коды совместимы с DeepL (на случай возврата) и с MyMemory (нормализуются выше).
const TARGET_LANGS = [
  ['EN', 'English'],
  ['RU', 'Русский'],
  ['UK', 'Українська'],
  ['DE', 'Deutsch'],
  ['FR', 'Français'],
  ['ES', 'Español'],
  ['IT', 'Italiano'],
  ['PT', 'Português'],
  ['PL', 'Polski'],
  ['NL', 'Nederlands'],
  ['TR', 'Türkçe'],
  ['JA', '日本語'],
  ['ZH', '中文'],
  ['KO', '한국어'],
  ['CS', 'Čeština'],
  ['AR', 'العربية'],
];

module.exports = { translate, TARGET_LANGS };
