<?php

namespace App\Controller;

use App\Service\ExtensionService;

class ExtensionController
{
    private ExtensionService $service;

    public function __construct(ExtensionService $service)
    {
        $this->service = $service;
    }

    public function getPoints(): array
    {
        return $this->jsonResponse($this->service->getPoints());
    }

    public function getPoint(string $name): array
    {
        $point = $this->service->getPoint($name);
        if (!$point) {
            return $this->jsonResponse(['error' => "Extension point \"{$name}\" not found"], 404);
        }
        return $this->jsonResponse($point);
    }

    public function definePoint(): array
    {
        $data = $this->getRequestBody();
        if (empty($data['name'])) {
            return $this->jsonResponse(['error' => 'Extension point name is required'], 400);
        }
        try {
            $point = $this->service->definePoint($data);
            return $this->jsonResponse($point, 201);
        } catch (\PDOException $e) {
            if (str_contains($e->getMessage(), 'UNIQUE constraint failed')) {
                return $this->jsonResponse(['error' => "Extension point \"{$data['name']}\" already exists"], 409);
            }
            return $this->jsonResponse(['error' => $e->getMessage()], 500);
        }
    }

    public function deletePoint(string $name): array
    {
        $deleted = $this->service->deletePoint($name);
        return $deleted
            ? $this->jsonResponse(['message' => "Extension point \"{$name}\" deleted"])
            : $this->jsonResponse(['error' => "Extension point \"{$name}\" not found"], 404);
    }

    public function getPackages(): array
    {
        return $this->jsonResponse($this->service->getPackages());
    }

    public function getPackage(string $packageId): array
    {
        $pkg = $this->service->getPackage($packageId);
        if (!$pkg) {
            return $this->jsonResponse(['error' => "Package \"{$packageId}\" not found"], 404);
        }
        return $this->jsonResponse($pkg);
    }

    public function registerPackage(): array
    {
        $data = $this->getRequestBody();
        if (empty($data['id']) && empty($data['package_id'])) {
            return $this->jsonResponse(['error' => 'Package id is required'], 400);
        }
        $pkg = $this->service->registerPackage($data);
        return $this->jsonResponse($pkg, 201);
    }

    public function deletePackage(string $packageId): array
    {
        $deleted = $this->service->deletePackage($packageId);
        return $deleted
            ? $this->jsonResponse(['message' => "Package \"{$packageId}\" deleted"])
            : $this->jsonResponse(['error' => "Package \"{$packageId}\" not found"], 404);
    }

    public function getExtensions(): array
    {
        $pointName = $_GET['point'] ?? null;
        return $this->jsonResponse($this->service->getExtensions($pointName));
    }

    public function registerExtension(string $packageId): array
    {
        $data = $this->getRequestBody();
        if (empty($data['point'])) {
            return $this->jsonResponse(['error' => 'Extension point is required'], 400);
        }
        $result = $this->service->registerExtension($packageId, $data);
        if (isset($result['error'])) {
            return $this->jsonResponse(['error' => $result['error']], $result['code'] ?? 400);
        }
        return $this->jsonResponse($result, 201);
    }

    public function unregisterExtension(string $extId): array
    {
        $deleted = $this->service->unregisterExtension($extId);
        return $deleted
            ? $this->jsonResponse(['message' => "Extension \"{$extId}\" unregistered"])
            : $this->jsonResponse(['error' => "Extension \"{$extId}\" not found"], 404);
    }

    public function checkOverrideImpact(string $packageId): array
    {
        return $this->jsonResponse($this->service->checkOverrideImpact($packageId));
    }

    public function getConflicts(): array
    {
        $pointName = $_GET['point'] ?? null;
        $resolved = isset($_GET['resolved']) ? (bool)$_GET['resolved'] : null;
        return $this->jsonResponse($this->service->getConflicts($pointName, $resolved));
    }

    public function resolveConflict(int $conflictId): array
    {
        $data = $this->getRequestBody();
        if (empty($data['resolution'])) {
            return $this->jsonResponse(['error' => 'Resolution is required'], 400);
        }
        $conflict = $this->service->resolveConflict($conflictId, $data['resolution']);
        if (!$conflict) {
            return $this->jsonResponse(['error' => "Conflict #{$conflictId} not found"], 404);
        }
        return $this->jsonResponse($conflict);
    }

    public function getStats(): array
    {
        return $this->jsonResponse($this->service->getStats());
    }

    private function getRequestBody(): array
    {
        $input = file_get_contents('php://input');
        return json_decode($input, true) ?: [];
    }

    private function jsonResponse($data, int $statusCode = 200): array
    {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }
}
