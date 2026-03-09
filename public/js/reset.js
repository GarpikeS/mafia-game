import { state } from './state.js';
import { elements } from './dom.js';

// Сброс игрового состояния (сохраняет roleConfig)
export function resetGameState() {
  state.roomId = null;
  state.playerId = null;
  state.playerName = null;
  state.isHost = false;
  state.role = null;
  state.players = [];
  state.selectedPlayer = null;
  state.gamePhase = null;
  state.token = null;
  state.mafiaMembers = [];
  state.narratorPlayers = [];

  elements.chatMessages.innerHTML = '';
  elements.narratorChatMessages.innerHTML = '';
  elements.narratorLog.innerHTML = '';
  elements.lobbyPlayers.innerHTML = '';
  elements.playerCount.textContent = '0';
}
