import { state } from './state.js';
import { elements } from './dom.js';
import { socket, stopPingMonitor } from './socket.js';
import { showNotification } from './utils.js';
import { navigateTo } from './navigation.js';
import { showConfirmModal } from './modals.js';
import { resetGameState } from './reset.js';

// Debounce для кнопок создания/входа
let joinDebounceTimer = null;
function debounceJoin(fn) {
  if (joinDebounceTimer) return;
  fn();
  joinDebounceTimer = setTimeout(() => { joinDebounceTimer = null; }, 2000);
}

// Создание комнаты
elements.createRoomBtn.addEventListener('click', () => {
  const name = elements.playerNameInput.value.trim();
  if (!name) {
    showNotification('Введите ваше имя', 'error');
    return;
  }
  debounceJoin(() => {
    state.playerName = name;
    socket.emit('createRoom', name);
  });
});

// Присоединение к комнате
elements.joinRoomBtn.addEventListener('click', () => {
  const name = elements.playerNameInput.value.trim();
  const roomId = elements.roomCodeInput.value.trim().toUpperCase();

  if (!name) {
    showNotification('Введите ваше имя', 'error');
    return;
  }
  if (!roomId) {
    showNotification('Введите код комнаты', 'error');
    return;
  }

  debounceJoin(() => {
    state.playerName = name;
    socket.emit('joinRoom', { roomId, playerName: name });
  });
});

// Копирование ссылки комнаты
elements.copyCodeBtn.addEventListener('click', () => {
  const url = window.location.origin + '/lobby/' + state.roomId;
  navigator.clipboard.writeText(url);
  showNotification('Ссылка скопирована!', 'success');
});

// Добавить бота
elements.addBotBtn.addEventListener('click', () => {
  socket.emit('addBot');
});

// Начало игры
elements.startGameBtn.addEventListener('click', () => {
  socket.emit('startGame', state.roleConfig);
});

// Следующая фаза (ведущий)
elements.advancePhaseBtn.addEventListener('click', () => {
  elements.advancePhaseBtn.classList.remove('phase-ready-pulse');
  socket.emit('hostAdvancePhase');
});

// Возврат в меню
elements.backToMenu.addEventListener('click', () => {
  stopPingMonitor();
  resetGameState();
  navigateTo('/');
});

// Enter для формы
elements.playerNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    if (elements.roomCodeInput.value) {
      elements.joinRoomBtn.click();
    } else {
      elements.createRoomBtn.click();
    }
  }
});

elements.roomCodeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    elements.joinRoomBtn.click();
  }
});

// Кнопка "Назад" в лобби
elements.lobbyBackBtn.addEventListener('click', () => {
  const title = state.isHost ? 'Покинуть комнату?' : 'Выйти из комнаты?';
  const text = state.isHost
    ? 'Вы ведущий. Комната будет закрыта для всех игроков.'
    : 'Вы покинете текущую комнату.';
  showConfirmModal('🚪', title, text, 'Выйти', () => {
    if (state.roomId) {
      socket.emit('leaveRoom');
    }
    resetGameState();
    stopPingMonitor();
    navigateTo('/');
  });
});

// Закрыть комнату
document.getElementById('close-room-btn').addEventListener('click', () => {
  showConfirmModal('🚪', 'Закрыть комнату?', 'Все игроки будут отключены от комнаты.', 'Закрыть', () => {
    socket.emit('closeRoom');
    resetGameState();
    stopPingMonitor();
    navigateTo('/');
  });
});

// Завершить игру (ведущий)
document.getElementById('end-game-btn').addEventListener('click', () => {
  showConfirmModal('⚠️', 'Завершить игру?', 'Игра будет завершена досрочно. Все игроки увидят результаты.', 'Завершить', () => {
    socket.emit('endGame');
  });
});
