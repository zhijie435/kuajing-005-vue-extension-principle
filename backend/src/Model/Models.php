<?php

namespace App\Model;

class ExtensionPoint
{
    public ?int $id = null;
    public string $name;
    public ?string $description = null;
    public string $strategy = 'last_wins';
    public bool $multiple = true;
    public bool $required = false;
    public ?array $metadata = null;
    public string $created_at;

    public static function fromArray(array $data): self
    {
        $point = new self();
        $point->id = $data['id'] ?? null;
        $point->name = $data['name'];
        $point->description = $data['description'] ?? null;
        $point->strategy = $data['strategy'] ?? 'last_wins';
        $point->multiple = (bool)($data['multiple'] ?? true);
        $point->required = (bool)($data['required'] ?? false);
        $point->metadata = isset($data['metadata']) ? (is_string($data['metadata']) ? json_decode($data['metadata'], true) : $data['metadata']) : null;
        $point->created_at = $data['created_at'] ?? date('Y-m-d H:i:s');
        return $point;
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'strategy' => $this->strategy,
            'multiple' => $this->multiple,
            'required' => $this->required,
            'metadata' => $this->metadata,
            'created_at' => $this->created_at,
        ];
    }
}

class Extension
{
    public ?int $id = null;
    public string $ext_id;
    public string $point_name;
    public string $package_id;
    public ?string $component = null;
    public ?array $props = null;
    public int $order = 100;
    public int $priority = 0;
    public string $state = 'registered';
    public bool $is_override = false;
    public ?array $override_targets = null;
    public ?array $metadata = null;
    public string $registered_at;

    public static function fromArray(array $data): self
    {
        $ext = new self();
        $ext->id = $data['id'] ?? null;
        $ext->ext_id = $data['ext_id'] ?? ($data['id'] ?? '');
        $ext->point_name = $data['point_name'] ?? ($data['point'] ?? '');
        $ext->package_id = $data['package_id'] ?? '';
        $ext->component = $data['component'] ?? null;
        $ext->props = isset($data['props']) ? (is_string($data['props']) ? json_decode($data['props'], true) : $data['props']) : null;
        $ext->order = (int)($data['order'] ?? 100);
        $ext->priority = (int)($data['priority'] ?? 0);
        $ext->state = $data['state'] ?? 'registered';
        $ext->is_override = (bool)($data['is_override'] ?? false);
        $ext->override_targets = isset($data['override_targets']) ? (is_string($data['override_targets']) ? json_decode($data['override_targets'], true) : $data['override_targets']) : null;
        $ext->metadata = isset($data['metadata']) ? (is_string($data['metadata']) ? json_decode($data['metadata'], true) : $data['metadata']) : null;
        $ext->registered_at = $data['registered_at'] ?? date('Y-m-d H:i:s');
        return $ext;
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'ext_id' => $this->ext_id,
            'point_name' => $this->point_name,
            'package_id' => $this->package_id,
            'component' => $this->component,
            'props' => $this->props,
            'order' => $this->order,
            'priority' => $this->priority,
            'state' => $this->state,
            'is_override' => $this->is_override,
            'override_targets' => $this->override_targets,
            'metadata' => $this->metadata,
            'registered_at' => $this->registered_at,
        ];
    }
}

class Package
{
    public ?int $id = null;
    public string $package_id;
    public string $name;
    public string $version = '1.0.0';
    public ?string $description = null;
    public bool $enabled = true;
    public string $installed_at;

    public static function fromArray(array $data): self
    {
        $pkg = new self();
        $pkg->id = $data['id'] ?? null;
        $pkg->package_id = $data['package_id'] ?? ($data['id'] ?? '');
        $pkg->name = $data['name'] ?? $pkg->package_id;
        $pkg->version = $data['version'] ?? '1.0.0';
        $pkg->description = $data['description'] ?? null;
        $pkg->enabled = (bool)($data['enabled'] ?? true);
        $pkg->installed_at = $data['installed_at'] ?? date('Y-m-d H:i:s');
        return $pkg;
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'package_id' => $this->package_id,
            'name' => $this->name,
            'version' => $this->version,
            'description' => $this->description,
            'enabled' => $this->enabled,
            'installed_at' => $this->installed_at,
        ];
    }
}

class OverrideConflict
{
    public ?int $id = null;
    public string $point_name;
    public string $type;
    public string $existing_ext_id;
    public string $existing_package_id;
    public string $incoming_ext_id;
    public string $incoming_package_id;
    public string $strategy;
    public bool $resolved = false;
    public ?string $resolution = null;
    public string $detected_at;

    public static function fromArray(array $data): self
    {
        $conflict = new self();
        $conflict->id = $data['id'] ?? null;
        $conflict->point_name = $data['point_name'] ?? '';
        $conflict->type = $data['type'] ?? '';
        $conflict->existing_ext_id = $data['existing_ext_id'] ?? '';
        $conflict->existing_package_id = $data['existing_package_id'] ?? '';
        $conflict->incoming_ext_id = $data['incoming_ext_id'] ?? '';
        $conflict->incoming_package_id = $data['incoming_package_id'] ?? '';
        $conflict->strategy = $data['strategy'] ?? '';
        $conflict->resolved = (bool)($data['resolved'] ?? false);
        $conflict->resolution = $data['resolution'] ?? null;
        $conflict->detected_at = $data['detected_at'] ?? date('Y-m-d H:i:s');
        return $conflict;
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'point_name' => $this->point_name,
            'type' => $this->type,
            'existing_ext_id' => $this->existing_ext_id,
            'existing_package_id' => $this->existing_package_id,
            'incoming_ext_id' => $this->incoming_ext_id,
            'incoming_package_id' => $this->incoming_package_id,
            'strategy' => $this->strategy,
            'resolved' => $this->resolved,
            'resolution' => $this->resolution,
            'detected_at' => $this->detected_at,
        ];
    }
}
