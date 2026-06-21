<?php

namespace App\Service;

use App\Model\{ExtensionPoint, Extension, Package, OverrideConflict};
use PDO;

class ExtensionService
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
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

    public function registerExtension(string $packageId, array $data): array
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

        if (!empty($conflicts)) {
            $resolvedConflicts = $this->resolveConflicts($pointName, $ext, $conflicts, $point);
            foreach ($resolvedConflicts as $conflict) {
                $this->persistConflict($conflict);
            }
        } else {
            $ext->state = 'active';
        }

        $this->persistExtension($ext);

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

    private function resolveConflicts(string $pointName, Extension &$newExt, array $conflicts, ExtensionPoint $point): array
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

            if ($conflict['resolution'] === 'incoming_replaces_existing') {
                $this->db->prepare("UPDATE extensions SET state = 'disabled' WHERE ext_id = :eid")
                    ->execute([':eid' => $conflict['existing']->ext_id]);
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

    private function persistConflict(array $conflict): void
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
    }
}
