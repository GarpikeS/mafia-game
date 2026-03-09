import { elements } from './dom.js';
import { socket } from './socket.js';

export function addChatMessage(message, targetElement) {
  const container = targetElement || elements.chatMessages;
  const div = document.createElement('div');
  div.className = 'chat-message ' + message.type;

  if (message.type === 'system') {
    div.textContent = message.text;
  } else if (message.type === 'narrator') {
    const senderDiv = document.createElement('div');
    senderDiv.className = 'sender narrator-sender';
    senderDiv.textContent = message.sender;
    const textDiv = document.createElement('div');
    textDiv.textContent = message.text;
    div.appendChild(senderDiv);
    div.appendChild(textDiv);
  } else {
    const senderDiv = document.createElement('div');
    senderDiv.className = 'sender';
    senderDiv.textContent = message.sender;
    const textDiv = document.createElement('div');
    textDiv.textContent = message.text;
    div.appendChild(senderDiv);
    div.appendChild(textDiv);
  }

  container.appendChild(div);

  while (container.children.length > 200) {
    container.removeChild(container.firstChild);
  }

  container.scrollTop = container.scrollHeight;
}

function sendChatMessage() {
  const text = elements.chatInput.value.trim();
  if (!text) return;
  socket.emit('chatMessage', text);
  elements.chatInput.value = '';
}

elements.sendMessage.addEventListener('click', sendChatMessage);
elements.chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

function sendNarratorChatMessage() {
  const text = elements.narratorChatInput.value.trim();
  if (!text) return;
  socket.emit('chatMessage', text);
  elements.narratorChatInput.value = '';
}

elements.narratorSendMessage.addEventListener('click', sendNarratorChatMessage);
elements.narratorChatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendNarratorChatMessage();
});
