<?php
declare(strict_types=1);

namespace App;

final class Logger
{
    public static function logCall(?int $accountId, string $endpoint, array $http): void
    {
        $db = DB::conn();
        $stmt = $db->prepare('INSERT INTO logs(created_at, account_id, endpoint, http_code, duration_ms, correlation_id, request_json, response_json, curl_info, error) VALUES(?,?,?,?,?,?,?,?,?,?)');
        $stmt->bindValue(1, DB::nowIso(), SQLITE3_TEXT);
        $stmt->bindValue(2, $accountId, SQLITE3_INTEGER);
        $stmt->bindValue(3, $endpoint, SQLITE3_TEXT);
        $stmt->bindValue(4, $http['http_code'] ?? 0, SQLITE3_INTEGER);
        $stmt->bindValue(5, $http['duration_ms'] ?? 0, SQLITE3_INTEGER);
        $stmt->bindValue(6, $http['correlationId'] ?? null, SQLITE3_TEXT);
        $stmt->bindValue(7, json_encode($http['request'] ?? new \stdClass(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), SQLITE3_TEXT);
        $stmt->bindValue(8, json_encode($http['response'] ?? new \stdClass(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), SQLITE3_TEXT);
        $stmt->bindValue(9, json_encode($http['curl_info'] ?? new \stdClass(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), SQLITE3_TEXT);
        $stmt->bindValue(10, $http['error'] ?? null, SQLITE3_TEXT);
        $stmt->execute();
    }
}
