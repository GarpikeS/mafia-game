// server/socket/room-handlers.js — Обработчики лобби и комнат

const crypto = require('crypto');
const { ROLES, BOT_NAMES, MIN_PLAYERS } = require('../config');
const { createRoom, getRoom, deleteRoom, rooms, MAX_ROOMS } = require('../game/GameRoom');
const { checkWinCondition } = require('../game/WinCondition');
const { checkNightComplete, checkVotesComplete, notifyNarratorReady } = require('../game/PhaseManager');
const { generateName } = require('../generators/names');
const { getAvatar } = require('../generators/avatars');
const { safeHandler, playersForClient, lobbyPlayersForClient, sanitizeString } = require('./helpers');
const logger = require('../logger');

/**
 * Регистрация обработчиков лобби/комнат
 * @param {Object} socket — сокет игрока
 * @param {Object} io — socket.io сервер
 */
function registerRoomHandlers(socket, io) {

  // === Создание комнаты ===
  socket.on('createRoom', safeHandler(socket, (playerName) => {
    playerName = sanitizeString(playerName, 20);
    if (!playerName) {
      socket.emit('error', 'Имя не может быть пустым');
      return;
    }
    if (rooms.size >= MAX_ROOMS) {
      socket.emit('error', 'Слишком много активных комнат. Попробуйте позже.');
      return;
    }
    const room = createRoom(playerName);
    room.host = socket.id;
    const token = crypto.randomUUID();
    room.hostToken = token;

    socket.join(room.id);
    socket.roomId = room.id;
    socket.playerName = playerName;
    socket.isHost = true;

    logger.info({ roomId: room.id, host: playerName }, 'Комната создана');
    socket.emit('roomCreated', { roomId: room.id, isHost: true, token });
    io.to(room.id).emit('updatePlayers', lobbyPlayersForClient(room));
  }));

  // === Присоединение к комнате ===
  socket.on('joinRoom', safeHandler(socket, ({ roomId, playerName }) => {
    playerName = sanitizeString(playerName, 20);
    roomId = sanitizeString(roomId, 6);
    if (!playerName) { socket.emit('error', 'Имя не может быть пустым'); return; }
    if (!roomId) { socket.emit('error', 'Код комнаты не указан'); return; }

    const room = getRoom(roomId.toUpperCase());
    if (!room) { socket.emit('error', 'Комната не найдена'); return; }
    if (room.state !== 'lobby') { socket.emit('error', 'Игра уже началась'); return; }
    if (room.players.length >= 15) { socket.emit('error', 'Комната заполнена (максимум 15 игроков)'); return; }

    // Блокируем имя ведущего
    if (playerName === room.hostName) { socket.emit('error', 'Это имя уже занято в комнате'); return; }

    // Дубликат имени? (игнорируем _disconnected — они скоро будут удалены)
    const nameExists = room.players.some(p => p.name === playerName && !p.isBot && !p._disconnected);
    if (nameExists) { socket.emit('error', 'Это имя уже занято в комнате'); return; }

    const avatar = getAvatar(playerName);
    const token = crypto.randomUUID();
    const player = { id: socket.id, name: playerName, role: null, isBot: false, avatar, token };
    room.players.push(player);
    room.participants.push({ name: playerName, joinedAt: Date.now() });

    socket.join(room.id);
    socket.roomId = room.id;
    socket.playerName = playerName;

    logger.info({ roomId: room.id, player: playerName, playerCount: room.players.length }, 'Игрок присоединился');
    socket.emit('roomJoined', { roomId: room.id, player, token });
    io.to(room.id).emit('updatePlayers', lobbyPlayersForClient(room));
    io.to(room.id).emit('message', { type: 'system', text: `${playerName} присоединился к игре` });
  }));

  // === Добавление бота ===
  socket.on('addBot', safeHandler(socket, () => {
    const room = getRoom(socket.roomId);
    if (!room || room.host !== socket.id || room.state !== 'lobby') return;
    if (room.players.length >= 15) {
      socket.emit('error', 'Максимум 15 игроков в комнате');
      return;
    }

    room.botCounter++;
    const existingNames = new Set(room.players.map(p => p.name));

    // Пытаемся сгенерировать уникальное имя (до 20 попыток)
    let botName = null;
    try {
      const styles = ['russian', 'italian', 'hero'];
      for (let attempt = 0; attempt < 20; attempt++) {
        const style = styles[attempt % styles.length];
        const candidate = generateName(style) + ' (бот)';
        if (!existingNames.has(candidate)) {
          botName = candidate;
          break;
        }
      }
    } catch (err) {
      logger.error({ err: err.message }, 'Ошибка генератора имён');
    }

    // Fallback на "Бот N" если генератор не сработал или все имена заняты
    if (!botName) {
      botName = BOT_NAMES[(room.botCounter - 1) % BOT_NAMES.length] + ' (бот)';
    }

    const botAvatar = getAvatar(botName);
    const bot = { id: 'bot_' + room.botCounter, name: botName, role: null, isBot: true, avatar: botAvatar };
    room.players.push(bot);

    io.to(room.id).emit('updatePlayers', lobbyPlayersForClient(room));
    io.to(room.id).emit('message', { type: 'system', text: `${bot.name} добавлен в игру` });
  }));

  // === Удаление бота ===
  socket.on('removeBot', safeHandler(socket, (botId) => {
    const room = getRoom(socket.roomId);
    if (!room || room.host !== socket.id || room.state !== 'lobby') return;

    const index = room.players.findIndex(p => p.id === botId && p.isBot);
    if (index === -1) return;

    const bot = room.players[index];
    room.players.splice(index, 1);
    io.to(room.id).emit('updatePlayers', lobbyPlayersForClient(room));
    io.to(room.id).emit('message', { type: 'system', text: `${bot.name} удалён из игры` });
  }));

  // === Выход из комнаты ===
  socket.on('leaveRoom', safeHandler(socket, () => {
    const room = getRoom(socket.roomId);
    if (!room) return;

    if (socket.id === room.host) {
      io.to(room.id).emit('message', { type: 'system', text: 'Ведущий покинул игру. Комната закрыта.' });
      io.to(room.id).emit('gameEnded', { winner: null, message: 'Ведущий покинул игру. Комната закрыта.', players: room.players });
      deleteRoom(room.id);
    } else {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];

        if (room.state === 'lobby') {
          room.players.splice(playerIndex, 1);
          io.to(room.id).emit('updatePlayers', lobbyPlayersForClient(room));
        } else {
          if (!room.deadPlayers.has(socket.id)) {
            room.deadPlayers.add(socket.id);
          }
          delete room.nightActions[socket.id];
          delete room.votes[socket.id];

          io.to(room.id).emit('updatePlayers', playersForClient(room));

          const winCondition = checkWinCondition(room);
          if (winCondition) {
            room.state = 'ended';
            io.to(room.id).emit('gameEnded', { winner: winCondition.winner, message: winCondition.message, players: room.players });
          } else if (room.state === 'night' && checkNightComplete(room)) {
            notifyNarratorReady(room, 'night', io);
          } else if (room.state === 'day' && checkVotesComplete(room)) {
            notifyNarratorReady(room, 'day', io);
          }
        }

        socket.leave(room.id);
        io.to(room.id).emit('message', { type: 'system', text: `${player.name} покинул комнату` });
      }
    }
    socket.roomId = null;
  }));

  // === Закрыть комнату ===
  socket.on('closeRoom', safeHandler(socket, () => {
    const room = getRoom(socket.roomId);
    if (!room || room.host !== socket.id) return;

    io.to(room.id).emit('message', { type: 'system', text: 'Ведущий закрыл комнату.' });
    io.to(room.id).emit('gameEnded', { winner: null, message: 'Ведущий закрыл комнату.', players: room.players });
    deleteRoom(room.id);
    socket.roomId = null;
  }));

  // === Кик игрока (только в лобби) ===
  socket.on('kickPlayer', safeHandler(socket, (playerId) => {
    const room = getRoom(socket.roomId);
    if (!room || room.host !== socket.id) return;
    if (room.state !== 'lobby') return;

    const idx = room.players.findIndex(p => p.id === playerId && !p.isBot);
    if (idx === -1) return;

    const player = room.players[idx];
    room.players.splice(idx, 1);

    io.to(playerId).emit('kicked');
    io.to(room.id).emit('updatePlayers', lobbyPlayersForClient(room));
    io.to(room.id).emit('message', { type: 'system', text: `${player.name} исключён` });

    logger.info({ roomId: room.id, player: player.name, kickedBy: socket.playerName }, 'Игрок исключён');
  }));
}

module.exports = { registerRoomHandlers };
