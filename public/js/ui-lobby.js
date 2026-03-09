import { state } from './state.js';
import { elements } from './dom.js';
import { renderPlayerAvatar } from './utils.js';
import { socket } from './socket.js';

export function updateLobbyPlayers(players) {
  elements.lobbyPlayers.innerHTML = '';

  players.forEach(player => {
    const card = document.createElement('div');
    card.className = 'player-card' + (player.isBot ? ' bot' : '');

    card.appendChild(renderPlayerAvatar(player, 'player-avatar'));

    const infoDiv = document.createElement('div');
    infoDiv.className = 'player-info';
    const nameDiv = document.createElement('div');
    nameDiv.className = 'player-name';
    nameDiv.textContent = player.name;
    const statusDiv = document.createElement('div');
    statusDiv.className = 'player-status';
    statusDiv.textContent = player.isBot ? '🤖 Бот' : 'Игрок';
    infoDiv.appendChild(nameDiv);
    infoDiv.appendChild(statusDiv);
    card.appendChild(infoDiv);

    const faceCard = document.createElement('div');
    faceCard.className = 'player-face-card';
    const faceSpan = document.createElement('span');
    faceSpan.textContent = '?';
    faceCard.appendChild(faceSpan);
    card.appendChild(faceCard);

    if (state.isHost && player.isBot) {
      const rmBtn = document.createElement('button');
      rmBtn.className = 'remove-bot-btn';
      rmBtn.dataset.botId = player.id;
      rmBtn.title = 'Удалить бота';
      rmBtn.textContent = '\u00d7';
      card.appendChild(rmBtn);
    }

    elements.lobbyPlayers.appendChild(card);
  });

  document.querySelectorAll('.remove-bot-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('removeBot', btn.dataset.botId);
    });
  });

  elements.playerCount.textContent = players.length;
  elements.startGameBtn.disabled = !state.isHost || players.length < 4;
  if (state.isHost) updateRoleConfig();
}

export function updateRoleConfig() {
  document.getElementById('rc-mafia').textContent = state.roleConfig.mafia;
  document.getElementById('rc-godfather').textContent = state.roleConfig.godfather;
  document.getElementById('rc-maniac').textContent = state.roleConfig.maniac;
  document.getElementById('rc-doctor').textContent = state.roleConfig.doctor;
  document.getElementById('rc-detective').textContent = state.roleConfig.detective;
  const playerCount = state.players.length;
  const assigned = state.roleConfig.mafia + state.roleConfig.godfather + state.roleConfig.maniac + state.roleConfig.doctor + state.roleConfig.detective;
  const civilians = Math.max(0, playerCount - assigned);
  document.getElementById('rc-civilian').textContent = civilians;
}

// Role config buttons
document.querySelectorAll('.role-config-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const role = btn.dataset.role;
    const action = btn.dataset.action;
    const playerCount = state.players.length;
    const otherRoles = Object.entries(state.roleConfig)
      .filter(([k]) => k !== role)
      .reduce((sum, [, v]) => sum + v, 0);
    const maxForRole = Math.max(0, playerCount - otherRoles);

    if (action === 'plus') {
      const newVal = state.roleConfig[role] + 1;
      if (newVal <= maxForRole) {
        state.roleConfig[role] = newVal;
      }
    } else {
      state.roleConfig[role] = Math.max(0, state.roleConfig[role] - 1);
    }
    updateRoleConfig();
  });
});
