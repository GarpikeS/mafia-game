import { state } from './state.js';
import { socket, startPingMonitor, stopPingMonitor } from './socket.js';
import { elements } from './dom.js';
import { showScreen, navigateTo } from './navigation.js';
import { showNotification } from './utils.js';
import { setMyCard } from './cards.js';
import { saveSession, loadSession, clearSession } from './session.js';
import { resetGameState } from './reset.js';
import { updateLobbyPlayers, updateRoleConfig } from './ui-lobby.js';
import { updateGamePlayers, updateActionPanel } from './ui-game.js';
import { updateNarratorPlayers } from './ui-narrator.js';

const reconnectOverlay = document.getElementById('reconnect-overlay');
const reconnectText = reconnectOverlay.querySelector('.reconnect-text');
const reconnectHint = reconnectOverlay.querySelector('.reconnect-hint');
const reconnectReloadBtn = document.getElementById('reconnect-reload');
if (reconnectReloadBtn) reconnectReloadBtn.addEventListener('click', () => location.reload());
let reconnectAttempt = 0;

// Сохраняем при каждом важном изменении
socket.on('roomCreated', () => saveSession());
socket.on('roomJoined', () => saveSession());
socket.on('gameStarted', () => saveSession());

socket.on('disconnect', (reason) => {
  if (state.roomId) {
    reconnectAttempt = 0;
    reconnectOverlay.classList.add('active');
    reconnectText.textContent = 'Переподключение...';
    reconnectHint.textContent = reason === 'io server disconnect'
      ? 'Сервер разорвал соединение'
      : 'Проверьте интернет-соединение';
    saveSession();
  }
});

socket.io.on('reconnect_attempt', (attempt) => {
  reconnectAttempt = attempt;
  reconnectText.textContent = `Переподключение... (${attempt})`;
  if (attempt > 5) {
    reconnectHint.textContent = 'Слабый сигнал. Попытки продолжаются...';
  }
  const reloadBtn = document.getElementById('reconnect-reload');
  if (reloadBtn) reloadBtn.style.display = attempt > 10 ? 'inline-block' : 'none';
});

socket.io.on('reconnect_failed', () => {
  reconnectText.textContent = 'Не удалось подключиться';
  reconnectHint.textContent = 'Проверьте соединение и обновите страницу';
});

socket.on('connect', () => {
  let roomId = state.roomId;
  let playerName = state.playerName;
  let isHost = state.isHost;
  let token = state.token;

  if (!roomId) {
    const saved = loadSession();
    if (saved) {
      roomId = saved.roomId;
      playerName = saved.playerName;
      isHost = saved.isHost;
      token = saved.token || null;
      state.roomId = roomId;
      state.playerName = playerName;
      state.isHost = isHost;
      state.token = token;
    }
  }

  if (roomId && playerName) {
    socket.emit('rejoinRoom', { roomId, playerName, token });
  } else {
    reconnectOverlay.classList.remove('active');
  }
});

socket.on('rejoinSuccess', (data) => {
  reconnectOverlay.classList.remove('active');
  reconnectAttempt = 0;
  state.playerId = socket.id;

  if (data.gameState === 'lobby') {
    if (data.players) state.players = data.players;
    elements.roomIdDisplay.textContent = state.roomId;
    if (data.isHost) state.isHost = true;
    if (state.isHost) {
      elements.hostControls.style.display = 'flex';
      document.getElementById('role-config').style.display = 'block';
      const roleBadge = document.getElementById('lobby-role-badge');
      roleBadge.textContent = '🎭 Ведущий';
      roleBadge.className = 'lobby-role-badge narrator';
      roleBadge.style.display = 'inline-block';
      updateRoleConfig();
    } else {
      elements.hostControls.style.display = 'none';
      document.getElementById('role-config').style.display = 'none';
      const roleBadge = document.getElementById('lobby-role-badge');
      roleBadge.textContent = 'Игрок';
      roleBadge.className = 'lobby-role-badge player';
      roleBadge.style.display = 'inline-block';
    }
    showScreen('lobby');
    startPingMonitor();
    if (data.players) updateLobbyPlayers(data.players);
  } else if (data.gameState === 'night' || data.gameState === 'day') {
    state.role = data.role;
    state.gamePhase = data.gameState;
    state.mafiaMembers = data.mafiaMembers || [];
    state.players = data.players || [];

    if (state.role) setMyCard(state.role);

    if (state.isHost) {
      if (data.narratorPlayers) state.narratorPlayers = data.narratorPlayers;
      showScreen('narrator');
      startPingMonitor();
      updateNarratorPlayers();
    } else {
      showScreen('game');
      startPingMonitor();
      updateGamePlayers(state.players);
      updateActionPanel();
    }

    const phaseIcon = data.gameState === 'night' ? '🌙' : '☀️';
    const phaseLabel = data.gameState === 'night' ? 'Ночь' : 'День';
    if (state.isHost) {
      elements.narratorPhaseIcon.textContent = phaseIcon;
      elements.narratorPhaseText.textContent = `${phaseLabel} ${data.phase || ''}`;
    } else {
      elements.phaseIcon.textContent = phaseIcon;
      elements.phaseText.textContent = `${phaseLabel} ${data.phase || ''}`;
    }
    document.body.dataset.phase = data.gameState;
  }

  saveSession();
  showNotification('Соединение восстановлено', 'success');
});

socket.on('rejoinFailed', () => {
  reconnectOverlay.classList.remove('active');
  clearSession();
  stopPingMonitor();
  resetGameState();
  navigateTo('/');
  showNotification('Не удалось переподключиться к комнате', 'error');
});

socket.on('gameEnded', () => clearSession());

// Обработка кика игрока
socket.on('kicked', () => {
  reconnectOverlay.classList.remove('active');
  clearSession();
  stopPingMonitor();
  resetGameState();
  navigateTo('/');
  showNotification('Вы были исключены из комнаты', 'error');
});

// Page Visibility API
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveSession();
  } else {
    if (!socket.connected && state.roomId) {
      socket.connect();
    }
  }
});
