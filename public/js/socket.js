// Socket.IO init (io — глобальный из socket.io.js)
export const socket = io({
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity,
  timeout: 30000,
  transports: ['polling']
});

// === Heartbeat-индикатор соединения ===
const connectionIndicator = document.getElementById('connection-indicator');
const connectionDot = connectionIndicator ? connectionIndicator.querySelector('.connection-dot') : null;
let pingInterval = null;

export function startPingMonitor() {
  if (pingInterval) clearInterval(pingInterval);
  if (connectionIndicator) connectionIndicator.classList.add('active');

  pingInterval = setInterval(() => {
    const start = Date.now();
    socket.volatile.emit('ping_check', () => {
      const latency = Date.now() - start;
      if (connectionDot) {
        connectionDot.className = 'connection-dot ' + (latency < 150 ? 'good' : latency < 400 ? 'medium' : 'poor');
      }
      if (connectionIndicator) {
        connectionIndicator.title = `Пинг: ${latency}мс`;
      }
    });
  }, 5000);
}

export function stopPingMonitor() {
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  if (connectionIndicator) connectionIndicator.classList.remove('active');
}
