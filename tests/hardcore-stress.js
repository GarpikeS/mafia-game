// tests/hardcore-stress.js — Жёсткий стресс-тест производительности
// Тестирует пределы сервера:
// - Массовое создание комнат (до 50)
// - Массовый вход (10+ игроков в комнату)
// - Burst-подключения (50 одновременных connect)
// - Быстрые F5 (disconnect+rejoin < 100ms)
// - Нагрузка на память (создать, наполнить, удалить, повторить)
// - Ping под нагрузкой
// - Rate limiter (спам событиями)

const { io } = require('socket.io-client');
const http = require('http');

const URL = process.env.PROD_URL || 'http://127.0.0.1:5000';
const DURATION_MS = parseInt(process.env.TEST_DURATION) || 5 * 60 * 1000;

function conn() {
  return io(URL, { reconnection: false, forceNew: true, timeout: 15000, transports: ['polling'] });
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function waitFor(s, ev, t = 10000) {
  return new Promise((res, rej) => {
    const tm = setTimeout(() => rej(new Error(`Timeout: ${ev}`)), t);
    s.once(ev, d => { clearTimeout(tm); res(d); });
  });
}
function getHealth() {
  return new Promise((res, rej) => {
    http.get(`${URL}/api/health`, r => {
      let b = ''; r.on('data', d => b += d);
      r.on('end', () => { try { res(JSON.parse(b)); } catch(e) { rej(e); } });
    }).on('error', rej);
  });
}

const stats = {
  connects: 0, connectFails: 0,
  rooms: 0, roomFails: 0,
  joins: 0, joinFails: 0,
  reconnects: 0, reconnectFails: 0,
  games: 0, gameFails: 0,
  pings: 0, pingTotal: 0, pingMin: Infinity, pingMax: 0,
  rateLimited: 0,
  errors: [],
  peakRooms: 0, peakPlayers: 0, peakMemory: 0,
  start: Date.now()
};
function logErr(ctx, e) {
  stats.errors.push(`[${ctx}] ${e.message || e}`);
  if (stats.errors.length > 50) stats.errors.shift();
}

// === ТЕСТ 1: Burst-подключения (50 одновременных) ===
async function testBurstConnect(count = 50) {
  console.log(`  [burst] ${count} одновременных подключений...`);
  const sockets = [];
  const promises = [];
  for (let i = 0; i < count; i++) {
    const s = conn();
    sockets.push(s);
    promises.push(
      waitFor(s, 'connect', 15000)
        .then(() => { stats.connects++; })
        .catch(e => { stats.connectFails++; logErr('burst', e); })
    );
  }
  await Promise.all(promises);
  // Disconnect all
  sockets.forEach(s => { try { s.disconnect(); } catch(e) {} });
  console.log(`  [burst] OK: ${stats.connects} подключений, ${stats.connectFails} ошибок`);
}

// === ТЕСТ 2: Массовое создание комнат ===
async function testMassRoomCreation(count = 30) {
  console.log(`  [rooms] Создание ${count} комнат...`);
  const sockets = [];
  const roomIds = [];
  for (let i = 0; i < count; i++) {
    try {
      const s = conn();
      await waitFor(s, 'connect', 10000);
      s.emit('createRoom', `StressHost_${i}`);
      const d = await waitFor(s, 'roomCreated', 10000);
      stats.rooms++;
      roomIds.push(d.roomId);
      sockets.push(s);
    } catch(e) {
      stats.roomFails++;
      logErr('massRoom', e);
    }
  }
  // Check health
  const h = await getHealth();
  stats.peakRooms = Math.max(stats.peakRooms, h.rooms);
  stats.peakMemory = Math.max(stats.peakMemory, parseInt(h.memory.rss));
  console.log(`  [rooms] ${stats.rooms} создано, сервер: ${h.rooms} комнат, ${h.memory.rss}`);
  // Cleanup
  sockets.forEach(s => { try { s.disconnect(); } catch(e) {} });
  return roomIds;
}

// === ТЕСТ 3: Массовый вход в одну комнату (15 игроков) ===
async function testMassJoin(playerCount = 15) {
  console.log(`  [join] ${playerCount} игроков в одну комнату...`);
  const host = conn();
  await waitFor(host, 'connect');
  host.emit('createRoom', 'MassJoinHost');
  const { roomId } = await waitFor(host, 'roomCreated');
  stats.rooms++;

  const players = [];
  let joined = 0;
  for (let i = 0; i < playerCount; i++) {
    try {
      const p = conn();
      await waitFor(p, 'connect', 10000);
      p.emit('joinRoom', { roomId, playerName: `MJ_${i}` });
      await waitFor(p, 'roomJoined', 10000);
      stats.joins++;
      joined++;
      players.push(p);
    } catch(e) {
      stats.joinFails++;
      logErr('massJoin', e);
    }
  }
  const h = await getHealth();
  stats.peakPlayers = Math.max(stats.peakPlayers, h.totalPlayers);
  console.log(`  [join] ${joined}/${playerCount} вошли, сервер: ${h.totalPlayers} игроков`);
  players.forEach(p => { try { p.disconnect(); } catch(e) {} });
  host.disconnect();
}

// === ТЕСТ 4: Rapid F5 (отключение + реконнект < 200ms) ===
async function testRapidF5(cycles = 20) {
  console.log(`  [f5] ${cycles} rapid F5 циклов...`);
  const host = conn();
  await waitFor(host, 'connect');
  host.emit('createRoom', 'F5Host');
  const { roomId, token } = await waitFor(host, 'roomCreated');
  stats.rooms++;

  let currentHost = host;
  for (let i = 0; i < cycles; i++) {
    currentHost.disconnect();
    await wait(rand(50, 200)); // очень быстрый F5
    const h2 = conn();
    try {
      await waitFor(h2, 'connect', 10000);
      h2.emit('rejoinRoom', { roomId, playerName: 'F5Host', token });
      await waitFor(h2, 'rejoinSuccess', 10000);
      stats.reconnects++;
      currentHost = h2;
    } catch(e) {
      stats.reconnectFails++;
      logErr(`rapidF5_${i}`, e);
      h2.disconnect();
      break;
    }
  }
  currentHost.disconnect();
  console.log(`  [f5] ${stats.reconnects} OK, ${stats.reconnectFails} FAIL`);
}

// === ТЕСТ 5: Ping под нагрузкой ===
async function testPingUnderLoad() {
  console.log(`  [ping] Ping при 10 активных комнатах...`);
  // Создаём 10 комнат с ботами
  const hosts = [];
  for (let i = 0; i < 10; i++) {
    try {
      const h = conn();
      await waitFor(h, 'connect', 10000);
      h.emit('createRoom', `PingHost_${i}`);
      await waitFor(h, 'roomCreated', 10000);
      for (let j = 0; j < 3; j++) h.emit('addBot');
      hosts.push(h);
    } catch(e) { logErr('pingSetup', e); }
  }
  await wait(1000);

  // Замеряем ping
  const pingSocket = conn();
  await waitFor(pingSocket, 'connect');
  for (let i = 0; i < 50; i++) {
    const start = Date.now();
    await new Promise(resolve => {
      const tm = setTimeout(resolve, 5000);
      pingSocket.emit('ping_check', () => {
        clearTimeout(tm);
        const lat = Date.now() - start;
        stats.pings++;
        stats.pingTotal += lat;
        if (lat < stats.pingMin) stats.pingMin = lat;
        if (lat > stats.pingMax) stats.pingMax = lat;
        resolve();
      });
    });
    await wait(100);
  }
  pingSocket.disconnect();
  hosts.forEach(h => { try { h.disconnect(); } catch(e) {} });

  const avg = stats.pings > 0 ? (stats.pingTotal / stats.pings).toFixed(1) : '-';
  console.log(`  [ping] avg=${avg}ms min=${stats.pingMin}ms max=${stats.pingMax}ms (${stats.pings} замеров)`);
}

// === ТЕСТ 6: Rate limiter ===
async function testRateLimiter() {
  console.log(`  [rate] Спам 100 событий за 1 секунду...`);
  const s = conn();
  await waitFor(s, 'connect');
  let errors = 0;
  s.on('error', () => { errors++; stats.rateLimited++; });

  // Спамим createRoom 100 раз за 1 секунду
  for (let i = 0; i < 100; i++) {
    s.emit('createRoom', `Spam_${i}`);
  }
  await wait(3000);
  s.disconnect();
  console.log(`  [rate] ${errors} отклонено rate limiter-ом`);
}

// === ТЕСТ 7: Полный цикл игры (create→bots→start→phases→end) × N ===
async function testGameCycles(count = 5) {
  console.log(`  [game] ${count} полных циклов игры...`);
  for (let i = 0; i < count; i++) {
    try {
      const h = conn();
      await waitFor(h, 'connect', 10000);
      h.emit('createRoom', `GameCycle_${i}`);
      const { roomId } = await waitFor(h, 'roomCreated', 10000);

      // Add player + bots
      const p = conn();
      await waitFor(p, 'connect', 10000);
      p.emit('joinRoom', { roomId, playerName: `GC_P_${i}` });
      await waitFor(p, 'roomJoined', 10000);
      stats.joins++;

      for (let j = 0; j < 4; j++) { h.emit('addBot'); await wait(200); }
      await wait(500);

      h.emit('startGame', { mafia: 2, godfather: 0, maniac: 0, doctor: 1, detective: 1 });
      await waitFor(h, 'narratorGameStarted', 15000);
      stats.games++;

      // Advance a few phases
      for (let ph = 0; ph < 3; ph++) {
        h.emit('hostAdvancePhase');
        await wait(1000);
      }

      h.emit('endGame');
      await wait(300);
      h.disconnect(); p.disconnect();
    } catch(e) {
      stats.gameFails++;
      logErr(`gameCycle_${i}`, e);
    }
  }
  console.log(`  [game] ${stats.games} OK, ${stats.gameFails} FAIL`);
}

// === ТЕСТ 8: Memory leak check (create/fill/destroy циклы) ===
async function testMemoryLeak(cycles = 10) {
  console.log(`  [mem] ${cycles} циклов create/fill/destroy...`);
  const memBefore = await getHealth();

  for (let i = 0; i < cycles; i++) {
    const h = conn();
    await waitFor(h, 'connect', 10000);
    h.emit('createRoom', `MemLeak_${i}`);
    const { roomId } = await waitFor(h, 'roomCreated', 10000);

    // Add 10 bots
    for (let j = 0; j < 10; j++) h.emit('addBot');
    await wait(500);

    // Start + end immediately
    h.emit('startGame', { mafia: 3, godfather: 0, maniac: 0, doctor: 1, detective: 1 });
    try { await waitFor(h, 'narratorGameStarted', 10000); } catch(e) {}
    h.emit('endGame');
    await wait(200);
    h.emit('closeRoom');
    await wait(200);
    h.disconnect();
  }

  // Force GC wait
  await wait(2000);
  const memAfter = await getHealth();
  const before = parseInt(memBefore.memory.rss);
  const after = parseInt(memAfter.memory.rss);
  const diff = after - before;
  console.log(`  [mem] RSS: ${before}MB → ${after}MB (${diff > 0 ? '+' : ''}${diff}MB), rooms: ${memAfter.rooms}`);
}

// === ТЕСТ 9: Concurrent operations (всё одновременно) ===
async function testConcurrent() {
  console.log(`  [concurrent] 20 комнат + joins + reconnects одновременно...`);
  const tasks = [];

  for (let i = 0; i < 20; i++) {
    tasks.push((async () => {
      try {
        const h = conn();
        await waitFor(h, 'connect', 15000);
        h.emit('createRoom', `Conc_${i}`);
        const { roomId, token } = await waitFor(h, 'roomCreated', 15000);
        stats.rooms++;

        // Add 2 players
        const p1 = conn(); await waitFor(p1, 'connect', 10000);
        p1.emit('joinRoom', { roomId, playerName: `CP1_${i}` });
        await waitFor(p1, 'roomJoined', 10000);
        stats.joins++;

        const p2 = conn(); await waitFor(p2, 'connect', 10000);
        p2.emit('joinRoom', { roomId, playerName: `CP2_${i}` });
        await waitFor(p2, 'roomJoined', 10000);
        stats.joins++;

        // Host F5
        h.disconnect();
        await wait(rand(100, 500));
        const h2 = conn(); await waitFor(h2, 'connect', 10000);
        h2.emit('rejoinRoom', { roomId, playerName: `Conc_${i}`, token });
        await waitFor(h2, 'rejoinSuccess', 10000);
        stats.reconnects++;

        h2.disconnect(); p1.disconnect(); p2.disconnect();
      } catch(e) {
        logErr(`concurrent_${i}`, e);
      }
    })());
  }

  await Promise.all(tasks);
  const h = await getHealth();
  stats.peakRooms = Math.max(stats.peakRooms, h.rooms);
  console.log(`  [concurrent] Done. Server: ${h.rooms} rooms, ${h.memory.rss}`);
}

// === MAIN ===
async function main() {
  console.log(`\n🔥 HARDCORE STRESS TEST`);
  console.log(`URL: ${URL}`);
  console.log(`Duration: ${DURATION_MS / 1000}s\n`);

  const h0 = await getHealth();
  console.log(`Сервер до теста: uptime=${h0.uptime}s, rooms=${h0.rooms}, memory=${h0.memory.rss}\n`);

  const startTime = Date.now();
  let round = 0;

  while (Date.now() - startTime < DURATION_MS) {
    round++;
    console.log(`\n━━━ Раунд ${round} (${Math.round((Date.now() - startTime) / 1000)}s) ━━━`);

    await testBurstConnect(50);
    await testMassRoomCreation(20);
    await testMassJoin(15);
    await testRapidF5(20);
    await testPingUnderLoad();
    await testRateLimiter();
    await testGameCycles(3);
    await testMemoryLeak(5);
    await testConcurrent();

    // Health snapshot
    try {
      const h = await getHealth();
      stats.peakRooms = Math.max(stats.peakRooms, h.rooms);
      stats.peakMemory = Math.max(stats.peakMemory, parseInt(h.memory.rss));
      console.log(`\n📊 Health: rooms=${h.rooms}, players=${h.totalPlayers}, mem=${h.memory.rss}`);
    } catch(e) {
      console.log(`\n⚠ Health check failed: ${e.message}`);
    }
  }

  // === ИТОГ ===
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const avgPing = stats.pings > 0 ? (stats.pingTotal / stats.pings).toFixed(1) : '-';
  const hFinal = await getHealth().catch(() => null);

  console.log(`
╔══════════════════════════════════════╗
║     ИТОГОВЫЙ ОТЧЁТ (${elapsed}s, ${round} раундов)
╠══════════════════════════════════════╣
║ Подключения: ${stats.connects} OK, ${stats.connectFails} FAIL
║ Комнаты:     ${stats.rooms} создано, ${stats.roomFails} ошибок
║ Входы:       ${stats.joins} OK, ${stats.joinFails} FAIL
║ Реконнекты:  ${stats.reconnects} OK, ${stats.reconnectFails} FAIL
║ Игры:        ${stats.games} OK, ${stats.gameFails} FAIL
║ Ping:        avg=${avgPing}ms min=${stats.pingMin}ms max=${stats.pingMax}ms
║ Rate limit:  ${stats.rateLimited} отклонено
║ Пики:        ${stats.peakRooms} комнат, ${stats.peakMemory}MB RAM
║ Ошибки:      ${stats.errors.length} всего
╚══════════════════════════════════════╝`);

  if (stats.errors.length > 0) {
    console.log('\nПоследние ошибки:');
    stats.errors.slice(-10).forEach(e => console.log('  ' + e));
  }

  if (hFinal) {
    console.log(`\nСервер после теста: uptime=${hFinal.uptime}s, rooms=${hFinal.rooms}, mem=${hFinal.memory.rss}`);
    if (hFinal.status !== 'ok') { console.log('СЕРВЕР НЕ OK!'); process.exit(1); }
  }

  const failRate = stats.reconnects > 0 ? stats.reconnectFails / (stats.reconnects + stats.reconnectFails) : 0;
  const pass = failRate < 0.1 && stats.connectFails < stats.connects * 0.05;
  console.log(pass ? '\n✅ ТЕСТ ПРОЙДЕН' : '\n❌ ТЕСТ НЕ ПРОЙДЕН');
  process.exit(pass ? 0 : 1);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
