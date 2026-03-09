import { state } from './state.js';

const SESSION_KEY = 'mafia_session';
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 часа

export function saveSession() {
  if (state.roomId) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      roomId: state.roomId,
      playerName: state.playerName,
      isHost: state.isHost,
      token: state.token,
      savedAt: Date.now()
    }));
  }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // TTL 2 часа
    if (Date.now() - data.savedAt > SESSION_TTL_MS) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
