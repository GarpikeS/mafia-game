import { state, ROLE_NAMES } from './state.js';
import { elements } from './dom.js';
import { socket, startPingMonitor, stopPingMonitor } from './socket.js';
import { showNotification, renderPlayerAvatar } from './utils.js';
import { showScreen, navigateTo, screenTransitionInProgress } from './navigation.js';
import { setMyCard } from './cards.js';
import { addChatMessage } from './chat.js';
import { addNarratorLog } from './ui-narrator.js';
import { updateLobbyPlayers, updateRoleConfig } from './ui-lobby.js';
import { updateGamePlayers, updateActionPanel, unlockActionButtons } from './ui-game.js';
import { updateNarratorPlayers } from './ui-narrator.js';
import { triggerKillEffect } from './effects.js';
import { resetGameState } from './reset.js';

// Комната создана (ведущий)
socket.on('roomCreated', ({ roomId, isHost, token }) => {
  state.roomId = roomId;
  state.playerId = socket.id;
  state.isHost = true;
  state.token = token || null;
  state.players = [];
  state.role = null;
  state.gamePhase = null;
  state.selectedPlayer = null;
  state.mafiaMembers = [];
  state.narratorPlayers = [];

  elements.roomIdDisplay.textContent = roomId;
  elements.hostControls.style.display = 'flex';
  document.getElementById('role-config').style.display = 'block';
  const roleBadge = document.getElementById('lobby-role-badge');
  roleBadge.textContent = '🎭 Ведущий';
  roleBadge.className = 'lobby-role-badge narrator';
  roleBadge.style.display = 'inline-block';
  state.roleConfig = { mafia: 1, godfather: 0, maniac: 0, doctor: 1, detective: 1 };
  updateRoleConfig();
  navigateTo('/lobby/' + roomId);
  startPingMonitor();
  showNotification('Комната создана! Код: ' + roomId, 'success');
});

// Присоединение к комнате (игрок)
socket.on('roomJoined', ({ roomId, player, token }) => {
  state.roomId = roomId;
  state.playerId = player.id;
  state.isHost = false;
  state.token = token || null;
  state.players = [];
  state.role = null;
  state.gamePhase = null;
  state.selectedPlayer = null;
  state.mafiaMembers = [];
  state.narratorPlayers = [];

  elements.roomIdDisplay.textContent = roomId;
  elements.hostControls.style.display = 'none';
  const roleBadge = document.getElementById('lobby-role-badge');
  roleBadge.textContent = 'Игрок';
  roleBadge.className = 'lobby-role-badge player';
  roleBadge.style.display = 'inline-block';
  navigateTo('/lobby/' + roomId);
  startPingMonitor();
  showNotification('Вы присоединились к комнате', 'success');
});

// Обновление списка игроков
socket.on('updatePlayers', (players) => {
  state.players = players;

  if (state.screen === 'lobby') {
    updateLobbyPlayers(players);
  } else if (state.screen === 'game') {
    updateGamePlayers(players);
    updateActionPanel();
    unlockActionButtons();
  } else if (state.screen === 'narrator') {
    updateNarratorPlayers();
  }

  if (screenTransitionInProgress) {
    setTimeout(() => {
      if (state.screen === 'lobby') {
        updateLobbyPlayers(state.players);
      } else if (state.screen === 'game') {
        updateGamePlayers(state.players);
        updateActionPanel();
      } else if (state.screen === 'narrator') {
        updateNarratorPlayers();
      }
    }, 450);
  }
});

// Игра началась (для игрока)
socket.on('gameStarted', ({ role, roleName, mafiaMembers }) => {
  state.role = role;
  state.mafiaMembers = mafiaMembers;
  state.gamePhase = 'night';

  setMyCard(role);

  navigateTo('/game/' + state.roomId);
  document.body.dataset.phase = 'night';
  startPingMonitor();

  elements.gameMessage.textContent = '🌙 Ночь 1 — Город засыпает... Нажмите на карту справа, чтобы узнать свою роль.';
  elements.phaseIcon.textContent = '🌙';
  elements.phaseText.textContent = 'Ночь 1';

  let roleMessage = `Ваша роль: ${roleName}`;
  if ((role === 'mafia' || role === 'godfather') && mafiaMembers.length > 0) {
    roleMessage += `\nДругие члены мафии: ${mafiaMembers.join(', ')}`;
  }

  addChatMessage({ type: 'system', text: '🌙 Наступила первая ночь. Нажмите на карту справа, чтобы узнать свою роль.' });
  addChatMessage({ type: 'system', text: roleMessage });
  showNotification(`Игра началась! Узнайте свою роль.`, 'info');

  if (state.players.length > 0) {
    setTimeout(() => {
      updateGamePlayers(state.players);
      updateActionPanel();
    }, 450);
  }
});

// Игра началась (для ведущего)
socket.on('narratorGameStarted', ({ players }) => {
  state.narratorPlayers = players;
  state.gamePhase = 'night';
  navigateTo('/game/' + state.roomId);
  document.body.dataset.phase = 'night';
  startPingMonitor();
  updateNarratorPlayers();

  addNarratorLog('Игра началась! Роли распределены.');
  players.forEach(p => {
    addNarratorLog(`${p.name}${p.isBot ? ' 🤖' : ''} — ${p.roleName}`);
  });
});

// Действие игрока (для ведущего)
socket.on('narratorAction', ({ phase, actor, actorRole, target, isBot }) => {
  const botTag = isBot ? ' 🤖' : '';
  if (phase === 'night') {
    addNarratorLog(`🌙 ${actor}${botTag} (${actorRole}) → ${target}`);
  } else {
    addNarratorLog(`🗳️ ${actor}${botTag} голосует против ${target}`);
  }
});

// Итоги ночи (для ведущего)
socket.on('narratorNightResult', ({ killed, killedRole, maniacKilled, maniacKilledRole, saved, checked }) => {
  addNarratorLog('--- Итоги ночи ---');
  if (killed) {
    addNarratorLog(`💀 Убит мафией: ${killed} (${killedRole})`);
  }
  if (maniacKilled && maniacKilled !== killed) {
    addNarratorLog(`🪓 Убит маньяком: ${maniacKilled} (${maniacKilledRole})`);
  } else if (maniacKilled && maniacKilled === killed) {
    addNarratorLog(`🪓 Маньяк тоже выбрал: ${maniacKilled} (та же цель)`);
  }
  if (saved) {
    addNarratorLog(`💚 Спасён от мафии: ${saved}`);
  }
  if (checked) {
    let checkResult = 'мирный';
    if (checked.isMafia) checkResult = 'МАФИЯ';
    else if (checked.isManiac) checkResult = 'МАНЬЯК';
    addNarratorLog(`🔍 Проверен: ${checked.target} — ${checkResult}`);
  }
  if (!killed && !maniacKilled && !saved) {
    addNarratorLog('Никто не пострадал.');
  }
  addNarratorLog('------------------');
});

// Смена фазы
socket.on('phaseChange', ({ state: phase, phase: phaseNum, message, killed }) => {
  state.gamePhase = phase;
  state.selectedPlayer = null;

  unlockActionButtons();
  document.body.dataset.phase = phase;
  elements.advancePhaseBtn.classList.remove('phase-ready-pulse');

  if (state.screen === 'game') {
    if (phase === 'night') {
      elements.phaseIcon.textContent = '🌙';
      elements.phaseText.textContent = `Ночь ${phaseNum}`;
    } else {
      elements.phaseIcon.textContent = '☀️';
      elements.phaseText.textContent = `День ${phaseNum}`;
    }

    if (killed) {
      triggerKillEffect();
    }

    elements.gameMessage.textContent = message;
    addChatMessage({ type: 'system', text: message });
    updateActionPanel();
  } else if (state.screen === 'narrator') {
    if (phase === 'night') {
      elements.narratorPhaseIcon.textContent = '🌙';
      elements.narratorPhaseText.textContent = `Ночь ${phaseNum}`;
    } else {
      elements.narratorPhaseIcon.textContent = '☀️';
      elements.narratorPhaseText.textContent = `День ${phaseNum}`;
    }

    if (killed) {
      triggerKillEffect();
    }

    elements.narratorGameMessage.textContent = message;
    addNarratorLog(message);
  }
});

// Результат детектива
socket.on('detectiveResult', ({ target, isMafia, isManiac }) => {
  let resultText;
  let notifType;
  if (isMafia) {
    resultText = `🔍 ${target} — МАФИЯ!`;
    notifType = 'error';
  } else if (isManiac) {
    resultText = `🔍 ${target} — МАНЬЯК!`;
    notifType = 'error';
  } else {
    resultText = `🔍 ${target} — мирный житель`;
    notifType = 'success';
  }

  addChatMessage({ type: 'system', text: resultText });
  showNotification(resultText, notifType);
});

// Голосование
socket.on('voteUpdate', ({ voter, target }) => {
  const msg = { type: 'system', text: `${voter} голосует против: ${target}` };
  if (state.screen === 'game') {
    addChatMessage(msg);
  } else if (state.screen === 'narrator') {
    addChatMessage(msg, elements.narratorChatMessages);
  }
});

// Игрок изгнан
socket.on('playerLynched', ({ player, role, votes }) => {
  const msg = { type: 'system', text: `⚖️ ${player} был изгнан (${votes} голосов). Он был ${role}.` };
  if (state.screen === 'game') {
    addChatMessage(msg);
    showNotification(`${player} изгнан!`, 'error');
  } else if (state.screen === 'narrator') {
    addChatMessage(msg, elements.narratorChatMessages);
    addNarratorLog(`⚖️ Изгнан: ${player} (${role}) — ${votes} голосов`);
  }
});

// Сообщения чата
socket.on('message', (message) => {
  if (state.screen === 'game') {
    addChatMessage(message);
  } else if (state.screen === 'narrator') {
    addChatMessage(message, elements.narratorChatMessages);
  }
});

// Конец игры
socket.on('gameEnded', ({ winner, message, players }) => {
  if (!state.roomId) return;

  if (winner) {
    if (winner === 'mafia') {
      elements.resultTitle.textContent = 'Мафия победила!';
      elements.resultTitle.className = 'mafia-win';
    } else if (winner === 'maniac') {
      elements.resultTitle.textContent = 'Маньяк победил!';
      elements.resultTitle.className = 'maniac-win';
    } else {
      elements.resultTitle.textContent = 'Город спасён!';
      elements.resultTitle.className = 'civilians-win';
    }
  } else {
    elements.resultTitle.textContent = 'Игра завершена';
    elements.resultTitle.className = '';
  }
  elements.resultMessage.textContent = message;

  elements.finalPlayers.innerHTML = '';
  players.forEach(player => {
    const div = document.createElement('div');
    div.className = 'final-player';
    const isDead = state.players.find(p => p.id === player.id)?.isDead;
    if (isDead) div.classList.add('dead');

    const roleName = ROLE_NAMES[player.role] || 'Неизвестно';
    div.appendChild(renderPlayerAvatar(player, 'final-player-avatar'));
    const roleSpan = document.createElement('span');
    roleSpan.className = 'final-player-role ' + (player.role || '');
    roleSpan.textContent = roleName;
    div.appendChild(roleSpan);
    const nameSpan = document.createElement('span');
    nameSpan.textContent = player.name + (player.isBot ? ' 🤖' : '');
    div.appendChild(nameSpan);
    elements.finalPlayers.appendChild(div);
  });

  state.roomId = null;
  state.role = null;
  state.gamePhase = null;
  state.isHost = false;
  state.selectedPlayer = null;
  state.mafiaMembers = [];
  state.narratorPlayers = [];
  stopPingMonitor();

  document.body.dataset.phase = 'ended';
  navigateTo('/result');
});

// Фаза готова
socket.on('narratorPhaseReady', ({ phase }) => {
  const phaseLabel = phase === 'night' ? 'ночные действия' : 'голосование';
  addNarratorLog(`✅ Все ${phaseLabel} собраны. Можно переходить к следующей фазе.`);
  elements.advancePhaseBtn.classList.add('phase-ready-pulse');
});

// Ведущий потерял соединение
socket.on('hostDisconnected', ({ timeout }) => {
  showNotification(`Ведущий потерял соединение (${timeout / 1000}с на возврат)`, 'error');
});

// Ведущий вернулся
socket.on('hostReconnected', () => {
  showNotification('Ведущий вернулся', 'success');
});

socket.on('error', (message) => {
  showNotification(message, 'error');
});
