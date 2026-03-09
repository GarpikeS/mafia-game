<?php
$home = '/var/www/u3404811/data';
copy(__DIR__ . '/deploy-mafia.sh', $home . '/deploy-mafia.sh');
chmod($home . '/deploy-mafia.sh', 0755);
echo "deploy-mafia.sh installed\n";
