// server/index.js — Entry point (модульная версия)

const express = require('express');
const compression = require('compression');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const config = require('./config');
const logger = require('./logger');
const { registerHandlers } = require('./socket/handlers');
const { getAllRooms, startCleanupTimer, saveState } = require('./game/GameRoom');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // Heartbeat/ping для раннего обнаружения мёртвых соединений
  pingInterval: config.PING_INTERVAL_MS,
  pingTimeout: config.PING_TIMEOUT_MS
});

// Gzip-сжатие всех ответов
app.use(compression());

// Заголовки безопасности
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https://api.dicebear.com data:; connect-src 'self' ws: wss:");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Статические файлы — public/ лежит на уровень выше
app.use(express.static(path.join(__dirname, '..', 'public')));

// Регистрация socket обработчиков
registerHandlers(io);

// Health-check и мониторинг памяти
app.get('/api/health', (req, res) => {
  const mem = process.memoryUsage();
  const rooms = getAllRooms();
  let totalPlayers = 0;
  for (const [, room] of rooms) {
    totalPlayers += room.players.length;
  }
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    rooms: rooms.size,
    totalPlayers,
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024) + ' MB',
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + ' MB'
    }
  });
});

// SPA catch-all: все нематченные маршруты -> index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

server.listen(config.PORT, () => {
  logger.info({ port: config.PORT, maxPlayers: config.MAX_PLAYERS, maxRooms: config.MAX_ROOMS, pingInterval: config.PING_INTERVAL_MS, pingTimeout: config.PING_TIMEOUT_MS, reconnectTimeout: config.RECONNECT_TIMEOUT_MS }, 'Сервер запущен');

  // Запуск очистки устаревших комнат
  startCleanupTimer(io);
});

// Graceful shutdown — сохранение состояния при остановке
async function gracefulShutdown(signal) {
  logger.info({ signal }, 'Получен сигнал, сохраняем состояние');
  await saveState();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
