<?php

require_once __DIR__ . '/../src/Service/Database.php';
require_once __DIR__ . '/../src/Model/Models.php';
require_once __DIR__ . '/../src/Service/ExtensionService.php';
require_once __DIR__ . '/../src/Controller/ExtensionController.php';
require_once __DIR__ . '/../src/Middleware/CorsMiddleware.php';

use App\Service\Database;
use App\Service\ExtensionService;
use App\Controller\ExtensionController;
use App\Middleware\CorsMiddleware;

CorsMiddleware::handle();

$config = require __DIR__ . '/../config/config.php';
$db = Database::getInstance($config['db']);
Database::initialize($db);

$service = new ExtensionService($db);
$controller = new ExtensionController($service);

$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$prefix = $config['api']['prefix'] ?? '/api';

if (!str_starts_with($uri, $prefix)) {
    http_response_code(404);
    echo json_encode(['error' => 'Not found']);
    exit;
}

$path = substr($uri, strlen($prefix));
$segments = array_values(array_filter(explode('/', $path)));

try {
    match (true) {
        $path === '' && $method === 'GET' => $controller->getStats(),

        $path === 'points' && $method === 'GET' => $controller->getPoints(),
        $path === 'points' && $method === 'POST' => $controller->definePoint(),

        count($segments) === 2 && $segments[0] === 'points' && $method === 'GET' => $controller->getPoint($segments[1]),
        count($segments) === 2 && $segments[0] === 'points' && $method === 'DELETE' => $controller->deletePoint($segments[1]),

        $path === 'packages' && $method === 'GET' => $controller->getPackages(),
        $path === 'packages' && $method === 'POST' => $controller->registerPackage(),

        $path === 'packages/validate' && $method === 'POST' => $controller->validatePackage(),

        count($segments) === 2 && $segments[0] === 'packages' && $method === 'GET' => $controller->getPackage($segments[1]),
        count($segments) === 2 && $segments[0] === 'packages' && $method === 'DELETE' => $controller->deletePackage($segments[1]),

        count($segments) === 3 && $segments[0] === 'packages' && $segments[2] === 'rollback' && $method === 'POST' => $controller->rollbackPackage($segments[1]),

        count($segments) === 3 && $segments[0] === 'packages' && $segments[2] === 'check-override' && $method === 'GET' => $controller->checkOverrideImpact($segments[1]),

        $path === 'extensions' && $method === 'GET' => $controller->getExtensions(),

        count($segments) === 2 && $segments[0] === 'packages' && $segments[1] !== '' && $method === 'POST' => $controller->registerExtension($segments[1]),

        count($segments) === 2 && $segments[0] === 'extensions' && $method === 'DELETE' => $controller->unregisterExtension($segments[1]),

        $path === 'conflicts' && $method === 'GET' => $controller->getConflicts(),

        count($segments) === 2 && $segments[0] === 'conflicts' && $method === 'POST' => $controller->resolveConflict((int)$segments[1]),

        $path === 'rollbacks' && $method === 'GET' => $controller->getRollbacks(),

        default => (function () {
            http_response_code(404);
            echo json_encode(['error' => 'Route not found']);
        })(),
    };
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);
}
