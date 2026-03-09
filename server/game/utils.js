// server/game/utils.js — Общие утилиты игровой логики

const { ROLES } = require('../config');

/**
 * Получить живых игроков комнаты
 * @param {Object} room — объект комнаты
 * @returns {Array} — массив живых игроков
 */
function getAlivePlayers(room) {
  return room.players.filter(p => !room.deadPlayers.has(p.id));
}

/**
 * Проверка: является ли роль частью мафии (Мафия или Крёстный отец)
 * @param {string} role — роль игрока
 * @returns {boolean}
 */
function isMafiaRole(role) {
  return role === ROLES.MAFIA || role === ROLES.GODFATHER;
}

/**
 * Получить живых игроков-людей (не ботов)
 * @param {Object} room — объект комнаты
 * @returns {Array}
 */
function getAliveHumans(room) {
  return room.players.filter(p => !room.deadPlayers.has(p.id) && !p.isBot);
}

/**
 * Получить живых ботов
 * @param {Object} room — объект комнаты
 * @returns {Array}
 */
function getAliveBots(room) {
  return room.players.filter(p => !room.deadPlayers.has(p.id) && p.isBot);
}

/**
 * Получить живых игроков команды мафии
 * @param {Object} room — объект комнаты
 * @returns {Array}
 */
function getAliveMafia(room) {
  return room.players.filter(p => !room.deadPlayers.has(p.id) && isMafiaRole(p.role));
}

/**
 * Получить живых мирных (не мафия, не маньяк)
 * @param {Object} room — объект комнаты
 * @returns {Array}
 */
function getAliveCivilians(room) {
  return room.players.filter(p => !room.deadPlayers.has(p.id) && !isMafiaRole(p.role) && p.role !== ROLES.MANIAC);
}

module.exports = { getAlivePlayers, isMafiaRole, getAliveHumans, getAliveBots, getAliveMafia, getAliveCivilians };
