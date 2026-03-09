// server/generators/names.js — Генератор имён

const path = require('path');
const namesData = require(path.join(__dirname, '..', '..', 'data', 'names.json'));

/**
 * Получить случайный элемент массива
 * @param {Array} arr
 * @returns {*}
 */
function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Сгенерировать русское имя
 * @param {string} [gender='male'] — 'male' или 'female'
 * @returns {string}
 */
function generateRussianName(gender) {
  const g = gender || 'male';
  const name = random(namesData.russian[g]);
  const surname = random(namesData.russian.surnames);
  return `${name} ${surname}`;
}

/**
 * Сгенерировать итальянское имя (мафия-стиль)
 * @returns {string}
 */
function generateItalianName() {
  const name = random(namesData.italian.names);
  const surname = random(namesData.italian.surnames);
  return `${name} ${surname}`;
}

/**
 * Сгенерировать алиас героя (Dota-стиль)
 * Формат: "{Prefix} {Noun}"
 * @returns {string}
 */
function generateHeroAlias() {
  const prefix = random(namesData.heroAliases.prefixes);
  const noun = random(namesData.heroAliases.nouns);
  return `${prefix} ${noun}`;
}

/**
 * Получить случайное имя города
 * @returns {string}
 */
function getRandomCityName() {
  return random(namesData.cityNames);
}

/**
 * Сгенерировать имя бота
 * @param {number} index — порядковый номер бота
 * @returns {string}
 */
function generateBotName(index) {
  const allNames = [...namesData.russian.male, ...namesData.russian.female];
  const name = allNames[index % allNames.length];
  return `${name} (бот)`;
}

/**
 * Сгенерировать случайное имя (любой стиль)
 * @param {string} [style='russian'] — 'russian', 'italian', 'hero'
 * @returns {string}
 */
function generateName(style) {
  switch (style) {
    case 'italian':
      return generateItalianName();
    case 'hero':
      return generateHeroAlias();
    case 'russian':
    default:
      return generateRussianName();
  }
}

module.exports = {
  generateRussianName,
  generateItalianName,
  generateHeroAlias,
  getRandomCityName,
  generateBotName,
  generateName,
  random
};
