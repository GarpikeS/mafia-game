// server/config.js — Конфигурация сервера

const config = {
  PORT: process.env.PORT || 5000,

  // Роли в игре (текущие)
  ROLES: {
    MAFIA: 'mafia',
    GODFATHER: 'godfather',
    MANIAC: 'maniac',
    DOCTOR: 'doctor',
    DETECTIVE: 'detective',
    CIVILIAN: 'civilian'
  },

  ROLE_NAMES: {
    mafia: 'Мафия',
    godfather: 'Крёстный отец',
    maniac: 'Маньяк',
    doctor: 'Доктор',
    detective: 'Детектив',
    civilian: 'Мирный житель'
  },

  // Имена для ботов
  BOT_NAMES: [
    'Алекс', 'Борис', 'Виктор', 'Григорий', 'Дмитрий',
    'Евгений', 'Жорж', 'Захар', 'Иван', 'Кирилл',
    'Леонид', 'Максим', 'Николай', 'Олег', 'Павел',
    'Роман', 'Сергей', 'Тимур', 'Фёдор', 'Юрий',
    'Андрей', 'Валентин', 'Геннадий', 'Денис', 'Егор',
    'Константин', 'Михаил', 'Пётр', 'Степан', 'Филипп',
    'Анна', 'Дарья', 'Екатерина', 'Ирина', 'Ксения',
    'Маргарита', 'Наталья', 'Ольга', 'Полина', 'Светлана'
  ],

  // Лимиты игроков
  MIN_PLAYERS: 4,
  MAX_PLAYERS: 40,

  // Лимиты комнат
  MAX_ROOMS: 50,

  // Задержка действий ботов (мс)
  BOT_DELAY_MIN: 1000,
  BOT_DELAY_MAX: 3000,

  // Reconnection — время хранения данных отключённого игрока (мс)
  RECONNECT_TIMEOUT_MS: 120 * 1000, // 2 минуты (запас для плохого интернета)

  // Lobby reconnect — время ожидания переподключения игрока в лобби (мс)
  LOBBY_RECONNECT_TIMEOUT_MS: 45 * 1000, // 45 секунд (достаточно для F5)

  // Host reconnect — время ожидания переподключения ведущего (мс)
  HOST_RECONNECT_TIMEOUT_MS: 60 * 1000, // 60 секунд

  // Socket.io heartbeat
  PING_INTERVAL_MS: 30000,  // 30 секунд (меньше нагрузка на мобильных)
  PING_TIMEOUT_MS: 30000,   // 30 секунд (увеличено для стабильности)

  // Anti-spam: rate limiting
  RATE_LIMIT_MAX_EVENTS: 10,    // макс. событий
  RATE_LIMIT_WINDOW_MS: 1000,   // за 1 секунду

  // Очистка пустых комнат (мс)
  EMPTY_ROOM_TTL_MS: 5 * 60 * 1000,  // 5 минут
  ROOM_CLEANUP_INTERVAL_MS: 60 * 1000, // проверка каждую минуту

  // Минимум игроков для продолжения игры (иначе пауза)
  MIN_PLAYERS_TO_CONTINUE: 3
};

module.exports = config;
