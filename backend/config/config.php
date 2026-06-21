<?php

return [
    'db' => [
        'driver'   => getenv('DB_DRIVER') ?: 'sqlite',
        'host'     => getenv('DB_HOST') ?: '127.0.0.1',
        'port'     => getenv('DB_PORT') ?: '3306',
        'database' => getenv('DB_DATABASE') ?: __DIR__ . '/../../db/extensions.sqlite',
        'username' => getenv('DB_USERNAME') ?: 'root',
        'password' => getenv('DB_PASSWORD') ?: '',
        'charset'  => 'utf8mb4',
    ],
    'api' => [
        'prefix' => '/api',
        'cors'   => true,
    ],
    'override' => [
        'default_strategy' => 'last_wins',
        'strategies'       => ['throw', 'last_wins', 'first_wins', 'merge', 'stack'],
        'strict_mode'      => false,
    ],
];
