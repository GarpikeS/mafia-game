<?php
$src = __DIR__ . '/.htaccess';
$dst = '/var/www/u3404811/data/www/mafia1.ru/.htaccess';
copy($src, $dst);
echo file_get_contents($dst);
