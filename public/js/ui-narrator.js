import { state } from './state.js';
import { elements } from './dom.js';
import { renderPlayerAvatar } from './utils.js';

export function updateNarratorPlayers() {
  elements.narratorPlayers.innerHTML = '';

  state.narratorPlayers.forEach(player => {
    const isDead = state.players.find(p => p.id === player.id)?.isDead || false;
    const div = document.createElement('div');
    div.className = 'narrator-player' + (isDead ? ' dead' : '');
    const fullPlayer = state.players.find(p => p.id === player.id);
    const avatarSource = fullPlayer && fullPlayer.avatar ? fullPlayer : player;

    div.appendChild(renderPlayerAvatar(avatarSource, 'game-player-avatar'));
    const nameDiv = document.createElement('div');
    nameDiv.className = 'game-player-name';
    nameDiv.textContent = player.name + (player.isBot ? ' 🤖' : '');
    div.appendChild(nameDiv);
    const roleSpan = document.createElement('span');
    roleSpan.className = 'game-player-role ' + player.role;
    roleSpan.textContent = player.roleName;
    div.appendChild(roleSpan);
    elements.narratorPlayers.appendChild(div);
  });
}

export function addNarratorLog(text) {
  const div = document.createElement('div');
  div.className = 'narrator-log-entry';
  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = `[${time}]`;
  div.appendChild(timeSpan);
  div.appendChild(document.createTextNode(' ' + text));
  elements.narratorLog.appendChild(div);
  while (elements.narratorLog.children.length > 200) {
    elements.narratorLog.removeChild(elements.narratorLog.firstChild);
  }
  elements.narratorLog.scrollTop = elements.narratorLog.scrollHeight;
}
