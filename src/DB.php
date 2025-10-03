<?php
declare(strict_types=1);

namespace App;

use SQLite3;
use DateTimeImmutable;
use DateTimeInterface;

final class DB
{
    private static ?SQLite3 $db = null;

    public static function conn(): SQLite3
    {
        if (self::$db instanceof SQLite3) {
            return self::$db;
        }
        $dir = dirname(Config::DB_PATH);
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        self::$db = new SQLite3(Config::DB_PATH);
        self::$db->exec('PRAGMA journal_mode=WAL;');
        self::$db->exec('PRAGMA foreign_keys=ON;');

        // --- уже было ---
        self::$db->exec('CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            api_login TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL
        )');
        self::$db->exec('CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            account_id INTEGER,
            endpoint TEXT NOT NULL,
            http_code INTEGER,
            duration_ms INTEGER,
            correlation_id TEXT,
            request_json TEXT,
            response_json TEXT,
            curl_info TEXT,
            error TEXT,
            FOREIGN KEY(account_id) REFERENCES accounts(id)
        )');

        // --- НОВОЕ: учёт аккаунтов iikoServer и их токенов ---
        self::$db->exec('CREATE TABLE IF NOT EXISTS accounts_server (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,           -- метка клиента/узла
            base_url TEXT NOT NULL,        -- https://host:port (без /resto)
            login TEXT NOT NULL,
            password_plain TEXT NOT NULL,  -- можно заменить на password_enc при шифровании
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )');
        self::$db->exec('CREATE UNIQUE INDEX IF NOT EXISTS ix_accounts_server_label ON accounts_server(label)');

        self::$db->exec('CREATE TABLE IF NOT EXISTS server_tokens (
            account_id INTEGER PRIMARY KEY,
            token TEXT NOT NULL,           -- cookie key
            acquired_at INTEGER NOT NULL,  -- unix ts
            FOREIGN KEY(account_id) REFERENCES accounts_server(id) ON DELETE CASCADE
        )');


        self::$db->exec('CREATE TABLE IF NOT EXISTS server_calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            account_id INTEGER NOT NULL,
            method TEXT NOT NULL,
            url TEXT NOT NULL,
            http_code INTEGER,
            duration_ms INTEGER,
            error TEXT,
            FOREIGN KEY(account_id) REFERENCES accounts_server(id) ON DELETE CASCADE
        )');
        self::$db->exec('CREATE INDEX IF NOT EXISTS ix_server_calls_account ON server_calls(account_id, ts)');

        return self::$db;
    }

    public static function nowIso(): string
    {
        return (new DateTimeImmutable('now'))->format(DateTimeInterface::ATOM);
    }
}
