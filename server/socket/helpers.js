// server/socket/helpers.js — Общие утилиты для socket-обработчиков

const { RATE_LIMIT_MAX_EVENTS, RATE_LIMIT_WINDOW_MS } = require('../config');
const { stripPrivateFields } = require('../game/GameRoom');
const logger = require('../logger');

/**
 * Санитизация строки: обрезка, ограничение длины, удаление управляющих символов
 */
function sanitizeString(str, maxLen = 50) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\x00-\x1F\x7F]/g, '').trim().substring(0, maxLen);
}

/**
 * Валидация targetId — должен быть строкой или null
 */
function sanitizeTargetId(targetId) {
  if (targetId === null || targetId === undefined) return null;
  if (typeof targetId !== 'string') return null;
  return targetId.substring(0, 50);
}

/**
 * Rate limiter на сокет
 * Возвращает true если лимит превышен (нужно заблокировать)
 */
function isRateLimited(socket) {
  const now = Date.now();
  if (!socket._rateLimit) {
    socket._rateLimit = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }
  if (now > socket._rateLimit.resetAt) {
    socket._rateLimit.count = 0;
    socket._rateLimit.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  socket._rateLimit.count++;
  return socket._rateLimit.count > RATE_LIMIT_MAX_EVENTS;
}

/**
 * Обёртка хендлера с try-catch и rate-limit
 */
function safeHandler(socket, handler) {
  return (...args) => {
    if (isRateLimited(socket)) return;
    try {
      handler(...args);
    } catch (err) {
      logger.error({ socketId: socket.id, err: err.message }, 'Ошибка в обработчике');
    }
  };
}

/**
 * Формирование списка игроков для отправки клиенту (скрытие ролей живых)
 * @param {Object} room — объект комнаты
 * @returns {Array<Object>} — массив игроков с ролями только у мёртвых
 */
function playersForClient(room) {
  return room.players.map(p => ({
    ...stripPrivateFields(p),
    role: room.deadPlayers.has(p.id) ? p.role : undefined,
    isDead: room.deadPlayers.has(p.id)
  }));
}

/**
 * Список игроков лобби (без отключённых и приватных полей)
 * @param {Object} room — объект комнаты
 * @returns {Array<Object>} — массив активных игроков без приватных полей
 */
function lobbyPlayersForClient(room) {
  return room.players.filter(p => !p._disconnected).map(stripPrivateFields);
}

module.exports = {
  sanitizeString,
  sanitizeTargetId,
  safeHandler,
  playersForClient,
  lobbyPlayersForClient
};
