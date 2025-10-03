<?php
declare(strict_types=1);

namespace App;

/**
 * Минимальный HTTP-клиент под Syrve.
 * - POST JSON с bearer-токеном
 * - Явные глобальные вызовы \curl_* (чтобы не было App\curl_init)
 * - Fallback на stream-контекст, если cURL не установлен
 * - Возвращает массив вида: ['http_code'=>int, 'response'=>mixed, 'raw'=>string, 'duration_ms'=>int]
 */
final class Http
{
    /** База API. Можно переопределить переменной окружения SYRVE_BASE */
    private static function baseUrl(): string
    {
        $env = \getenv('SYRVE_BASE') ?: \getenv('SYRVE_API_BASE') ?: '';
        if ($env) return \rtrim($env, '/');
        // дефолт — EU
        return 'https://api-eu.syrve.live';
    }

    /**
     * POST JSON
     * @param string $path  Например: '/api/1/access_token'
     * @param array|object|string $body
     * @param string|null $bearer
     */
    public static function postJson(string $path, $body, ?string $bearer = null): array
    {
        $url = self::baseUrl() . $path;
        $payload = \is_string($body) ? $body : \json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $headers = [
            'Content-Type: application/json',
            'Accept: application/json',
        ];
        if ($bearer) {
            $headers[] = 'Authorization: Bearer ' . $bearer;
        }

        return self::request('POST', $url, $headers, $payload);
    }

    /** Универсальный запрос с авто-выбором транспорта */
    private static function request(string $method, string $url, array $headers, ?string $body): array
    {
        $t0 = \microtime(true);

        if (\function_exists('curl_init')) {
            $ch = \curl_init();
            \curl_setopt_array($ch, [
                CURLOPT_URL            => $url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_CUSTOMREQUEST  => $method,
                CURLOPT_HTTPHEADER     => $headers,
                CURLOPT_TIMEOUT        => 30,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
                // при необходимости: CURLOPT_ENCODING => ''  // авто gzip
            ]);

            if ($body !== null) {
                \curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
            }

            $raw   = \curl_exec($ch);
            $errno = \curl_errno($ch);
            $err   = \curl_error($ch);
            $code  = (int) \curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            \curl_close($ch);

            $ms = (int) \round((\microtime(true) - $t0) * 1000);

            if ($errno) {
                return [
                    'http_code'   => 0,
                    'error'       => 'curl_error',
                    'errno'       => $errno,
                    'message'     => $err,
                    'duration_ms' => $ms,
                ];
            }

            $resp = self::decodeJson($raw);
            return [
                'http_code'   => $code,
                'response'    => $resp,
                'raw'         => $raw,
                'duration_ms' => $ms,
            ];
        }

        // ---- Fallback без cURL (streams) ----
        $opts = [
            'http' => [
                'method'        => $method,
                'header'        => \implode("\r\n", $headers),
                'content'       => $body ?? '',
                'ignore_errors' => true, // чтобы читать тело даже при 4xx/5xx
                'timeout'       => 30,
            ],
            'ssl' => [
                'verify_peer'      => true,
                'verify_peer_name' => true,
            ],
        ];
        $ctx  = \stream_context_create($opts);
        $raw  = @\file_get_contents($url, false, $ctx);
        $code = self::parseStatusCode($http_response_header ?? []);
        $ms   = (int) \round((\microtime(true) - $t0) * 1000);

        if ($raw === false) {
            return [
                'http_code'   => 0,
                'error'       => 'stream_error',
                'duration_ms' => $ms,
            ];
        }

        $resp = self::decodeJson($raw);
        return [
            'http_code'   => $code,
            'response'    => $resp,
            'raw'         => $raw,
            'duration_ms' => $ms,
        ];
    }

    /** JSON->array (или отдаём сырую строку, если это не JSON) */
    private static function decodeJson(?string $raw)
    {
        if ($raw === null || $raw === '') return null;
        $dec = \json_decode($raw, true);
        return \json_last_error() === JSON_ERROR_NONE ? $dec : $raw;
    }

    /** Парсим HTTP статус из $http_response_header */
    private static function parseStatusCode(array $headers): int
    {
        foreach ($headers as $line) {
            if (\preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
                return (int) $m[1];
            }
        }
        return 0;
    }
}
