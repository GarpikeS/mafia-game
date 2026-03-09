// Entry point — импорт всех модулей

// Инициализация базовых модулей (порядок важен)
import './js/state.js';
import './js/dom.js';
import './js/socket.js';
import './js/utils.js';
import './js/effects.js';

// UI модули
import './js/cards.js';
import './js/chat.js';
import './js/modals.js';
import './js/ui-lobby.js';
import './js/ui-game.js';
import './js/ui-narrator.js';

// Навигация и роутинг
import './js/navigation.js';

// Event handlers
import './js/events-menu.js';
import './js/events-socket.js';
import './js/reconnect.js';

// Инициализация — показать экран по текущему URL
import { handleRoute } from './js/navigation.js';
handleRoute();
