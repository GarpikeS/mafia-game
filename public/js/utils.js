import { elements } from './dom.js';

// Экранирование HTML для предотвращения XSS
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Рендеринг аватара игрока
 * @param {Object} player — объект игрока с полем avatar
 * @param {string} cssClass — CSS-класс контейнера
 * @returns {HTMLElement} — DOM-элемент аватара
 */
export function renderPlayerAvatar(player, cssClass) {
  const initial = player.name[0].toUpperCase();
  const container = document.createElement('div');
  container.className = cssClass;

  if (!player.avatar) {
    container.textContent = initial;
    return container;
  }

  if (player.avatar.type === 'url') {
    const url = player.avatar.value;
    if (!/^https?:\/\//i.test(url)) {
      container.textContent = initial;
      return container;
    }
    container.classList.add('avatar-img');
    const img = document.createElement('img');
    img.src = url;
    img.alt = initial;
    img.addEventListener('error', () => {
      container.textContent = initial;
      container.classList.remove('avatar-img');
      img.remove();
    });
    container.appendChild(img);
    return container;
  }

  if (player.avatar.type === 'svg') {
    container.classList.add('avatar-svg');
    try {
      const doc = new DOMParser().parseFromString(player.avatar.value, 'image/svg+xml');
      const svg = doc.querySelector('svg');
      if (svg && !doc.querySelector('parsererror')) {
        container.appendChild(svg);
      } else {
        container.textContent = initial;
      }
    } catch {
      container.textContent = initial;
    }
    return container;
  }

  container.textContent = initial;
  return container;
}

// Уведомления
export function showNotification(message, type = 'info') {
  elements.notification.textContent = message;
  elements.notification.className = 'notification show ' + type;

  setTimeout(() => {
    elements.notification.classList.remove('show');
  }, 3000);
}
