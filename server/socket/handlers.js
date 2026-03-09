// server/socket/handlers.js — Регистрация всех socket.io обработчиков

const { registerRoomHandlers } = require('./room-handlers');
const { registerGameHandlers } = require('./game-handlers');
const { registerReconnectHandlers } = require('./reconnect-handlers');
const logger = require('../logger');

/**
 * Регистрация всех socket обработчиков
 * @param {Object} io — socket.io сервер
 */
function registerHandlers(io) {
  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'Подключение');

    registerRoomHandlers(socket, io);
    registerGameHandlers(socket, io);
    registerReconnectHandlers(socket, io);
  });
}

module.exports = { registerHandlers };
