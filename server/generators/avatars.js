// server/generators/avatars.js — Генерация аватаров (DiceBear + Jdenticon)

/**
 * Доступные стили DiceBear
 */
const DICEBEAR_STYLES = [
  'adventurer',
  'bottts',
  'pixel-art',
  'lorelei',
  'notionists',
  'avataaars',
  'big-smile',
  'open-peeps',
  'thumbs'
];

/**
 * Простой хеш строки -> число
 * @param {string} str
 * @returns {number}
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Получить URL аватара из DiceBear API
 * @param {string} seed — строка-сид (имя, id)
 * @param {string} [style] — стиль DiceBear (опционально)
 * @param {number} [size=128] — размер
 * @returns {string} — URL SVG аватара
 */
function getDiceBearUrl(seed, style, size) {
  const s = style || DICEBEAR_STYLES[Math.abs(hashCode(seed)) % DICEBEAR_STYLES.length];
  const sz = size || 128;
  return `https://api.dicebear.com/7.x/${s}/svg?seed=${encodeURIComponent(seed)}&size=${sz}`;
}

/**
 * Получить URL аватара из UI Avatars
 * @param {string} name — имя игрока
 * @param {number} [size=128] — размер
 * @returns {string}
 */
function getUIAvatarUrl(name, size) {
  const sz = size || 128;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=${sz}`;
}

/**
 * Получить URL аватара из Robohash
 * @param {string} seed — строка-сид
 * @param {number} [set=4] — набор (1=роботы, 2=монстры, 3=головы, 4=котики, 5=люди)
 * @param {number} [size=200] — размер
 * @returns {string}
 */
function getRobohashUrl(seed, set, size) {
  const s = set || 4;
  const sz = size || 200;
  return `https://robohash.org/${encodeURIComponent(seed)}?set=set${s}&size=${sz}x${sz}`;
}

/**
 * Получить SVG аватар через Jdenticon (если установлен)
 * Возвращает null если jdenticon не установлен
 * @param {string} seed — строка-сид
 * @param {number} [size=100] — размер
 * @returns {string|null} — SVG-строка или null
 */
function getJdenticonSvg(seed, size) {
  try {
    const jdenticon = require('jdenticon');
    return jdenticon.toSvg(seed, size || 100);
  } catch (e) {
    // jdenticon не установлен
    return null;
  }
}

/**
 * Получить аватар для игрока (fallback-цепочка)
 * @param {string} seed — строка-сид (имя или id)
 * @param {Object} [options] — настройки
 * @returns {Object} — { type: 'url'|'svg', value: string }
 */
function getAvatar(seed, options) {
  const opts = options || {};

  // Если доступен jdenticon — используем его (офлайн)
  const svg = getJdenticonSvg(seed, opts.size);
  if (svg) {
    return { type: 'svg', value: svg };
  }

  // Иначе — DiceBear URL
  return { type: 'url', value: getDiceBearUrl(seed, opts.style, opts.size) };
}

module.exports = {
  DICEBEAR_STYLES,
  getDiceBearUrl,
  getUIAvatarUrl,
  getRobohashUrl,
  getJdenticonSvg,
  getAvatar,
  hashCode
};
