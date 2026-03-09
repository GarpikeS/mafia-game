// server/generators/scenarios.js — Шаблоны ночных событий и атмосферных текстов

const { random } = require('./names');

/**
 * Локации для ночных событий
 */
const LOCATIONS = [
  'центральной площади',
  'тёмного переулка',
  'старого порта',
  'городской ратуши',
  'заброшенного склада',
  'ночного клуба',
  'парковой аллеи',
  'подземного перехода',
  'крыши высотки',
  'старого кладбища',
  'железнодорожной станции',
  'набережной',
  'торгового квартала',
  'церковной площади',
  'тюремного двора'
];

/**
 * Ночные события
 */
const NIGHT_EVENTS = [
  'слышны крики',
  'найден странный предмет',
  'погасли фонари',
  'раздался выстрел',
  'заметили подозрительную тень',
  'обнаружены следы борьбы',
  'прозвучал звон разбитого стекла',
  'кто-то быстро скрылся в темноте',
  'на земле нашли анонимную записку',
  'из подвала донёсся странный шум'
];

/**
 * Дневные слухи (для атмосферы)
 */
const DAY_RUMORS = [
  'Говорят, кто-то видел подозрительного человека у {location}.',
  'Ходят слухи, что в городе появился новый враг.',
  'Местные торговцы заметили странную активность ночью.',
  'Сегодня утром у {location} нашли необычные улики.',
  'Горожане встревожены. Никто не чувствует себя в безопасности.',
  'Кто-то оставил предупреждающее послание на стене ратуши.',
  'Старый сторож клянётся, что видел двух людей в масках.',
  'На рассвете заметили кого-то убегающего из {location}.'
];

/**
 * Шаблоны ночных описаний
 */
const NIGHT_TEMPLATES = [
  'Ночь #{phase}. Возле {location} {event}. Город затаил дыхание.',
  'Ночь #{phase}. Тьма сгущается. У {location} {event}.',
  'Ночь #{phase}. Туман окутывает город. Где-то у {location} {event}.',
  'Ночь #{phase}. Тишину нарушает лишь ветер. Но у {location} {event}.',
  'Ночь #{phase}. Город спит беспокойным сном. Возле {location} {event}.'
];

/**
 * Шаблоны утренних описаний
 */
const DAY_TEMPLATES = [
  'Утро #{phase}. Город просыпается. {rumor}',
  'День #{phase}. Солнце восходит над крышами. {rumor}',
  'Утро #{phase}. Новый день, но тень ночи ещё не рассеялась. {rumor}',
  'День #{phase}. Горожане собираются на площади. {rumor}'
];

/**
 * Погода/настроение для фаз
 */
const WEATHER = [
  'Холодный ветер пронизывает до костей.',
  'Мелкий дождь барабанит по крышам.',
  'Густой туман скрывает очертания зданий.',
  'Луна освещает пустые улицы.',
  'Тяжёлые тучи нависли над городом.',
  'Звёздное небо над спящим городом.',
  'Лёгкий снег покрывает мостовые.',
  'Безоблачная ночь, каждая тень на виду.'
];

/**
 * Заполнить шаблон данными
 * @param {string} template — шаблон с {placeholders}
 * @param {Object} data — объект с данными
 * @returns {string}
 */
function fillTemplate(template, data) {
  let result = template;
  Object.entries(data).forEach(([key, value]) => {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    result = result.replace(new RegExp(`#\\{${key}\\}`, 'g'), value);
  });
  return result;
}

/**
 * Сгенерировать атмосферный текст для ночной фазы
 * @param {number} phase — номер фазы
 * @returns {string}
 */
function generateNightFlavor(phase) {
  const location = random(LOCATIONS);
  const event = random(NIGHT_EVENTS);
  const template = random(NIGHT_TEMPLATES);
  return fillTemplate(template, { phase, location, event });
}

/**
 * Сгенерировать атмосферный текст для дневной фазы
 * @param {number} phase — номер фазы
 * @returns {string}
 */
function generateDayFlavor(phase) {
  const location = random(LOCATIONS);
  const rumorTemplate = random(DAY_RUMORS);
  const rumor = fillTemplate(rumorTemplate, { location });
  const template = random(DAY_TEMPLATES);
  return fillTemplate(template, { phase, rumor });
}

/**
 * Сгенерировать описание погоды
 * @returns {string}
 */
function generateWeather() {
  return random(WEATHER);
}

/**
 * Сгенерировать название матча
 * @returns {string}
 */
function generateMatchTitle() {
  const adjectives = ['Тёмная', 'Кровавая', 'Тихая', 'Последняя', 'Роковая', 'Ледяная', 'Огненная'];
  const nouns = ['Ночь', 'Охота', 'Расправа', 'Операция', 'Вендетта', 'Облава', 'Засада'];
  return `${random(adjectives)} ${random(nouns)}`;
}

/**
 * Шаблоны описания убийства (для перехода ночь → день)
 */
const KILL_TEMPLATES = [
  '{name} был найден мёртвым у {location}. {weather}',
  'Тело {name} обнаружили на рассвете возле {location}. {weather}',
  '{name} не пережил эту ночь. Следы ведут к {location}.',
  'Жители в ужасе: {name} убит. Последний раз его видели у {location}.',
  'На рассвете у {location} нашли {name}. Город содрогнулся.',
  '{name} стал жертвой тёмной ночи. Возле {location} царит гнетущая тишина.'
];

/**
 * Шаблоны для спасения доктором
 */
const SAVE_TEMPLATES = [
  'Чудом кто-то выжил этой ночью. Говорят, помог таинственный доктор.',
  'Ночь была опасной, но кого-то успели спасти в последний момент.',
  'У {location} нашли следы борьбы, но жертв нет. Кому-то повезло.',
  'Этой ночью смерть прошла мимо. Говорят, кто-то оказал помощь вовремя.'
];

/**
 * Шаблоны для мирной ночи (никто не пострадал)
 */
const PEACEFUL_NIGHT_TEMPLATES = [
  'Удивительно, но эта ночь прошла без жертв. Город вздохнул с облегчением.',
  'Утро наступило без потерь. Но надолго ли?',
  'Тихая ночь. Слишком тихая. Горожане переглядываются с подозрением.',
  'Никто не пострадал, но тревога витает в воздухе.'
];

/**
 * Сгенерировать описание убийства
 * @param {string} victimName — имя жертвы
 * @returns {string}
 */
function generateKillDescription(victimName) {
  const location = random(LOCATIONS);
  const weather = random(WEATHER);
  const template = random(KILL_TEMPLATES);
  return fillTemplate(template, { name: victimName, location, weather });
}

/**
 * Сгенерировать описание спасения
 * @returns {string}
 */
function generateSaveDescription() {
  const location = random(LOCATIONS);
  const template = random(SAVE_TEMPLATES);
  return fillTemplate(template, { location });
}

/**
 * Сгенерировать описание мирной ночи
 * @returns {string}
 */
function generatePeacefulNight() {
  return random(PEACEFUL_NIGHT_TEMPLATES);
}

module.exports = {
  LOCATIONS,
  NIGHT_EVENTS,
  DAY_RUMORS,
  WEATHER,
  generateNightFlavor,
  generateDayFlavor,
  generateWeather,
  generateMatchTitle,
  generateKillDescription,
  generateSaveDescription,
  generatePeacefulNight,
  fillTemplate
};
