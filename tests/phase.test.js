// tests/phase.test.js — Тесты PhaseManager и utils

const { processNightActions, checkNightComplete, checkVotesComplete } = require('../server/game/PhaseManager');
const { getAlivePlayers, isMafiaRole, getAliveHumans, getAliveBots, getAliveMafia, getAliveCivilians } = require('../server/game/utils');

// === Тесты utils.js ===

function makeRoom(players, deadIds = []) {
  return {
    players,
    deadPlayers: new Set(deadIds),
    nightActions: {},
    votes: {},
    lastDoctorTarget: null,
    lastKilled: null,
    lastSaved: null,
    lastChecked: null
  };
}

describe('utils — расширенные функции', () => {
  const players = [
    { id: 'p1', name: 'A', role: 'mafia', isBot: false },
    { id: 'p2', name: 'B', role: 'civilian', isBot: false },
    { id: 'p3', name: 'C', role: 'doctor', isBot: true },
    { id: 'p4', name: 'D', role: 'godfather', isBot: false },
    { id: 'p5', name: 'E', role: 'maniac', isBot: true }
  ];

  test('getAlivePlayers — исключает мёртвых', () => {
    const room = makeRoom(players, ['p1']);
    expect(getAlivePlayers(room)).toHaveLength(4);
    expect(getAlivePlayers(room).find(p => p.id === 'p1')).toBeUndefined();
  });

  test('isMafiaRole — mafia и godfather', () => {
    expect(isMafiaRole('mafia')).toBe(true);
    expect(isMafiaRole('godfather')).toBe(true);
    expect(isMafiaRole('civilian')).toBe(false);
    expect(isMafiaRole('maniac')).toBe(false);
    expect(isMafiaRole('doctor')).toBe(false);
    expect(isMafiaRole('detective')).toBe(false);
  });

  test('getAliveHumans — только живые люди (не боты)', () => {
    const room = makeRoom(players);
    const humans = getAliveHumans(room);
    expect(humans).toHaveLength(3); // p1, p2, p4
    expect(humans.every(p => !p.isBot)).toBe(true);
  });

  test('getAliveBots — только живые боты', () => {
    const room = makeRoom(players);
    const bots = getAliveBots(room);
    expect(bots).toHaveLength(2); // p3, p5
    expect(bots.every(p => p.isBot)).toBe(true);
  });

  test('getAliveMafia — mafia + godfather', () => {
    const room = makeRoom(players);
    const mafia = getAliveMafia(room);
    expect(mafia).toHaveLength(2); // p1, p4
    expect(mafia.map(p => p.role)).toEqual(expect.arrayContaining(['mafia', 'godfather']));
  });

  test('getAliveMafia — исключает мёртвую мафию', () => {
    const room = makeRoom(players, ['p1']);
    expect(getAliveMafia(room)).toHaveLength(1);
  });

  test('getAliveCivilians — не мафия, не маньяк', () => {
    const room = makeRoom(players);
    const civs = getAliveCivilians(room);
    expect(civs).toHaveLength(2); // p2 (civilian), p3 (doctor)
    expect(civs.every(p => !isMafiaRole(p.role) && p.role !== 'maniac')).toBe(true);
  });
});

// === Тесты processNightActions ===

describe('processNightActions', () => {
  test('мафия убивает жертву', () => {
    const room = makeRoom([
      { id: 'p1', name: 'Mafia', role: 'mafia' },
      { id: 'p2', name: 'Victim', role: 'civilian' }
    ]);
    room.nightActions = { p1: { target: 'p2' } };

    const result = processNightActions(room);
    expect(result.killed).toBe('p2');
    expect(room.deadPlayers.has('p2')).toBe(true);
  });

  test('доктор спасает жертву мафии', () => {
    const room = makeRoom([
      { id: 'p1', name: 'Mafia', role: 'mafia' },
      { id: 'p2', name: 'Victim', role: 'civilian' },
      { id: 'p3', name: 'Doctor', role: 'doctor' }
    ]);
    room.nightActions = {
      p1: { target: 'p2' },
      p3: { target: 'p2' }
    };

    const result = processNightActions(room);
    expect(result.killed).toBeNull();
    expect(result.saved).toBe('p2');
    expect(room.deadPlayers.has('p2')).toBe(false);
  });

  test('доктор НЕ спасает от маньяка', () => {
    const room = makeRoom([
      { id: 'p1', name: 'Maniac', role: 'maniac' },
      { id: 'p2', name: 'Victim', role: 'civilian' },
      { id: 'p3', name: 'Doctor', role: 'doctor' }
    ]);
    room.nightActions = {
      p1: { target: 'p2' },
      p3: { target: 'p2' }
    };

    const result = processNightActions(room);
    expect(result.maniacKilled).toBe('p2');
    expect(room.deadPlayers.has('p2')).toBe(true);
  });

  test('доктор не может лечить одного и того же дважды подряд', () => {
    const room = makeRoom([
      { id: 'p1', name: 'Mafia', role: 'mafia' },
      { id: 'p2', name: 'Victim', role: 'civilian' },
      { id: 'p3', name: 'Doctor', role: 'doctor' }
    ]);
    room.lastDoctorTarget = 'p2'; // доктор уже лечил p2
    room.nightActions = {
      p1: { target: 'p2' },
      p3: { target: 'p2' }
    };

    const result = processNightActions(room);
    // Спасение не сработало — доктор пытается лечить того же
    expect(result.killed).toBe('p2');
    expect(result.saved).toBeNull();
  });

  test('детектив проверяет игрока', () => {
    const room = makeRoom([
      { id: 'p1', name: 'Mafia', role: 'mafia' },
      { id: 'p2', name: 'Detective', role: 'detective' }
    ]);
    room.nightActions = {
      p2: { target: 'p1' }
    };

    const result = processNightActions(room);
    expect(result.checked).toEqual({ detective: 'p2', target: 'p1' });
  });

  test('маньяк убивает отдельно от мафии', () => {
    const room = makeRoom([
      { id: 'p1', name: 'Mafia', role: 'mafia' },
      { id: 'p2', name: 'Maniac', role: 'maniac' },
      { id: 'p3', name: 'Victim1', role: 'civilian' },
      { id: 'p4', name: 'Victim2', role: 'civilian' }
    ]);
    room.nightActions = {
      p1: { target: 'p3' },
      p2: { target: 'p4' }
    };

    const result = processNightActions(room);
    expect(result.killed).toBe('p3');
    expect(result.maniacKilled).toBe('p4');
    expect(room.deadPlayers.has('p3')).toBe(true);
    expect(room.deadPlayers.has('p4')).toBe(true);
  });

  test('мафия и маньяк убивают одного — одна жертва', () => {
    const room = makeRoom([
      { id: 'p1', name: 'Mafia', role: 'mafia' },
      { id: 'p2', name: 'Maniac', role: 'maniac' },
      { id: 'p3', name: 'Victim', role: 'civilian' }
    ]);
    room.nightActions = {
      p1: { target: 'p3' },
      p2: { target: 'p3' }
    };

    const result = processNightActions(room);
    expect(result.killed).toBe('p3');
    expect(result.maniacKilled).toBe('p3');
    expect(room.deadPlayers.has('p3')).toBe(true);
  });

  test('мирная ночь — никто не выбрал цель', () => {
    const room = makeRoom([
      { id: 'p1', name: 'Mafia', role: 'mafia' },
      { id: 'p2', name: 'Civilian', role: 'civilian' }
    ]);
    room.nightActions = {
      p1: { target: null }
    };

    const result = processNightActions(room);
    expect(result.killed).toBeNull();
    expect(result.maniacKilled).toBeNull();
  });

  test('коллективное голосование мафии — побеждает большинство', () => {
    const room = makeRoom([
      { id: 'p1', name: 'Mafia1', role: 'mafia' },
      { id: 'p2', name: 'Mafia2', role: 'mafia' },
      { id: 'p3', name: 'Godfather', role: 'godfather' },
      { id: 'p4', name: 'Victim1', role: 'civilian' },
      { id: 'p5', name: 'Victim2', role: 'civilian' }
    ]);
    room.nightActions = {
      p1: { target: 'p4' },
      p2: { target: 'p5' },
      p3: { target: 'p4' }
    };

    const result = processNightActions(room);
    // p4 набрал 2 голоса, p5 — 1
    expect(result.killed).toBe('p4');
  });

  test('очищает nightActions после обработки', () => {
    const room = makeRoom([
      { id: 'p1', name: 'Mafia', role: 'mafia' },
      { id: 'p2', name: 'Civilian', role: 'civilian' }
    ]);
    room.nightActions = { p1: { target: 'p2' } };
    processNightActions(room);
    expect(room.nightActions).toEqual({});
  });
});

// === Тесты checkNightComplete ===

describe('checkNightComplete', () => {
  test('завершена когда все активные роли выбрали', () => {
    const room = makeRoom([
      { id: 'p1', name: 'Mafia', role: 'mafia' },
      { id: 'p2', name: 'Doctor', role: 'doctor' },
      { id: 'p3', name: 'Civilian', role: 'civilian' }
    ]);
    room.nightActions = { p1: { target: 'p3' }, p2: { target: 'p3' } };
    expect(checkNightComplete(room)).toBe(true);
  });

  test('не завершена когда кто-то ещё не выбрал', () => {
    const room = makeRoom([
      { id: 'p1', name: 'Mafia', role: 'mafia' },
      { id: 'p2', name: 'Doctor', role: 'doctor' },
      { id: 'p3', name: 'Civilian', role: 'civilian' }
    ]);
    room.nightActions = { p1: { target: 'p3' } };
    expect(checkNightComplete(room)).toBe(false);
  });

  test('мирные жители не считаются как активные роли', () => {
    const room = makeRoom([
      { id: 'p1', name: 'Mafia', role: 'mafia' },
      { id: 'p2', name: 'Civilian', role: 'civilian' },
      { id: 'p3', name: 'Civilian2', role: 'civilian' }
    ]);
    room.nightActions = { p1: { target: 'p2' } };
    expect(checkNightComplete(room)).toBe(true);
  });

  test('мёртвые роли не учитываются', () => {
    const room = makeRoom([
      { id: 'p1', name: 'Mafia', role: 'mafia' },
      { id: 'p2', name: 'Doctor', role: 'doctor' },
      { id: 'p3', name: 'Civilian', role: 'civilian' }
    ], ['p2']); // доктор мёртв
    room.nightActions = { p1: { target: 'p3' } };
    expect(checkNightComplete(room)).toBe(true);
  });
});

// === Тесты checkVotesComplete ===

describe('checkVotesComplete', () => {
  test('завершено когда все живые проголосовали', () => {
    const room = makeRoom([
      { id: 'p1', name: 'A', role: 'mafia' },
      { id: 'p2', name: 'B', role: 'civilian' },
      { id: 'p3', name: 'C', role: 'civilian' }
    ]);
    room.votes = { p1: 'p2', p2: 'p1', p3: 'p1' };
    expect(checkVotesComplete(room)).toBe(true);
  });

  test('не завершено пока не все проголосовали', () => {
    const room = makeRoom([
      { id: 'p1', name: 'A', role: 'mafia' },
      { id: 'p2', name: 'B', role: 'civilian' },
      { id: 'p3', name: 'C', role: 'civilian' }
    ]);
    room.votes = { p1: 'p2' };
    expect(checkVotesComplete(room)).toBe(false);
  });

  test('мёртвые не голосуют', () => {
    const room = makeRoom([
      { id: 'p1', name: 'A', role: 'mafia' },
      { id: 'p2', name: 'B', role: 'civilian' },
      { id: 'p3', name: 'C', role: 'civilian' }
    ], ['p3']);
    room.votes = { p1: 'p2', p2: 'p1' };
    expect(checkVotesComplete(room)).toBe(true);
  });
});
