// server/socket/game-handlers.js — Обработчики игрового процесса

const { ROLES, ROLE_NAMES, MIN_PLAYERS } = require('../config');
const { getRoom, emitToHost, stripPrivateFields } = require('../game/GameRoom');
const { assignRoles } = require('../game/RoleManager');
const { checkNightComplete, checkVotesComplete, notifyNarratorReady, transitionToDay, processVoteResults } = require('../game/PhaseManager');
const { scheduleBotActions } = require('../game/BotAI');
const { generateNightFlavor, generateWeather } = require('../generators/scenarios');
const { getAlivePlayers, isMafiaRole } = require('../game/utils');
const { safeHandler, playersForClient, sanitizeString, sanitizeTargetId } = require('./helpers');
const logger = require('../logger');

/**
 * Регистрация обработчиков игрового процесса
 * @param {Object} socket — сокет игрока
 * @param {Object} io — socket.io сервер
 */
function registerGameHandlers(socket, io) {

  // Обёртка scheduleBotActions с io
  function scheduleBotsForRoom(room) {
    scheduleBotActions(room, io);
  }

  // === Начало игры ===
  socket.on('startGame', safeHandler(socket, (roleConfig) => {
    const room = getRoom(socket.roomId);
    if (!room || room.host !== socket.id) return;
    if (room.state !== 'lobby') return;

    if (room.players.length < MIN_PLAYERS) {
      socket.emit('error', `Минимум ${MIN_PLAYERS} игрока для начала игры`);
      return;
    }

    // Санитизация roleConfig — не доверяем клиенту (только >= 0)
    const safeInt = (v) => Math.max(0, Math.floor(Number(v) || 0));
    const n = room.players.length;
    const safeConfig = {
      mafia: safeInt(roleConfig && roleConfig.mafia),
      godfather: safeInt(roleConfig && roleConfig.godfather),
      maniac: safeInt(roleConfig && roleConfig.maniac),
      doctor: safeInt(roleConfig && roleConfig.doctor),
      detective: safeInt(roleConfig && roleConfig.detective)
    };
    const totalSpecial = safeConfig.mafia + safeConfig.godfather + safeConfig.maniac + safeConfig.doctor + safeConfig.detective;
    if (totalSpecial > n) {
      socket.emit('error', 'Слишком много специальных ролей для данного числа игроков');
      return;
    }

    assignRoles(room.players, safeConfig);
    room.gameRoster = room.players.map(p => ({ name: p.name, role: p.role, isBot: p.isBot }));
    room.state = 'night';
    room.phase = 1;

    // Отправляем каждому реальному игроку его роль
    room.players.forEach(player => {
      if (player.isBot) return;
      const isTeamMafia = isMafiaRole(player.role);
      const mafiaMembers = room.players
        .filter(p => isMafiaRole(p.role) && p.id !== player.id)
        .map(p => p.name);

      io.to(player.id).emit('gameStarted', {
        role: player.role,
        roleName: ROLE_NAMES[player.role],
        mafiaMembers: isTeamMafia ? mafiaMembers : []
      });
    });

    // Ведущему — все роли
    emitToHost(room, io, 'narratorGameStarted', {
      players: room.players.map(p => ({
        id: p.id, name: p.name, role: p.role,
        roleName: ROLE_NAMES[p.role], isBot: p.isBot, avatar: p.avatar
      }))
    });

    // Атмосферное вступление первой ночи
    const nightFlavor = generateNightFlavor(room.phase);
    io.to(room.id).emit('message', { type: 'narrator', sender: 'Ведущий', text: nightFlavor });

    io.to(room.id).emit('phaseChange', {
      state: 'night', phase: room.phase,
      message: `${generateWeather()} Мафия выбирает жертву...`
    });

    io.to(room.id).emit('updatePlayers', room.players.map(p => ({ ...stripPrivateFields(p), role: undefined })));
    scheduleBotsForRoom(room);

    // Аналитика: старт игры
    const humans = room.players.filter(p => !p.isBot).length;
    const bots = room.players.filter(p => p.isBot).length;
    logger.info({ event: 'game_start', roomId: room.id, players: room.players.length, humans, bots, phase: room.phase }, 'Игра началась');
  }));

  // === Ночное действие ===
  socket.on('nightAction', safeHandler(socket, (targetId) => {
    targetId = sanitizeTargetId(targetId);
    const room = getRoom(socket.roomId);
    if (!room || room.state !== 'night') return;
    if (room.phaseTransitionLocked) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || room.deadPlayers.has(player.id)) return;

    // Валидация: targetId должен быть живым игроком или null
    if (targetId !== null) {
      const target = room.players.find(p => p.id === targetId);
      if (!target || room.deadPlayers.has(targetId)) return;
    }

    room.nightActions[socket.id] = { target: targetId };

    const targetPlayer = targetId ? room.players.find(p => p.id === targetId) : null;

    // Мафия / Крёстный отец — уведомить союзников
    if (isMafiaRole(player.role)) {
      const mafiaPlayers = room.players.filter(p => isMafiaRole(p.role) && p.id !== player.id && !p.isBot && !room.deadPlayers.has(p.id));
      const voteMsg = {
        type: 'mafia', sender: player.name,
        text: targetPlayer ? `Выбираю цель: ${targetPlayer.name}` : 'Пропускаю'
      };
      mafiaPlayers.forEach(m => io.to(m.id).emit('message', voteMsg));
    }

    emitToHost(room, io, 'narratorAction', {
      phase: 'night', actor: player.name,
      actorRole: ROLE_NAMES[player.role],
      target: targetPlayer ? targetPlayer.name : 'Пропуск', isBot: false
    });

    if (checkNightComplete(room)) {
      notifyNarratorReady(room, 'night', io);
    }
  }));

  // === Голосование ===
  socket.on('vote', safeHandler(socket, (targetId) => {
    targetId = sanitizeTargetId(targetId);
    const room = getRoom(socket.roomId);
    if (!room || room.state !== 'day') return;
    if (room.phaseTransitionLocked) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || room.deadPlayers.has(player.id)) return;

    if (targetId !== null) {
      const target = room.players.find(p => p.id === targetId);
      if (!target || room.deadPlayers.has(targetId)) return;
    }

    room.votes[socket.id] = targetId;

    const targetName = targetId ? room.players.find(p => p.id === targetId)?.name || 'Пропуск' : 'Пропуск';
    io.to(room.id).emit('voteUpdate', { voter: player.name, target: targetName });

    emitToHost(room, io, 'narratorAction', {
      phase: 'day', actor: player.name, target: targetName, isBot: false
    });

    if (checkVotesComplete(room)) {
      notifyNarratorReady(room, 'day', io);
    }
  }));

  // === Чат ===
  socket.on('chatMessage', safeHandler(socket, (text) => {
    text = sanitizeString(text, 200);
    if (!text) return;
    const room = getRoom(socket.roomId);
    if (!room) return;

    if (socket.id === room.host) {
      io.to(room.id).emit('message', { type: 'narrator', sender: '\uD83C\uDFAD Ведущий', text });
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    if (room.deadPlayers.has(player.id)) return;

    if (room.state === 'night') {
      if (isMafiaRole(player.role)) {
        const mafiaPlayers = room.players.filter(p => isMafiaRole(p.role));
        mafiaPlayers.forEach(m => {
          if (!m.isBot) io.to(m.id).emit('message', { type: 'mafia', sender: player.name, text });
        });
        emitToHost(room, io, 'message', { type: 'mafia', sender: player.name, text });
      }
      return;
    }

    io.to(room.id).emit('message', { type: 'chat', sender: player.name, text });
  }));

  // === Ведущий: следующая фаза ===
  socket.on('hostAdvancePhase', safeHandler(socket, () => {
    const room = getRoom(socket.roomId);
    if (!room || room.host !== socket.id) return;
    if (room.state === 'lobby' || room.state === 'ended') return;

    room.phaseReady = false;
    room.phaseTransitionLocked = true;

    try {
      if (room.state === 'night') {
        const alive = getAlivePlayers(room);
        const activeRoles = alive.filter(p =>
          p.role === ROLES.MAFIA || p.role === ROLES.GODFATHER || p.role === ROLES.MANIAC || p.role === ROLES.DOCTOR || p.role === ROLES.DETECTIVE
        );
        activeRoles.forEach(p => {
          if (!room.nightActions[p.id]) room.nightActions[p.id] = { target: null };
        });
        transitionToDay(room, io, scheduleBotsForRoom);
      } else if (room.state === 'day') {
        const alive = getAlivePlayers(room);
        alive.forEach(p => {
          if (!room.votes[p.id]) room.votes[p.id] = null;
        });
        processVoteResults(room, io, scheduleBotsForRoom);
      }
    } finally {
      room.phaseTransitionLocked = false;
    }
  }));

  // === Завершить игру досрочно ===
  socket.on('endGame', safeHandler(socket, () => {
    const room = getRoom(socket.roomId);
    if (!room || room.host !== socket.id) return;
    if (room.state === 'lobby' || room.state === 'ended') return;

    room.state = 'ended';
    if (room.timers) {
      room.timers.forEach(t => clearTimeout(t));
      room.timers = [];
    }
    io.to(room.id).emit('gameEnded', {
      winner: null, message: 'Ведущий завершил игру досрочно.', players: room.players
    });

    logger.info({ event: 'game_end', roomId: room.id, winner: null, phase: room.phase, reason: 'host_ended' }, 'Игра завершена досрочно');
  }));
}

module.exports = { registerGameHandlers };
