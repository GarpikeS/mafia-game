// tests/lobby-test.js — Комплексный тест лобби (20 мин)
const { io } = require('socket.io-client');

const URL = 'http://127.0.0.1:5099';
const OPTS = { reconnection: false, timeout: 5000, transports: ['websocket', 'polling'] };

let passed = 0, failed = 0, total = 0;

function connect() {
  return io(URL, { ...OPTS, forceNew: true });
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function waitFor(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
    socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
  });
}

function test(name, fn) {
  total++;
  return fn().then(() => {
    passed++;
    console.log(`  ✓ ${name}`);
  }).catch(err => {
    failed++;
    console.log(`  ✗ ${name}: ${err.message}`);
  });
}

async function cleanup(...sockets) {
  for (const s of sockets) {
    if (s && s.connected) s.disconnect();
  }
  await wait(200);
}

// ============= ТЕСТЫ =============

async function testCreateRoom() {
  console.log('\n=== 1. Создание комнаты ===');
  const host = connect();

  await test('Ведущий создаёт комнату', async () => {
    host.emit('createRoom', 'Ведущий');
    const data = await waitFor(host, 'roomCreated');
    if (!data.roomId) throw new Error('Нет roomId');
    if (!data.isHost) throw new Error('isHost !== true');
    if (!data.token) throw new Error('Нет token');
  });

  await cleanup(host);
}

async function testJoinRoom() {
  console.log('\n=== 2. Вход в комнату ===');
  const host = connect();
  host.emit('createRoom', 'Ведущий');
  const { roomId, token: hostToken } = await waitFor(host, 'roomCreated');

  const player1 = connect();
  await test('Игрок входит по коду', async () => {
    player1.emit('joinRoom', { roomId, playerName: 'Игрок1' });
    const data = await waitFor(player1, 'roomJoined');
    if (data.roomId !== roomId) throw new Error('roomId не совпадает');
    if (!data.token) throw new Error('Нет token игрока');
  });

  const player2 = connect();
  await test('Второй игрок входит', async () => {
    player2.emit('joinRoom', { roomId, playerName: 'Игрок2' });
    const data = await waitFor(player2, 'roomJoined');
    if (!data.player) throw new Error('Нет player');
  });

  await test('Обновление списка игроков (2 игрока)', async () => {
    const players = await waitFor(host, 'updatePlayers', 2000);
    if (!Array.isArray(players)) throw new Error('players не массив');
    if (players.length < 2) throw new Error(`Ожидалось ≥2, получено ${players.length}`);
  });

  await test('Дубль имени отклонён', async () => {
    const dup = connect();
    dup.emit('joinRoom', { roomId, playerName: 'Игрок1' });
    const err = await waitFor(dup, 'error', 3000);
    if (!err.includes('занято')) throw new Error(`Ожидалась ошибка "занято", получено: ${err}`);
    dup.disconnect();
  });

  await test('Неверный код комнаты отклонён', async () => {
    const bad = connect();
    bad.emit('joinRoom', { roomId: 'XXXXXX', playerName: 'Тест' });
    const err = await waitFor(bad, 'error', 3000);
    if (!err.includes('не найдена')) throw new Error(`Ожидалась "не найдена", получено: ${err}`);
    bad.disconnect();
  });

  await cleanup(host, player1, player2);
}

async function testBots() {
  console.log('\n=== 3. Боты ===');
  const host = connect();
  host.emit('createRoom', 'Ведущий');
  const { roomId } = await waitFor(host, 'roomCreated');
  await waitFor(host, 'updatePlayers'); // начальный

  await test('Добавление бота', async () => {
    host.emit('addBot');
    const players = await waitFor(host, 'updatePlayers', 3000);
    const bot = players.find(p => p.isBot);
    if (!bot) throw new Error('Бот не найден в списке');
  });

  await test('Добавление 3 ботов с паузами (rate limiter)', async () => {
    let lastPlayers;
    host.on('updatePlayers', p => { lastPlayers = p; });
    for (let i = 0; i < 3; i++) {
      host.emit('addBot');
      await wait(300);
    }
    await wait(500);
    host.off('updatePlayers');
    const bots = (lastPlayers || []).filter(p => p.isBot);
    if (bots.length < 3) throw new Error(`Ожидалось ≥3 ботов, получено ${bots.length}`);
  });

  await test('Удаление бота', async () => {
    host.emit('addBot');
    const playersAfterAdd = await waitFor(host, 'updatePlayers', 3000);
    const bot = playersAfterAdd.find(p => p.isBot);
    host.emit('removeBot', bot.id);
    const playersAfterRemove = await waitFor(host, 'updatePlayers', 3000);
    const removed = !playersAfterRemove.find(p => p.id === bot.id);
    if (!removed) throw new Error('Бот не удалён');
  });

  await cleanup(host);
}

async function testHostReconnectLobby() {
  console.log('\n=== 4. Реконнект ведущего в лобби (F5) ===');
  const host = connect();
  host.emit('createRoom', 'Ведущий');
  const { roomId, token } = await waitFor(host, 'roomCreated');

  const player = connect();
  player.emit('joinRoom', { roomId, playerName: 'Игрок1' });
  await waitFor(player, 'roomJoined');
  await wait(500);

  await test('Ведущий отключается → hostDisconnected приходит игроку', async () => {
    const hostDisconnectPromise = waitFor(player, 'hostDisconnected', 5000);
    host.disconnect();
    const data = await hostDisconnectPromise;
    if (!data.timeout) throw new Error('Нет timeout в hostDisconnected');
  });

  await wait(500);

  await test('Ведущий реконнектится в лобби — получает rejoinSuccess с isHost и players', async () => {
    const host2 = connect();
    host2.emit('rejoinRoom', { roomId, playerName: 'Ведущий', token });
    const data = await waitFor(host2, 'rejoinSuccess', 5000);
    if (data.gameState !== 'lobby') throw new Error(`gameState=${data.gameState}, ожидалось lobby`);
    if (!data.isHost) throw new Error('isHost !== true');
    if (!data.players || data.players.length === 0) throw new Error('players пусто');
    host2.disconnect();
  });

  await test('Игрок получает hostReconnected', async () => {
    const host3 = connect();
    const reconnectedPromise = waitFor(player, 'hostReconnected', 5000);
    host3.emit('rejoinRoom', { roomId, playerName: 'Ведущий', token });
    await waitFor(host3, 'rejoinSuccess', 5000);
    await reconnectedPromise;
    host3.disconnect();
  });

  await cleanup(player);
}

async function testPlayerReconnectLobby() {
  console.log('\n=== 5. Реконнект игрока в лобби ===');
  const host = connect();
  host.emit('createRoom', 'Ведущий');
  const { roomId } = await waitFor(host, 'roomCreated');
  await waitFor(host, 'updatePlayers');

  const player = connect();
  player.emit('joinRoom', { roomId, playerName: 'Тестигрок' });
  const joinData = await waitFor(player, 'roomJoined');
  const playerToken = joinData.token;
  await wait(300);

  await test('Игрок отключается и реконнектится по токену', async () => {
    player.disconnect();
    await wait(500);
    const player2 = connect();
    player2.emit('rejoinRoom', { roomId, playerName: 'Тестигрок', token: playerToken });
    const data = await waitFor(player2, 'rejoinSuccess', 5000);
    if (data.gameState !== 'lobby') throw new Error(`gameState=${data.gameState}`);
    player2.disconnect();
  });

  await test('Реконнект с неверным токеном отклонён', async () => {
    const bad = connect();
    bad.emit('rejoinRoom', { roomId, playerName: 'Тестигрок', token: 'bad-token-xxx' });
    await waitFor(bad, 'rejoinFailed', 5000);
    bad.disconnect();
  });

  await cleanup(host);
}

async function testPingCheck() {
  console.log('\n=== 6. Ping check (индикатор соединения) ===');
  const client = connect();

  await test('ping_check возвращает callback', async () => {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Ping timeout')), 3000);
      client.emit('ping_check', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  });

  await cleanup(client);
}

async function testRoleConfig() {
  console.log('\n=== 7. Старт игры с ролями (maniac fix) ===');
  const host = connect();
  host.emit('createRoom', 'Ведущий');
  const { roomId } = await waitFor(host, 'roomCreated');

  // Добавляем 4 игрока (мин. для старта)
  const players = [];
  for (let i = 0; i < 4; i++) {
    const p = connect();
    p.emit('joinRoom', { roomId, playerName: `Player${i}` });
    await waitFor(p, 'roomJoined');
    players.push(p);
  }
  await wait(500);

  await test('Старт с maniac=1 в roleConfig не падает', async () => {
    const gameStartedPromise = waitFor(players[0], 'gameStarted', 5000);
    host.emit('startGame', { mafia: 1, godfather: 0, maniac: 1, doctor: 1, detective: 0 });
    const data = await gameStartedPromise;
    if (!data.role) throw new Error('Нет роли');
  });

  await test('Ведущий получил narratorGameStarted со всеми ролями', async () => {
    const data = await waitFor(host, 'narratorGameStarted', 3000);
    if (!data.players || data.players.length !== 4) throw new Error(`Ожидалось 4 игрока, получено ${data.players?.length}`);
    const maniac = data.players.find(p => p.role === 'maniac');
    if (!maniac) throw new Error('Маньяк не назначен');
  });

  await cleanup(host, ...players);
}

async function testStartGameMinPlayers() {
  console.log('\n=== 8. Валидация минимума игроков ===');
  const host = connect();
  host.emit('createRoom', 'Ведущий2');
  const { roomId } = await waitFor(host, 'roomCreated');

  const pl1 = connect();
  pl1.emit('joinRoom', { roomId, playerName: 'Один' });
  await waitFor(pl1, 'roomJoined');

  await test('Старт с 1 игроком отклонён (нужно минимум 4)', async () => {
    host.emit('startGame', { mafia: 1, godfather: 0, maniac: 0, doctor: 0, detective: 0 });
    const err = await waitFor(host, 'error', 3000);
    if (!err.includes('Минимум')) throw new Error(`Ожидалось "Минимум", получено: ${err}`);
  });

  await cleanup(host, pl1);
}

async function testLeaveRoom() {
  console.log('\n=== 9. Выход из комнаты ===');
  const host = connect();
  host.emit('createRoom', 'Ведущий');
  const { roomId } = await waitFor(host, 'roomCreated');
  await waitFor(host, 'updatePlayers');

  const player = connect();
  player.emit('joinRoom', { roomId, playerName: 'Уходящий' });
  await waitFor(player, 'roomJoined');
  await wait(300);

  await test('Игрок покидает лобби — список обновляется', async () => {
    const updatePromise = waitFor(host, 'updatePlayers', 3000);
    player.emit('leaveRoom');
    const players = await updatePromise;
    const found = players.find(p => p.name === 'Уходящий');
    if (found) throw new Error('Игрок всё ещё в списке');
  });

  await test('Ведущий покидает → комната закрывается', async () => {
    const p2 = connect();
    p2.emit('joinRoom', { roomId, playerName: 'Ждущий' });
    await waitFor(p2, 'roomJoined');
    const endPromise = waitFor(p2, 'gameEnded', 5000);
    host.emit('leaveRoom');
    const data = await endPromise;
    if (!data.message.includes('Ведущий')) throw new Error('Нет сообщения о ведущем');
    p2.disconnect();
  });

  await cleanup(host, player);
}

async function testConcurrentReconnects() {
  console.log('\n=== 10. Стресс-тест: несколько реконнектов подряд ===');
  const host = connect();
  host.emit('createRoom', 'СтрессХост');
  const { roomId, token } = await waitFor(host, 'roomCreated');
  await waitFor(host, 'updatePlayers');

  // Добавим игроков
  for (let i = 0; i < 3; i++) {
    const p = connect();
    p.emit('joinRoom', { roomId, playerName: `Стресс${i}` });
    await waitFor(p, 'roomJoined');
    p.disconnect();
  }
  await wait(500);

  let currentHost = host;
  await test('Хост: 3 реконнекта подряд (симуляция нестабильного WiFi)', async () => {
    for (let i = 0; i < 3; i++) {
      currentHost.disconnect();
      await wait(500);
      currentHost = connect();
      currentHost.emit('rejoinRoom', { roomId, playerName: 'СтрессХост', token });
      const data = await waitFor(currentHost, 'rejoinSuccess', 5000);
      if (data.gameState !== 'lobby') throw new Error(`Итерация ${i}: gameState=${data.gameState}`);
      await wait(300);
    }
  });

  await cleanup(currentHost);
}

async function testHealthEndpoint() {
  console.log('\n=== 11. Health endpoint ===');
  const http = require('http');

  await test('/api/health отвечает и содержит rooms', async () => {
    const data = await new Promise((resolve, reject) => {
      http.get(`${URL}/api/health`, res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });
    if (data.status !== 'ok') throw new Error(`status=${data.status}`);
    if (typeof data.rooms !== 'number') throw new Error('rooms не число');
  });
}

async function testLobbyTimeoutDisconnect() {
  console.log('\n=== 12. Таймаут отключения в лобби ===');
  const host = connect();
  host.emit('createRoom', 'TimeoutHost');
  const { roomId } = await waitFor(host, 'roomCreated');
  await wait(300);

  const player = connect();
  player.emit('joinRoom', { roomId, playerName: 'Временный' });
  await waitFor(player, 'roomJoined');
  await wait(300);

  await test('Игрок отключается → пока в списке (отложенное удаление)', async () => {
    player.disconnect();
    await wait(500);
    // Запрашиваем health — комната должна существовать
    const http = require('http');
    const data = await new Promise((resolve, reject) => {
      http.get(`${URL}/api/health`, res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });
    if (data.rooms < 1) throw new Error('Комната удалена слишком рано');
  });

  await cleanup(host);
}

async function testCloseRoom() {
  console.log('\n=== 13. Закрытие комнаты ===');
  const host = connect();
  host.emit('createRoom', 'CloseHost');
  const { roomId } = await waitFor(host, 'roomCreated');
  await waitFor(host, 'updatePlayers');

  const player = connect();
  player.emit('joinRoom', { roomId, playerName: 'Закрываемый' });
  await waitFor(player, 'roomJoined');

  await test('closeRoom → все получают gameEnded', async () => {
    const endPromise = waitFor(player, 'gameEnded', 5000);
    host.emit('closeRoom');
    const data = await endPromise;
    if (!data.message.includes('закрыл')) throw new Error(`Сообщение: ${data.message}`);
  });

  await cleanup(host, player);
}

async function testGameStartAndPhases() {
  console.log('\n=== 14. Полный цикл: старт → ночь → день ===');
  const host = connect();
  host.emit('createRoom', 'FullCycle');
  const { roomId } = await waitFor(host, 'roomCreated');

  const players = [];
  for (let i = 0; i < 5; i++) {
    const p = connect();
    p.emit('joinRoom', { roomId, playerName: `Cycle${i}` });
    await waitFor(p, 'roomJoined');
    players.push(p);
  }
  await wait(300);

  await test('Игра стартует → ночная фаза', async () => {
    const phasePromise = waitFor(players[0], 'phaseChange', 5000);
    host.emit('startGame', { mafia: 1, godfather: 0, maniac: 0, doctor: 1, detective: 1 });
    await waitFor(players[0], 'gameStarted', 5000);
    const phase = await phasePromise;
    if (phase.state !== 'night') throw new Error(`phase.state=${phase.state}`);
  });

  await test('Ведущий принудительно переводит в день', async () => {
    await wait(500);
    const phasePromise = waitFor(players[0], 'phaseChange', 5000);
    host.emit('hostAdvancePhase');
    const phase = await phasePromise;
    if (phase.state !== 'day') throw new Error(`Ожидалось day, получено ${phase.state}`);
  });

  await cleanup(host, ...players);
}

async function testHostReconnectDuringGame() {
  console.log('\n=== 15. Реконнект ведущего во время игры ===');
  const host = connect();
  host.emit('createRoom', 'GameReconn');
  const { roomId, token } = await waitFor(host, 'roomCreated');

  const players = [];
  for (let i = 0; i < 4; i++) {
    const p = connect();
    p.emit('joinRoom', { roomId, playerName: `GR${i}` });
    await waitFor(p, 'roomJoined');
    players.push(p);
  }
  await wait(300);

  host.emit('startGame', { mafia: 1, godfather: 0, maniac: 0, doctor: 1, detective: 0 });
  await waitFor(host, 'narratorGameStarted', 5000);
  await wait(300);

  await test('Ведущий реконнектится во время ночи → получает narratorPlayers', async () => {
    host.disconnect();
    await wait(500);
    const host2 = connect();
    host2.emit('rejoinRoom', { roomId, playerName: 'GameReconn', token });
    const data = await waitFor(host2, 'rejoinSuccess', 5000);
    if (data.gameState !== 'night') throw new Error(`gameState=${data.gameState}`);
    if (!data.narratorPlayers || data.narratorPlayers.length !== 4)
      throw new Error(`narratorPlayers: ${data.narratorPlayers?.length}`);
    host2.disconnect();
  });

  await cleanup(...players);
}

// ============= MAIN =============

async function main() {
  console.log('🎮 Тестирование лобби Mafia Game');
  console.log('================================\n');
  const startTime = Date.now();

  await testCreateRoom();
  await testJoinRoom();
  await testBots();
  await testHostReconnectLobby();
  await testPlayerReconnectLobby();
  await testPingCheck();
  await testRoleConfig();
  await testStartGameMinPlayers();
  await testLeaveRoom();
  await testConcurrentReconnects();
  await testHealthEndpoint();
  await testLobbyTimeoutDisconnect();
  await testCloseRoom();
  await testGameStartAndPhases();
  await testHostReconnectDuringGame();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n================================');
  console.log(`Результат: ${passed}/${total} passed, ${failed} failed (${elapsed}s)`);
  console.log('================================');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
