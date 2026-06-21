<?php

namespace App\Service;

use App\Model\{ExtensionPoint, Extension, Package, OverrideConflict, PackageRollback};
use PDO;

class ExtensionService
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function validatePackageRegistration(array $pkgData): array
    {
        $result = [
            'valid' => true,
            'can_install' => true,
            'errors' => [],
            'warnings' => [],
            'conflicts' => [],
            'extension_validations' => [],
        ];

        $pkgId = $pkgData['id'] ?? $pkgData['package_id'] ?? null;
        if (!$pkgId) {
            $result['valid'] = false;
            $result['can_install'] = false;
            $result['errors'][] = ['field' => 'package_id', 'message' => '扩展包ID不能为空'];
            return $result;
        }

        if (!preg_match('/^[a-zA-Z][a-zA-Z0-9_\-]*(\.[a-zA-Z][a-zA-Z0-9_\-]*)*$/', trim($pkgId))) {
            $result['valid'] = false;
            $result['errors'][] = ['field' => 'package_id', 'message' => '扩展包ID格式无效'];
        }

        if (empty($pkgData['name'])) {
            $result['valid'] = false;
            $result['errors'][] = ['field' => 'name', 'message' => '扩展包名称不能为空'];
        }

        if (!empty($pkgData['version']) && !preg_match('/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/', trim($pkgData['version']))) {
            $result['valid'] = false;
            $result['errors'][] = ['field' => 'version', 'message' => '版本号格式无效，应为 semver 格式'];
        }

        $extensions = $pkgData['extensions'] ?? [];
        if (!is_array($extensions)) {
            $result['valid'] = false;
            $result['errors'][] = ['field' => 'extensions', 'message' => 'extensions 必须是数组'];
            return $result;
        }

        foreach ($extensions as $idx => $extDef) {
            $extValidation = $this->validateExtensionDefinition($extDef);
            $result['extension_validations'][] = [
                'index' => $idx,
                'point' => $extDef['point'] ?? '(unknown)',
                'valid' => $extValidation['valid'],
                'errors' => $extValidation['errors'],
                'warnings' => $extValidation['warnings'],
                'conflicts' => $extValidation['conflicts'],
            ];

            if (!$extValidation['valid']) {
                $result['valid'] = false;
            }
            if (!$extValidation['can_install']) {
                $result['can_install'] = false;
            }
            $result['warnings'] = array_merge($result['warnings'], $extValidation['warnings']);
            $result['conflicts'] = array_merge($result['conflicts'], $extValidation['conflicts']);
            $result['errors'] = array_merge($result['errors'], $extValidation['errors']);
        }

        return $result;
    }

    private function validateExtensionDefinition(array $extDef): array
    {
        $result = [
            'valid' => true,
            'can_install' => true,
            'errors' => [],
            'warnings' => [],
            'conflicts' => [],
        ];

        $pointName = $extDef['point'] ?? '';
        if (!$pointName) {
            $result['valid'] = false;
            $result['errors'][] = ['field' => 'point', 'message' => '扩展点不能为空'];
            return $result;
        }

        $point = $this->getPoint($pointName);
        if (!$point) {
            $result['warnings'][] = [
                'type' => 'missing_point',
                'point_name' => $pointName,
                'message' => "扩展点 \"{$pointName}\" 尚未定义，注册后该扩展不会生效",
            ];
        }

        if (!empty($extDef['id']) && !is_string($extDef['id'])) {
            $result['valid'] = false;
            $result['errors'][] = ['field' => 'id', 'message' => '扩展ID必须为字符串'];
        }

        if (!empty($extDef['override'])) {
            if (empty($extDef['overrideTargets']) || !is_array($extDef['overrideTargets']) || count($extDef['overrideTargets']) === 0) {
                $result['valid'] = false;
                $result['errors'][] = ['field' => 'overrideTargets', 'message' => "标记为覆盖扩展时必须指定覆盖目标 (point: {$pointName})"];
            } elseif ($point) {
                $existingExts = $this->getActiveExtensions($pointName);
                $existingIds = array_map(fn($e) => $e->ext_id, $existingExts);
                $missing = array_diff($extDef['overrideTargets'], $existingIds);
                if (count($missing) > 0 && count($existingIds) > 0) {
                    $result['valid'] = false;
                    $result['errors'][] = [
                        'field' => 'overrideTargets',
                        'message' => "覆盖目标不存在: " . implode(', ', $missing) . " (point: {$pointName})",
                    ];
                }
            }
        }

        if ($point) {
            $existingExts = $this->getActiveExtensions($pointName);
            if (!$point->multiple && count($existingExts) > 0) {
                $result['conflicts'][] = [
                    'type' => 'single_point_conflict',
                    'point_name' => $pointName,
                    'existing_count' => count($existingExts),
                    'strategy' => $point->strategy,
                    'message' => "扩展点 \"{$pointName}\" 配置为单扩展模式，已有 " . count($existingExts) . " 个活跃扩展，策略: {$point->strategy}",
                ];
                if ($point->strategy === 'throw') {
                    $result['can_install'] = false;
                }
            }

            if (!empty($extDef['overrideTargets']) && is_array($extDef['overrideTargets'])) {
                foreach ($existingExts as $existing) {
                    if (in_array($existing->ext_id, $extDef['overrideTargets'])) {
                        $result['conflicts'][] = [
                            'type' => 'explicit_override',
                            'point_name' => $pointName,
                            'existing_ext_id' => $existing->ext_id,
                            'existing_package_id' => $existing->package_id,
                            'incoming_ext_id' => $extDef['id'] ?? "{$pointName}::auto",
                            'resolution' => 'incoming_replaces_existing',
                            'message' => "将覆盖扩展 \"{$existing->ext_id}\" (包: {$existing->package_id})",
                        ];
                    }
                }
            }
        }

        if (isset($extDef['priority']) && !is_numeric($extDef['priority'])) {
            $result['valid'] = false;
            $result['errors'][] = ['field' => 'priority', 'message' => "优先级必须为数字 (point: {$pointName})"];
        }
        if (isset($extDef['order']) && !is_numeric($extDef['order'])) {
            $result['valid'] = false;
            $result['errors'][] = ['field' => 'order', 'message' => "排序必须为数字 (point: {$pointName})"];
        }

        return $result;
    }

    public function definePoint(array $data): ExtensionPoint
    {
        $point = ExtensionPoint::fromArray($data);
        $stmt = $this->db->prepare(
            "INSERT INTO extension_points (name, description, strategy, multiple, required, metadata)
             VALUES (:name, :description, :strategy, :multiple, :required, :metadata)"
        );
        $stmt->execute([
            ':name' => $point->name,
            ':description' => $point->description,
            ':strategy' => $point->strategy,
            ':multiple' => $point->multiple ? 1 : 0,
            ':required' => $point->required ? 1 : 0,
            ':metadata' => $point->metadata ? json_encode($point->metadata) : null,
        ]);
        $point->id = (int)$this->db->lastInsertId();
        return $point;
    }

    public function getPoint(string $name): ?ExtensionPoint
    {
        $stmt = $this->db->prepare("SELECT * FROM extension_points WHERE name = :name");
        $stmt->execute([':name' => $name]);
        $row = $stmt->fetch();
        return $row ? ExtensionPoint::fromArray($row) : null;
    }

    public function getPoints(): array
    {
        $stmt = $this->db->query("SELECT * FROM extension_points ORDER BY created_at DESC");
        return array_map(fn($r) => ExtensionPoint::fromArray($r), $stmt->fetchAll());
    }

    public function deletePoint(string $name): bool
    {
        $stmt = $this->db->prepare("DELETE FROM extension_points WHERE name = :name");
        return $stmt->execute([':name' => $name]) && $stmt->rowCount() > 0;
    }

    public function registerPackage(array $data): Package
    {
        $pkg = Package::fromArray($data);
        $existing = $this->getPackage($pkg->package_id);

        if ($existing) {
            $stmt = $this->db->prepare(
                "UPDATE packages SET name = :name, version = :version, description = :description, enabled = :enabled
                 WHERE package_id = :package_id"
            );
            $stmt->execute([
                ':name' => $pkg->name,
                ':version' => $pkg->version,
                ':description' => $pkg->description,
                ':enabled' => $pkg->enabled ? 1 : 0,
                ':package_id' => $pkg->package_id,
            ]);
            $pkg->id = $existing->id;
        } else {
            $stmt = $this->db->prepare(
                "INSERT INTO packages (package_id, name, version, description, enabled)
                 VALUES (:package_id, :name, :version, :description, :enabled)"
            );
            $stmt->execute([
                ':package_id' => $pkg->package_id,
                ':name' => $pkg->name,
                ':version' => $pkg->version,
                ':description' => $pkg->description,
                ':enabled' => $pkg->enabled ? 1 : 0,
            ]);
            $pkg->id = (int)$this->db->lastInsertId();
        }

        return $pkg;
    }

    public function getPackage(string $packageId): ?Package
    {
        $stmt = $this->db->prepare("SELECT * FROM packages WHERE package_id = :package_id");
        $stmt->execute([':package_id' => $packageId]);
        $row = $stmt->fetch();
        return $row ? Package::fromArray($row) : null;
    }

    public function getPackages(): array
    {
        $stmt = $this->db->query("SELECT * FROM packages ORDER BY installed_at DESC");
        return array_map(fn($r) => Package::fromArray($r), $stmt->fetchAll());
    }

    public function deletePackage(string $packageId): bool
    {
        $this->db->prepare("DELETE FROM extensions WHERE package_id = :package_id")->execute([':package_id' => $packageId]);
        $stmt = $this->db->prepare("DELETE FROM packages WHERE package_id = :package_id");
        return $stmt->execute([':package_id' => $packageId]) && $stmt->rowCount() > 0;
    }

    public function registerExtension(string $packageId, array $data, ?array &$rollbackContext = null): array
    {
        $pointName = $data['point'] ?? '';
        $point = $this->getPoint($pointName);
        if (!$point) {
            return ['error' => "Extension point \"{$pointName}\" not found", 'code' => 404];
        }

        $extId = $data['id'] ?? "{$packageId}::{$pointName}::" . time();
        $ext = Extension::fromArray([
            'ext_id' => $extId,
            'point_name' => $pointName,
            'package_id' => $packageId,
            'component' => $data['component'] ?? null,
            'props' => $data['props'] ?? null,
            'order' => $data['order'] ?? 100,
            'priority' => $data['priority'] ?? 0,
            'is_override' => $data['override'] ?? false,
            'override_targets' => $data['overrideTargets'] ?? null,
            'metadata' => $data['metadata'] ?? null,
        ]);

        $existing = $this->findExtensionByExtId($extId);
        if ($existing) {
            return ['error' => "Extension \"{$extId}\" already registered", 'code' => 409];
        }

        $conflicts = $this->checkOverrideConflicts($pointName, $ext, $point);

        $disabledExtIds = [];
        $createdConflictIds = [];

        if (!empty($conflicts)) {
            $resolvedConflicts = $this->resolveConflicts($pointName, $ext, $conflicts, $point, $disabledExtIds);
            foreach ($resolvedConflicts as $conflict) {
                $conflictId = $this->persistConflict($conflict);
                if ($conflictId) {
                    $createdConflictIds[] = $conflictId;
                }
            }
        } else {
            $ext->state = 'active';
        }

        $this->persistExtension($ext);

        if ($rollbackContext !== null) {
            if (!isset($rollbackContext['disabled_extensions'])) {
                $rollbackContext['disabled_extensions'] = [];
            }
            if (!isset($rollbackContext['created_conflicts'])) {
                $rollbackContext['created_conflicts'] = [];
            }
            if (!isset($rollbackContext['created_extensions'])) {
                $rollbackContext['created_extensions'] = [];
            }
            $rollbackContext['disabled_extensions'] = array_unique(
                array_merge($rollbackContext['disabled_extensions'], $disabledExtIds)
            );
            $rollbackContext['created_conflicts'] = array_unique(
                array_merge($rollbackContext['created_conflicts'], $createdConflictIds)
            );
            $rollbackContext['created_extensions'][] = $extId;
        }

        return [
            'extension' => $ext->toArray(),
            'conflicts' => $conflicts,
        ];
    }

    public function getExtensions(?string $pointName = null): array
    {
        if ($pointName) {
            $stmt = $this->db->prepare("SELECT * FROM extensions WHERE point_name = :point ORDER BY priority DESC, `order` ASC");
            $stmt->execute([':point' => $pointName]);
        } else {
            $stmt = $this->db->query("SELECT * FROM extensions ORDER BY point_name, priority DESC, `order` ASC");
        }
        return array_map(fn($r) => Extension::fromArray($r), $stmt->fetchAll());
    }

    public function getActiveExtensions(string $pointName): array
    {
        $stmt = $this->db->prepare("SELECT * FROM extensions WHERE point_name = :point AND state = 'active' ORDER BY priority DESC, `order` ASC");
        $stmt->execute([':point' => $pointName]);
        return array_map(fn($r) => Extension::fromArray($r), $stmt->fetchAll());
    }

    public function unregisterExtension(string $extId): bool
    {
        $stmt = $this->db->prepare("DELETE FROM extensions WHERE ext_id = :ext_id");
        return $stmt->execute([':ext_id' => $extId]) && $stmt->rowCount() > 0;
    }

    public function checkOverrideImpact(string $packageId): array
    {
        $pkg = $this->getPackage($packageId);
        if (!$pkg) {
            return ['can_install' => true, 'conflicts' => [], 'warnings' => []];
        }

        $impacts = ['can_install' => true, 'conflicts' => [], 'warnings' => []];
        $packageExtensions = $this->db->prepare("SELECT * FROM extensions WHERE package_id = :pid");
        $packageExtensions->execute([':pid' => $packageId]);
        $extList = $packageExtensions->fetchAll();

        foreach ($extList as $extData) {
            $ext = Extension::fromArray($extData);
            $point = $this->getPoint($ext->point_name);

            if (!$point) {
                $impacts['warnings'][] = [
                    'type' => 'missing_point',
                    'point_name' => $ext->point_name,
                    'message' => "Extension point \"{$ext->point_name}\" is not defined",
                ];
                continue;
            }

            $existingExts = $this->getActiveExtensions($ext->point_name);
            foreach ($existingExts as $existing) {
                if (!$point->multiple) {
                    $impacts['conflicts'][] = [
                        'type' => 'single_point_conflict',
                        'point_name' => $ext->point_name,
                        'existing_ext_id' => $existing->ext_id,
                        'existing_package_id' => $existing->package_id,
                        'resolution' => $point->strategy,
                    ];
                }
                if ($ext->is_override && $ext->override_targets && in_array($existing->ext_id, $ext->override_targets)) {
                    $impacts['conflicts'][] = [
                        'type' => 'explicit_override',
                        'point_name' => $ext->point_name,
                        'existing_ext_id' => $existing->ext_id,
                        'existing_package_id' => $existing->package_id,
                        'resolution' => 'incoming_replaces_existing',
                    ];
                }
            }
        }

        $impacts['can_install'] = empty(array_filter($impacts['conflicts'], fn($c) => $c['resolution'] === 'throw'));
        return $impacts;
    }

    public function getConflicts(?string $pointName = null, ?bool $resolved = null): array
    {
        $sql = "SELECT * FROM override_conflicts WHERE 1=1";
        $params = [];
        if ($pointName) {
            $sql .= " AND point_name = :point";
            $params[':point'] = $pointName;
        }
        if ($resolved !== null) {
            $sql .= " AND resolved = :resolved";
            $params[':resolved'] = $resolved ? 1 : 0;
        }
        $sql .= " ORDER BY detected_at DESC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return array_map(fn($r) => OverrideConflict::fromArray($r), $stmt->fetchAll());
    }

    public function resolveConflict(int $conflictId, string $resolution): ?OverrideConflict
    {
        $stmt = $this->db->prepare("SELECT * FROM override_conflicts WHERE id = :id");
        $stmt->execute([':id' => $conflictId]);
        $row = $stmt->fetch();
        if (!$row) return null;

        $conflict = OverrideConflict::fromArray($row);
        $update = $this->db->prepare(
            "UPDATE override_conflicts SET resolved = 1, resolution = :resolution WHERE id = :id"
        );
        $update->execute([':resolution' => $resolution, ':id' => $conflictId]);

        if ($resolution === 'incoming_wins') {
            $this->db->prepare("UPDATE extensions SET state = 'disabled' WHERE ext_id = :eid")
                ->execute([':eid' => $conflict->existing_ext_id]);
            $this->db->prepare("UPDATE extensions SET state = 'active' WHERE ext_id = :eid")
                ->execute([':eid' => $conflict->incoming_ext_id]);
        } elseif ($resolution === 'existing_wins') {
            $this->db->prepare("UPDATE extensions SET state = 'override_conflict' WHERE ext_id = :eid")
                ->execute([':eid' => $conflict->incoming_ext_id]);
        }

        $conflict->resolved = true;
        $conflict->resolution = $resolution;
        return $conflict;
    }

    public function getStats(): array
    {
        $points = $this->db->query("SELECT COUNT(*) as c FROM extension_points")->fetch()['c'];
        $extensions = $this->db->query("SELECT COUNT(*) as c FROM extensions")->fetch()['c'];
        $active = $this->db->query("SELECT COUNT(*) as c FROM extensions WHERE state = 'active'")->fetch()['c'];
        $packages = $this->db->query("SELECT COUNT(*) as c FROM packages")->fetch()['c'];
        $conflicts = $this->db->query("SELECT COUNT(*) as c FROM override_conflicts")->fetch()['c'];
        $unresolved = $this->db->query("SELECT COUNT(*) as c FROM override_conflicts WHERE resolved = 0")->fetch()['c'];
        return compact('points', 'extensions', 'active', 'packages', 'conflicts', 'unresolved');
    }

    private function findExtensionByExtId(string $extId): ?Extension
    {
        $stmt = $this->db->prepare("SELECT * FROM extensions WHERE ext_id = :ext_id");
        $stmt->execute([':ext_id' => $extId]);
        $row = $stmt->fetch();
        return $row ? Extension::fromArray($row) : null;
    }

    private function checkOverrideConflicts(string $pointName, Extension $newExt, ExtensionPoint $point): array
    {
        $conflicts = [];
        $existing = $this->getActiveExtensions($pointName);

        foreach ($existing as $ext) {
            if ($ext->ext_id === $newExt->ext_id) continue;

            if ($newExt->is_override && $newExt->override_targets && in_array($ext->ext_id, $newExt->override_targets)) {
                $conflicts[] = [
                    'type' => 'explicit_override',
                    'existing' => $ext,
                    'incoming' => $newExt,
                    'resolution' => 'incoming_replaces_existing',
                ];
                continue;
            }

            if ($ext->is_override && $ext->override_targets && in_array($newExt->ext_id, $ext->override_targets)) {
                $conflicts[] = [
                    'type' => 'explicit_override',
                    'existing' => $ext,
                    'incoming' => $newExt,
                    'resolution' => 'existing_replaces_incoming',
                ];
                continue;
            }

            if (!$point->multiple && count($existing) > 0) {
                $conflicts[] = [
                    'type' => 'single_point_conflict',
                    'existing' => $ext,
                    'incoming' => $newExt,
                    'resolution' => null,
                ];
            }
        }

        return $conflicts;
    }

    private function resolveConflicts(string $pointName, Extension &$newExt, array $conflicts, ExtensionPoint $point, array &$disabledExtIds = []): array
    {
        $resolved = [];
        $strategy = $point->strategy;

        foreach ($conflicts as $conflict) {
            $record = [
                'point_name' => $pointName,
                'type' => $conflict['type'],
                'existing_ext_id' => $conflict['existing']->ext_id,
                'existing_package_id' => $conflict['existing']->package_id,
                'incoming_ext_id' => $newExt->ext_id,
                'incoming_package_id' => $newExt->package_id,
                'strategy' => $strategy,
                'resolved' => false,
                'resolution' => null,
            ];

            $disableExt = function ($extId) use (&$disabledExtIds) {
                $disabledExtIds[] = $extId;
            };

            if ($conflict['resolution'] === 'incoming_replaces_existing') {
                $this->db->prepare("UPDATE extensions SET state = 'disabled' WHERE ext_id = :eid")
                    ->execute([':eid' => $conflict['existing']->ext_id]);
                $disableExt($conflict['existing']->ext_id);
                $newExt->state = 'active';
                $record['resolved'] = true;
                $record['resolution'] = 'incoming_override';
            } elseif ($conflict['resolution'] === 'existing_replaces_incoming') {
                $newExt->state = 'override_conflict';
                $record['resolved'] = true;
                $record['resolution'] = 'existing_override';
            } else {
                switch ($strategy) {
                    case 'throw':
                        $record['resolved'] = false;
                        break;
                    case 'last_wins':
                        $this->db->prepare("UPDATE extensions SET state = 'disabled' WHERE ext_id = :eid")
                            ->execute([':eid' => $conflict['existing']->ext_id]);
                        $disableExt($conflict['existing']->ext_id);
                        $newExt->state = 'active';
                        $record['resolved'] = true;
                        $record['resolution'] = 'last_wins';
                        break;
                    case 'first_wins':
                        $newExt->state = 'override_conflict';
                        $record['resolved'] = true;
                        $record['resolution'] = 'first_wins';
                        break;
                    case 'stack':
                        $newExt->state = 'active';
                        $record['resolved'] = true;
                        $record['resolution'] = 'stacked';
                        break;
                    case 'merge':
                        $newExt->state = 'active';
                        $newExt->props = array_merge($conflict['existing']->props ?? [], $newExt->props ?? []);
                        $this->db->prepare("UPDATE extensions SET state = 'disabled' WHERE ext_id = :eid")
                            ->execute([':eid' => $conflict['existing']->ext_id]);
                        $disableExt($conflict['existing']->ext_id);
                        $record['resolved'] = true;
                        $record['resolution'] = 'merged';
                        break;
                    default:
                        $newExt->state = 'active';
                }
            }

            $resolved[] = $record;
        }

        if ($newExt->state !== 'active' && $newExt->state !== 'override_conflict') {
            $newExt->state = 'active';
        }

        return $resolved;
    }

    private function persistExtension(Extension $ext): void
    {
        $stmt = $this->db->prepare(
            "INSERT INTO extensions (ext_id, point_name, package_id, component, props, `order`, priority, state, is_override, override_targets, metadata)
             VALUES (:ext_id, :point_name, :package_id, :component, :props, :order_val, :priority, :state, :is_override, :override_targets, :metadata)"
        );
        $stmt->execute([
            ':ext_id' => $ext->ext_id,
            ':point_name' => $ext->point_name,
            ':package_id' => $ext->package_id,
            ':component' => $ext->component,
            ':props' => $ext->props ? json_encode($ext->props) : null,
            ':order_val' => $ext->order,
            ':priority' => $ext->priority,
            ':state' => $ext->state,
            ':is_override' => $ext->is_override ? 1 : 0,
            ':override_targets' => $ext->override_targets ? json_encode($ext->override_targets) : null,
            ':metadata' => $ext->metadata ? json_encode($ext->metadata) : null,
        ]);
        $ext->id = (int)$this->db->lastInsertId();
    }

    private function persistConflict(array $conflict): ?int
    {
        $stmt = $this->db->prepare(
            "INSERT INTO override_conflicts (point_name, type, existing_ext_id, existing_package_id, incoming_ext_id, incoming_package_id, strategy, resolved, resolution)
             VALUES (:point_name, :type, :existing_ext_id, :existing_package_id, :incoming_ext_id, :incoming_package_id, :strategy, :resolved, :resolution)"
        );
        $stmt->execute([
            ':point_name' => $conflict['point_name'],
            ':type' => $conflict['type'],
            ':existing_ext_id' => $conflict['existing_ext_id'],
            ':existing_package_id' => $conflict['existing_package_id'],
            ':incoming_ext_id' => $conflict['incoming_ext_id'],
            ':incoming_package_id' => $conflict['incoming_package_id'],
            ':strategy' => $conflict['strategy'],
            ':resolved' => $conflict['resolved'] ? 1 : 0,
            ':resolution' => $conflict['resolution'],
        ]);
        return (int)$this->db->lastInsertId() ?: null;
    }

    public function createRollbackRecord(string $packageId, array $rollbackContext): PackageRollback
    {
        $stmt = $this->db->prepare(
            "INSERT INTO package_rollbacks (package_id, operation_type, disabled_extensions, created_conflicts)
             VALUES (:package_id, :operation_type, :disabled_extensions, :created_conflicts)"
        );
        $stmt->execute([
            ':package_id' => $packageId,
            ':operation_type' => 'register',
            ':disabled_extensions' => !empty($rollbackContext['disabled_extensions']) ? json_encode($rollbackContext['disabled_extensions']) : null,
            ':created_conflicts' => !empty($rollbackContext['created_conflicts']) ? json_encode($rollbackContext['created_conflicts']) : null,
        ]);
        $id = (int)$this->db->lastInsertId();
        $rb = PackageRollback::fromArray([
            'id' => $id,
            'package_id' => $packageId,
            'operation_type' => 'register',
            'disabled_extensions' => $rollbackContext['disabled_extensions'] ?? null,
            'created_conflicts' => $rollbackContext['created_conflicts'] ?? null,
            'rolled_back' => false,
            'created_at' => date('Y-m-d H:i:s'),
        ]);
        $rb->id = $id;
        return $rb;
    }

    public function rollbackPackage(string $packageId): array
    {
        $result = [
            'success' => false,
            'message' => '',
            'restored_extensions' => [],
            'removed_extensions' => [],
            'removed_conflicts' => [],
            'rollback_id' => null,
        ];

        $pkg = $this->getPackage($packageId);
        if (!$pkg) {
            $result['message'] = "扩展包 \"{$packageId}\" 不存在";
            return $result;
        }

        $stmt = $this->db->prepare(
            "SELECT * FROM package_rollbacks WHERE package_id = :pid AND rolled_back = 0 ORDER BY created_at DESC LIMIT 1"
        );
        $stmt->execute([':pid' => $packageId]);
        $row = $stmt->fetch();
        if (!$row) {
            $result['message'] = "没有可回滚的记录，将执行删除操作";
            $this->db->prepare("DELETE FROM extensions WHERE package_id = :pid")->execute([':pid' => $packageId]);
            $this->db->prepare("DELETE FROM packages WHERE package_id = :pid")->execute([':pid' => $packageId]);
            $result['success'] = true;
            return $result;
        }

        $rollback = PackageRollback::fromArray($row);

        $this->db->beginTransaction();
        try {
            $disabledExts = $rollback->disabled_extensions ?? [];
            if (is_array($disabledExts) && count($disabledExts) > 0) {
                $placeholders = implode(',', array_fill(0, count($disabledExts), '?'));
                $restoreStmt = $this->db->prepare("UPDATE extensions SET state = 'active' WHERE ext_id IN ({$placeholders})");
                $restoreStmt->execute($disabledExts);
                $result['restored_extensions'] = $disabledExts;
            }

            $createdExtsStmt = $this->db->prepare("SELECT ext_id FROM extensions WHERE package_id = :pid");
            $createdExtsStmt->execute([':pid' => $packageId]);
            $createdExtIds = array_column($createdExtsStmt->fetchAll(), 'ext_id');

            if (count($createdExtIds) > 0) {
                $placeholders = implode(',', array_fill(0, count($createdExtIds), '?'));
                $this->db->prepare("DELETE FROM extensions WHERE ext_id IN ({$placeholders})")
                    ->execute($createdExtIds);
                $result['removed_extensions'] = $createdExtIds;
            }

            $conflictIds = $rollback->created_conflicts ?? [];
            if (is_array($conflictIds) && count($conflictIds) > 0) {
                $placeholders = implode(',', array_fill(0, count($conflictIds), '?'));
                $this->db->prepare("DELETE FROM override_conflicts WHERE id IN ({$placeholders})")
                    ->execute($conflictIds);
                $result['removed_conflicts'] = $conflictIds;
            }

            $this->db->prepare("DELETE FROM packages WHERE package_id = :pid")->execute([':pid' => $packageId]);

            $this->db->prepare(
                "UPDATE package_rollbacks SET rolled_back = 1, rolled_back_at = datetime('now') WHERE id = :id"
            )->execute([':id' => $rollback->id]);

            $this->db->commit();
            $result['success'] = true;
            $result['rollback_id'] = $rollback->id;
            $result['message'] = "扩展包 \"{$packageId}\" 回滚成功";
        } catch (\Throwable $e) {
            $this->db->rollBack();
            $result['message'] = "回滚失败: " . $e->getMessage();
        }

        return $result;
    }

    public function getRollbacks(?string $packageId = null): array
    {
        $sql = "SELECT * FROM package_rollbacks WHERE 1=1";
        $params = [];
        if ($packageId) {
            $sql .= " AND package_id = :pid";
            $params[':pid'] = $packageId;
        }
        $sql .= " ORDER BY created_at DESC LIMIT 50";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return array_map(fn($r) => PackageRollback::fromArray($r), $stmt->fetchAll());
    }
}
