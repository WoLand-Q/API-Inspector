<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require __DIR__ . '/../src/bootstrap.php';

use App\DB;
use App\Logger;
use App\SyrveClient;

function read_json_body(): array {
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function json_response(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

/**
 * Преобразует дату/время в ISO8601 UTC с миллисекундами (…Z) или возвращает null.
 * Принимает: '2025-09-30', '2025-09-30 13:25', '2025-09-30T13:25:00+03:00',
 * '2025-09-30T13:25:00.123Z' и т.п.
 */
function iso_or_null(?string $s): ?string {
    $t = trim((string)$s);
    if ($t === '') return null;
    try {
        $dt = new \DateTimeImmutable($t);
    } catch (\Throwable $e) {
        return null;
    }
    return $dt->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
}


$action = $_GET['action'] ?? '';

switch ($action) {
    case 'add_account': {
        $data = read_json_body();
        $title = trim((string)($data['title'] ?? ''));
        $api_login = trim((string)($data['api_login'] ?? ''));
        if ($title === '' || $api_login === '') json_response(['error' => 'title and api_login are required'], 400);
        $stmt = DB::conn()->prepare('INSERT OR IGNORE INTO accounts(title, api_login, created_at) VALUES(?,?,?)');
        $stmt->bindValue(1, $title, SQLITE3_TEXT);
        $stmt->bindValue(2, $api_login, SQLITE3_TEXT);
        $stmt->bindValue(3, DB::nowIso(), SQLITE3_TEXT);
        $stmt->execute();
        json_response(['ok' => true]);
    }

    case 'update_account': {
        $d = read_json_body();
        $id = (int)($d['id'] ?? 0);
        $title = trim((string)($d['title'] ?? ''));
        if (!$id || $title==='') json_response(['error'=>'id and title required'], 400);
        $stmt = DB::conn()->prepare('UPDATE accounts SET title=? WHERE id=?');
        $stmt->bindValue(1,$title,SQLITE3_TEXT);
        $stmt->bindValue(2,$id,SQLITE3_INTEGER);
        $stmt->execute();
        json_response(['ok'=>true]);
    }

    case 'delete_account': {
        $d = read_json_body();
        $id = (int)($d['id'] ?? 0);
        if (!$id) json_response(['error'=>'id required'], 400);
        $stmt = DB::conn()->prepare('DELETE FROM accounts WHERE id=?');
        $stmt->bindValue(1,$id,SQLITE3_INTEGER);
        $stmt->execute();
        json_response(['ok'=>true]);
    }

    case 'list_accounts': {
        $rows = [];
        $res = DB::conn()->query('SELECT id, title, api_login, created_at FROM accounts ORDER BY id DESC');
        while ($row = $res->fetchArray(SQLITE3_ASSOC)) $rows[] = $row;
        json_response(['accounts' => $rows]);
    }

    case 'fetch_orgs': {
        $data = read_json_body();
        $accountId = (int)($data['account_id'] ?? 0);
        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = ' . $accountId, true);
        if (!$row) json_response(['error' => 'account not found'], 404);

        $tokenRes = SyrveClient::accessToken($row['api_login']);
        Logger::logCall($accountId, '/api/1/access_token', $tokenRes);
        if (($tokenRes['http_code'] ?? 0) !== 200) {
            json_response(['error' => 'access_token http error', 'http' => $tokenRes], 502);
        }
        $token = SyrveClient::extractToken($tokenRes);
        if (!is_string($token)) {
            json_response(['error' => 'cannot parse token', 'http' => $tokenRes], 502);
        }

        $orgsRes = SyrveClient::organizations($token);
        Logger::logCall($accountId, '/api/1/organizations', $orgsRes);
        if (($orgsRes['http_code'] ?? 0) !== 200) {
            json_response(['error' => 'organizations http error', 'http' => $orgsRes], 502);
        }
        json_response(['orgs' => $orgsRes]);
    }

    case 'fetch_menu': {
        $data = read_json_body();
        $accountId = (int)($data['account_id'] ?? 0);
        $organizationId = (string)($data['organizationId'] ?? '');
        if (!$organizationId) json_response(['error' => 'organizationId required'], 400);

        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = ' . $accountId, true);
        if (!$row) json_response(['error' => 'account not found'], 404);

        $tokenRes = SyrveClient::accessToken($row['api_login']);
        Logger::logCall($accountId, '/api/1/access_token', $tokenRes);
        if (($tokenRes['http_code'] ?? 0) !== 200) {
            json_response(['error' => 'access_token http error', 'http' => $tokenRes], 502);
        }
        $token = SyrveClient::extractToken($tokenRes);
        if (!is_string($token)) {
            json_response(['error' => 'cannot parse token', 'http' => $tokenRes], 502);
        }

        $menuRes = SyrveClient::nomenclature($token, $organizationId, 0);
        Logger::logCall($accountId, '/api/1/nomenclature', $menuRes);
        if (($menuRes['http_code'] ?? 0) !== 200) {
            json_response(['error' => 'nomenclature http error', 'http' => $menuRes], 502);
        }
        json_response(['menu' => $menuRes]);
    }

    case 'logs': {
        $rows = [];
        $res = DB::conn()->query('SELECT id, created_at, account_id, endpoint, http_code, duration_ms, correlation_id FROM logs ORDER BY id DESC LIMIT 100');
        while ($row = $res->fetchArray(SQLITE3_ASSOC)) $rows[] = $row;
        json_response(['logs' => $rows]);
    }

    case 'log_detail': {
        $id = (int)($_GET['id'] ?? 0);
        $row = DB::conn()->querySingle('SELECT * FROM logs WHERE id = ' . $id, true);
        if (!$row) json_response(['error' => 'not found'], 404);
        json_response(['log' => $row]);
    }
    case 'terminal_groups': {
        $d = read_json_body();
        $accountId = (int)($d['account_id'] ?? 0);
        $orgId     = (string)($d['organizationId'] ?? '');
        if (!$orgId) json_response(['error'=>'organizationId required'], 400);

        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = '.$accountId, true);
        if (!$row) json_response(['error'=>'account not found'], 404);

        $tok = SyrveClient::accessToken($row['api_login']); Logger::logCall($accountId,'/api/1/access_token',$tok);
        if (($tok['http_code']??0)!==200) json_response(['error'=>'access_token http error','http'=>$tok], 502);
        $bearer = SyrveClient::extractToken($tok) ?? '';

        $resp = SyrveClient::terminalGroups($bearer, [$orgId]);
        Logger::logCall($accountId,'/api/1/terminal_groups',$resp);
        json_response(['terminal_groups'=>$resp]);
    }

    case 'terminal_is_alive': {
        $d = read_json_body();
        $accountId = (int)($d['account_id'] ?? 0);
        $orgId     = (string)($d['organizationId'] ?? '');
        $ids       = (array)($d['terminalGroupIds'] ?? []);

        if (!$orgId) json_response(['error'=>'organizationId required'], 400);
        if (!$ids)   json_response(['error'=>'terminalGroupIds required'], 400);

        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = '.$accountId, true);
        if (!$row) json_response(['error'=>'account not found'], 404);

        $tok = SyrveClient::accessToken($row['api_login']); Logger::logCall($accountId,'/api/1/access_token',$tok);
        if (($tok['http_code']??0)!==200) json_response(['error'=>'access_token http error','http'=>$tok], 502);
        $bearer = SyrveClient::extractToken($tok) ?? '';

        $resp = SyrveClient::terminalIsAlive($bearer, [$orgId], $ids);
        Logger::logCall($accountId,'/api/1/terminal_groups/is_alive',$resp);

        json_response(['is_alive'=>$resp]);
    }


    case 'payment_types': {
        $d = read_json_body();
        $accountId = (int)($d['account_id'] ?? 0);
        $orgId     = (string)($d['organizationId'] ?? '');
        if (!$orgId) json_response(['error'=>'organizationId required'], 400);
        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = '.$accountId, true);
        if (!$row) json_response(['error'=>'account not found'], 404);
        $tok = SyrveClient::accessToken($row['api_login']); Logger::logCall($accountId,'/api/1/access_token',$tok);
        if (($tok['http_code']??0)!==200) json_response(['error'=>'access_token http error','http'=>$tok], 502);
        $bearer = SyrveClient::extractToken($tok) ?? '';
        $resp = SyrveClient::paymentTypes($bearer, [$orgId]);
        Logger::logCall($accountId,'/api/1/payment_types',$resp);
        json_response(['payment_types'=>$resp]);
    }

    case 'cities': {
        $d = read_json_body();
        $accountId = (int)($d['account_id'] ?? 0);
        $orgId     = (string)($d['organizationId'] ?? '');
        if (!$orgId) json_response(['error'=>'organizationId required'], 400);
        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = '.$accountId, true);
        if (!$row) json_response(['error'=>'account not found'], 404);
        $tok = SyrveClient::accessToken($row['api_login']); Logger::logCall($accountId,'/api/1/access_token',$tok);
        if (($tok['http_code']??0)!==200) json_response(['error'=>'access_token http error','http'=>$tok], 502);
        $bearer = SyrveClient::extractToken($tok) ?? '';
        $resp = SyrveClient::cities($bearer, [$orgId]);
        Logger::logCall($accountId,'/api/1/cities',$resp);
        json_response(['cities'=>$resp]);
    }

    case 'streets_by_city': {
        $d = read_json_body();
        $accountId = (int)($d['account_id'] ?? 0);
        $orgId     = (string)($d['organizationId'] ?? '');
        $cityId    = (string)($d['cityId'] ?? '');
        if (!$orgId || !$cityId) json_response(['error'=>'organizationId and cityId required'], 400);
        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = '.$accountId, true);
        if (!$row) json_response(['error'=>'account not found'], 404);
        $tok = SyrveClient::accessToken($row['api_login']); Logger::logCall($accountId,'/api/1/access_token',$tok);
        if (($tok['http_code']??0)!==200) json_response(['error'=>'access_token http error','http'=>$tok], 502);
        $bearer = SyrveClient::extractToken($tok) ?? '';
        $resp = SyrveClient::streetsByCity($bearer, $orgId, $cityId);
        Logger::logCall($accountId,'/api/1/streets/by_city',$resp);
        json_response(['streets'=>$resp]);
    }

    case 'create_delivery': {
        $d = read_json_body(); // ожидаем целиком payload под Syrve
        $accountId = (int)($d['account_id'] ?? 0);
        $payload   = (array)($d['payload'] ?? []);
        if (!$payload) json_response(['error'=>'payload required'], 400);
        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = '.$accountId, true);
        if (!$row) json_response(['error'=>'account not found'], 404);
        $tok = SyrveClient::accessToken($row['api_login']); Logger::logCall($accountId,'/api/1/access_token',$tok);
        if (($tok['http_code']??0)!==200) json_response(['error'=>'access_token http error','http'=>$tok], 502);
        $bearer = SyrveClient::extractToken($tok) ?? '';
        $resp = SyrveClient::deliveriesCreate($bearer, $payload);
        Logger::logCall($accountId,'/api/1/deliveries/create',$resp);
        json_response(['result'=>$resp]);
    }

    case 'command_status': {
        $d = read_json_body();
        $accountId = (int)($d['account_id'] ?? 0);
        $orgId     = (string)($d['organizationId'] ?? '');
        $corrId    = (string)($d['correlationId'] ?? '');
        if (!$orgId || !$corrId) json_response(['error'=>'organizationId and correlationId required'], 400);
        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = '.$accountId, true);
        if (!$row) json_response(['error'=>'account not found'], 404);
        $tok = SyrveClient::accessToken($row['api_login']); Logger::logCall($accountId,'/api/1/access_token',$tok);
        if (($tok['http_code']??0)!==200) json_response(['error'=>'access_token http error','http'=>$tok], 502);
        $bearer = SyrveClient::extractToken($tok) ?? '';
        $resp = SyrveClient::commandsStatus($bearer, $orgId, $corrId);
        Logger::logCall($accountId,'/api/1/commands/status',$resp);
        json_response(['status'=>$resp]);
    }
    case 'order_types': {
        $d = read_json_body();
        $accountId = (int)($d['account_id'] ?? 0);
        $orgId     = (string)($d['organizationId'] ?? '');
        if (!$orgId) json_response(['error'=>'organizationId required'], 400);

        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = '.$accountId, true);
        if (!$row) json_response(['error'=>'account not found'], 404);

        $tok = SyrveClient::accessToken($row['api_login']); Logger::logCall($accountId,'/api/1/access_token',$tok);
        if (($tok['http_code']??0)!==200) json_response(['error'=>'access_token http error','http'=>$tok], 502);
        $bearer = SyrveClient::extractToken($tok) ?? '';

        // Нужен POST на /api/1/order_types с organizationIds
        $resp = SyrveClient::orderTypes($bearer, [$orgId]);
        Logger::logCall($accountId,'/api/1/order_types',$resp);

        json_response(['order_types'=>$resp]);
    }
    case 'hall_sections': {
        $d        = read_json_body();
        $accountId= (int)($d['account_id'] ?? 0);
        $orgId    = (string)($d['organizationId'] ?? '');
        if (!$orgId) json_response(['error'=>'organizationId required'], 400);

        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = '.$accountId, true);
        if (!$row) json_response(['error'=>'account not found'], 404);

        $tok = SyrveClient::accessToken($row['api_login']); Logger::logCall($accountId,'/api/1/access_token',$tok);
        if (($tok['http_code']??0)!==200) json_response(['error'=>'access_token http error','http'=>$tok], 502);
        $bearer = SyrveClient::extractToken($tok) ?? '';

        $tg = SyrveClient::terminalGroups($bearer, [$orgId]);
        Logger::logCall($accountId,'/api/1/terminal_groups',$tg);

        // вытащим ID терминальных групп
        $tgs = [];
        foreach (($tg['response']['terminalGroups'] ?? []) as $g) foreach (($g['items'] ?? []) as $it) $tgs[] = $it;
        foreach (($tg['response']['terminalGroupsInSleep'] ?? []) as $g) foreach (($g['items'] ?? []) as $it) $tgs[] = $it;
        $tgIds = array_values(array_unique(array_map(fn($x)=>$x['id'] ?? null, $tgs)));
        if (!$tgIds) json_response(['terminal_groups'=>$tg, 'sections'=>['response'=>['restaurantSections'=>[]]]]);

        $sec = SyrveClient::reserveAvailableRestaurantSections($bearer, $tgIds, true);
        Logger::logCall($accountId,'/api/1/reserve/available_restaurant_sections',$sec);

        json_response(['terminal_groups'=>$tg, 'sections'=>$sec]);
    }

    case 'hall_orders': {
        $d         = read_json_body();
        $accountId = (int)($d['account_id'] ?? 0);
        $orgId     = (string)($d['organizationId'] ?? '');
        $tableIds  = (array)($d['tableIds'] ?? []);
        $from      = (string)($d['dateFrom'] ?? '');
        $to        = (string)($d['dateTo'] ?? '');
        $statuses  = (array)($d['statuses'] ?? ['Closed']);
        if (!$orgId || !$tableIds || !$from || !$to) json_response(['error'=>'organizationId, tableIds, dateFrom, dateTo required'], 400);

        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = '.$accountId, true);
        if (!$row) json_response(['error'=>'account not found'], 404);

        $tok = SyrveClient::accessToken($row['api_login']); Logger::logCall($accountId,'/api/1/access_token',$tok);
        if (($tok['http_code']??0)!==200) json_response(['error'=>'access_token http error','http'=>$tok], 502);
        $bearer = SyrveClient::extractToken($tok) ?? '';

        $orders = [];
        foreach ($tableIds as $tid) {
            $resp = SyrveClient::orderByTable($bearer, [$orgId], [$tid], $from, $to, $statuses);
            Logger::logCall($accountId,'/api/1/order/by_table',$resp);
            foreach (($resp['response']['orders'] ?? []) as $o) $orders[] = $o;
        }

        // summary
        $noClient=0; $zero=0;
        foreach ($orders as $o) {
            $ord = $o['order'] ?? $o;
            if (empty($ord['customer'])) $noClient++;
            if ((float)($ord['sum'] ?? 0) <= 0) $zero++;
        }
        json_response(['summary'=>[
            'total'=>count($orders),
            'noClient'=>$noClient,
            'zeroSum'=>$zero
        ], 'orders'=>$orders]);
    }

    case 'deliveries_report': {
        $d         = read_json_body();
        $accountId = (int)($d['account_id'] ?? 0);
        $orgId     = (string)($d['organizationId'] ?? '');
        $from      = (string)($d['dateFrom'] ?? '');
        $to        = (string)($d['dateTo'] ?? '');
        $statuses  = (array)($d['statuses'] ?? []); // опционально
        if (!$orgId || !$from || !$to) json_response(['error'=>'organizationId, dateFrom, dateTo required'], 400);

        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = '.$accountId, true);
        if (!$row) json_response(['error'=>'account not found'], 404);

        $tok = SyrveClient::accessToken($row['api_login']); Logger::logCall($accountId,'/api/1/access_token',$tok);
        if (($tok['http_code']??0)!==200) json_response(['error'=>'access_token http error','http'=>$tok], 502);
        $bearer = SyrveClient::extractToken($tok) ?? '';

        // чанкование по дням — надёжно и дешево
        $start = new DateTimeImmutable($from);
        $end   = new DateTimeImmutable($to);
        $ordersByOrganizations = [];

        for ($cursor=$start; $cursor < $end; $cursor = $cursor->modify('+1 day')) {
            $chunkEnd = min($cursor->modify('+1 day'), $end);
            $resp = SyrveClient::deliveriesByDateAndStatus(
                $bearer, [$orgId],
                $cursor->format('Y-m-d H:i:s.v'),
                $chunkEnd->format('Y-m-d H:i:s.v'),
                $statuses
            );
            Logger::logCall($accountId,'/api/1/deliveries/by_delivery_date_and_status',$resp);
            foreach (($resp['response']['ordersByOrganizations'] ?? []) as $b) $ordersByOrganizations[] = $b;
        }

        // summary
        $all = [];
        foreach ($ordersByOrganizations as $b) foreach (($b['orders'] ?? []) as $o) $all[] = ($o['order'] ?? $o);
        $phones = []; $invalid = []; $noClient=0; $noPhone=0; $zero=0;
        foreach ($all as $o){
            if (empty($o['customer'])) { $noClient++; continue; }
            $ph = (string)($o['phone'] ?? '');
            if ($ph === '') $noPhone++; else {
                $phones[] = $ph;
                if (!preg_match('/^\+\d{8,15}$/', $ph)) $invalid[] = $ph; // универсальнее
            }
            if ((float)($o['sum'] ?? 0) <= 0) $zero++;
        }
        json_response([
            'summary'=>[
                'total'            => count($all),
                'noClient'         => $noClient,
                'noPhone'          => $noPhone,
                'zeroSum'          => $zero,
                'uniquePhones'     => count(array_unique($phones)),
                'invalidPhones'    => count(array_unique($invalid)),
            ],
            'ordersByOrganizations'=>$ordersByOrganizations
        ]);
    }
    case 'dict': {
        $d = read_json_body();
        $accountId = (int)($d['account_id'] ?? 0);
        $orgId     = (string)($d['organizationId'] ?? '');
        $name      = (string)($d['name'] ?? '');

        if (!$name || !$orgId) json_response(['error'=>'organizationId and name required'], 400);
        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = '.$accountId, true);
        if (!$row) json_response(['error'=>'account not found'], 404);

        $tok = SyrveClient::accessToken($row['api_login']); Logger::logCall($accountId,'/api/1/access_token',$tok);
        if (($tok['http_code']??0)!==200) json_response(['error'=>'access_token http error','http'=>$tok], 502);
        $bearer = SyrveClient::extractToken($tok) ?? '';

        // Разрешённые словари
        $map = [
            'cancel_causes'         => ['fn' => [SyrveClient::class, 'cancelCauses'],  'ep'=>'/api/1/cancel_causes'],
            'discounts'             => ['fn' => [SyrveClient::class, 'discounts'],     'ep'=>'/api/1/discounts'],
            'payment_types'         => ['fn' => [SyrveClient::class, 'paymentTypes'],   'ep'=>'/api/1/payment_types'],
            'removal_types'         => ['fn' => [SyrveClient::class, 'removalTypes'],   'ep'=>'/api/1/removal_types'],
            'tips_types'            => ['fn' => [SyrveClient::class, 'tipsTypes'],      'ep'=>'/api/1/tips_types'],
            'deliveries_order_types'=> ['fn' => [SyrveClient::class, 'orderTypes'],     'ep'=>'/api/1/deliveries/order_types'],
        ];
        if (!isset($map[$name])) json_response(['error'=>'unknown dict name'], 400);

        $fn   = $map[$name]['fn'];
        $resp = $fn($bearer, [$orgId]);
        Logger::logCall($accountId, $map[$name]['ep'], $resp);

        json_response(['dict'=>$name, 'result'=>$resp]);
    }
    case 'employees': {
        $d = read_json_body();
        $accountId = (int)($d['account_id'] ?? 0);
        $name      = (string)($d['name'] ?? '');
        $payload   = (array)($d['payload'] ?? []);
        if (!$accountId || !$name) json_response(['error'=>'account_id and name required'], 400);

        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = '.$accountId, true);
        if (!$row) json_response(['error'=>'account not found'], 404);

        $tok = SyrveClient::accessToken($row['api_login']); Logger::logCall($accountId,'/api/1/access_token',$tok);
        if (($tok['http_code']??0)!==200) json_response(['error'=>'access_token http error','http'=>$tok], 502);
        $bearer = SyrveClient::extractToken($tok) ?? '';

        // хелпер повторной попытки (на 400 переводим массивы в singular / другой формат)
        $retry = function(array $resp, callable $alt){
            $hc = $resp['http_code'] ?? 0;
            $desc = strtolower((string)($resp['response']['errorDescription'] ?? ''));
            if ($hc===400 && $desc!=='') return $alt();
            return $resp;
        };

        if ($name==='couriers'){
            $resp = SyrveClient::employeesCouriers($bearer, (array)($payload['organizationIds'] ?? []));
            Logger::logCall($accountId,'/api/1/employees/couriers',$resp);
            json_response(['endpoint'=>$name, 'result'=>$resp]);
        }

        if ($name==='couriers_by_role'){
            $resp = SyrveClient::employeesCouriersByRole(
                $bearer,
                (array)($payload['organizationIds'] ?? []),
                (array)($payload['rolesToCheck'] ?? []) // ВАЖНО: rolesToCheck
            );
            Logger::logCall($accountId,'/api/1/employees/couriers/by_role',$resp);
            json_response(['endpoint'=>$name, 'result'=>$resp]);
        }

        if ($name==='couriers_locations_by_time_offset'){
            $resp = SyrveClient::employeesCouriersLocationsByTimeOffset(
                $bearer,
                (array)($payload['organizationIds'] ?? []),
                (int)($payload['timeOffsetInMinutes'] ?? 30)
            );
            Logger::logCall($accountId,'/api/1/employees/couriers/locations/by_time_offset',$resp);
            json_response(['endpoint'=>$name, 'result'=>$resp]);
        }

        if ($name==='couriers_active_location'){
            $resp = SyrveClient::employeesCouriersActiveLocation(
                $bearer,
                (array)($payload['organizationIds'] ?? []),
                (array)($payload['courierIds'] ?? [])
            );
            Logger::logCall($accountId,'/api/1/employees/couriers/active_location',$resp);
            json_response(['endpoint'=>$name, 'result'=>$resp]);
        }

        if ($name==='couriers_active_location_by_terminal'){
            $resp = SyrveClient::employeesCouriersActiveLocationByTerminal(
                $bearer,
                (string)($payload['organizationId'] ?? ''),
                (array)($payload['terminalGroupIds'] ?? []),
                (string)($payload['terminalGroupId'] ?? '')
            );
            Logger::logCall($accountId,'/api/1/employees/couriers/active_location/by_terminal',$resp);
            json_response(['endpoint'=>$name, 'result'=>$resp]);
        }

        if ($name === 'info') {
            // поддержим оба варианта org: organizationIds[] ИЛИ organizationId
            $orgIds = array_values(array_filter(array_map('strval', (array)($payload['organizationIds'] ?? []))));
            $orgSingle = (string)($payload['organizationId'] ?? '');
            if ($orgSingle !== '') { $orgIds = [$orgSingle]; }

            // соберём employee id из всех возможных мест: employeeIds[], employees[].id, employeeId, id
            $idsA = array_values(array_filter(array_map('strval', (array)($payload['employeeIds'] ?? []))));
            $idsB = array_values(array_filter(array_map(
                fn($e) => (string)($e['id'] ?? ''),
                (array)($payload['employees'] ?? [])
            )));
            $idSingle = (string)($payload['employeeId'] ?? ($payload['id'] ?? ''));
            $empIds = array_values(array_filter(array_unique(array_merge($idsA, $idsB, [$idSingle]))));

            // если реально пусто — вернём 400 с понятным текстом
            if (!($orgIds[0] ?? '') || !($empIds[0] ?? '')) {
                json_response([
                    'endpoint' => 'info',
                    'error'    => 'organizationId and employee id are required',
                    'received' => $payload
                ], 400);
            }

            // обычный вызов
            $resp = SyrveClient::employeesInfo($bearer, $orgIds, $empIds);

            // fallback (тот же сингуляр)
            $resp = $retry($resp, function() use ($bearer, $orgIds, $empIds) {
                return App\Http::postJson('/api/1/employees/info', [
                    'organizationId' => (string)$orgIds[0],
                    'id'             => (string)$empIds[0],
                ], $bearer);
            });

            Logger::logCall($accountId, '/api/1/employees/info', $resp);
            json_response(['endpoint' => $name, 'result' => $resp]);
        }





        if ($name==='shift_is_open'){
            $resp = SyrveClient::employeesShiftIsOpen(
                $bearer,
                (string)($payload['organizationId'] ?? ''),
                (string)($payload['employeeId'] ?? ''),
                (string)($payload['terminalGroupId'] ?? '')
            );
            Logger::logCall($accountId,'/api/1/employees/shift/is_open',$resp);
            json_response(['endpoint'=>$name, 'result'=>$resp]);
        }

        if ($name==='shift_clockin'){
            $resp = SyrveClient::employeesShiftClockin($bearer, (string)($payload['organizationId'] ?? ''), (string)($payload['employeeId'] ?? ''));
            Logger::logCall($accountId,'/api/1/employees/shift/clockin',$resp);
            json_response(['endpoint'=>$name, 'result'=>$resp]);
        }

        if ($name==='shift_clockout'){
            $resp = SyrveClient::employeesShiftClockout($bearer, (string)($payload['organizationId'] ?? ''), (string)($payload['employeeId'] ?? ''));
            Logger::logCall($accountId,'/api/1/employees/shift/clockout',$resp);
            json_response(['endpoint'=>$name, 'result'=>$resp]);
        }

        if ($name==='shifts_by_courier'){
            $orgIds = (array)($payload['organizationIds'] ?? []);
            $empIds = (array)($payload['employeeIds'] ?? []);
            $from   = (string)($payload['dateFrom'] ?? '');
            $to     = (string)($payload['dateTo'] ?? '');
            $resp = SyrveClient::employeesShiftsByCourier($bearer, $orgIds, $empIds, $from, $to);
            // fallback: singular
            $resp = $retry($resp, function() use($bearer,$orgIds,$empIds,$from,$to){
                $o = $orgIds[0] ?? ''; $e = $empIds[0] ?? '';
                return App\Http::postJson('/api/1/employees/shifts/by_courier', [
                    'organizationId'=>$o, 'employeeId'=>$e, 'dateFrom'=>$from, 'dateTo'=>$to
                ], $bearer);
            });
            Logger::logCall($accountId,'/api/1/employees/shifts/by_courier',$resp);
            json_response(['endpoint'=>$name, 'result'=>$resp]);
        }

        json_response(['error'=>'unknown employees endpoint'], 400);
    }
    case 'regions': {
        $d = read_json_body();
        $accountId = (int)($d['account_id'] ?? 0);
        $orgId     = (string)($d['organizationId'] ?? '');
        $include   = (bool)($d['includeDeleted'] ?? false);
        if (!$orgId) json_response(['error'=>'organizationId required'], 400);

        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = '.$accountId, true);
        if (!$row) json_response(['error'=>'account not found'], 404);

        $tok = SyrveClient::accessToken($row['api_login']); Logger::logCall($accountId,'/api/1/access_token',$tok);
        if (($tok['http_code']??0)!==200) json_response(['error'=>'access_token http error','http'=>$tok], 502);
        $bearer = SyrveClient::extractToken($tok) ?? '';

        $resp = SyrveClient::regions($bearer, [$orgId], $include);
        Logger::logCall($accountId,'/api/1/regions',$resp);
        json_response(['regions'=>$resp]);
    }

    case 'delivery_restrictions': {
        $d = read_json_body();
        $accountId = (int)($d['account_id'] ?? 0);
        $orgId     = (string)($d['organizationId'] ?? '');
        if (!$orgId) json_response(['error'=>'organizationId required'], 400);

        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = '.$accountId, true);
        if (!$row) json_response(['error'=>'account not found'], 404);

        $tok = SyrveClient::accessToken($row['api_login']); Logger::logCall($accountId,'/api/1/access_token',$tok);
        if (($tok['http_code']??0)!==200) json_response(['error'=>'access_token http error','http'=>$tok], 502);
        $bearer = SyrveClient::extractToken($tok) ?? '';

        $resp = SyrveClient::deliveryRestrictions($bearer, [$orgId]);
        Logger::logCall($accountId,'/api/1/delivery_restrictions',$resp);
        json_response(['delivery_restrictions'=>$resp]);
    }

    case 'delivery_restrictions_allowed': {
        $d = read_json_body();
        $accountId = (int)($d['account_id'] ?? 0);

        // Гибкая приёмка полей
        $orgId   = (string)($d['organizationId'] ?? $d['payload']['organizationId'] ?? '');
        $addr    = (array)($d['deliveryAddress'] ?? $d['payload']['deliveryAddress'] ?? []);
        if (!$addr) {
            $addr = [
                'regionId' => (string)($d['regionId'] ?? $d['payload']['regionId'] ?? ''),
                'cityId'   => (string)($d['cityId'] ?? $d['payload']['cityId'] ?? ''),
                'streetId' => (string)($d['streetId'] ?? $d['payload']['streetId'] ?? ''),
                'house'    => (string)($d['house'] ?? $d['payload']['house'] ?? ''),
            ];
            $addr = array_filter($addr, fn($v)=>$v!=='' && $v!==null);
        }
        $coords = (array)($d['coordinates'] ?? $d['payload']['coordinates'] ?? []);
        $term   = (string)($d['terminalGroupId'] ?? $d['payload']['terminalGroupId'] ?? '');

        // NEW: isCourierDelivery (по умолчанию true)
        $isCourier = $d['isCourierDelivery'] ?? $d['payload']['isCourierDelivery'] ?? true;
        if (is_string($isCourier)) $isCourier = strtolower($isCourier) === 'true';
        $isCourier = (bool)$isCourier;

        if (!$orgId || !isset($addr['cityId'], $addr['streetId'])) {
            json_response(['error'=>'organizationId, cityId and streetId are required',
                'received'=>['organizationId'=>$orgId,'deliveryAddress'=>$addr]], 400);
        }

        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = '.$accountId, true);
        if (!$row) json_response(['error'=>'account not found'], 404);

        $tok = SyrveClient::accessToken($row['api_login']); Logger::logCall($accountId,'/api/1/access_token',$tok);
        if (($tok['http_code']??0)!==200) json_response(['error'=>'access_token http error','http'=>$tok], 502);
        $bearer = SyrveClient::extractToken($tok) ?? '';

        $resp = SyrveClient::deliveryRestrictionsAllowed($bearer, $orgId, $addr, $coords ?: null, $term ?: null, $isCourier);
        Logger::logCall($accountId,'/api/1/delivery_restrictions/allowed',$resp);
        json_response(['allowed'=>$resp]);
    }


    case 'marketing_sources': {
        $d = read_json_body();
        $accountId = (int)($d['account_id'] ?? 0);
        $orgId     = (string)($d['organizationId'] ?? '');
        if (!$orgId) json_response(['error'=>'organizationId required'], 400);

        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = '.$accountId, true);
        if (!$row) json_response(['error'=>'account not found'], 404);

        $tok = SyrveClient::accessToken($row['api_login']); Logger::logCall($accountId,'/api/1/access_token',$tok);
        if (($tok['http_code']??0)!==200) json_response(['error'=>'access_token http error','http'=>$tok], 502);
        $bearer = SyrveClient::extractToken($tok) ?? '';

        $resp = SyrveClient::marketingSources($bearer, [$orgId]);
        Logger::logCall($accountId,'/api/1/marketing_sources',$resp);
        json_response(['marketing_sources'=>$resp]);
    }

    case 'loyalty': {
        $d         = read_json_body();
        $accountId = (int)($d['account_id'] ?? 0);
        $name      = (string)($d['name'] ?? '');
        $payload   = (array)($d['payload'] ?? []);
        $auto      = !empty($d['_auto']); // галочка "Авто customerId" в UI

        if (!$accountId || $name==='') json_response(['error'=>'account_id and name required'], 400);

        $row = DB::conn()->querySingle('SELECT * FROM accounts WHERE id = '.$accountId, true);
        if (!$row) json_response(['error'=>'account not found'], 404);

        $tok = SyrveClient::accessToken($row['api_login']); Logger::logCall($accountId,'/api/1/access_token',$tok);
        if (($tok['http_code']??0)!==200) json_response(['error'=>'access_token http error','http'=>$tok], 502);
        $bearer = SyrveClient::extractToken($tok) ?? '';

        // ---------- NORMALIZE (алиасы, дефолты) ----------
        $orgId = (string)($payload['organizationId'] ?? ($d['organizationId'] ?? ''));
        if ($orgId==='') { /* часть loyalty не требует orgId, но если он есть — подставим */ }
        $payload['organizationId'] = $orgId ?: ($payload['organizationId'] ?? '');

        // телефон → компактный формат
        foreach (['phone','customer.phone'] as $p) {
            $parts = explode('.', $p);
            if (count($parts)===2 && isset($payload[$parts[0]][$parts[1]])) {
                $payload[$parts[0]][$parts[1]] = preg_replace('/\s+/', '', (string)$payload[$parts[0]][$parts[1]]);
            } elseif (isset($payload[$p])) {
                $payload[$p] = preg_replace('/\s+/', '', (string)$payload[$p]);
            }
        }

        // Алиасы/преобразования по конкретным методам
        switch ($name) {
            case 'calculate': {
                // id → GUID|null, items[] → гарантируем type=Product
                if (isset($payload['order']['id'])) {
                    $id = $payload['order']['id'];
                    $isGuid = is_string($id) && preg_match('/^[0-9a-fA-F-]{36}$/', $id);
                    if (!$isGuid && $id !== null) $payload['order']['id'] = null;
                } else {
                    $payload['order']['id'] = null;
                }
                if (!isset($payload['order']['items']) || !is_array($payload['order']['items'])) {
                    $payload['order']['items'] = [];
                } else {
                    foreach ($payload['order']['items'] as &$it) {
                        if (is_array($it) && !isset($it['type']) && isset($it['productId'])) {
                            $it['type'] = 'Product';
                        }
                    }
                    unset($it);
                }

                // 🧩 Нормализуем адрес: {address:{type:"свободный текст"}} → {address:{street:{name:"…"}}}
                if (isset($payload['order']['deliveryPoint']) && is_array($payload['order']['deliveryPoint'])) {
                    if (isset($payload['order']['deliveryPoint']['address']) && is_array($payload['order']['deliveryPoint']['address'])) {
                        $addr =& $payload['order']['deliveryPoint']['address'];

                        if (!isset($addr['street'])) {
                            if (!empty($addr['type']) && is_string($addr['type'])) {
                                $free = trim($addr['type']);
                                unset($addr['type']);

                                // (опционально вытащим дом из хвоста строки)
                                if ($free !== '') {
                                    if (preg_match('/^(.*?)(?:,\s*)?(\d+\w?)\s*$/u', $free, $m)) {
                                        $streetName = trim($m[1]);
                                        $house      = trim($m[2] ?? '');
                                        $addr['street'] = ['name' => $streetName ?: $free];
                                        if ($house !== '') $addr['house'] = $house;
                                    } else {
                                        $addr['street'] = ['name' => $free];
                                    }
                                }
                            }

                            // если так и не получили street — убираем адрес целиком, чтобы не ловить 400
                            if (!isset($addr['street'])) {
                                unset($payload['order']['deliveryPoint']['address']);
                            }
                        }

                        // если address опустел — удалим deliveryPoint.address
                        if (isset($payload['order']['deliveryPoint']['address']) &&
                            empty(array_filter($payload['order']['deliveryPoint']['address'], fn($v)=>$v!==null && $v!=='' && $v!==[]))) {
                            unset($payload['order']['deliveryPoint']['address']);
                        }
                    }

                    // если deliveryPoint пустой — тоже уберём
                    if (empty(array_filter($payload['order']['deliveryPoint'], fn($v)=>$v!==null && $v!=='' && $v!==[]))) {
                        unset($payload['order']['deliveryPoint']);
                    }
                }

                break;
            }
            case 'coupons_info':
                // сервер требует "number"
                if (isset($payload['coupon']) && empty($payload['number'])) {
                    $payload['number'] = (string)$payload['coupon'];
                    unset($payload['coupon']);
                }
                break;

            case 'customer_transactions_by_date':
                // даты и пагинация по умолчанию
                $payload['dateFrom']   = iso_or_null($payload['dateFrom'] ?? '') ?? gmdate('Y-m-01\T00:00:00.000\Z');
                $payload['dateTo']     = iso_or_null($payload['dateTo']   ?? '') ?? gmdate('Y-m-t\T23:59:59.000\Z');
                $payload['pageNumber'] = (int)($payload['pageNumber'] ?? 1);
                $payload['pageSize']   = (int)($payload['pageSize']   ?? 50);
                break;

            case 'customer_category_add':
            case 'customer_category_remove':
                if (isset($payload['customerCategoryId']) && empty($payload['categoryId'])) {
                    $payload['categoryId'] = (string)$payload['customerCategoryId'];
                    unset($payload['customerCategoryId']);
                }
                break;

            case 'customer_card_add':
            case 'customer_card_remove':
                // API часто ждёт cardTrack; если его нет — пробуем cardNumber
                if (empty($payload['cardTrack']) && !empty($payload['cardNumber'])) {
                    $payload['cardTrack'] = (string)$payload['cardNumber'];
                }
                break;

            case 'customer_wallet_topup':
            case 'customer_wallet_chargeoff':
            case 'customer_wallet_hold':
                // часть интеграций называет сумму "amount"/"changeSum" — маппим
                if (isset($payload['amount']) && empty($payload['sum'])) {
                    $payload['sum'] = (float)$payload['amount'];
                    unset($payload['amount']);
                }
                if (isset($payload['changeSum']) && empty($payload['sum'])) {
                    $payload['sum'] = (float)$payload['changeSum'];
                    unset($payload['changeSum']);
                }
                break;

            case 'message_send_email':
                if (!isset($payload['receiver']) && isset($payload['email'])) {
                    $payload['receiver'] = (string)$payload['email']; // строка из UI
                    unset($payload['email']);
                }
                if (isset($payload['text']) && empty($payload['body'])) {
                    $payload['body'] = (string)$payload['text'];
                    unset($payload['text']);
                }
                break;

            case 'customer_info': {
                $org = (string)($payload['organizationId'] ?? '');
                $body = ['organizationId' => $org];

                if (!empty($payload['phone'])) {
                    $body['type']  = 'phone';
                    $body['phone'] = preg_replace('/\s+/', '', (string)$payload['phone']);
                } elseif (!empty($payload['id'])) {
                    $body['type'] = 'id';
                    $body['id']   = (string)$payload['id'];
                } elseif (!empty($payload['cardNumber']) || !empty($payload['cardTrack'])) {
                    $body['type']       = 'card';
                    $body['cardNumber'] = (string)($payload['cardNumber'] ?? $payload['cardTrack']);
                } else {
                    json_response([
                        'endpoint' => 'customer_info',
                        'error'    => 'provide one of: phone | id | cardNumber/cardTrack',
                        'received' => $payload
                    ], 400);
                }

                // основной путь для EU-кластера
                $resp = App\Http::postJson('/api/1/loyalty/syrve/customer/info', $body, $bearer);
                Logger::logCall($accountId, '/api/1/loyalty/syrve/customer/info', $resp);

                // fallback на старые контроллеры, если вдруг 404/405
                if (in_array(($resp['http_code'] ?? 0), [404,405], true)) {
                    $tp = $body['type']; $legacy = ['organizationId'=>$org, 'request'=>['$type'=>ucfirst($tp)]];
                    if ($tp==='phone') $legacy['request']['phone']=$body['phone'];
                    if ($tp==='id')    $legacy['request']['id']=$body['id'];
                    if ($tp==='card')  $legacy['request']['cardTrack']=$body['cardNumber'];
                    $resp = SyrveClient::loyalty($bearer, 'customer_info', $legacy);
                    Logger::logCall($accountId, '/api/1/loyalty/customer/info (legacy)', $resp);
                }

                json_response(['endpoint'=>'customer_info','normalized_payload'=>$body,'result'=>$resp]);
            }



        }

        // ---------- AUTO customerId (в т.ч. через полиморфный customer_info) ----------
        $needCustomer = in_array($name, [
            'customer_transactions_by_date','customer_transactions_by_revision',
            'customer_wallet_topup','customer_wallet_chargeoff','customer_wallet_hold','customer_wallet_cancel_hold',
            'customer_program_add','customer_card_add','customer_card_remove',
            'customer_category','customer_category_add','customer_category_remove',
            'get_counters'
        ], true);

        if ($auto && $needCustomer && empty($payload['customerId'])) {
            $org = (string)($payload['organizationId'] ?? '');
            if ($org !== '') {
                $ci = null;
                if (!empty($payload['phone']))      $ci = ['type'=>'phone','phone'=>preg_replace('/\s+/', '', (string)$payload['phone'])];
                elseif (!empty($payload['id']))     $ci = ['type'=>'id','id'=>(string)$payload['id']];
                elseif (!empty($payload['cardNumber']) || !empty($payload['cardTrack']))
                    $ci = ['type'=>'card','cardNumber'=>(string)($payload['cardNumber'] ?? $payload['cardTrack'])];

                if ($ci) {
                    $resp = App\Http::postJson('/api/1/loyalty/syrve/customer/info',
                        ['organizationId'=>$org] + $ci, $bearer);
                    Logger::logCall($accountId, '/api/1/loyalty/syrve/customer/info (auto)', $resp);

                    // fallback на legacy, если 404/405
                    if (in_array(($resp['http_code'] ?? 0), [404,405], true)) {
                        $tp = ucfirst($ci['type']); $legacy=['organizationId'=>$org,'request'=>['$type'=>$tp] + array_diff_key($ci,['type'=>true])];
                        if ($tp==='Card' && isset($legacy['request']['cardNumber'])) {
                            $legacy['request']['cardTrack']=$legacy['request']['cardNumber']; unset($legacy['request']['cardNumber']);
                        }
                        $resp = SyrveClient::loyalty($bearer,'customer_info',$legacy);
                        Logger::logCall($accountId, '/api/1/loyalty/customer/info (legacy auto)', $resp);
                    }

                    $cid = (string)($resp['response']['id'] ?? $resp['response']['customer']['id'] ?? '');
                    if ($cid !== '') $payload['customerId'] = $cid;
                }
            }
        }

        // ---------- CALL ----------
        $resp = SyrveClient::loyalty($bearer, $name, $payload);

        $ep = SyrveClient::loyaltyEndpointPath($name) ?? ('/loyalty/'.$name);
        Logger::logCall($accountId, $ep, $resp);

        json_response(['endpoint'=>$name, 'normalized_payload'=>$payload, 'result'=>$resp]);
    }


}

json_response(['error' => 'unknown action'], 404);
