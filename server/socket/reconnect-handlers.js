// server/socket/reconnect-handlers.js — Обработчики реконнекта и дисконнекта

const { ROLES, ROLE_NAMES, RECONNECT_TIMEOUT_MS, LOBBY_RECONNECT_TIMEOUT_MS, HOST_RECONNECT_TIMEOUT_MS } = require('../config');
const { getRoom, deleteRoom, saveDisconnectedPlayer, tryReconnect, addRoomTimer, checkMassDisconnect, resumeGame, emitToHost, replayNarratorQueue, lobbyDisconnectTimers, disconnectedPlayers } = require('../game/GameRoom');
const { checkNightComplete, checkVotesComplete, notifyNarratorReady } = require('../game/PhaseManager');
const { checkWinCondition } = require('../game/WinCondition');
const { isMafiaRole } = require('../game/utils');
const { safeHandler, playersForClient, lobbyPlayersForClient, sanitizeString } = require('./helpers');
const logger = require('../logger');

/**
 * Регистрация обработчиков реконнекта и дисконнекта
 * @param {Object} socket — сокет игрока
 * @param {Object} io — socket.io сервер
 */
function registerReconnectHandlers(socket, io) {

  // === Реконнект ===
  socket.on('rejoinRoom', safeHandler(socket, ({ roomId, playerName, token }) => {
    playerName = sanitizeString(playerName, 20);
    roomId = sanitizeString(roomId, 6);
    token = typeof token === 'string' ? token.substring(0, 50) : null;
    if (!roomId || !playerName) { socket.emit('rejoinFailed'); return; }

    const room = getRoom(roomId.toUpperCase());
    if (!room) { socket.emit('rejoinFailed'); return; }

    // Ведущий? (только если хост реально отключён — room.host === null)
    if (room.hostName === playerName && !room.host) {
      // Смягчённая проверка токена: в лобби разрешаем без токена (менее критично)
      if (room.hostToken && token !== room.hostToken) {
        if (room.state !== 'lobby') {
          socket.emit('rejoinFailed');
          logger.warn({ roomId: room.id, player: playerName }, 'Реконнект отклонён (неверный токен хоста)');
          return;
        }
        logger.warn({ roomId: room.id, player: playerName }, 'Хост реконнект без валидного токена (лобби)');
      }
      room.host = socket.id;
      socket.join(room.id);
      socket.roomId = room.id;
      socket.playerName = playerName;
      socket.isHost = true;

      if (room.state === 'lobby') {
        socket.emit('rejoinSuccess', {
          gameState: 'lobby',
          isHost: true,
          players: lobbyPlayersForClient(room)
        });
        io.to(room.id).emit('updatePlayers', lobbyPlayersForClient(room));
      } else {
        socket.emit('rejoinSuccess', {
          gameState: room.state, phase: room.phase,
          players: playersForClient(room),
          narratorPlayers: room.players.map(p => ({
            id: p.id, name: p.name, role: p.role,
            roleName: ROLE_NAMES[p.role], isBot: p.isBot, avatar: p.avatar
          }))
        });
        replayNarratorQueue(room, io);
      }
      io.to(room.id).emit('hostReconnected');
      io.to(room.id).emit('message', { type: 'system', text: 'Ведущий вернулся' });
      logger.info({ roomId: room.id, player: playerName }, 'Ведущий реконнект');
      return;
    }

    // Игрок — проверяем сохранённые данные
    const reconnectData = tryReconnect(roomId.toUpperCase(), playerName);
    if (reconnectData) {
      if (reconnectData.player.token && token !== reconnectData.player.token) {
        socket.emit('rejoinFailed');
        logger.warn({ roomId: room.id, player: playerName }, 'Реконнект отклонён (неверный токен игрока)');
        return;
      }

      const oldSocketId = reconnectData.socketId;
      const playerInRoom = room.players.find(p => p.id === oldSocketId);
      if (playerInRoom) {
        if (reconnectData.roomTimerId) {
          clearTimeout(reconnectData.roomTimerId);
          const timerIdx = room.timers.indexOf(reconnectData.roomTimerId);
          if (timerIdx !== -1) room.timers.splice(timerIdx, 1);
        }

        playerInRoom.id = socket.id;

        if (room.nightActions[oldSocketId]) {
          room.nightActions[socket.id] = room.nightActions[oldSocketId];
          delete room.nightActions[oldSocketId];
        }
        if (room.votes[oldSocketId]) {
          room.votes[socket.id] = room.votes[oldSocketId];
          delete room.votes[oldSocketId];
        }

        if (room.deadPlayers.has(oldSocketId)) {
          room.deadPlayers.delete(oldSocketId);
          room.deadPlayers.add(socket.id);
        }

        socket.join(room.id);
        socket.roomId = room.id;
        socket.playerName = playerName;

        const isTeamMafia = isMafiaRole(playerInRoom.role);
        const mafiaMembers = room.players
          .filter(p => isMafiaRole(p.role) && p.id !== socket.id)
          .map(p => p.name);

        socket.emit('rejoinSuccess', {
          gameState: room.state, phase: room.phase,
          role: playerInRoom.role,
          mafiaMembers: isTeamMafia ? mafiaMembers : [],
          players: playersForClient(room)
        });

        io.to(room.id).emit('message', { type: 'system', text: `${playerName} переподключился` });
        io.to(room.id).emit('updatePlayers', playersForClient(room));

        if (room.state === 'paused') resumeGame(room, io);

        logger.info({ roomId: room.id, player: playerName, oldSocketId, newSocketId: socket.id }, 'Реконнект игрока');
        return;
      }
    }

    // Лобби — можно войти заново по имени
    if (room.state === 'lobby') {
      const existingPlayer = room.players.find(p => p.name === playerName && !p.isBot);
      if (existingPlayer) {
        if (existingPlayer.token && token !== existingPlayer.token) {
          socket.emit('rejoinFailed');
          logger.warn({ roomId: room.id, player: playerName }, 'Реконнект отклонён (неверный токен лобби)');
          return;
        }
        const lobbyKey = `${room.id}:${playerName}`;
        const lobbyTimer = lobbyDisconnectTimers.get(lobbyKey);
        if (lobbyTimer) {
          clearTimeout(lobbyTimer);
          lobbyDisconnectTimers.delete(lobbyKey);
        }
        delete existingPlayer._disconnected;
        existingPlayer.id = socket.id;
        socket.join(room.id);
        socket.roomId = room.id;
        socket.playerName = playerName;
        socket.emit('rejoinSuccess', { gameState: 'lobby' });
        io.to(room.id).emit('updatePlayers', lobbyPlayersForClient(room));
        logger.info({ roomId: room.id, player: playerName }, 'Лобби реконнект');
        return;
      }
    }

    socket.emit('rejoinFailed');
  }));

  // === Ping check для индикатора соединения ===
  socket.on('ping_check', (callback) => {
    if (typeof callback === 'function') callback();
  });

  // === Отключение ===
  socket.on('disconnect', () => {
    try {
      logger.debug({ socketId: socket.id, roomId: socket.roomId || null }, 'Отключение');
      const room = getRoom(socket.roomId);
      if (!room) return;

      // Ведущий — отложенное закрытие, даём время на реконнект
      if (socket.id === room.host) {
        room.host = null;
        const hostTimeout = room.state === 'lobby' ? HOST_RECONNECT_TIMEOUT_MS : RECONNECT_TIMEOUT_MS;
        io.to(room.id).emit('hostDisconnected', { timeout: hostTimeout });
        io.to(room.id).emit('message', {
          type: 'system',
          text: `Ведущий потерял соединение (${hostTimeout / 1000}с на возврат)`
        });

        const hostRoomId = room.id;
        const hostTimerId = setTimeout(() => {
          const currentRoom = getRoom(hostRoomId);
          if (!currentRoom) return;
          if (currentRoom.host) return;
          io.to(hostRoomId).emit('message', { type: 'system', text: 'Ведущий не вернулся. Комната закрыта.' });
          io.to(hostRoomId).emit('gameEnded', { winner: null, message: 'Ведущий не вернулся. Комната закрыта.', players: currentRoom.players });
          deleteRoom(hostRoomId);
        }, hostTimeout);
        addRoomTimer(room, hostTimerId);
        return;
      }

      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;
      const player = room.players[playerIndex];

      if (room.state === 'lobby') {
        player._disconnected = true;
        const lobbyKey = `${room.id}:${player.name}`;
        const existingTimer = lobbyDisconnectTimers.get(lobbyKey);
        if (existingTimer) clearTimeout(existingTimer);

        const lobbyTimerId = setTimeout(() => {
          lobbyDisconnectTimers.delete(lobbyKey);
          const currentRoom = getRoom(room.id);
          if (!currentRoom || currentRoom.state !== 'lobby') return;
          const idx = currentRoom.players.findIndex(p => p.name === player.name && p._disconnected);
          if (idx === -1) return;
          currentRoom.players.splice(idx, 1);
          io.to(currentRoom.id).emit('updatePlayers', lobbyPlayersForClient(currentRoom));
          io.to(currentRoom.id).emit('message', { type: 'system', text: `${player.name} покинул игру` });
        }, LOBBY_RECONNECT_TIMEOUT_MS);
        lobbyDisconnectTimers.set(lobbyKey, lobbyTimerId);
      } else {
        // Убитые игроки тоже сохраняются для реконнекта как наблюдатели
        const isDead = room.deadPlayers.has(socket.id);

        saveDisconnectedPlayer(room.id, player, socket.id);

        // Для убитых игроков — другое сообщение (они наблюдатели)
        if (isDead) {
          io.to(room.id).emit('message', {
            type: 'system',
            text: `${player.name} (наблюдатель) потерял соединение`
          });
        } else {
          io.to(room.id).emit('message', {
            type: 'system',
            text: `${player.name} потерял соединение (${RECONNECT_TIMEOUT_MS / 1000}с на возврат)`
          });

          emitToHost(room, io, 'narratorAction', {
            phase: room.state, actor: player.name,
            actorRole: ROLE_NAMES[player.role],
            target: 'Потерял соединение', isBot: false
          });

          checkMassDisconnect(room, io);
        }

        // Таймер выбывания только для живых игроков (убитые уже наблюдатели)
        if (!isDead) {
          const roomId = socket.roomId;
          const socketId = socket.id;
          const playerName = player.name;
          const timerId = setTimeout(() => {
            try {
              const currentRoom = getRoom(roomId);
              if (!currentRoom || currentRoom.state === 'ended') return;

              const currentPlayer = currentRoom.players.find(p => p.id === socketId);
              if (!currentPlayer) return;

              if (currentRoom.deadPlayers.has(socketId)) return;

              currentRoom.deadPlayers.add(socketId);
              io.to(currentRoom.id).emit('message', { type: 'system', text: `${player.name} покинул игру и выбыл` });
              io.to(currentRoom.id).emit('updatePlayers', playersForClient(currentRoom));

              const winCondition = checkWinCondition(currentRoom);
              if (winCondition) {
                currentRoom.state = 'ended';
                io.to(currentRoom.id).emit('gameEnded', { winner: winCondition.winner, message: winCondition.message, players: currentRoom.players });
              } else {
                if (currentRoom.state === 'night' && checkNightComplete(currentRoom)) {
                  notifyNarratorReady(currentRoom, 'night', io);
                } else if (currentRoom.state === 'day' && checkVotesComplete(currentRoom)) {
                  notifyNarratorReady(currentRoom, 'day', io);
                }
              }
            } catch (err) {
              logger.error({ err: err.message }, 'Ошибка в таймере отключения');
            }
          }, RECONNECT_TIMEOUT_MS);

          addRoomTimer(room, timerId);

          const dcKey = `${roomId}:${playerName}`;
          const dcData = disconnectedPlayers.get(dcKey);
          if (dcData) dcData.roomTimerId = timerId;
        }
      }
    } catch (err) {
      logger.error({ err: err.message, socketId: socket.id }, 'Ошибка в disconnect');
    }
  });
}

module.exports = { registerReconnectHandlers };
