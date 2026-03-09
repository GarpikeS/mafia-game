import { state } from './state.js';
import { screens, elements } from './dom.js';

// Переключение экранов с анимацией
export let screenTransitionInProgress = false;

let screenTransitionSafetyTimer = null;

// === Мобильные вкладки ===
export function setMobileGamePanel(panelName) {
  document.querySelectorAll('.game-mobile-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
  document.querySelectorAll('[data-game-panel]').forEach(p => p.classList.remove('mobile-active'));
  const tab = document.querySelector(`.game-mobile-tab[data-panel="${panelName}"]`);
  const panel = document.querySelector(`[data-game-panel="${panelName}"]`);
  if (tab) { tab.classList.add('active'); tab.setAttribute('aria-selected', 'true'); }
  if (panel) panel.classList.add('mobile-active');
}

export function setNarratorMobilePanel(panelName) {
  document.querySelectorAll('.narrator-mobile-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
  document.querySelectorAll('[data-narrator-panel]').forEach(p => p.classList.remove('mobile-active'));
  const tab = document.querySelector(`.narrator-mobile-tab[data-narrator-tab="${panelName}"]`);
  const panel = document.querySelector(`[data-narrator-panel="${panelName}"]`);
  if (tab) { tab.classList.add('active'); tab.setAttribute('aria-selected', 'true'); }
  if (panel) panel.classList.add('mobile-active');
}

export function showScreen(screenName) {
  const phaseMap = {
    menu: 'menu',
    lobby: 'lobby',
    game: state.gamePhase || 'night',
    narrator: state.gamePhase || 'night',
    result: 'ended'
  };
  document.body.dataset.phase = phaseMap[screenName] || 'menu';

  if (screenName === 'lobby') {
    document.querySelectorAll('.lobby-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    document.querySelectorAll('.lobby-tab-content').forEach(c => c.classList.remove('active'));
    const playersTab = document.querySelector('.lobby-tab[data-tab="players"]');
    if (playersTab) { playersTab.classList.add('active'); playersTab.setAttribute('aria-selected', 'true'); }
    const playersContent = document.getElementById('tab-players');
    if (playersContent) playersContent.classList.add('active');
  }

  if (screenName === 'game') {
    setMobileGamePanel('players');
  }

  if (screenName === 'narrator') {
    setNarratorMobilePanel('players');
  }

  const currentScreen = Object.values(screens).find(s => s.classList.contains('active'));

  if (currentScreen && currentScreen !== screens[screenName] && !screenTransitionInProgress) {
    screenTransitionInProgress = true;
    currentScreen.classList.add('screen-exit');

    if (screenTransitionSafetyTimer) clearTimeout(screenTransitionSafetyTimer);
    screenTransitionSafetyTimer = setTimeout(() => {
      screenTransitionInProgress = false;
      screenTransitionSafetyTimer = null;
    }, 600);

    setTimeout(() => {
      currentScreen.classList.remove('active', 'screen-exit');
      screens[screenName].classList.add('active');
      state.screen = screenName;
      screenTransitionInProgress = false;
      if (screenTransitionSafetyTimer) {
        clearTimeout(screenTransitionSafetyTimer);
        screenTransitionSafetyTimer = null;
      }
    }, 400);
  } else if (!currentScreen || currentScreen === screens[screenName]) {
    screens[screenName].classList.add('active');
    state.screen = screenName;
  }
}

// === URL Routing (History API) ===

export function navigateTo(path, replace = false) {
  if (replace) {
    history.replaceState(null, '', path);
  } else {
    history.pushState(null, '', path);
  }
  handleRoute();
}

export function handleRoute() {
  if (screenTransitionInProgress) return;

  const path = location.pathname;

  if (path.startsWith('/lobby/')) {
    const roomId = path.split('/lobby/')[1].toUpperCase();
    if (roomId && state.roomId) {
      showScreen('lobby');
      return;
    }
    if (roomId) {
      elements.roomCodeInput.value = roomId;
      showScreen('menu');
      return;
    }
  }

  if (path.startsWith('/game/')) {
    const roomId = path.split('/game/')[1].toUpperCase();
    if (roomId && state.roomId) {
      if (state.isHost) {
        showScreen('narrator');
      } else {
        showScreen('game');
      }
      return;
    }
    showScreen('menu');
    return;
  }

  if (path === '/result') {
    showScreen('result');
    return;
  }

  if (state.roomId && (state.screen === 'game' || state.screen === 'narrator' || state.screen === 'lobby')) {
    const correctPath = state.screen === 'lobby'
      ? '/lobby/' + state.roomId
      : '/game/' + state.roomId;
    history.pushState(null, '', correctPath);
    return;
  }

  showScreen('menu');
}

export function getRoomIdFromPath() {
  const path = location.pathname;
  const match = path.match(/^\/(lobby|game)\/([A-Za-z0-9]+)/);
  return match ? match[2].toUpperCase() : null;
}

// Кнопка "Назад" в браузере
window.onpopstate = () => {
  handleRoute();
};

// При загрузке — обратная совместимость с hash-ссылками + подстановка кода
window.addEventListener('load', () => {
  const hash = location.hash.replace('#', '').trim().toUpperCase();
  if (hash.length > 0) {
    history.replaceState(null, '', '/lobby/' + hash);
  }

  const roomId = getRoomIdFromPath();
  if (roomId) {
    elements.roomCodeInput.value = roomId;
  }
});

// Вкладки лобби
document.querySelectorAll('.lobby-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.lobby-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    document.querySelectorAll('.lobby-tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    const target = document.getElementById('tab-' + tab.dataset.tab);
    if (target) target.classList.add('active');
  });
});

// Мобильные вкладки игрового экрана
document.querySelectorAll('.game-mobile-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    setMobileGamePanel(tab.dataset.panel);
  });
});

// Мобильные вкладки ведущего
document.querySelectorAll('.narrator-mobile-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    setNarratorMobilePanel(tab.dataset.narratorTab);
  });
});
