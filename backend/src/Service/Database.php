<?php

namespace App\Service;

use PDO;

class Database
{
    private static ?PDO $instance = null;

    public static function getInstance(array $config): PDO
    {
        if (self::$instance !== null) {
            return self::$instance;
        }

        $driver = $config['driver'] ?? 'sqlite';

        if ($driver === 'sqlite') {
            $dbPath = $config['database'] ?? __DIR__ . '/../../db/extensions.sqlite';
            $dir = dirname($dbPath);
            if (!is_dir($dir)) {
                mkdir($dir, 0755, true);
            }
            $dsn = "sqlite:{$dbPath}";
            self::$instance = new PDO($dsn, null, null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            self::$instance->exec('PRAGMA journal_mode=WAL');
            self::$instance->exec('PRAGMA foreign_keys=ON');
        } else {
            $dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['database']};charset={$config['charset']}";
            self::$instance = new PDO($dsn, $config['username'], $config['password'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
        }

        return self::$instance;
    }

    public static function initialize(PDO $db): void
    {
        $db->exec("CREATE TABLE IF NOT EXISTS extension_points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            strategy TEXT NOT NULL DEFAULT 'last_wins',
            multiple INTEGER NOT NULL DEFAULT 1,
            required INTEGER NOT NULL DEFAULT 0,
            metadata TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )");

        $db->exec("CREATE TABLE IF NOT EXISTS packages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            package_id TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            version TEXT NOT NULL DEFAULT '1.0.0',
            description TEXT,
            enabled INTEGER NOT NULL DEFAULT 1,
            installed_at TEXT NOT NULL DEFAULT (datetime('now'))
        )");

        $db->exec("CREATE TABLE IF NOT EXISTS extensions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ext_id TEXT NOT NULL UNIQUE,
            point_name TEXT NOT NULL,
            package_id TEXT NOT NULL,
            component TEXT,
            props TEXT,
            `order` INTEGER NOT NULL DEFAULT 100,
            priority INTEGER NOT NULL DEFAULT 0,
            state TEXT NOT NULL DEFAULT 'registered',
            is_override INTEGER NOT NULL DEFAULT 0,
            override_targets TEXT,
            metadata TEXT,
            registered_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (point_name) REFERENCES extension_points(name) ON DELETE CASCADE,
            FOREIGN KEY (package_id) REFERENCES packages(package_id) ON DELETE CASCADE
        )");

        $db->exec("CREATE TABLE IF NOT EXISTS override_conflicts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            point_name TEXT NOT NULL,
            type TEXT NOT NULL,
            existing_ext_id TEXT NOT NULL,
            existing_package_id TEXT NOT NULL,
            incoming_ext_id TEXT NOT NULL,
            incoming_package_id TEXT NOT NULL,
            strategy TEXT NOT NULL,
            resolved INTEGER NOT NULL DEFAULT 0,
            resolution TEXT,
            detected_at TEXT NOT NULL DEFAULT (datetime('now'))
        )");

        $db->exec("CREATE INDEX IF NOT EXISTS idx_extensions_point ON extensions(point_name)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_extensions_package ON extensions(package_id)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_extensions_state ON extensions(state)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_conflicts_point ON override_conflicts(point_name)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_conflicts_resolved ON override_conflicts(resolved)");
    }
}
