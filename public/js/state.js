// Константы ролей
export const ROLE_NAMES = {
  mafia: 'Мафия',
  godfather: 'Крёстный отец',
  maniac: 'Маньяк',
  doctor: 'Доктор',
  detective: 'Детектив',
  civilian: 'Мирный житель'
};

export const ROLE_ICONS = {
  mafia: '🔪',
  godfather: '🎩',
  maniac: '🪓',
  doctor: '💉',
  detective: '🔍',
  civilian: '🏠'
};

export const ROLE_DESCRIPTIONS = {
  mafia: 'Каждую ночь выбирайте жертву. Уничтожьте всех мирных жителей.',
  godfather: 'Глава мафии. Выбирайте жертву ночью. Детектив не сможет вас разоблачить.',
  maniac: 'Независимый убийца. Каждую ночь убивайте жертву. Побеждайте, оставшись последним.',
  doctor: 'Каждую ночь спасайте одного игрока от мафии.',
  detective: 'Каждую ночь проверяйте одного игрока — мафия он или нет.',
  civilian: 'Днём голосуйте за изгнание подозреваемых. Найдите мафию!'
};

// Состояние игры
export const state = {
  screen: 'menu',
  roomId: null,
  playerId: null,
  playerName: null,
  isHost: false,
  role: null,
  players: [],
  selectedPlayer: null,
  gamePhase: null,
  token: null,
  mafiaMembers: [],
  narratorPlayers: [],
  roleConfig: { mafia: 1, godfather: 0, maniac: 0, doctor: 1, detective: 1 },
  isDead: false  // Флаг для убитых игроков (наблюдателей)
};
