import { state, ROLE_NAMES } from './state.js';
import { elements } from './dom.js';
import { renderPlayerAvatar, showNotification } from './utils.js';
import { socket } from './socket.js';

export function selectPlayer(playerId) {
  state.selectedPlayer = playerId;
  updateGamePlayers(state.players);
  elements.confirmAction.disabled = false;
}

export function updateGamePlayers(players) {
  elements.gamePlayers.innerHTML = '';

  players.forEach(player => {
    const div = document.createElement('div');
    div.className = 'game-player';

    if (player.isDead) div.classList.add('dead');
    if (player.id === state.playerId) div.classList.add('is-me');
    if (state.selectedPlayer === player.id) div.classList.add('selected');

    div.appendChild(renderPlayerAvatar(player, 'game-player-avatar'));

    const nameDiv = document.createElement('div');
    nameDiv.className = 'game-player-name';
    nameDiv.textContent = player.name + (player.id === state.playerId ? ' (Вы)' : '');
    if (player.isBot) {
      const botSpan = document.createElement('span');
      botSpan.className = 'bot-tag';
      botSpan.textContent = 'бот';
      nameDiv.appendChild(document.createTextNode(' '));
      nameDiv.appendChild(botSpan);
    }
    div.appendChild(nameDiv);

    if (player.role) {
      const roleSpan = document.createElement('span');
      roleSpan.className = 'game-player-role ' + player.role;
      roleSpan.textContent = ROLE_NAMES[player.role] || '';
      div.appendChild(roleSpan);
    }

    if (!player.isDead && player.id !== state.playerId) {
      div.addEventListener('click', () => selectPlayer(player.id));
    }

    elements.gamePlayers.appendChild(div);
  });
}

export function updateActionPanel() {
  const isAlive = !state.players.find(p => p.id === state.playerId)?.isDead;

  if (!isAlive) {
    elements.actionPanel.classList.add('hidden');
    return;
  }

  elements.actionPanel.classList.remove('hidden');

  if (state.gamePhase === 'night') {
    switch (state.role) {
      case 'mafia':
        elements.actionHint.textContent = '🔪 Выберите жертву для убийства';
        break;
      case 'godfather':
        elements.actionHint.textContent = '🎩 Выберите жертву для убийства';
        break;
      case 'maniac':
        elements.actionHint.textContent = '🪓 Выберите жертву для убийства';
        break;
      case 'doctor':
        elements.actionHint.textContent = '💉 Выберите кого спасти';
        break;
      case 'detective':
        elements.actionHint.textContent = '🔍 Выберите кого проверить';
        break;
      default:
        elements.actionHint.textContent = '😴 Вы спите... Ждите утра';
        elements.confirmAction.style.display = 'none';
        elements.skipAction.style.display = 'none';
        return;
    }
    elements.confirmAction.textContent = 'Выбрать';
  } else if (state.gamePhase === 'day') {
    elements.actionHint.textContent = '🗳️ Голосуйте за изгнание';
    elements.confirmAction.textContent = 'Голосовать';
  }

  elements.confirmAction.style.display = 'block';
  elements.skipAction.style.display = 'block';
  elements.confirmAction.disabled = !state.selectedPlayer;
}

// === Debounce для кнопок действий ===
let actionDebounceTimer = null;

export function lockActionButtons() {
  elements.confirmAction.disabled = true;
  elements.confirmAction.classList.add('btn-loading');
  elements.skipAction.disabled = true;
  elements.skipAction.classList.add('btn-loading');

  if (actionDebounceTimer) clearTimeout(actionDebounceTimer);
  actionDebounceTimer = setTimeout(() => {
    unlockActionButtons();
  }, 3000);
}

export function unlockActionButtons() {
  if (actionDebounceTimer) {
    clearTimeout(actionDebounceTimer);
    actionDebounceTimer = null;
  }
  elements.confirmAction.classList.remove('btn-loading');
  elements.skipAction.classList.remove('btn-loading');
  elements.skipAction.disabled = false;
  elements.confirmAction.disabled = !state.selectedPlayer;
}

// Action buttons
elements.confirmAction.addEventListener('click', () => {
  if (!state.selectedPlayer) return;
  if (elements.confirmAction.classList.contains('btn-loading')) return;

  lockActionButtons();

  if (state.gamePhase === 'night') {
    socket.emit('nightAction', state.selectedPlayer);
  } else if (state.gamePhase === 'day') {
    socket.emit('vote', state.selectedPlayer);
  }

  state.selectedPlayer = null;
  elements.confirmAction.disabled = true;
  showNotification('Действие выполнено', 'success');
});

elements.skipAction.addEventListener('click', () => {
  if (elements.skipAction.classList.contains('btn-loading')) return;

  lockActionButtons();

  if (state.gamePhase === 'night') {
    socket.emit('nightAction', null);
  } else if (state.gamePhase === 'day') {
    socket.emit('vote', null);
  }

  state.selectedPlayer = null;
  showNotification('Вы пропустили', 'info');
});
