// server/game/PhaseManager.js — Управление фазами (ночь/день/голосование)

const { ROLES, ROLE_NAMES } = require('../config');
const { checkWinCondition } = require('./WinCondition');
const { emitToHost, stripPrivateFields } = require('./GameRoom');
const { getAlivePlayers, isMafiaRole } = require('./utils');
const {
  generateNightFlavor,
  generateDayFlavor,
  generateKillDescription,
  generateSaveDescription,
  generatePeacefulNight,
  generateWeather
} = require('../generators/scenarios');
const logger = require('../logger');

/**
 * Обработка ночных действий
 * @param {Object} room — объект комнаты
 * @returns {Object} — { killed, saved, checked }
 */
function processNightActions(room) {
  const actions = room.nightActions;
  let killed = null;
  let maniacKilled = null;
  let saved = null;
  let checked = null;

  // Мафия убивает (включая Крёстного отца)
  const mafiaVotes = {};
  Object.entries(actions).forEach(([playerId, action]) => {
    const player = room.players.find(p => p.id === playerId);
    if (player && isMafiaRole(player.role) && action.target) {
      mafiaVotes[action.target] = (mafiaVotes[action.target] || 0) + 1;
    }
  });

  if (Object.keys(mafiaVotes).length > 0) {
    const sorted = Object.entries(mafiaVotes).sort((a, b) => b[1] - a[1]);
    const maxVotes = sorted[0][1];
    const topTargets = sorted.filter(([, v]) => v === maxVotes).map(([id]) => id);
    killed = topTargets[Math.floor(Math.random() * topTargets.length)];
  }

  // Маньяк убивает (отдельно от мафии, доктор НЕ спасает от маньяка)
  Object.entries(actions).forEach(([playerId, action]) => {
    const player = room.players.find(p => p.id === playerId);
    if (player && player.role === ROLES.MANIAC && action.target) {
      maniacKilled = action.target;
    }
  });

  // Доктор спасает ТОЛЬКО от мафии (не от маньяка)
  Object.entries(actions).forEach(([playerId, action]) => {
    const player = room.players.find(p => p.id === playerId);
    if (player && player.role === ROLES.DOCTOR && action.target) {
      if (action.target !== room.lastDoctorTarget) {
        saved = action.target;
      }
      room.lastDoctorTarget = action.target;
    }
  });

  // Детектив проверяет
  Object.entries(actions).forEach(([playerId, action]) => {
    const player = room.players.find(p => p.id === playerId);
    if (player && player.role === ROLES.DETECTIVE && action.target) {
      checked = { detective: playerId, target: action.target };
    }
  });

  // Если убитый мафией был спасён доктором
  if (killed && killed === saved) {
    room.lastSaved = killed;
    killed = null;
  } else {
    room.lastSaved = null;
  }

  // Жертва маньяка НЕ спасается доктором
  // Если маньяк убил того, кого доктор спас от мафии — жертва всё равно умирает
  if (maniacKilled && maniacKilled === room.lastSaved) {
    room.lastSaved = null; // спасение не помогло — маньяк убил
  }

  // Записываем жертву мафии
  if (killed) {
    room.deadPlayers.add(killed);
    room.lastKilled = killed;
  } else {
    room.lastKilled = null;
  }

  // Записываем жертву маньяка (если это другой игрок, не тот же что убила мафия)
  if (maniacKilled && !room.deadPlayers.has(maniacKilled)) {
    room.deadPlayers.add(maniacKilled);
  }
  room.lastManiacKilled = maniacKilled;

  room.lastChecked = checked;
  room.nightActions = {};

  return { killed, maniacKilled, saved: room.lastSaved, checked };
}

/**
 * Проверка: все ли ночные действия завершены
 * @param {Object} room — объект комнаты
 * @returns {boolean}
 */
function checkNightComplete(room) {
  const alivePlayers = getAlivePlayers(room);
  const activeRoles = alivePlayers.filter(p =>
    p.role === ROLES.MAFIA || p.role === ROLES.GODFATHER || p.role === ROLES.MANIAC || p.role === ROLES.DOCTOR || p.role === ROLES.DETECTIVE
  );
  return Object.keys(room.nightActions).length >= activeRoles.length;
}

/**
 * Проверка: все ли проголосовали
 * @param {Object} room — объект комнаты
 * @returns {boolean}
 */
function checkVotesComplete(room) {
  const alivePlayers = getAlivePlayers(room);
  return Object.keys(room.votes).length >= alivePlayers.length;
}

/**
 * Уведомить ведущего, что фаза готова к переходу
 * @param {Object} room — объект комнаты
 * @param {string} phase — текущая фаза
 * @param {Object} io — socket.io экземпляр
 */
function notifyNarratorReady(room, phase, io) {
  if (room.phaseReady) return; // уже уведомлён
  room.phaseReady = true;
  emitToHost(room, io, 'narratorPhaseReady', { phase });
}

/**
 * Переход к дню после ночи
 * @param {Object} room — объект комнаты
 * @param {Object} io — socket.io экземпляр
 * @param {Function} scheduleBotActions — функция для запуска ботов
 */
function transitionToDay(room, io, scheduleBotActions) {
  room.phaseReady = false;
  const result = processNightActions(room);

  // Уведомляем ведущего об итогах ночи
  const nightResult = {
    killed: result.killed ? room.players.find(p => p.id === result.killed)?.name : null,
    killedRole: result.killed ? ROLE_NAMES[room.players.find(p => p.id === result.killed)?.role] : null,
    maniacKilled: result.maniacKilled ? room.players.find(p => p.id === result.maniacKilled)?.name : null,
    maniacKilledRole: result.maniacKilled ? ROLE_NAMES[room.players.find(p => p.id === result.maniacKilled)?.role] : null,
    saved: result.saved ? room.players.find(p => p.id === result.saved)?.name : null,
    checked: result.checked ? {
      target: room.players.find(p => p.id === result.checked.target)?.name,
      // Ведущий видит правду: мафия, крёстный отец И маньяк — все опасные
      isMafia: room.players.find(p => p.id === result.checked.target)?.role === ROLES.MAFIA
        || room.players.find(p => p.id === result.checked.target)?.role === ROLES.GODFATHER,
      isManiac: room.players.find(p => p.id === result.checked.target)?.role === ROLES.MANIAC
    } : null
  };
  emitToHost(room, io, 'narratorNightResult', nightResult);

  // Проверяем победу
  const winCondition = checkWinCondition(room);
  if (winCondition) {
    room.state = 'ended';
    io.to(room.id).emit('gameEnded', {
      winner: winCondition.winner,
      message: winCondition.message,
      players: room.players.map(stripPrivateFields)
    });
    logger.info({ event: 'game_end', roomId: room.id, winner: winCondition.winner, phase: room.phase, reason: 'night' }, 'Игра завершена');
    return;
  }

  // Переход к дню
  room.state = 'day';

  // Атмосферное вступление дня
  const dayFlavor = generateDayFlavor(room.phase);
  io.to(room.id).emit('message', { type: 'narrator', sender: 'Ведущий', text: dayFlavor });

  // Формируем сообщение о ночных смертях
  let dayMessage = 'Наступило утро.';
  const mafiaVictim = result.killed ? room.players.find(p => p.id === result.killed) : null;
  const maniacVictim = result.maniacKilled ? room.players.find(p => p.id === result.maniacKilled) : null;
  // Флаг: погиб хотя бы кто-то
  const anyKilled = result.killed || result.maniacKilled;

  if (mafiaVictim && maniacVictim && result.killed !== result.maniacKilled) {
    // Мафия и маньяк убили разных людей — 2 жертвы
    const killDesc1 = generateKillDescription(mafiaVictim.name);
    dayMessage = `Страшная ночь! ${killDesc1} Он был ${ROLE_NAMES[mafiaVictim.role]}. Но это не всё — ${maniacVictim.name} тоже найден мёртвым. Он был ${ROLE_NAMES[maniacVictim.role]}.`;
  } else if (mafiaVictim && maniacVictim && result.killed === result.maniacKilled) {
    // Мафия и маньяк убили одного и того же
    const killDesc = generateKillDescription(mafiaVictim.name);
    dayMessage = `${killDesc} Он был ${ROLE_NAMES[mafiaVictim.role]}.`;
  } else if (mafiaVictim && !maniacVictim) {
    const killDesc = generateKillDescription(mafiaVictim.name);
    dayMessage = `${killDesc} Он был ${ROLE_NAMES[mafiaVictim.role]}.`;
  } else if (!mafiaVictim && maniacVictim) {
    // Только маньяк убил (мафия промахнулась или доктор спас от мафии)
    dayMessage = `Наступило утро. ${maniacVictim.name} найден мёртвым при загадочных обстоятельствах. Он был ${ROLE_NAMES[maniacVictim.role]}.`;
  } else if (result.saved) {
    dayMessage = generateSaveDescription();
  } else {
    dayMessage = generatePeacefulNight();
  }

  io.to(room.id).emit('phaseChange', {
    state: 'day',
    phase: room.phase,
    message: dayMessage,
    killed: anyKilled ? (result.killed || result.maniacKilled) : null
  });

  // Отправляем результат детективу (если не бот)
  if (result.checked && !result.checked.detective.startsWith('bot_')) {
    const targetPlayer = room.players.find(p => p.id === result.checked.target);
    // Крёстный отец при проверке детективом выглядит мирным (appearsInnocent)
    // Маньяк виден как опасный (isDangerous)
    const isMafia = targetPlayer.role === ROLES.MAFIA;
    const isManiac = targetPlayer.role === ROLES.MANIAC;
    io.to(result.checked.detective).emit('detectiveResult', {
      target: targetPlayer.name,
      isMafia,
      isManiac
    });
  }

  io.to(room.id).emit('updatePlayers', room.players.map(p => ({
    ...stripPrivateFields(p),
    role: room.deadPlayers.has(p.id) ? p.role : undefined,
    isDead: room.deadPlayers.has(p.id)
  })));

  // Запускаем действия ботов (голосование)
  scheduleBotActions(room);
}

/**
 * Обработка результатов голосования
 * @param {Object} room — объект комнаты
 * @param {Object} io — socket.io экземпляр
 * @param {Function} scheduleBotActions — функция для запуска ботов
 */
function processVoteResults(room, io, scheduleBotActions) {
  room.phaseReady = false;
  const alivePlayers = getAlivePlayers(room);
  const voteCount = {};
  Object.values(room.votes).forEach(targetId => {
    if (targetId) {
      voteCount[targetId] = (voteCount[targetId] || 0) + 1;
    }
  });

  let maxVotes = 0;
  let lynched = null;
  let isTie = false;
  Object.entries(voteCount).forEach(([playerId, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      lynched = playerId;
      isTie = false;
    } else if (count === maxVotes && maxVotes > 0) {
      isTie = true;
    }
  });

  // При ничье или недостаточном большинстве — никто не казнён
  const lynchedPlayer = lynched ? room.players.find(p => p.id === lynched) : null;
  if (lynched && lynchedPlayer && !isTie && maxVotes > alivePlayers.length / 2) {
    room.deadPlayers.add(lynched);

    io.to(room.id).emit('playerLynched', {
      player: lynchedPlayer.name,
      role: ROLE_NAMES[lynchedPlayer.role],
      votes: maxVotes
    });
  } else {
    const msg = { type: 'system', text: 'Город не смог принять решение. Никто не был казнён.' };
    io.to(room.id).emit('message', msg);
  }

  room.votes = {};

  // Проверяем победу
  const winCondition = checkWinCondition(room);
  if (winCondition) {
    room.state = 'ended';
    io.to(room.id).emit('gameEnded', {
      winner: winCondition.winner,
      message: winCondition.message,
      players: room.players.map(stripPrivateFields)
    });
    logger.info({ event: 'game_end', roomId: room.id, winner: winCondition.winner, phase: room.phase, reason: 'vote' }, 'Игра завершена');
    return;
  }

  // Переход к ночи
  room.state = 'night';
  room.phase++;

  // Атмосферное вступление ночи
  const nightFlavor = generateNightFlavor(room.phase);
  io.to(room.id).emit('message', { type: 'narrator', sender: 'Ведущий', text: nightFlavor });

  const phaseData = {
    state: 'night',
    phase: room.phase,
    message: `${generateWeather()} Мафия выбирает жертву...`
  };
  io.to(room.id).emit('phaseChange', phaseData);

  io.to(room.id).emit('updatePlayers', room.players.map(p => ({
    ...stripPrivateFields(p),
    role: room.deadPlayers.has(p.id) ? p.role : undefined,
    isDead: room.deadPlayers.has(p.id)
  })));

  // Запускаем ночные действия ботов
  scheduleBotActions(room);
}

module.exports = {
  processNightActions,
  checkNightComplete,
  checkVotesComplete,
  notifyNarratorReady,
  transitionToDay,
  processVoteResults
};
