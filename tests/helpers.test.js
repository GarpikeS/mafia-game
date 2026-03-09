// tests/helpers.test.js — Тесты для socket helpers

const { sanitizeString, sanitizeTargetId, safeHandler, playersForClient, lobbyPlayersForClient } = require('../server/socket/helpers');

describe('sanitizeString', () => {
  test('обрезает до maxLen', () => {
    expect(sanitizeString('abcdefghij', 5)).toBe('abcde');
  });

  test('удаляет управляющие символы', () => {
    expect(sanitizeString('hello\x00\x1Fworld')).toBe('helloworld');
  });

  test('обрезает пробелы по краям', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  test('возвращает пустую строку для не-строки', () => {
    expect(sanitizeString(123)).toBe('');
    expect(sanitizeString(null)).toBe('');
    expect(sanitizeString(undefined)).toBe('');
    expect(sanitizeString({})).toBe('');
  });

  test('по умолчанию maxLen = 50', () => {
    const long = 'a'.repeat(100);
    expect(sanitizeString(long)).toHaveLength(50);
  });
});

describe('sanitizeTargetId', () => {
  test('возвращает строку как есть (до 50 символов)', () => {
    expect(sanitizeTargetId('abc123')).toBe('abc123');
  });

  test('обрезает до 50 символов', () => {
    const long = 'x'.repeat(100);
    expect(sanitizeTargetId(long)).toHaveLength(50);
  });

  test('возвращает null для null/undefined', () => {
    expect(sanitizeTargetId(null)).toBeNull();
    expect(sanitizeTargetId(undefined)).toBeNull();
  });

  test('возвращает null для не-строки', () => {
    expect(sanitizeTargetId(123)).toBeNull();
    expect(sanitizeTargetId({})).toBeNull();
  });
});

describe('safeHandler', () => {
  test('вызывает handler с аргументами', () => {
    const socket = {};
    const handler = jest.fn();
    const wrapped = safeHandler(socket, handler);
    wrapped('a', 'b');
    expect(handler).toHaveBeenCalledWith('a', 'b');
  });

  test('первые 10 вызовов проходят (rate limit)', () => {
    const socket = {};
    const handler = jest.fn();
    const wrapped = safeHandler(socket, handler);
    for (let i = 0; i < 10; i++) {
      wrapped('call-' + i);
    }
    expect(handler).toHaveBeenCalledTimes(10);
  });

  test('блокирует handler после 10 вызовов за 1 секунду', () => {
    const socket = {};
    const handler = jest.fn();
    const wrapped = safeHandler(socket, handler);
    // Исчерпываем лимит через safeHandler
    for (let i = 0; i < 10; i++) {
      wrapped(i);
    }
    handler.mockClear();
    wrapped('should-be-blocked');
    expect(handler).not.toHaveBeenCalled();
  });

  test('rate limit сбрасывается после окна', () => {
    const socket = {};
    const handler = jest.fn();
    const wrapped = safeHandler(socket, handler);
    // Исчерпываем лимит
    for (let i = 0; i < 11; i++) {
      wrapped(i);
    }
    handler.mockClear();
    // Сдвигаем время — сброс окна
    socket._rateLimit.resetAt = Date.now() - 1;
    wrapped('after-reset');
    expect(handler).toHaveBeenCalledWith('after-reset');
  });

  test('ловит ошибки без падения', () => {
    const socket = { id: 'test-socket' };
    const handler = () => { throw new Error('test error'); };
    const wrapped = safeHandler(socket, handler);
    expect(() => wrapped()).not.toThrow();
  });
});

describe('playersForClient', () => {
  test('скрывает роли живых игроков', () => {
    const room = {
      players: [
        { id: 'p1', name: 'A', role: 'mafia' },
        { id: 'p2', name: 'B', role: 'civilian' }
      ],
      deadPlayers: new Set()
    };
    const result = playersForClient(room);
    expect(result[0].role).toBeUndefined();
    expect(result[1].role).toBeUndefined();
    expect(result[0].isDead).toBe(false);
  });

  test('показывает роли мёртвых игроков', () => {
    const room = {
      players: [
        { id: 'p1', name: 'A', role: 'mafia' },
        { id: 'p2', name: 'B', role: 'civilian' }
      ],
      deadPlayers: new Set(['p1'])
    };
    const result = playersForClient(room);
    expect(result[0].role).toBe('mafia');
    expect(result[0].isDead).toBe(true);
    expect(result[1].role).toBeUndefined();
    expect(result[1].isDead).toBe(false);
  });

  test('удаляет приватные поля (token, _disconnected)', () => {
    const room = {
      players: [{ id: 'p1', name: 'A', role: 'mafia', token: 'secret', _disconnected: true }],
      deadPlayers: new Set()
    };
    const result = playersForClient(room);
    expect(result[0].token).toBeUndefined();
    expect(result[0]._disconnected).toBeUndefined();
  });
});

describe('lobbyPlayersForClient', () => {
  test('исключает отключённых игроков', () => {
    const room = {
      players: [
        { id: 'p1', name: 'A', _disconnected: false },
        { id: 'p2', name: 'B', _disconnected: true },
        { id: 'p3', name: 'C' }
      ]
    };
    const result = lobbyPlayersForClient(room);
    expect(result).toHaveLength(2);
    expect(result.map(p => p.name)).toEqual(['A', 'C']);
  });

  test('удаляет приватные поля', () => {
    const room = {
      players: [{ id: 'p1', name: 'A', token: 'secret', _disconnected: false }]
    };
    const result = lobbyPlayersForClient(room);
    expect(result[0].token).toBeUndefined();
    expect(result[0]._disconnected).toBeUndefined();
  });
});
