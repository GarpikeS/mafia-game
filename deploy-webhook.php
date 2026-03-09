<?php
$secretFile = '/var/www/u3404811/data/.mafia-webhook-secret';
if (!file_exists($secretFile)) {
    http_response_code(500);
    die('Secret file not found');
}
$secret = trim(file_get_contents($secretFile));

$signature = isset($_SERVER['HTTP_X_HUB_SIGNATURE_256']) ? $_SERVER['HTTP_X_HUB_SIGNATURE_256'] : '';
$payload = file_get_contents('php://input');

$expected = 'sha256=' . hash_hmac('sha256', $payload, $secret);

if (!hash_equals($expected, $signature)) {
    http_response_code(403);
    die('Forbidden');
}

$home = '/var/www/u3404811/data';
$log = date('Y-m-d H:i:s') . " Deploy triggered\n";
file_put_contents($home . '/deploy.log', $log, FILE_APPEND);

exec('bash ' . $home . '/mafia-game/deploy-mafia.sh >> ' . $home . '/deploy-mafia.log 2>&1 &');

echo 'OK';
