<?php
declare(strict_types=1);

namespace App;

final class SyrveClient
{
    public static function deliveriesByDateAndStatus(
        string $token,
        array $organizationIds,
        string $from,         // 'YYYY-MM-DD HH:MM:SS.mmm'
        string $to,           // 'YYYY-MM-DD HH:MM:SS.mmm'
        array $statuses = [], // опционально
        array $sourceKeys = [] // опционально
    ): array {
        $body = [
            'organizationIds'  => array_values($organizationIds),
            'deliveryDateFrom' => $from,
            'deliveryDateTo'   => $to,
        ];
        if ($statuses)   $body['statuses']   = array_values($statuses);
        if ($sourceKeys) $body['sourceKeys'] = array_values($sourceKeys);

        return Http::postJson('/api/1/deliveries/by_delivery_date_and_status', $body, $token);
    }

    public static function orderByTable(
        string $token,
        array $organizationIds,
        array $tableIds,
        string $from,
        string $to,
        array $statuses = ['Closed']
    ): array {
        return Http::postJson('/api/1/order/by_table', [
            'organizationIds' => array_values($organizationIds),
            'tableIds'        => array_values($tableIds),
            'statuses'        => array_values($statuses),
            'dateFrom'        => $from,
            'dateTo'          => $to,
        ], $token);
    }

    public static function reserveAvailableRestaurantSections(
        string $token,
        array $terminalGroupIds,
        bool $returnSchema = true
    ): array {
        return Http::postJson('/api/1/reserve/available_restaurant_sections', [
            'terminalGroupIds' => array_values($terminalGroupIds),
            'returnSchema'     => $returnSchema,
        ], $token);
    }
    public static function orderTypes(string $token, array $organizationIds): array {
        return Http::postJson('/api/1/deliveries/order_types', [
            'organizationIds' => array_values($organizationIds)
        ], $token);
    }

    private static function tokenCachePath(string $apiLogin): string {
        return __DIR__ . '/../var/token_' . sha1($apiLogin) . '.json';
    }

    /** Raw HTTP call with simple token cache */
    public static function accessToken(string $apiLogin): array
    {
        $f = self::tokenCachePath($apiLogin);
        if (is_file($f)) {
            $raw = json_decode((string)@file_get_contents($f), true);
            if (is_array($raw) && isset($raw['token']) && ($raw['ts']??0) > time()-600) {
                return ['http_code'=>200, 'response'=>['token'=>$raw['token']]];
            }
        }
        $res = Http::postJson('/api/1/access_token', ['apiLogin' => $apiLogin]);
        $tok = self::extractToken($res);
        if ($tok) @file_put_contents($f, json_encode(['token'=>$tok,'ts'=>time()]));
        return $res;
    }

    public static function organizations(string $token): array
    {
        return Http::postJson('/api/1/organizations', (object)[], $token);
    }

    public static function nomenclature(string $token, string $organizationId, int $startRevision = 0): array
    {
        return Http::postJson('/api/1/nomenclature', [
            'organizationId' => $organizationId,
            'startRevision'  => $startRevision,
        ], $token);
    }

    /** Extract bearer token supporting both plain-string and {token: "..."} formats */
    public static function extractToken(array $http): ?string
    {
        $resp = $http['response'] ?? null;
        if (is_string($resp)) {
            // plain string token
            return $resp;
        }
        if (is_array($resp)) {
            foreach ($resp as $k => $v) {
                if (is_string($k) && strtolower($k) === 'token' && is_string($v)) {
                    return $v;
                }
            }
        }
        return null;
    }
    // + NEW: терминалы, оплата, города/улицы, доставка, статус команды
    public static function terminalGroups(string $token, array $organizationIds, bool $includeDisabled=true): array {
        return Http::postJson('/api/1/terminal_groups', [
            'organizationIds'   => array_values($organizationIds),
            'includeDisabled'   => $includeDisabled,
            'returnExternalData'=> []
        ], $token);
    }
    public static function terminalIsAlive(string $token, array $orgIds, array $terminalGroupIds = []): array {
        $body = ['organizationIds' => array_values(array_filter($orgIds))];
        if (!empty($terminalGroupIds)) {
            $body['terminalGroupIds'] = array_values(array_filter($terminalGroupIds));
        }
        return Http::postJson('/api/1/terminal_groups/is_alive', $body, $token);
    }

    public static function paymentTypes(string $token, array $organizationIds): array {
        return Http::postJson('/api/1/payment_types', [
            'organizationIds' => array_values($organizationIds)
        ], $token);
    }
    public static function cities(string $token, array $organizationIds, bool $includeDeleted=false): array {
        return Http::postJson('/api/1/cities', [
            'organizationIds' => array_values($organizationIds),
            'includeDeleted'  => $includeDeleted
        ], $token);
    }
    public static function streetsByCity(string $token, string $organizationId, string $cityId, bool $includeDeleted=false): array {
        return Http::postJson('/api/1/streets/by_city', [
            'organizationId'  => $organizationId,
            'cityId'          => $cityId,
            'includeDeleted'  => $includeDeleted
        ], $token);
    }
    public static function deliveriesCreate(string $token, array $payload): array {
        return Http::postJson('/api/1/deliveries/create', $payload, $token);
    }
    public static function deliveriesDraftCreate(string $token, array $payload): array {
        return Http::postJson('/api/1/deliveries/drafts/create', $payload, $token);
    }
    public static function commandsStatus(string $token, string $organizationId, string $correlationId): array {
        return Http::postJson('/api/1/commands/status', [
            'organizationId' => $organizationId,
            'correlationId'  => $correlationId,
        ], $token);
    }
    public static function cancelCauses(string $token, array $organizationIds): array {
        return Http::postJson('/api/1/cancel_causes', [
            'organizationIds' => array_values($organizationIds)
        ], $token);
    }

    public static function discounts(string $token, array $organizationIds): array {
        return Http::postJson('/api/1/discounts', [
            'organizationIds' => array_values($organizationIds)
        ], $token);
    }

    public static function removalTypes(string $token, array $organizationIds): array {
        return Http::postJson('/api/1/removal_types', [
            'organizationIds' => array_values($organizationIds)
        ], $token);
    }

    public static function tipsTypes(string $token, array $organizationIds): array {
        return Http::postJson('/api/1/tips_types', [
            'organizationIds' => array_values($organizationIds)
        ], $token);
    }
    public static function employeesCouriers(string $token, array $organizationIds): array {
        return Http::postJson('/api/1/employees/couriers', [
            'organizationIds' => array_values($organizationIds)
        ], $token);
    }

    public static function employeesCouriersByRole(string $token, array $organizationIds, array $roles): array {
        // API ожидает rolesToCheck
        return Http::postJson('/api/1/employees/couriers/by_role', [
            'organizationIds' => array_values($organizationIds),
            'rolesToCheck'    => array_values($roles),
        ], $token);
    }

    public static function employeesCouriersLocationsByTimeOffset(string $token, array $organizationIds, int $minutes): array {
        return Http::postJson('/api/1/employees/couriers/locations/by_time_offset', [
            'organizationIds'      => array_values($organizationIds),
            'timeOffsetInMinutes'  => $minutes
        ], $token);
    }

    public static function employeesCouriersActiveLocation(string $token, array $organizationIds, array $courierIds): array {
        return Http::postJson('/api/1/employees/couriers/active_location', [
            'organizationIds' => array_values($organizationIds),
            'courierIds'      => array_values($courierIds)
        ], $token);
    }

    public static function employeesCouriersActiveLocationByTerminal(
        string $token,
        string $organizationId,
        array $terminalGroupIds = [],
        string $terminalGroupId = ''
    ): array {
        $body = ['organizationId' => $organizationId];

        if ($terminalGroupId !== '') {
            // сервер явно просит terminalGroupId
            $body['terminalGroupId'] = $terminalGroupId;
        } elseif (count($terminalGroupIds) === 1) {
            // один элемент в массиве — тоже шлём singular
            $body['terminalGroupId'] = (string)reset($terminalGroupIds);
        } else {
            $body['terminalGroupIds'] = array_values($terminalGroupIds);
        }

        return Http::postJson('/api/1/employees/couriers/active_location/by_terminal', $body, $token);
    }


    public static function employeesInfo(string $token, array $organizationIds, array $employeeIds): array {
        $orgId = (string)($organizationIds[0] ?? '');
        $empId = (string)($employeeIds[0] ?? '');
        return Http::postJson('/api/1/employees/info', [
            'organizationId' => $orgId,
            'id'             => $empId,
        ], $token);
    }




    public static function employeesShiftClockin(string $token, string $organizationId, string $employeeId): array {
        return Http::postJson('/api/1/employees/shift/clockin', [
            'organizationId' => $organizationId,
            'employeeId'     => $employeeId
        ], $token);
    }

    public static function employeesShiftClockout(string $token, string $organizationId, string $employeeId): array {
        return Http::postJson('/api/1/employees/shift/clockout', [
            'organizationId' => $organizationId,
            'employeeId'     => $employeeId
        ], $token);
    }

    public static function employeesShiftIsOpen(string $token, string $organizationId, string $employeeId, string $terminalGroupId = ''): array {
        $body = [
            'organizationId' => $organizationId,
            'employeeId'     => $employeeId,
        ];
        if ($terminalGroupId !== '') $body['terminalGroupId'] = $terminalGroupId;
        return Http::postJson('/api/1/employees/shift/is_open', $body, $token);
    }


    public static function employeesShiftsByCourier(string $token, array $organizationIds, array $employeeIds, string $from, string $to): array {
        return Http::postJson('/api/1/employees/shifts/by_courier', [
            'organizationIds' => array_values($organizationIds),
            'employeeIds'     => array_values($employeeIds),
            'dateFrom'        => $from,
            'dateTo'          => $to
        ], $token);
    }
    /** Regions */
    public static function regions(string $token, array $organizationIds, bool $includeDeleted=false): array {
        return Http::postJson('/api/1/regions', [
            'organizationIds' => array_values($organizationIds),
            'includeDeleted'  => $includeDeleted,
        ], $token);
    }
    /** Delivery restrictions (полный список по орг-ям) */
    public static function deliveryRestrictions(string $token, array $organizationIds): array {
        return Http::postJson('/api/1/delivery_restrictions', [
            'organizationIds' => array_values($organizationIds),
        ], $token);
    }

    /** Проверка «адрес разрешён?» */
    public static function deliveryRestrictionsAllowed(
        string $token,
        string $organizationId,
        array $deliveryAddress,               // ['regionId'?, 'cityId', 'streetId', 'house', ...]
        ?array $coordinates = null,           // ['latitude'=>..., 'longitude'=>...]
        ?string $terminalGroupId = null,      // если нужно таргетнуть терминал
        ?bool $isCourierDelivery = true       // NEW: обязателен на API; по умолчанию true
    ): array {
        $body = [
            'organizationId'   => $organizationId,
            'deliveryAddress'  => $deliveryAddress,
            'isCourierDelivery'=> $isCourierDelivery ?? true,
        ];
        if ($coordinates && isset($coordinates['latitude'], $coordinates['longitude'])) {
            $body['coordinates'] = [
                'latitude'  => (float)$coordinates['latitude'],
                'longitude' => (float)$coordinates['longitude'],
            ];
        }
        if ($terminalGroupId) {
            $body['terminalGroupId'] = $terminalGroupId;
        }
        return Http::postJson('/api/1/delivery_restrictions/allowed', $body, $token);
    }


    /** Marketing sources */
    public static function marketingSources(string $token, array $organizationIds): array {
        return Http::postJson('/api/1/marketing_sources', [
            'organizationIds' => array_values($organizationIds),
        ], $token);
    }

    /** ===== LOYALTY (Syrve) ===== */

    /** Карта поддерживаемых лояльность-эндпоинтов */
    private static function loyaltyMap(): array {
        return [
            // Discounts & promotions
            'calculate'                  => '/api/1/loyalty/syrve/calculate',
            'manual_condition'           => '/api/1/loyalty/syrve/manual_condition',
            'program'                    => '/api/1/loyalty/syrve/program',
            'coupons_info'               => '/api/1/loyalty/syrve/coupons/info',
            'coupons_series'             => '/api/1/loyalty/syrve/coupons/series',
            'coupons_by_series'          => '/api/1/loyalty/syrve/coupons/by_series',

            // Customer categories
            'customer_category'          => '/api/1/loyalty/syrve/customer_category',
            'customer_category_add'      => '/api/1/loyalty/syrve/customer_category/add',
            'customer_category_remove'   => '/api/1/loyalty/syrve/customer_category/remove',

            // Customers
            'customer_info'              => '/api/1/loyalty/syrve/customer/info',
            'customer_create_or_update'  => '/api/1/loyalty/syrve/customer/create_or_update',
            'delete_customers'           => '/api/1/loyalty/syrve/delete_customers',
            'restore_customers'          => '/api/1/loyalty/syrve/restore_customers',
            'customer_program_add'       => '/api/1/loyalty/syrve/customer/program/add',
            'customer_card_add'          => '/api/1/loyalty/syrve/customer/card/add',
            'customer_card_remove'       => '/api/1/loyalty/syrve/customer/card/remove',
            'customer_wallet_hold'       => '/api/1/loyalty/syrve/customer/wallet/hold',
            'customer_wallet_cancel_hold'=> '/api/1/loyalty/syrve/customer/wallet/cancel_hold',
            'customer_wallet_topup'      => '/api/1/loyalty/syrve/customer/wallet/topup',
            'customer_wallet_chargeoff'  => '/api/1/loyalty/syrve/customer/wallet/chargeoff',
            'get_counters'               => '/api/1/loyalty/syrve/get_counters',

            // Messages
            'check_sms_sending_possibility' => '/api/1/loyalty/syrve/check_sms_sending_possibility',
            'message_send_sms'               => '/api/1/loyalty/syrve/message/send_sms',
            'check_sms_status'               => '/api/1/loyalty/syrve/check_sms_status',
            'message_send_email'             => '/api/1/loyalty/syrve/message/send_email',

            // Reports
            'customer_transactions_by_revision' => '/api/1/loyalty/syrve/customer/transactions/by_revision',
            'customer_transactions_by_date'     => '/api/1/loyalty/syrve/customer/transactions/by_date',
        ];
    }

    /** Получить абсолютный путь эндпоинта по ключу (для логов/валидации) */
    public static function loyaltyEndpointPath(string $name): ?string {
        $map = self::loyaltyMap();
        return $map[$name] ?? null;
    }

    /** Универсальный вызов LOYALTY по имени эндпоинта из карты выше */
    public static function loyalty(string $token, string $name, array $payload): array {
        $path = self::loyaltyEndpointPath($name);
        if (!$path) {
            return ['http_code'=>400, 'response'=>['error'=>'unknown loyalty endpoint: '.$name]];
        }
        return Http::postJson($path, $payload, $token);
    }


}
