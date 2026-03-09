import { elements } from './dom.js';

let confirmCallback = null;

export function showConfirmModal(icon, title, text, yesText, callback) {
  document.getElementById('confirm-modal-icon').textContent = icon;
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-text').textContent = text;
  document.getElementById('confirm-modal-yes').textContent = yesText;
  document.getElementById('confirm-modal').classList.add('active');
  confirmCallback = callback;
}

document.getElementById('confirm-modal-yes').addEventListener('click', () => {
  document.getElementById('confirm-modal').classList.remove('active');
  if (confirmCallback) confirmCallback();
  confirmCallback = null;
});

document.getElementById('confirm-modal-no').addEventListener('click', () => {
  document.getElementById('confirm-modal').classList.remove('active');
  confirmCallback = null;
});

// Правила
elements.showRules.addEventListener('click', () => {
  elements.rulesModal.classList.add('active');
});

document.querySelector('.modal-close').addEventListener('click', () => {
  elements.rulesModal.classList.remove('active');
});

elements.rulesModal.addEventListener('click', (e) => {
  if (e.target === elements.rulesModal) {
    elements.rulesModal.classList.remove('active');
  }
});
