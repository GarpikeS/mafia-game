// server/game/BotAI.js — Логика ботов

const { ROLES, ROLE_NAMES, BOT_DELAY_MIN, BOT_DELAY_MAX } = require('../config');
const { checkNightComplete, checkVotesComplete, notifyNarratorReady } = require('./PhaseManager');
const { addRoomTimer, emitToHost } = require('./GameRoom');
const { getAlivePlayers, isMafiaRole } = require('./utils');
const logger = require('../logger');

/**
 * Запланировать действия ботов
 * @param {Object} room — объект комнаты
 * @param {Object} io — socket.io экземпляр
 */
function scheduleBotActions(room, io) {
  // Снимок текущей фазы для проверки при исполнении
  const scheduledPhase = room.state;
  const scheduledPhaseNum = room.phase;

  const aliveBots = room.players.filter(p => p.isBot && !room.deadPlayers.has(p.id));

  aliveBots.forEach(bot => {
    const delay = BOT_DELAY_MIN + Math.random() * (BOT_DELAY_MAX - BOT_DELAY_MIN);

    const timerId = setTimeout(() => {
      try {
        // Проверяем что комната и фаза всё ещё та же
        if (room.state !== scheduledPhase) return;
        if (room.state === 'ended' || room.state === 'lobby') return;
        if (room.phase !== scheduledPhaseNum && scheduledPhase === 'night') return;
        if (room.phaseTransitionLocked) return;

        // Проверяем что бот всё ещё жив
        if (room.deadPlayers.has(bot.id)) return;

        // Актуальный список живых
        const alivePlayers = getAlivePlayers(room);

        if (room.state === 'night') {
          // Ночные действия бота
          if (isMafiaRole(bot.role) || bot.role === ROLES.MANIAC || bot.role === ROLES.DOCTOR || bot.role === ROLES.DETECTIVE) {
            if (room.nightActions[bot.id]) return; // уже действовал

            let targets = alivePlayers.filter(p => p.id !== bot.id);
            if (targets.length === 0) return;

            // Мафия / Крёстный отец НЕ убивает своих мафиози ночью
            if (isMafiaRole(bot.role)) {
              const nonMafia = targets.filter(p => !isMafiaRole(p.role));
              if (nonMafia.length > 0) targets = nonMafia;
            }

            // Маньяк убивает любого (кроме себя — уже отфильтровано)

            // Детектив НЕ проверяет тех, кого уже проверял
            if (bot.role === ROLES.DETECTIVE) {
              if (!room.botChecked) room.botChecked = {};
              if (!room.botChecked[bot.id]) room.botChecked[bot.id] = [];
              const unchecked = targets.filter(p => !room.botChecked[bot.id].includes(p.id));
              if (unchecked.length > 0) targets = unchecked;
              // Запоминаем кого проверили (после выбора ниже)
            }

            const target = targets[Math.floor(Math.random() * targets.length)];

            // Сохраняем проверку детектива
            if (bot.role === ROLES.DETECTIVE && room.botChecked && room.botChecked[bot.id]) {
              room.botChecked[bot.id].push(target.id);
            }

            room.nightActions[bot.id] = { target: target.id };

            // Если бот-мафия/крёстный отец — уведомить живых мафиози
            if (isMafiaRole(bot.role)) {
              const mafiaHumans = room.players.filter(p => isMafiaRole(p.role) && p.id !== bot.id && !p.isBot && !room.deadPlayers.has(p.id));
              const botVoteMsg = {
                type: 'mafia',
                sender: bot.name,
                text: `Выбираю цель: ${target.name}`
              };
              mafiaHumans.forEach(m => io.to(m.id).emit('message', botVoteMsg));
            }

            // Маньяк действует молча (никого не уведомляет в чате)

            // Уведомляем ведущего (буферизация при offline)
            emitToHost(room, io, 'narratorAction', {
              phase: 'night',
              actor: bot.name,
              actorRole: ROLE_NAMES[bot.role],
              target: target.name,
              isBot: true
            });

            if (checkNightComplete(room)) {
              notifyNarratorReady(room, 'night', io);
            }
          }
        } else if (room.state === 'day') {
          // Голосование бота
          if (room.votes[bot.id]) return; // уже голосовал

          let targets = alivePlayers.filter(p => p.id !== bot.id);
          if (targets.length === 0) return;

          // Мафия / Крёстный отец старается НЕ голосовать за своих днём
          if (isMafiaRole(bot.role)) {
            const nonMafia = targets.filter(p => !isMafiaRole(p.role));
            if (nonMafia.length > 0) targets = nonMafia;
            // Если все живые — мафия, fallback на случайный из всех
          }

          const target = targets[Math.floor(Math.random() * targets.length)];

          room.votes[bot.id] = target.id;

          const voteMsg = {
            voter: bot.name,
            target: target.name
          };
          io.to(room.id).emit('voteUpdate', voteMsg);

          // Уведомляем ведущего (буферизация при offline)
          emitToHost(room, io, 'narratorAction', {
            phase: 'day',
            actor: bot.name,
            target: target.name,
            isBot: true
          });

          if (checkVotesComplete(room)) {
            notifyNarratorReady(room, 'day', io);
          }
        }
      } catch (err) {
        logger.error({ roomId: room.id, bot: bot.name, err: err.message }, 'Ошибка BotAI');
      }
    }, delay);

    // Отслеживаем таймер для очистки при удалении комнаты
    addRoomTimer(room, timerId);
  });
}

module.exports = { scheduleBotActions };
