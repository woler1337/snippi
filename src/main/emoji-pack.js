'use strict';
/* ════════════════════════════════════════════════════════════════
   Emoji-пак: ~150 наиболее частых эмодзи с триггерами вида :name:
   Устанавливается одним нажатием — создаёт группу "Emoji" и сниппеты.

   Принципы:
     • Все триггеры начинаются с двоеточия (`:smile:`) — низкий шанс
       случайного срабатывания при обычном письме.
     • Триггеры на английском — это де-факто стандарт (Slack/GitHub/Discord),
       работает одинаково для пользователей всех языков.
     • Без зависимостей — список прямо здесь.
════════════════════════════════════════════════════════════════ */

const crypto = require('crypto');

// Группировано для удобства поддержки. Финальный список — flat массив
// { trigger: ':smile:', replacement: '😊' }.
const EMOJI = {
  // Faces — smileys
  ':smile:': '😊',  ':grin:': '😁',  ':joy:': '😂',  ':rofl:': '🤣',
  ':wink:': '😉',  ':blush:': '😊',  ':smirk:': '😏',  ':sweat:': '😅',
  ':lol:': '😂',   ':happy:': '😄',  ':cry:': '😢',  ':sob:': '😭',
  ':sad:': '😞',   ':angry:': '😠',  ':rage:': '😡',  ':love:': '😍',
  ':kiss:': '😘',  ':tongue:': '😜', ':cool:': '😎',  ':nerd:': '🤓',
  ':think:': '🤔', ':shrug:': '🤷',  ':facepalm:': '🤦', ':wow:': '😮',
  ':sleep:': '😴', ':sick:': '🤒',   ':vomit:': '🤮', ':poop:': '💩',
  ':skull:': '💀', ':ghost:': '👻',  ':alien:': '👽', ':robot:': '🤖',
  ':party:': '🥳', ':cowboy:': '🤠', ':yawn:': '🥱', ':zip:': '🤐',

  // Gestures & body
  ':thumbsup:': '👍',  ':thumbsdown:': '👎', ':clap:': '👏',  ':wave:': '👋',
  ':ok:': '👌',        ':point:': '👉',       ':pray:': '🙏',  ':muscle:': '💪',
  ':write:': '✍️',     ':eyes:': '👀',        ':brain:': '🧠', ':heart:': '❤️',
  ':broken:': '💔',    ':sparklesh:': '💖',   ':fire:': '🔥', ':star:': '⭐',
  ':sparkles:': '✨',  ':boom:': '💥',         ':zap:': '⚡',  ':rocket:': '🚀',

  // Symbols / common
  ':check:': '✅',    ':x:': '❌',          ':warn:': '⚠️',  ':info:': 'ℹ️',
  ':question:': '❓', ':exclaim:': '❗',     ':100:': '💯',  ':done:': '✔️',
  ':no:': '🚫',       ':stop:': '🛑',        ':bell:': '🔔', ':lock:': '🔒',
  ':key:': '🔑',      ':bulb:': '💡',        ':gear:': '⚙️', ':tools:': '🛠️',
  ':wrench:': '🔧',   ':hammer:': '🔨',      ':link:': '🔗', ':paperclip:': '📎',
  ':pin:': '📌',      ':bookmark:': '🔖',    ':label:': '🏷️',
  ':search:': '🔍',   ':magnify:': '🔎',     ':eye:': '👁️',

  // Tech & objects
  ':bug:': '🐛',     ':computer:': '💻',  ':phone:': '📱',  ':camera:': '📷',
  ':video:': '🎥',   ':mic:': '🎤',        ':music:': '🎵',  ':gamepad:': '🎮',
  ':disc:': '💿',    ':floppy:': '💾',     ':battery:': '🔋',':plug:': '🔌',
  ':tv:': '📺',      ':printer:': '🖨️',    ':keyboard:': '⌨️',':mouse:': '🖱️',
  ':watch:': '⌚',   ':hourglass:': '⏳',  ':alarm:': '⏰',   ':calendar:': '📅',
  ':clock:': '🕐',   ':mail:': '📧',       ':inbox:': '📥',  ':outbox:': '📤',
  ':envelope:': '✉️',':package:': '📦',    ':moneybag:': '💰',':dollar:': '💵',
  ':card:': '💳',    ':chart:': '📊',      ':graph:': '📈',  ':down:': '📉',

  // Documents
  ':doc:': '📄',     ':folder:': '📁',     ':openfolder:': '📂',
  ':notebook:': '📓',':book:': '📖',       ':books:': '📚',  ':news:': '📰',
  ':memo:': '📝',    ':pencil:': '✏️',     ':pen:': '🖊️',   ':scissors:': '✂️',
  ':ruler:': '📏',

  // Travel & weather
  ':car:': '🚗',     ':bus:': '🚌',         ':train:': '🚆',  ':plane:': '✈️',
  ':ship:': '🚢',    ':bike:': '🚲',        ':taxi:': '🚕',  ':truck:': '🚚',
  ':sun:': '☀️',     ':cloud:': '☁️',       ':rain:': '🌧️',  ':snow:': '❄️',
  ':storm:': '⛈️',   ':rainbow:': '🌈',     ':moon:': '🌙',  ':earth:': '🌍',

  // Food
  ':coffee:': '☕',  ':tea:': '🍵',         ':beer:': '🍺',   ':wine:': '🍷',
  ':cocktail:': '🍸',':pizza:': '🍕',       ':burger:': '🍔', ':taco:': '🌮',
  ':sushi:': '🍣',   ':cake:': '🍰',        ':cookie:': '🍪', ':donut:': '🍩',
  ':apple:': '🍎',   ':banana:': '🍌',      ':grape:': '🍇',  ':strawberry:': '🍓',

  // Animals
  ':dog:': '🐶',     ':cat:': '🐱',         ':mouse2:': '🐭', ':fox:': '🦊',
  ':bear:': '🐻',    ':panda:': '🐼',       ':lion:': '🦁',   ':tiger:': '🐯',
  ':frog:': '🐸',    ':monkey:': '🐵',      ':unicorn:': '🦄',':dragon:': '🐉',

  // Nature & misc
  ':flower:': '🌸',  ':rose:': '🌹',        ':tree:': '🌳',   ':cactus:': '🌵',
  ':leaf:': '🍃',    ':crown:': '👑',       ':gem:': '💎',    ':trophy:': '🏆',
  ':medal:': '🏅',   ':gift:': '🎁',        ':balloon:': '🎈',':confetti:': '🎉',
  ':tada:': '🎉',
};

/**
 * Возвращает готовый массив сниппетов для добавления через storage.
 * @param {string} groupId — id группы, в которую добавлять
 * @returns {Array<{trigger:string,replacement:string,groupId:string}>}
 */
function getEmojiSnippets(groupId) {
  return Object.entries(EMOJI).map(([trigger, replacement]) => ({
    trigger,
    replacement,
    groupId: groupId || null,
  }));
}

function getEmojiCount() { return Object.keys(EMOJI).length; }

module.exports = { getEmojiSnippets, getEmojiCount };
