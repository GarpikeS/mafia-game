// server/game/WinCondition.js — Проверка победы

const { ROLES } = require('../config');
const { getAlivePlayers, getAliveMafia, getAliveCivilians } = require('./utils');

/**
 * Проверка условия победы
 * @param {Object} room — объект комнаты
 * @returns {Object|null} — { winner, message } или null если игра продолжается
 */
function checkWinCondition(room) {
  const alivePlayers = getAlivePlayers(room);
  const aliveMafia = getAliveMafia(room);
  const aliveManiac = alivePlayers.filter(p => p.role === ROLES.MANIAC);
  const aliveCivilians = getAliveCivilians(room);

  // Маньяк побеждает если он единственный живой
  if (aliveManiac.length > 0 && alivePlayers.length === aliveManiac.length) {
    return { winner: 'maniac', message: 'Маньяк победил! Все мертвы, остался только он.' };
  }

  // Мафия побеждает если мафиози >= мирных (маньяк НЕ учитывается)
  // Но только если маньяк мёртв или его нет, иначе игра продолжается
  if (aliveMafia.length === 0 && aliveManiac.length === 0) {
    return { winner: 'civilians', message: 'Мирные жители победили! Вся мафия уничтожена.' };
  }

  if (aliveMafia.length === 0 && aliveManiac.length > 0) {
    // Мафия мертва, но маньяк жив — игра продолжается (мирные vs маньяк)
    // Если остались только маньяк и мирные — проверяем нет ли мирных
    if (aliveCivilians.length === 0) {
      // Только маньяк(и) живы
      return { winner: 'maniac', message: 'Маньяк победил! Все мертвы, остался только он.' };
    }
    return null; // игра продолжается: мирные vs маньяк
  }

  if (aliveMafia.length > 0 && aliveManiac.length === 0) {
    // Маньяка нет — классическая проверка мафия vs мирные
    if (aliveMafia.length >= aliveCivilians.length) {
      return { winner: 'mafia', message: 'Мафия победила! Город захвачен.' };
    }
    return null;
  }

  // Живы и мафия, и маньяк — при подсчёте мафия vs мирные маньяк НЕ считается
  if (aliveCivilians.length === 0) {
    // Остались только мафия и маньяк — игра продолжается
    return null;
  }

  if (aliveMafia.length >= aliveCivilians.length) {
    return { winner: 'mafia', message: 'Мафия победила! Город захвачен.' };
  }

  return null;
}

module.exports = { checkWinCondition };
