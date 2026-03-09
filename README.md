# Mafia Game v1.4.0

Онлайн-мафия с ведущим (narrator), ботами и системой реконнекта. Real-time через Socket.io.

**Сайт:** [mafia1.ru](http://mafia1.ru)

## Стек

- **Сервер:** Node.js 18, Express, Socket.io
- **Клиент:** Vanilla JS, CSS (адаптивный, 3D-анимации)
- **Деплой:** reg.ru, PM2, GitHub webhook

## Роли

| Роль | Команда | Способность |
|---|---|---|
| Мафия | Мафия | Убивает ночью (коллективное голосование) |
| Крёстный отец | Мафия | Убивает ночью, выглядит мирным для детектива |
| Маньяк | Нейтрал | Убивает ночью (отдельно от мафии, доктор не спасает) |
| Доктор | Мирные | Лечит одного игрока ночью (спасает от мафии) |
| Детектив | Мирные | Проверяет одного игрока ночью |
| Мирный | Мирные | Голосует днём |

## Установка

```bash
git clone https://github.com/GarpikeS/Mafia-for-Dmitriy.git
cd Mafia-for-Dmitriy
npm install
```

## Запуск

```bash
# Development
npm start          # http://localhost:5000

# Production (PM2)
pm2 start server/index.js --name mafia
```

## Тесты

```bash
npm test                                    # Unit-тесты (Jest)
node tests/lobby-test.js                    # Интеграционные (27 сценариев)
node tests/stress-prod.js                   # Стресс-тест (20 мин)
PROD_URL=http://mafia1.ru node tests/stress-prod.js  # На production
```

## Архитектура

```
server/
  index.js              — Express + Socket.io + health endpoint
  config.js             — Конфигурация (роли, таймауты, лимиты)
  game/
    GameRoom.js          — Управление комнатами, реконнект, persistence
    PhaseManager.js      — Фазы: ночь → день → голосование
    RoleManager.js       — Распределение ролей (Fisher-Yates)
    WinCondition.js      — Условия победы (мафия/мирные/маньяк)
    BotAI.js             — Логика ботов (ночь/голосование)
    utils.js             — Утилиты (getAlivePlayers, isMafiaRole)
  socket/
    handlers.js          — Оркестратор обработчиков
    room-handlers.js     — Лобби: создание, вход, боты, выход
    game-handlers.js     — Игра: старт, действия, голосование, чат
    reconnect-handlers.js — Реконнект, дисконнект, ping
    helpers.js           — Санитизация, rate limit, safeHandler
  generators/
    names.js             — Генератор имён ботов
    avatars.js           — Аватары (DiceBear, Jdenticon)
    scenarios.js         — Атмосферные тексты фаз
public/
  index.html             — SPA (меню → лобби → игра → результат)
  game.js                — Клиентская логика
  style.css              — Стили (адаптив, анимации, темы ролей)
tests/
  game.test.js           — 31 unit-тест
  lobby-test.js          — 27 интеграционных сценариев
  stress-prod.js         — 20-мин production стресс-тест
  hardcore-stress.js     — Burst/concurrent стресс-тест
```

## Деплой

Автоматический через GitHub webhook:
1. Push в `master`
2. GitHub → POST `mafia1.ru/deploy-webhook.php` (HMAC-SHA256)
3. `deploy-mafia.sh` → git pull → npm install → pm2 restart

## Health Check

```
GET /api/health
→ { status, uptime, rooms, totalPlayers, memory }
```
