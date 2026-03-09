import { ROLE_ICONS, ROLE_NAMES, ROLE_DESCRIPTIONS } from './state.js';
import { elements } from './dom.js';

let roleCardTimer = null;
let roleCardAutoCloseTimer = null;

export function showRoleCard(role) {
  elements.roleCardIcon.textContent = ROLE_ICONS[role] || '?';
  elements.roleCardTitle.textContent = ROLE_NAMES[role] || 'Неизвестно';
  elements.roleCardDesc.textContent = ROLE_DESCRIPTIONS[role] || '';

  elements.roleCardInner.className = 'role-card-inner ' + role;
  elements.roleCardInner.classList.remove('flipped');
  elements.roleCardOverlay.classList.add('active');

  if (roleCardTimer) clearTimeout(roleCardTimer);
  if (roleCardAutoCloseTimer) clearTimeout(roleCardAutoCloseTimer);

  roleCardTimer = setTimeout(() => {
    flipRoleCard();
    roleCardAutoCloseTimer = setTimeout(() => {
      hideRoleCard();
    }, 6000);
  }, 2000);
}

export function flipRoleCard() {
  elements.roleCardInner.classList.toggle('flipped');

  if (elements.roleCardInner.classList.contains('flipped')) {
    if (roleCardTimer) clearTimeout(roleCardTimer);
    roleCardTimer = setTimeout(() => {
      elements.roleCardInner.classList.remove('flipped');
    }, 10000);
  } else {
    if (roleCardTimer) clearTimeout(roleCardTimer);
  }
}

export function hideRoleCard() {
  elements.roleCardOverlay.classList.remove('active');
  if (roleCardTimer) clearTimeout(roleCardTimer);
  if (roleCardAutoCloseTimer) clearTimeout(roleCardAutoCloseTimer);
}

export function setMyCard(role) {
  elements.myCardIcon.textContent = ROLE_ICONS[role] || '?';
  elements.myCardTitle.textContent = ROLE_NAMES[role] || 'Неизвестно';
  elements.myCardDesc.textContent = ROLE_DESCRIPTIONS[role] || '';
  elements.myCardInner.className = 'my-card-inner ' + role;
}

// Event listeners
elements.roleCardInner.addEventListener('click', (e) => {
  e.stopPropagation();
  flipRoleCard();
});

elements.roleCardOverlay.addEventListener('click', (e) => {
  if (e.target === elements.roleCardOverlay) {
    hideRoleCard();
  }
});

document.getElementById('role-card-close').addEventListener('click', (e) => {
  e.stopPropagation();
  hideRoleCard();
});

// Инлайн-карта (на столе)
let peekTimer = null;

elements.myCardInner.addEventListener('click', () => {
  if (peekTimer) { clearTimeout(peekTimer); peekTimer = null; }
  const isPeeked = elements.myCardInner.classList.toggle('peeked');
  if (isPeeked) {
    peekTimer = setTimeout(() => {
      elements.myCardInner.classList.remove('peeked');
      peekTimer = null;
    }, 5000);
  }
});
