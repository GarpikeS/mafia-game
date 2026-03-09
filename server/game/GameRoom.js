// server/game/GameRoom.js — Класс комнаты

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');
const { getAliveHumans } = require('./utils');

// Хранилище комнат
const rooms = new Map();

// Хранилище данных отключённых игроков для реконнекта
// Ключ: `${roomId}:${playerName}`, значение: { player, socketId, disconnectedAt, timerId }
const disconnectedPlayers = new Map();

// Таймеры отложенного удаления из лобби
// Ключ: `${roomId}:${playerName}`, значение: timerId
const lobbyDisconnectTimers = new Map();

/**
 * Создание комнаты — ведущий НЕ является игроком
 * @param {string} hostName — имя ведущего
 * @returns {Object} — объект комнаты
 */
function createRoom(hostName) {
  const roomId = uuidv4().substring(0, 6).toUpperCase();
  const room = {
    id: roomId,
    players: [],
    host: null,       // socket.id ведущего
    hostName: hostName,
    state: 'lobby',   // lobby, night, day, voting, ended, paused
    phase: 0,
    votes: {},
    nightActions: {},
    deadPlayers: new Set(),
    lastKilled: null,
    lastSaved: null,
    lastChecked: null,
    lastDoctorTarget: null, // предыдущая цель доктора (нельзя лечить дважды подряд)
    botCounter: 0,
    phaseReady: false,
    phaseTransitionLocked: false, // блокировка поздних действий при смене фазы
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    hostToken: null,    // токен реконнекта ведущего
    narratorQueue: [],  // очередь событий для offline-ведущего
    pausedState: null,  // состояние до паузы (для возобновления)
    timers: [],         // отслеживание таймеров для очистки
    participants: [],   // история всех вошедших игроков [{name, joinedAt}]
    gameRoster: null    // состав игроков на момент старта [{name, role, isBot}]
  };
  rooms.set(roomId, room);
  return room;
}

/**
 * Получить комнату по ID
 * @param {string} roomId
 * @returns {Object|undefined}
 */
function getRoom(roomId) {
  return rooms.get(roomId);
}

/**
 * Удалить комнату с очисткой таймеров
 * @param {string} roomId
 */
function deleteRoom(roomId) {
  const room = rooms.get(roomId);
  if (room) {
    // Очищаем все таймеры комнаты
    if (room.timers) {
      room.timers.forEach(t => clearTimeout(t));
      room.timers = [];
    }
    // Удаляем все данные реконнекта для этой комнаты
    for (const [key, data] of disconnectedPlayers) {
      if (key.startsWith(roomId + ':')) {
        if (data.timerId) clearTimeout(data.timerId);
        disconnectedPlayers.delete(key);
      }
    }
    // Очищаем таймеры лобби-реконнекта
    for (const [key, timerId] of lobbyDisconnectTimers) {
      if (key.startsWith(roomId + ':')) {
        clearTimeout(timerId);
        lobbyDisconnectTimers.delete(key);
      }
    }
  }
  rooms.delete(roomId);
}

/**
 * Получить все комнаты (для отладки/мониторинга)
 * @returns {Map}
 */
function getAllRooms() {
  return rooms;
}

/**
 * Обновить время активности комнаты
 * @param {Object} room
 */
function touchRoom(room) {
  if (room) room.lastActivityAt = Date.now();
}

/**
 * Сохранить данные отключённого игрока для реконнекта
 * @param {string} roomId
 * @param {Object} player — объект игрока
 * @param {string} oldSocketId — предыдущий socket.id
 */
function saveDisconnectedPlayer(roomId, player, oldSocketId) {
  const key = `${roomId}:${player.name}`;

  // Очищаем предыдущий таймер, если есть
  const existing = disconnectedPlayers.get(key);
  if (existing && existing.timerId) {
    clearTimeout(existing.timerId);
  }

  // Устанавливаем таймер автоудаления
  const timerId = setTimeout(() => {
    disconnectedPlayers.delete(key);
    logger.info({ roomId, player: player.name }, 'Реконнект истёк');
  }, config.RECONNECT_TIMEOUT_MS);

  disconnectedPlayers.set(key, {
    player: { ...player },
    socketId: oldSocketId,
    disconnectedAt: Date.now(),
    timerId
  });

  logger.debug({ roomId, player: player.name, timeoutSec: config.RECONNECT_TIMEOUT_MS / 1000 }, 'Данные реконнекта сохранены');
}

/**
 * Попытка реконнекта игрока
 * @param {string} roomId
 * @param {string} playerName
 * @returns {Object|null} — данные игрока или null
 */
function tryReconnect(roomId, playerName) {
  const key = `${roomId}:${playerName}`;
  const data = disconnectedPlayers.get(key);
  if (data) {
    if (data.timerId) clearTimeout(data.timerId);
    disconnectedPlayers.delete(key);
    return data;
  }
  return null;
}

/**
 * Очистка пустых и устаревших комнат
 * @param {Object} io — socket.io сервер (для уведомлений)
 */
function cleanupRooms(io) {
  const now = Date.now();
  for (const [id, room] of rooms) {
    // Удалить пустые комнаты, которые были пусты 5+ минут
    const humanPlayers = room.players.filter(p => !p.isBot);
    const isEmpty = humanPlayers.length === 0 && room.state !== 'lobby';
    const isStale = now - room.lastActivityAt > config.EMPTY_ROOM_TTL_MS;

    // Пустая комната без активности 5+ минут
    if (isEmpty && isStale) {
      logger.info({ roomId: id, inactiveSec: Math.round((now - room.lastActivityAt) / 1000) }, 'Очистка пустой комнаты');
      deleteRoom(id);
      continue;
    }

    // Лобби без хоста (хост отключился) — удалить через 5 минут
    if (room.state === 'lobby' && !room.host && isStale) {
      logger.info({ roomId: id }, 'Очистка комнаты без хоста');
      deleteRoom(id);
      continue;
    }

    // Старые комнаты (2+ часа)
    if (now - room.createdAt > 2 * 60 * 60 * 1000) {
      logger.info({ roomId: id, ageMin: Math.round((now - room.createdAt) / 60000) }, 'Очистка старой комнаты');
      if (io) {
        io.to(id).emit('gameEnded', {
          winner: null,
          message: 'Комната закрыта из-за неактивности.',
          players: room.players.map(stripPrivateFields)
        });
      }
      deleteRoom(id);
    }
  }
}

// Запуск периодической очистки
let cleanupInterval = null;
/**
 * Запустить периодическую очистку комнат по интервалу
 * @param {Object} io — socket.io сервер (для уведомлений при удалении)
 */
function startCleanupTimer(io) {
  if (cleanupInterval) clearInterval(cleanupInterval);
  cleanupInterval = setInterval(() => cleanupRooms(io), config.ROOM_CLEANUP_INTERVAL_MS);
}

/**
 * Добавить таймер в комнату для отслеживания и последующей очистки
 * @param {Object} room — объект комнаты
 * @param {NodeJS.Timeout} timerId — идентификатор таймера (setTimeout/setInterval)
 * @returns {NodeJS.Timeout} — переданный timerId (для удобства цепочки)
 */
function addRoomTimer(room, timerId) {
  if (room && room.timers) {
    room.timers.push(timerId);
  }
  return timerId;
}

/**
 * Проверка массового disconnect — если >50% живых игроков отключены, автопауза
 * @param {Object} room
 * @param {Object} io
 * @returns {boolean} true если комната поставлена на паузу
 */
function checkMassDisconnect(room, io) {
  if (!room || room.state === 'lobby' || room.state === 'ended' || room.state === 'paused') return false;

  const alivePlayers = getAliveHumans(room);
  if (alivePlayers.length === 0) return false;

  // Считаем отключённых среди живых людей
  let disconnectedCount = 0;
  for (const p of alivePlayers) {
    const key = `${room.id}:${p.name}`;
    if (disconnectedPlayers.has(key)) disconnectedCount++;
  }

  if (disconnectedCount > alivePlayers.length / 2) {
    room.pausedState = room.state;
    room.state = 'paused';
    if (io) {
      io.to(room.id).emit('message', {
        type: 'system',
        text: `Игра приостановлена: ${disconnectedCount} из ${alivePlayers.length} игроков потеряли соединение`
      });
      emitToHost(room, io, 'gamePaused', { reason: 'mass_disconnect', disconnected: disconnectedCount, total: alivePlayers.length });
    }
    logger.warn({ roomId: room.id, disconnected: disconnectedCount, alive: alivePlayers.length }, 'Автопауза: массовый disconnect');
    return true;
  }
  return false;
}

/**
 * Возобновить игру после паузы
 * @param {Object} room
 * @param {Object} io
 */
function resumeGame(room, io) {
  if (!room || room.state !== 'paused' || !room.pausedState) return;
  room.state = room.pausedState;
  room.pausedState = null;
  if (io) {
    io.to(room.id).emit('message', { type: 'system', text: 'Игра возобновлена' });
    emitToHost(room, io, 'gameResumed', { state: room.state });
  }
  logger.info({ roomId: room.id }, 'Игра возобновлена');
}

/**
 * Отправить событие ведущему (буферизация при offline)
 * @param {Object} room
 * @param {Object} io
 * @param {string} event — имя события
 * @param {*} data — данные
 */
function emitToHost(room, io, event, data) {
  if (room.host) {
    io.to(room.host).emit(event, data);
  } else {
    room.narratorQueue.push({ event, data });
    if (room.narratorQueue.length > 100) {
      room.narratorQueue.shift();
    }
  }
}

/**
 * Воспроизвести очередь событий ведущему после реконнекта
 * @param {Object} room
 * @param {Object} io
 */
function replayNarratorQueue(room, io) {
  if (!room.host || room.narratorQueue.length === 0) return;
  const queue = room.narratorQueue.splice(0);
  queue.forEach(({ event, data }) => {
    io.to(room.host).emit(event, data);
  });
}

/**
 * Убрать приватные поля из объекта игрока (token, _disconnected)
 * @param {Object} p — объект игрока
 * @returns {Object} — копия объекта без приватных полей
 */
function stripPrivateFields(p) {
  const { token, _disconnected, ...clean } = p;
  return clean;
}

// === Сохранение/восстановление состояния комнат (защита от рестартов) ===

const fs = require('fs');
const path = require('path');
const STATE_FILE = path.join(__dirname, '..', '..', 'data', 'rooms-state.json');

/**
 * Сохранить активные комнаты на диск (защита от рестартов сервера)
 * Записывает снимок всех незавершённых комнат в JSON-файл
 * @returns {Promise<void>}
 */
async function saveState() {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const snapshot = [];
    for (const [id, room] of rooms) {
      if (room.state === 'ended') continue;
      snapshot.push({
        id: room.id,
        hostName: room.hostName,
        state: room.state,
        phase: room.phase,
        players: room.players.map(p => ({ id: p.id, name: p.name, role: p.role, isBot: p.isBot, avatar: p.avatar })),
        deadPlayers: [...room.deadPlayers],
        participants: room.participants,
        gameRoster: room.gameRoster,
        createdAt: room.createdAt,
        savedAt: Date.now()
      });
    }
    await fs.promises.writeFile(STATE_FILE, JSON.stringify(snapshot, null, 2));
    logger.info({ rooms: snapshot.length }, 'Состояние сохранено');
  } catch (err) {
    logger.error({ err: err.message }, 'Ошибка сохранения состояния');
  }
}

module.exports = {
  createRoom,
  getRoom,
  deleteRoom,
  getAllRooms,
  touchRoom,
  saveDisconnectedPlayer,
  tryReconnect,
  cleanupRooms,
  startCleanupTimer,
  addRoomTimer,
  checkMassDisconnect,
  resumeGame,
  emitToHost,
  replayNarratorQueue,
  stripPrivateFields,
  saveState,
  rooms,
  disconnectedPlayers,
  lobbyDisconnectTimers
};
