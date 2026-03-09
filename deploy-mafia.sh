#!/bin/bash
HOME=/var/www/u3404811/data
NODE=$HOME/.nvm/versions/node/v18.20.8/bin/node
NPM=$HOME/.nvm/versions/node/v18.20.8/bin/npm
PM2=$HOME/.nvm/versions/node/v18.20.8/bin/pm2
SITE=$HOME/www/mafia1.ru
REPO=$HOME/mafia-game

cd $REPO
git pull origin master

# Копируем модульную архитектуру
cp -r server/ $SITE/server/
cp -r data/ $SITE/data/
cp -r public/* $SITE/
cp package.json $SITE/
cp deploy-webhook.php $SITE/
cp .htaccess $SITE/

# Устанавливаем зависимости (если обновились)
cd $SITE
$NPM install --production 2>&1

# Перезапускаем через PM2 (автоматический restart при падении)
$PM2 restart mafia 2>/dev/null || $PM2 start server/index.js --name mafia --interpreter=$NODE
$PM2 save

echo "Deploy done at $(date)"
