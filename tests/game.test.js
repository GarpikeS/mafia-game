// tests/game.test.js — Базовые тесты для mafia-game

const { createRoom, getRoom, deleteRoom, saveDisconnectedPlayer, tryReconnect, rooms, disconnectedPlayers, emitToHost, replayNarratorQueue, stripPrivateFields } = require('../server/game/GameRoom');
const { assignRoles } = require('../server/game/RoleManager');
const { checkWinCondition } = require('../server/game/WinCondition');
const { ROLES } = require('../server/config');

// Хелпер: создать мок-игрока
function mockPlayer(id, name) {
  return { id, name: name || `Player${id}`, role: null, isBot: false };
}

// Хелпер: создать N мок-игроков
function mockPlayers(count) {
  return Array.from({ length: count }, (_, i) => mockPlayer(`p${i + 1}`, `Player${i + 1}`));
}

// ============================================================
// GameRoom
// ============================================================
describe('GameRoom', () => {
  beforeEach(() => {
    rooms.clear();
    disconnectedPlayers.clear();
  });

  afterEach(() => {
    // Очистка таймеров реконнекта
    for (const [, data] of disconnectedPlayers) {
      if (data.timerId) clearTimeout(data.timerId);
    }
    disconnectedPlayers.clear();
    rooms.clear();
  });

  test('createRoom создаёт комнату с правильными полями', () => {
    const room = createRoom('TestHost');

    expect(room).toBeDefined();
    expect(room.id).toBeDefined();
    expect(typeof room.id).toBe('string');
    expect(room.id.length).toBe(6);
    expect(room.players).toEqual([]);
    expect(room.state).toBe('lobby');
    expect(room.hostName).toBe('TestHost');
    expect(room.host).toBeNull();
    expect(room.phase).toBe(0);
    expect(room.votes).toEqual({});
    expect(room.nightActions).toEqual({});
    expect(room.deadPlayers).toEqual(new Set());
    expect(room.lastKilled).toBeNull();
    expect(room.lastSaved).toBeNull();
    expect(room.lastChecked).toBeNull();
    expect(room.lastDoctorTarget).toBeNull();
    expect(room.botCounter).toBe(0);
    expect(room.phaseReady).toBe(false);
    expect(room.createdAt).toBeLessThanOrEqual(Date.now());
    expect(room.lastActivityAt).toBeLessThanOrEqual(Date.now());
    expect(room.pausedState).toBeNull();
    expect(room.timers).toEqual([]);
  });

  test('getRoom возвращает комнату по ID', () => {
    const room = createRoom('Host1');
    const found = getRoom(room.id);

    expect(found).toBe(room);
    expect(found.id).toBe(room.id);
    expect(found.hostName).toBe('Host1');
  });

  test('getRoom возвращает undefined для несуществующей комнаты', () => {
    const result = getRoom('NONEXIST');

    expect(result).toBeUndefined();
  });

  test('deleteRoom удаляет комнату', () => {
    const room = createRoom('Host2');
    const roomId = room.id;

    expect(getRoom(roomId)).toBeDefined();

    deleteRoom(roomId);

    expect(getRoom(roomId)).toBeUndefined();
  });

  test('rooms.size меняется при создании/удалении', () => {
    expect(rooms.size).toBe(0);

    const room1 = createRoom('Host1');
    expect(rooms.size).toBe(1);

    const room2 = createRoom('Host2');
    expect(rooms.size).toBe(2);

    deleteRoom(room1.id);
    expect(rooms.size).toBe(1);

    deleteRoom(room2.id);
    expect(rooms.size).toBe(0);
  });
});

// ============================================================
// RoleManager
// ============================================================
describe('RoleManager', () => {
  test('assignRoles назначает роли всем игрокам', () => {
    const players = mockPlayers(6);
    const result = assignRoles(players, { mafia: 1, doctor: 1, detective: 1 });

    expect(result.length).toBe(6);
    result.forEach(player => {
      expect(player.role).toBeDefined();
      expect(player.role).not.toBeNull();
      expect([ROLES.MAFIA, ROLES.DOCTOR, ROLES.DETECTIVE, ROLES.CIVILIAN]).toContain(player.role);
    });
  });

  test('assignRoles с config {mafia:1, doctor:1, detective:1} — правильное количество каждой роли', () => {
    const players = mockPlayers(6);
    const result = assignRoles(players, { mafia: 1, doctor: 1, detective: 1 });

    const mafiaCount = result.filter(p => p.role === ROLES.MAFIA).length;
    const doctorCount = result.filter(p => p.role === ROLES.DOCTOR).length;
    const detectiveCount = result.filter(p => p.role === ROLES.DETECTIVE).length;
    const civilianCount = result.filter(p => p.role === ROLES.CIVILIAN).length;

    expect(mafiaCount).toBe(1);
    expect(doctorCount).toBe(1);
    expect(detectiveCount).toBe(1);
    expect(civilianCount).toBe(3);
  });

  test('assignRoles — свободная конфигурация ролей (лимиты сняты)', () => {
    const players = mockPlayers(6);
    // Лимиты ролей убраны — 5 мафий на 6 игроков допустимо
    const result = assignRoles(players, { mafia: 5, doctor: 0, detective: 0 });

    const mafiaCount = result.filter(p => p.role === ROLES.MAFIA).length;
    expect(mafiaCount).toBe(5);
  });

  test('assignRoles — при 4 игроках и config {mafia:1, doctor:0, detective:0} — 1 мафия, 3 мирных', () => {
    const players = mockPlayers(4);
    const result = assignRoles(players, { mafia: 1, doctor: 0, detective: 0 });

    const mafiaCount = result.filter(p => p.role === ROLES.MAFIA).length;
    const civilianCount = result.filter(p => p.role === ROLES.CIVILIAN).length;

    expect(mafiaCount).toBe(1);
    expect(civilianCount).toBe(3);
  });

  test('assignRoles — при 6 игроках и config {mafia:2, doctor:1, detective:1} — правильное распределение', () => {
    const players = mockPlayers(6);
    const result = assignRoles(players, { mafia: 2, doctor: 1, detective: 1 });

    const mafiaCount = result.filter(p => p.role === ROLES.MAFIA).length;
    const doctorCount = result.filter(p => p.role === ROLES.DOCTOR).length;
    const detectiveCount = result.filter(p => p.role === ROLES.DETECTIVE).length;
    const civilianCount = result.filter(p => p.role === ROLES.CIVILIAN).length;

    expect(mafiaCount).toBe(2);
    expect(doctorCount).toBe(1);
    expect(detectiveCount).toBe(1);
    expect(civilianCount).toBe(2);
  });

  test('Fisher-Yates: результат не всегда одинаковый (минимум 2 разных за 10 запусков)', () => {
    const players = mockPlayers(8);
    const results = [];

    for (let i = 0; i < 10; i++) {
      const result = assignRoles(
        players.map(p => ({ ...p, role: null })),
        { mafia: 2, doctor: 1, detective: 1 }
      );
      // Сохраняем порядок id как строку для сравнения
      results.push(result.map(p => p.id).join(','));
    }

    const uniqueResults = new Set(results);
    expect(uniqueResults.size).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
// WinCondition
// ============================================================
describe('WinCondition', () => {
  test('Мирные побеждают когда вся мафия мертва', () => {
    const room = {
      players: [
        { id: 'p1', name: 'Player1', role: ROLES.MAFIA },
        { id: 'p2', name: 'Player2', role: ROLES.CIVILIAN },
        { id: 'p3', name: 'Player3', role: ROLES.DOCTOR },
        { id: 'p4', name: 'Player4', role: ROLES.DETECTIVE }
      ],
      deadPlayers: new Set(['p1']) // мафия мертва
    };

    const result = checkWinCondition(room);

    expect(result).not.toBeNull();
    expect(result.winner).toBe('civilians');
    expect(result.message).toContain('Мирные жители победили');
  });

  test('Мафия побеждает когда мафия >= мирные', () => {
    const room = {
      players: [
        { id: 'p1', name: 'Player1', role: ROLES.MAFIA },
        { id: 'p2', name: 'Player2', role: ROLES.CIVILIAN },
        { id: 'p3', name: 'Player3', role: ROLES.CIVILIAN },
        { id: 'p4', name: 'Player4', role: ROLES.CIVILIAN }
      ],
      deadPlayers: new Set(['p3', 'p4']) // двое мирных мертвы: 1 мафия vs 1 мирный
    };

    const result = checkWinCondition(room);

    expect(result).not.toBeNull();
    expect(result.winner).toBe('mafia');
    expect(result.message).toContain('Мафия победила');
  });

  test('null (игра продолжается) когда ещё есть и мафия и мирные', () => {
    const room = {
      players: [
        { id: 'p1', name: 'Player1', role: ROLES.MAFIA },
        { id: 'p2', name: 'Player2', role: ROLES.CIVILIAN },
        { id: 'p3', name: 'Player3', role: ROLES.CIVILIAN },
        { id: 'p4', name: 'Player4', role: ROLES.DOCTOR }
      ],
      deadPlayers: new Set() // никто не мёртв: 1 мафия vs 3 мирных
    };

    const result = checkWinCondition(room);

    expect(result).toBeNull();
  });

  test('Нет победителя при пустых deadPlayers (все живы, игра в процессе)', () => {
    const room = {
      players: [
        { id: 'p1', name: 'Player1', role: ROLES.MAFIA },
        { id: 'p2', name: 'Player2', role: ROLES.MAFIA },
        { id: 'p3', name: 'Player3', role: ROLES.CIVILIAN },
        { id: 'p4', name: 'Player4', role: ROLES.CIVILIAN },
        { id: 'p5', name: 'Player5', role: ROLES.DOCTOR },
        { id: 'p6', name: 'Player6', role: ROLES.DETECTIVE }
      ],
      deadPlayers: new Set()
    };

    const result = checkWinCondition(room);

    // 2 мафии vs 4 мирных — игра продолжается
    expect(result).toBeNull();
  });
});

// ============================================================
// Reconnect (saveDisconnectedPlayer / tryReconnect)
// ============================================================
describe('Reconnect', () => {
  beforeEach(() => {
    rooms.clear();
    // Очищаем таймеры перед каждым тестом
    for (const [, data] of disconnectedPlayers) {
      if (data.timerId) clearTimeout(data.timerId);
    }
    disconnectedPlayers.clear();
  });

  afterEach(() => {
    for (const [, data] of disconnectedPlayers) {
      if (data.timerId) clearTimeout(data.timerId);
    }
    disconnectedPlayers.clear();
    rooms.clear();
  });

  test('saveDisconnectedPlayer сохраняет данные', () => {
    const room = createRoom('Host');
    const player = { id: 'p1', name: 'Player1', role: ROLES.CIVILIAN, isBot: false };

    saveDisconnectedPlayer(room.id, player, 'old-socket-id');

    const key = `${room.id}:${player.name}`;
    expect(disconnectedPlayers.has(key)).toBe(true);

    const data = disconnectedPlayers.get(key);
    expect(data.player.id).toBe('p1');
    expect(data.player.name).toBe('Player1');
    expect(data.socketId).toBe('old-socket-id');
    expect(data.disconnectedAt).toBeLessThanOrEqual(Date.now());
    expect(data.timerId).toBeDefined();

    // Очистка таймера
    clearTimeout(data.timerId);
  });

  test('tryReconnect возвращает данные и удаляет из хранилища', () => {
    const room = createRoom('Host');
    const player = { id: 'p1', name: 'Player1', role: ROLES.MAFIA, isBot: false };

    saveDisconnectedPlayer(room.id, player, 'socket-123');

    const result = tryReconnect(room.id, 'Player1');

    expect(result).not.toBeNull();
    expect(result.player.id).toBe('p1');
    expect(result.player.name).toBe('Player1');
    expect(result.player.role).toBe(ROLES.MAFIA);
    expect(result.socketId).toBe('socket-123');

    // Проверяем что данные удалены из хранилища
    const key = `${room.id}:Player1`;
    expect(disconnectedPlayers.has(key)).toBe(false);
  });

  test('tryReconnect возвращает null для несуществующего игрока', () => {
    const room = createRoom('Host');

    const result = tryReconnect(room.id, 'NonExistent');

    expect(result).toBeNull();
  });
});

// ============================================================
// Новые поля комнаты (hostToken, narratorQueue, phaseTransitionLocked)
// ============================================================
describe('GameRoom — новые поля', () => {
  beforeEach(() => { rooms.clear(); });
  afterEach(() => { rooms.clear(); });

  test('createRoom содержит hostToken: null', () => {
    const room = createRoom('Host');
    expect(room).toHaveProperty('hostToken');
    expect(room.hostToken).toBeNull();
  });

  test('createRoom содержит narratorQueue: []', () => {
    const room = createRoom('Host');
    expect(room).toHaveProperty('narratorQueue');
    expect(room.narratorQueue).toEqual([]);
  });

  test('createRoom содержит phaseTransitionLocked: false', () => {
    const room = createRoom('Host');
    expect(room).toHaveProperty('phaseTransitionLocked');
    expect(room.phaseTransitionLocked).toBe(false);
  });
});

// ============================================================
// stripPrivateFields — удаление приватных полей
// ============================================================
describe('stripPrivateFields', () => {
  test('удаляет token и _disconnected', () => {
    const player = { id: 'p1', name: 'Player1', role: 'civilian', isBot: false, token: 'secret-token-123', _disconnected: true };
    const clean = stripPrivateFields(player);

    expect(clean).toEqual({ id: 'p1', name: 'Player1', role: 'civilian', isBot: false });
    expect(clean).not.toHaveProperty('token');
    expect(clean).not.toHaveProperty('_disconnected');
  });

  test('работает без token и _disconnected', () => {
    const player = { id: 'p1', name: 'Player1', role: null, isBot: false };
    const clean = stripPrivateFields(player);

    expect(clean).toEqual({ id: 'p1', name: 'Player1', role: null, isBot: false });
  });

  test('не мутирует оригинальный объект', () => {
    const player = { id: 'p1', name: 'Player1', token: 'abc' };
    stripPrivateFields(player);

    expect(player.token).toBe('abc');
  });
});

// ============================================================
// emitToHost — буферизация и прямая отправка
// ============================================================
describe('emitToHost', () => {
  beforeEach(() => { rooms.clear(); });
  afterEach(() => { rooms.clear(); });

  test('при наличии host — emit напрямую', () => {
    const room = createRoom('Host');
    room.host = 'socket-host-123';

    const emitted = [];
    const mockIo = {
      to: (id) => ({
        emit: (event, data) => emitted.push({ id, event, data })
      })
    };

    emitToHost(room, mockIo, 'testEvent', { foo: 'bar' });

    expect(emitted.length).toBe(1);
    expect(emitted[0].id).toBe('socket-host-123');
    expect(emitted[0].event).toBe('testEvent');
    expect(emitted[0].data).toEqual({ foo: 'bar' });
    expect(room.narratorQueue.length).toBe(0);
  });

  test('без host — буферизация в narratorQueue', () => {
    const room = createRoom('Host');
    room.host = null;

    const emitted = [];
    const mockIo = {
      to: () => ({ emit: (event, data) => emitted.push({ event, data }) })
    };

    emitToHost(room, mockIo, 'nightAction', { actor: 'Bot1' });
    emitToHost(room, mockIo, 'nightAction', { actor: 'Bot2' });

    expect(emitted.length).toBe(0);
    expect(room.narratorQueue.length).toBe(2);
    expect(room.narratorQueue[0]).toEqual({ event: 'nightAction', data: { actor: 'Bot1' } });
    expect(room.narratorQueue[1]).toEqual({ event: 'nightAction', data: { actor: 'Bot2' } });
  });

  test('очередь ограничена 100 элементами (FIFO)', () => {
    const room = createRoom('Host');
    room.host = null;

    const mockIo = { to: () => ({ emit: () => {} }) };

    for (let i = 0; i < 110; i++) {
      emitToHost(room, mockIo, 'event', { i });
    }

    expect(room.narratorQueue.length).toBe(100);
    // Первые 10 удалены, первый элемент — i=10
    expect(room.narratorQueue[0].data.i).toBe(10);
    expect(room.narratorQueue[99].data.i).toBe(109);
  });
});

// ============================================================
// replayNarratorQueue — воспроизведение очереди
// ============================================================
describe('replayNarratorQueue', () => {
  beforeEach(() => { rooms.clear(); });
  afterEach(() => { rooms.clear(); });

  test('воспроизводит все события из очереди', () => {
    const room = createRoom('Host');
    room.host = 'host-socket';
    room.narratorQueue = [
      { event: 'narratorAction', data: { actor: 'Bot1' } },
      { event: 'narratorPhaseReady', data: { phase: 'night' } },
      { event: 'narratorNightResult', data: { killed: 'Player2' } }
    ];

    const emitted = [];
    const mockIo = {
      to: (id) => ({
        emit: (event, data) => emitted.push({ id, event, data })
      })
    };

    replayNarratorQueue(room, mockIo);

    expect(emitted.length).toBe(3);
    expect(emitted[0]).toEqual({ id: 'host-socket', event: 'narratorAction', data: { actor: 'Bot1' } });
    expect(emitted[1]).toEqual({ id: 'host-socket', event: 'narratorPhaseReady', data: { phase: 'night' } });
    expect(emitted[2]).toEqual({ id: 'host-socket', event: 'narratorNightResult', data: { killed: 'Player2' } });
  });

  test('очередь пуста после воспроизведения', () => {
    const room = createRoom('Host');
    room.host = 'host-socket';
    room.narratorQueue = [
      { event: 'test', data: {} },
      { event: 'test2', data: {} }
    ];

    const mockIo = { to: () => ({ emit: () => {} }) };

    replayNarratorQueue(room, mockIo);

    expect(room.narratorQueue.length).toBe(0);
  });

  test('ничего не делает без host', () => {
    const room = createRoom('Host');
    room.host = null;
    room.narratorQueue = [{ event: 'test', data: {} }];

    const emitted = [];
    const mockIo = { to: () => ({ emit: (e, d) => emitted.push({ e, d }) }) };

    replayNarratorQueue(room, mockIo);

    expect(emitted.length).toBe(0);
    // Очередь сохраняется (не дренируется без хоста)
    expect(room.narratorQueue.length).toBe(1);
  });

  test('ничего не делает при пустой очереди', () => {
    const room = createRoom('Host');
    room.host = 'host-socket';
    room.narratorQueue = [];

    const emitted = [];
    const mockIo = { to: () => ({ emit: (e, d) => emitted.push({ e, d }) }) };

    replayNarratorQueue(room, mockIo);

    expect(emitted.length).toBe(0);
  });
});
