// server/game/RoleManager.js — Назначение ролей

const { ROLES } = require('../config');

/**
 * Fisher-Yates (Durstenfeld) shuffle — корректное равномерное перемешивание
 * @param {Array} array — массив для перемешивания (мутирует in-place)
 * @returns {Array}
 */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Распределение ролей (с конфигом от ведущего)
 * @param {Array} players — массив игроков
 * @param {Object} config — конфигурация ролей { mafia, doctor, detective, godfather, maniac }
 * @returns {Array} — перемешанный массив игроков с ролями
 */
function assignRoles(players, config) {
  const shuffled = shuffle([...players]);

  let mafiaCount = (config && config.mafia) || 0;
  let godfatherCount = (config && config.godfather) || 0;
  let maniacCount = (config && config.maniac) || 0;
  let doctorCount = (config && config.doctor) || 0;
  let detectiveCount = (config && config.detective) || 0;

  // Если ничего не задано — дефолт: 1 мафия, 1 доктор, 1 детектив
  if (mafiaCount + godfatherCount + maniacCount + doctorCount + detectiveCount === 0) {
    mafiaCount = 1; doctorCount = 1; detectiveCount = 1;
  }

  // Защита: суммарно не больше игроков (урезаем с конца)
  let total = mafiaCount + godfatherCount + maniacCount + doctorCount + detectiveCount;
  while (total > shuffled.length) {
    if (detectiveCount > 0) { detectiveCount--; total--; continue; }
    if (doctorCount > 0) { doctorCount--; total--; continue; }
    if (maniacCount > 0) { maniacCount--; total--; continue; }
    if (mafiaCount > 0) { mafiaCount--; total--; continue; }
    if (godfatherCount > 0) { godfatherCount--; total--; continue; }
  }

  let idx = 0;
  shuffled.forEach(player => {
    if (idx < godfatherCount) {
      player.role = ROLES.GODFATHER;
    } else if (idx < godfatherCount + mafiaCount) {
      player.role = ROLES.MAFIA;
    } else if (idx < godfatherCount + mafiaCount + maniacCount) {
      player.role = ROLES.MANIAC;
    } else if (idx < godfatherCount + mafiaCount + maniacCount + doctorCount) {
      player.role = ROLES.DOCTOR;
    } else if (idx < godfatherCount + mafiaCount + maniacCount + doctorCount + detectiveCount) {
      player.role = ROLES.DETECTIVE;
    } else {
      player.role = ROLES.CIVILIAN;
    }
    idx++;
  });

  return shuffled;
}

module.exports = { assignRoles };
