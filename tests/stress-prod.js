// tests/stress-prod.js — 20-минутный стресс-тест продакшена mafia1.ru
// Симулирует разных игроков с разным поведением:
// - Стабильные клиенты (сидят в лобби)
// - Нестабильные (disconnect/reconnect каждые 10-30с)
// - Быстрые F5 (disconnect + мгновенный rejoin)
// - Создатели комнат (хосты)
// - Входящие/выходящие (join → leave → join)

const { io } = require('socket.io-client');

const PROD_URL = process.env.PROD_URL || 'https://mafia1.ru';
const TEST_DURATION_MS = parseInt(process.env.TEST_DURATION) || 20 * 60 * 1000;
const httpModule = PROD_URL.startsWith('https') ? require('https') : require('http');
const REPORT_INTERVAL_MS = 60 * 1000; // отчёт каждую минуту

const OPTS = {
  reconnection: false,
  timeout: 15000,
  transports: ['websocket', 'polling']
};

// Статистика
const stats = {
  roomsCreated: 0,
  roomsCreateFailed: 0,
  joins: 0,
  joinFails: 0,
  reconnects: 0,
  reconnectFails: 0,
  disconnects: 0,
  pings: 0,
  pingTotal: 0,
  pingMax: 0,
  pingMin: Infinity,
  errors: [],
  startTime: Date.now(),
  botsAdded: 0,
  gamesStarted: 0,
  phaseChanges: 0,
  hostReconnectsLobby: 0,
  hostReconnectsGame: 0
};

function connect() {
  return io(PROD_URL, { ...OPTS, forceNew: true });
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function waitFor(socket, event, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${event}`)), timeout);
    socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
  });
}

function logError(context, err) {
  const msg = `[${context}] ${err.message || err}`;
  stats.errors.push({ time: Date.now(), msg });
  if (stats.errors.length > 100) stats.errors.shift();
}

// === Сценарий 1: Создание комнаты + боты + старт игры ===
async function scenarioFullGame(roomNum) {
  const host = connect();
  const label = `Room${roomNum}`;

  try {
    host.emit('createRoom', `Host_${label}`);
    const { roomId, token } = await waitFor(host, 'roomCreated');
    stats.roomsCreated++;

    // Добавляем 3-4 ботов
    const botCount = rand(3, 4);
    for (let i = 0; i < botCount; i++) {
      host.emit('addBot');
      stats.botsAdded++;
      await wait(300);
    }
    await wait(500);

    // Один реальный игрок
    const player = connect();
    player.emit('joinRoom', { roomId, playerName: `Player_${label}` });
    const joinData = await waitFor(player, 'roomJoined');
    stats.joins++;
    const playerToken = joinData.token;

    await wait(1000);

    // Старт игры
    host.emit('startGame', { mafia: 1, godfather: 0, maniac: 0, doctor: 1, detective: 1 });
    await waitFor(host, 'narratorGameStarted', 10000);
    await waitFor(player, 'gameStarted', 10000);
    stats.gamesStarted++;

    // Пинг-мониторинг
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(), 5000);
        host.emit('ping_check', () => {
          clearTimeout(timer);
          const lat = Date.now() - start;
          stats.pings++;
          stats.pingTotal += lat;
          if (lat > stats.pingMax) stats.pingMax = lat;
          if (lat < stats.pingMin) stats.pingMin = lat;
          resolve();
        });
      });
      await wait(2000);
    }

    // Симуляция хост-реконнекта во время игры
    host.disconnect();
    stats.disconnects++;
    await wait(1000);

    const host2 = connect();
    host2.emit('rejoinRoom', { roomId, playerName: `Host_${label}`, token });
    try {
      const data = await waitFor(host2, 'rejoinSuccess', 10000);
      if (data.narratorPlayers) stats.hostReconnectsGame++;
      stats.reconnects++;

      // Переключаем фазу
      await wait(500);
      host2.emit('hostAdvancePhase');
      await wait(2000);
      stats.phaseChanges++;

      // Завершаем игру
      host2.emit('endGame');
      await wait(500);
      host2.disconnect();
    } catch (e) {
      stats.reconnectFails++;
      logError('hostReconnGame', e);
      host2.disconnect();
    }

    player.disconnect();
    stats.disconnects += 2;
  } catch (e) {
    stats.roomsCreateFailed++;
    logError('fullGame', e);
    host.disconnect();
  }
}

// === Сценарий 2: Лобби реконнект (хост F5) ===
async function scenarioHostLobbyReconnect(n) {
  const host = connect();
  try {
    host.emit('createRoom', `LobbyReconn_${n}`);
    const { roomId, token } = await waitFor(host, 'roomCreated');
    stats.roomsCreated++;

    // Добавим игрока
    const player = connect();
    player.emit('joinRoom', { roomId, playerName: `LP_${n}` });
    await waitFor(player, 'roomJoined');
    stats.joins++;

    await wait(rand(500, 2000));

    // Хост F5
    host.disconnect();
    stats.disconnects++;
    await wait(rand(300, 1000));

    const host2 = connect();
    host2.emit('rejoinRoom', { roomId, playerName: `LobbyReconn_${n}`, token });
    try {
      const data = await waitFor(host2, 'rejoinSuccess', 10000);
      if (data.gameState === 'lobby' && data.isHost) {
        stats.hostReconnectsLobby++;
      }
      stats.reconnects++;
      host2.disconnect();
    } catch (e) {
      stats.reconnectFails++;
      logError('hostLobbyReconn', e);
      host2.disconnect();
    }

    // Закрываем
    player.disconnect();
    stats.disconnects += 2;
  } catch (e) {
    logError('lobbyReconn', e);
    host.disconnect();
  }
}

// === Сценарий 3: Игрок F5 в лобби ===
async function scenarioPlayerLobbyReconnect(n) {
  const host = connect();
  try {
    host.emit('createRoom', `PLR_${n}`);
    const { roomId } = await waitFor(host, 'roomCreated');
    stats.roomsCreated++;

    const player = connect();
    player.emit('joinRoom', { roomId, playerName: `PLR_Player_${n}` });
    const joinData = await waitFor(player, 'roomJoined');
    stats.joins++;
    const playerToken = joinData.token;

    await wait(rand(500, 1500));

    // F5
    player.disconnect();
    stats.disconnects++;
    await wait(rand(200, 800));

    const player2 = connect();
    player2.emit('rejoinRoom', { roomId, playerName: `PLR_Player_${n}`, token: playerToken });
    try {
      await waitFor(player2, 'rejoinSuccess', 10000);
      stats.reconnects++;
      player2.disconnect();
    } catch (e) {
      stats.reconnectFails++;
      logError('playerLobbyReconn', e);
      player2.disconnect();
    }

    host.emit('closeRoom');
    await wait(300);
    host.disconnect();
    stats.disconnects += 2;
  } catch (e) {
    logError('playerReconn', e);
    host.disconnect();
  }
}

// === Сценарий 4: Нестабильный клиент (multiple disconnect/reconnect) ===
async function scenarioUnstableClient(n) {
  const host = connect();
  try {
    host.emit('createRoom', `Unstable_${n}`);
    const { roomId, token } = await waitFor(host, 'roomCreated');
    stats.roomsCreated++;

    // 3 бота
    for (let i = 0; i < 3; i++) {
      host.emit('addBot');
      stats.botsAdded++;
      await wait(300);
    }

    // Один игрок, который будет отваливаться
    const player = connect();
    player.emit('joinRoom', { roomId, playerName: `Unstable_P_${n}` });
    const joinData = await waitFor(player, 'roomJoined');
    stats.joins++;

    await wait(500);

    // Старт
    host.emit('startGame', { mafia: 1, godfather: 0, maniac: 0, doctor: 1, detective: 0 });
    await waitFor(host, 'narratorGameStarted', 10000);
    stats.gamesStarted++;

    // 3 цикла disconnect/reconnect игрока
    let currentPlayer = player;
    let currentToken = joinData.token;
    for (let cycle = 0; cycle < 3; cycle++) {
      await wait(rand(1000, 3000));
      currentPlayer.disconnect();
      stats.disconnects++;
      await wait(rand(500, 2000));

      const newPlayer = connect();
      newPlayer.emit('rejoinRoom', { roomId, playerName: `Unstable_P_${n}`, token: currentToken });
      try {
        await waitFor(newPlayer, 'rejoinSuccess', 10000);
        stats.reconnects++;
        currentPlayer = newPlayer;
      } catch (e) {
        stats.reconnectFails++;
        logError(`unstableCycle${cycle}`, e);
        newPlayer.disconnect();
        break;
      }
    }

    // Завершаем
    host.emit('endGame');
    await wait(500);
    host.disconnect();
    if (currentPlayer.connected) currentPlayer.disconnect();
    stats.disconnects += 2;
  } catch (e) {
    logError('unstable', e);
    host.disconnect();
  }
}

// === Сценарий 5: Массовый ping-тест ===
async function scenarioPingStress() {
  const client = connect();
  try {
    for (let i = 0; i < 20; i++) {
      const start = Date.now();
      await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(), 5000);
        client.emit('ping_check', () => {
          clearTimeout(timer);
          const lat = Date.now() - start;
          stats.pings++;
          stats.pingTotal += lat;
          if (lat > stats.pingMax) stats.pingMax = lat;
          if (lat < stats.pingMin) stats.pingMin = lat;
          resolve();
        });
      });
      await wait(500);
    }
  } catch (e) {
    logError('pingStress', e);
  }
  client.disconnect();
}

// === Отчёт ===
function printReport() {
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
  const avgPing = stats.pings > 0 ? (stats.pingTotal / stats.pings).toFixed(0) : '-';
  console.log(`
--- Отчёт [${elapsed}s / ${(TEST_DURATION_MS / 1000)}s] ---
Комнаты: ${stats.roomsCreated} создано, ${stats.roomsCreateFailed} ошибок
Входы: ${stats.joins} join, ${stats.joinFails} ошибок
Реконнекты: ${stats.reconnects} OK, ${stats.reconnectFails} FAIL
  Хост лобби: ${stats.hostReconnectsLobby}
  Хост игра: ${stats.hostReconnectsGame}
Disconnect: ${stats.disconnects}
Боты: ${stats.botsAdded}
Игры: ${stats.gamesStarted} стартов, ${stats.phaseChanges} фаз
Пинг: avg=${avgPing}ms, min=${stats.pingMin === Infinity ? '-' : stats.pingMin}ms, max=${stats.pingMax}ms (${stats.pings} замеров)
Ошибки: ${stats.errors.length}${stats.errors.length > 0 ? '\n  Последние: ' + stats.errors.slice(-3).map(e => e.msg).join('; ') : ''}
---`);
}

// === MAIN ===
async function main() {
  console.log(`🎮 Стресс-тест mafia1.ru (20 минут)`);
  console.log(`URL: ${PROD_URL}`);
  console.log(`Старт: ${new Date().toLocaleTimeString('ru-RU')}\n`);

  // Проверка соединения
  try {
    const http = httpModule;
    await new Promise((resolve, reject) => {
      http.get(`${PROD_URL}/api/health`, res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          console.log('Health:', body);
          resolve();
        });
      }).on('error', reject);
    });
  } catch (e) {
    console.error('Сервер недоступен:', e.message);
    process.exit(1);
  }

  // Периодический отчёт
  const reportTimer = setInterval(printReport, REPORT_INTERVAL_MS);

  const startTime = Date.now();
  let roundNum = 0;

  while (Date.now() - startTime < TEST_DURATION_MS) {
    roundNum++;
    console.log(`\n🔄 Раунд ${roundNum} (${Math.round((Date.now() - startTime) / 1000)}s)...`);

    // Запускаем сценарии параллельно (2-3 за раунд)
    const scenarios = [];

    // Полная игра
    scenarios.push(scenarioFullGame(roundNum));

    // Хост F5 в лобби
    scenarios.push(scenarioHostLobbyReconnect(roundNum));

    // Игрок F5 в лобби
    scenarios.push(scenarioPlayerLobbyReconnect(roundNum));

    // Каждый 3-й раунд — нестабильный клиент
    if (roundNum % 3 === 0) {
      scenarios.push(scenarioUnstableClient(roundNum));
    }

    // Каждый 5-й раунд — пинг-стресс
    if (roundNum % 5 === 0) {
      scenarios.push(scenarioPingStress());
    }

    await Promise.all(scenarios);

    // Пауза между раундами (5-15с)
    await wait(rand(5000, 15000));
  }

  clearInterval(reportTimer);
  console.log('\n\n========== ИТОГОВЫЙ ОТЧЁТ ==========');
  printReport();

  // Финальная проверка health
  try {
    const http = httpModule;
    const health = await new Promise((resolve, reject) => {
      http.get(`${PROD_URL}/api/health`, res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });
    console.log(`\nСервер после теста: uptime=${health.uptime}s, rooms=${health.rooms}, memory=${health.memory.rss}`);
    if (health.status !== 'ok') {
      console.error('⚠️  Сервер НЕ OK!');
      process.exit(1);
    }
  } catch (e) {
    console.error('⚠️  Сервер недоступен после теста:', e.message);
    process.exit(1);
  }

  const exitCode = stats.reconnectFails > stats.reconnects * 0.1 ? 1 : 0;
  console.log(exitCode === 0 ? '\n✅ Тест пройден' : '\n❌ Слишком много ошибок реконнекта');
  process.exit(exitCode);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
