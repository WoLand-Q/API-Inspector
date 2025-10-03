<?php
// public/api.server.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require __DIR__ . '/../src/bootstrap.php';

use App\DB;
use App\Logger;
use App\IikoServerClient;

/* ---------- helpers ---------- */

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

/** Получить клиент iikoServer по server_id (account_server_id) */
function server_client_from_request(array $d): IikoServerClient {
    $sid = (int)($d['server_id'] ?? $d['account_server_id'] ?? $_GET['server_id'] ?? 0);
    if ($sid <= 0) json_response(['error' => 'server_id (account_server_id) required'], 400);

    $row = DB::conn()->querySingle('SELECT * FROM accounts_server WHERE id='.(int)$sid, true);
    if (!$row) json_response(['error'=>'server account not found'], 404);

    return new IikoServerClient(new DB(), new Logger(), (int)$row['id'], (string)$row['base_url'], (string)$row['login'], (string)$row['password_plain']);
}

/* ---------- routing ---------- */

$action = (string)($_GET['action'] ?? '');

switch ($action) {

    /* ====== Аккаунты iikoServer ====== */

    case 'server_account_add': {
        $d = read_json_body();
        $label = trim((string)($d['label'] ?? ''));
        $base  = trim((string)($d['base_url'] ?? ''));
        $login = trim((string)($d['login'] ?? ''));
        $pass  = (string)($d['password_plain'] ?? '');

        if ($label==='' || $base==='' || $login==='' || $pass==='') {
            json_response(['error'=>'label, base_url, login, password_plain required'], 400);
        }

        $st = DB::conn()->prepare('INSERT INTO accounts_server(label,base_url,login,password_plain,created_at) VALUES(?,?,?,?,?)');
        $st->bindValue(1,$label,SQLITE3_TEXT);
        $st->bindValue(2,rtrim($base,'/'),SQLITE3_TEXT);
        $st->bindValue(3,$login,SQLITE3_TEXT);
        $st->bindValue(4,$pass,SQLITE3_TEXT);
        $st->bindValue(5,DB::nowIso(),SQLITE3_TEXT);
        $st->execute();

        $id = DB::conn()->lastInsertRowID();
        json_response(['ok'=>true,'id'=>$id]);
    }

    case 'server_account_update': {
        $d = read_json_body();
        $id = (int)($d['id'] ?? 0);
        if ($id<=0) json_response(['error'=>'id required'], 400);

        $row = DB::conn()->querySingle('SELECT * FROM accounts_server WHERE id='.(int)$id, true);
        if (!$row) json_response(['error'=>'server account not found'], 404);

        $label = array_key_exists('label',$d) ? trim((string)$d['label']) : $row['label'];
        $base  = array_key_exists('base_url',$d) ? rtrim((string)$d['base_url'],'/') : $row['base_url'];
        $login = array_key_exists('login',$d) ? (string)$d['login'] : $row['login'];
        $pass  = array_key_exists('password_plain',$d) ? (string)$d['password_plain'] : $row['password_plain'];

        $st = DB::conn()->prepare('UPDATE accounts_server SET label=?, base_url=?, login=?, password_plain=? WHERE id=?');
        $st->bindValue(1,$label,SQLITE3_TEXT);
        $st->bindValue(2,$base,SQLITE3_TEXT);
        $st->bindValue(3,$login,SQLITE3_TEXT);
        $st->bindValue(4,$pass,SQLITE3_TEXT);
        $st->bindValue(5,$id,SQLITE3_INTEGER);
        $st->execute();

        json_response(['ok'=>true]);
    }

    case 'server_account_delete': {
        $d = read_json_body();
        $id = (int)($d['id'] ?? 0);
        if ($id<=0) json_response(['error'=>'id required'], 400);

        $db = DB::conn();
        $db->exec('BEGIN');
        $st = $db->prepare('DELETE FROM accounts_server WHERE id=?');
        $st->bindValue(1,$id,SQLITE3_INTEGER);
        $st->execute();
        $db->exec('DELETE FROM server_tokens WHERE account_id='.(int)$id); // подчистим токен
        $db->exec('COMMIT');

        json_response(['ok'=>true]);
    }

    case 'server_accounts':
    case 'server_accounts_list': {
        $rows = [];
        $res = DB::conn()->query('SELECT id,label,base_url,login,created_at FROM accounts_server ORDER BY id DESC');
        while ($r = $res->fetchArray(SQLITE3_ASSOC)) $rows[] = $r;
        json_response(['accounts_server'=>$rows]);
    }

    /* ====== Авторизация ====== */

    case 'server_login': {
        $d = read_json_body();
        $sid = (int)($d['server_id'] ?? $d['account_server_id'] ?? 0);
        if ($sid<=0) json_response(['error'=>'server_id required'], 400);

        $cli = server_client_from_request($d);
        // лёгкий пинг — сервер положит/обновит cookie key
        try { $ping = $cli->productsListGet(['includeDeleted'=>false]); }
        catch (\Throwable $e) { $ping = ['error'=>$e->getMessage()]; }

        $tokRow = DB::conn()->querySingle('SELECT token, acquired_at FROM server_tokens WHERE account_id='.(int)$sid, true);
        json_response([
            'http'        => $ping,
            'token'       => $tokRow['token'] ?? null,
            'acquired_at' => $tokRow['acquired_at'] ?? null
        ]);
    }

    case 'server_logout': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $res = $cli->logout();
        json_response(['http'=>$res, 'ok'=>true]);
    }

    /* ====== Номенклатура: ЭЛЕМЕНТЫ ====== */

    case 'server_products_list_get': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $params = (array)($d['params'] ?? []);
        $res = $cli->productsListGet($params);
        json_response(['http'=>$res]);
    }

    case 'server_products_list_post': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $form = (array)($d['form'] ?? []);
        $res = $cli->productsListPost($form);
        json_response(['http'=>$res]);
    }

    case 'server_product_save': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $body = (array)($d['body'] ?? []);
        $q = (array)($d['query'] ?? []); // generateNomenclatureCode, generateFastCode
        $res = $cli->productSave($body, $q['generateNomenclatureCode'] ?? null, $q['generateFastCode'] ?? null);
        json_response(['http'=>$res]);
    }

    case 'server_product_update': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $body = (array)($d['body'] ?? []); // обязан содержать id
        $q = (array)($d['query'] ?? []);   // overrideFastCode, overrideNomenclatureCode
        $res = $cli->productUpdate($body, $q['overrideFastCode'] ?? null, $q['overrideNomenclatureCode'] ?? null);
        json_response(['http'=>$res]);
    }

    case 'server_products_delete': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $items = (array)($d['items'] ?? []); // [ {id:UUID}, ... ]
        $res = $cli->productsDelete($items);
        json_response(['http'=>$res]);
    }

    case 'server_products_restore': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $items = (array)($d['items'] ?? []);
        $override = isset($d['overrideNomenclatureCode']) ? (bool)$d['overrideNomenclatureCode'] : null;
        $res = $cli->productsRestore($items, $override);
        json_response(['http'=>$res]);
    }

    /* ====== Номенклатурные ГРУППЫ ====== */

    case 'server_groups_list_get': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $params = (array)($d['params'] ?? []);
        $res = $cli->groupsListGet($params);
        json_response(['http'=>$res]);
    }

    case 'server_groups_list_post': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $form = (array)($d['form'] ?? []);
        $res = $cli->groupsListPost($form);
        json_response(['http'=>$res]);
    }

    case 'server_group_save': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $body = (array)($d['body'] ?? []);
        $q = (array)($d['query'] ?? []); // generateNomenclatureCode, generateFastCode
        $res = $cli->groupSave($body, $q['generateNomenclatureCode'] ?? null, $q['generateFastCode'] ?? null);
        json_response(['http'=>$res]);
    }

    case 'server_group_update': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $body = (array)($d['body'] ?? []); // должен содержать id
        $q = (array)($d['query'] ?? []);   // overrideFastCode, overrideNomenclatureCode
        $res = $cli->groupUpdate($body, $q['overrideFastCode'] ?? null, $q['overrideNomenclatureCode'] ?? null);
        json_response(['http'=>$res]);
    }

    case 'server_groups_delete': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        // ожидаем объект: { products:{items:[{id}]}, productGroups:{items:[{id}]} }
        $payload = (array)($d['payload'] ?? []);
        $res = $cli->groupsDelete($payload);
        json_response(['http'=>$res]);
    }

    case 'server_groups_restore': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $payload = (array)($d['payload'] ?? []);
        $res = $cli->groupsRestore($payload);
        json_response(['http'=>$res]);
    }

    /* ====== Пользовательские КАТЕГОРИИ ====== */

    case 'server_categories_list_get': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $params = (array)($d['params'] ?? []);
        $res = $cli->categoriesListGet($params);
        json_response(['http'=>$res]);
    }

    case 'server_categories_list_post': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $form = (array)($d['form'] ?? []);
        $res = $cli->categoriesListPost($form);
        json_response(['http'=>$res]);
    }

    case 'server_category_save': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $name = (string)($d['name'] ?? '');
        if ($name==='') json_response(['error'=>'name required'], 400);
        $res = $cli->categorySave($name);
        json_response(['http'=>$res]);
    }

    case 'server_category_update': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $id = (string)($d['id'] ?? '');
        $name = (string)($d['name'] ?? '');
        if ($id==='' || $name==='') json_response(['error'=>'id and name required'], 400);
        $res = $cli->categoryUpdate($id, $name);
        json_response(['http'=>$res]);
    }

    case 'server_category_delete': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $id = (string)($d['id'] ?? '');
        if ($id==='') json_response(['error'=>'id required'], 400);
        $res = $cli->categoryDelete($id);
        json_response(['http'=>$res]);
    }

    case 'server_category_restore': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $id = (string)($d['id'] ?? '');
        if ($id==='') json_response(['error'=>'id required'], 400);
        $res = $cli->categoryRestore($id);
        json_response(['http'=>$res]);
    }

    /* ====== Изображения ====== */

    case 'server_image_load': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $imageId = (string)($d['imageId'] ?? '');
        if ($imageId==='') json_response(['error'=>'imageId required'], 400);
        $res = $cli->imageLoad($imageId);
        json_response(['http'=>$res]);
    }

    case 'server_image_save_base64': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $base64 = (string)($d['data'] ?? $d['base64'] ?? '');
        if ($base64==='') json_response(['error'=>'data (base64) required'], 400);
        $res = $cli->imageSaveBase64($base64);
        json_response(['http'=>$res]);
    }

    case 'server_images_delete': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $items = (array)($d['items'] ?? []);
        $res = $cli->imagesDelete($items);
        json_response(['http'=>$res]);
    }

    /* ====== Техкарты (Assembly Charts) ====== */

    case 'server_charts_get_all': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $dateFrom = (string)($d['dateFrom'] ?? '');
        if ($dateFrom==='') json_response(['error'=>'dateFrom required (yyyy-MM-dd)'], 400);
        $res = $cli->chartsGetAll($dateFrom, $d['dateTo'] ?? null, $d['includeDeletedProducts'] ?? null, $d['includePreparedCharts'] ?? null);
        json_response(['http'=>$res]);
    }

    case 'server_charts_get_all_update': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $knownRevision = (int)($d['knownRevision'] ?? -1);
        $dateFrom = (string)($d['dateFrom'] ?? '');
        if ($dateFrom==='') json_response(['error'=>'dateFrom required'], 400);
        $res = $cli->chartsGetAllUpdate($knownRevision, $dateFrom, $d['dateTo'] ?? null, $d['includeDeletedProducts'] ?? null, $d['includePreparedCharts'] ?? null);
        json_response(['http'=>$res]);
    }

    case 'server_charts_get_tree': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $date = (string)($d['date'] ?? '');
        $productId = (string)($d['productId'] ?? '');
        $departmentId = $d['departmentId'] ?? null;
        if ($date==='' || $productId==='') json_response(['error'=>'date and productId required'], 400);
        $res = $cli->chartsGetTree($date, $productId, $departmentId ?: null);
        json_response(['http'=>$res]);
    }

    case 'server_charts_get_assembled': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $date = (string)($d['date'] ?? '');
        $productId = (string)($d['productId'] ?? '');
        $departmentId = $d['departmentId'] ?? null;
        if ($date==='' || $productId==='') json_response(['error'=>'date and productId required'], 400);
        $res = $cli->chartsGetAssembled($date, $productId, $departmentId ?: null);
        json_response(['http'=>$res]);
    }

    case 'server_charts_get_prepared': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $date = (string)($d['date'] ?? '');
        $productId = (string)($d['productId'] ?? '');
        $departmentId = $d['departmentId'] ?? null;
        if ($date==='' || $productId==='') json_response(['error'=>'date and productId required'], 400);
        $res = $cli->chartsGetPrepared($date, $productId, $departmentId ?: null);
        json_response(['http'=>$res]);
    }

    case 'server_chart_by_id': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $id = (string)($d['id'] ?? '');
        if ($id==='') json_response(['error'=>'id required'], 400);
        $res = $cli->chartById($id);
        json_response(['http'=>$res]);
    }

    case 'server_charts_get_history': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $productId = (string)($d['productId'] ?? '');
        $departmentId = $d['departmentId'] ?? null;
        if ($productId==='') json_response(['error'=>'productId required'], 400);
        $res = $cli->chartsGetHistory($productId, $departmentId ?: null);
        json_response(['http'=>$res]);
    }

    case 'server_chart_save': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $body = (array)($d['body'] ?? []);
        $res = $cli->chartSave($body);
        json_response(['http'=>$res]);
    }

    case 'server_chart_delete': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $id = (string)($d['id'] ?? '');
        if ($id==='') json_response(['error'=>'id required'], 400);
        $res = $cli->chartDelete($id);
        json_response(['http'=>$res]);
    }

    /* ====== Шкалы и размеры ====== */

    case 'server_scales_list_get': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $params = (array)($d['params'] ?? []); // includeDeleted, ids[]
        $res = $cli->productScalesListGet($params);
        json_response(['http'=>$res]);
    }

    case 'server_scales_list_post': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $form = (array)($d['form'] ?? []);
        $res = $cli->productScalesListPost($form);
        json_response(['http'=>$res]);
    }

    case 'server_scale_by_id': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $scaleId = (string)($d['id'] ?? '');
        if ($scaleId==='') json_response(['error'=>'id required'], 400);
        $res = $cli->productScaleById($scaleId);
        json_response(['http'=>$res]);
    }

    case 'server_scales_save': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $body = (array)($d['body'] ?? []);
        $res = $cli->productScaleSave($body);
        json_response(['http'=>$res]);
    }

    case 'server_scales_update': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $body = (array)($d['body'] ?? []); // должен содержать id
        $res = $cli->productScaleUpdate($body);
        json_response(['http'=>$res]);
    }

    case 'server_scales_delete': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $items = (array)($d['items'] ?? []); // [ {id:UUID} ]
        $res = $cli->productScalesDelete($items);
        json_response(['http'=>$res]);
    }

    case 'server_scales_restore': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $items = (array)($d['items'] ?? []);
        $res = $cli->productScalesRestore($items);
        json_response(['http'=>$res]);
    }

    case 'server_product_scale_get': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $productId = (string)($d['productId'] ?? '');
        if ($productId==='') json_response(['error'=>'productId required'], 400);
        $res = $cli->productScaleGetForProduct($productId);
        json_response(['http'=>$res]);
    }

    case 'server_products_scales_get': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $productIds = (array)($d['productId'] ?? $d['productIds'] ?? []); // допускаем оба
        $includeDel = (bool)($d['includeDeletedProducts'] ?? false);
        $res = $cli->productScalesGetForProductsGet($productIds, $includeDel);
        json_response(['http'=>$res]);
    }

    case 'server_products_scales_post': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $productIds = (array)($d['productId'] ?? $d['productIds'] ?? []);
        $includeDel = (bool)($d['includeDeletedProducts'] ?? false);
        $res = $cli->productScalesGetForProductsPost($productIds, $includeDel);
        json_response(['http'=>$res]);
    }

    case 'server_product_scale_set': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $productId = (string)($d['productId'] ?? '');
        $body = (array)($d['body'] ?? []); // {id, productSizes:[{id,disabled,factors:[{startNumber,factor}]}]}
        if ($productId==='') json_response(['error'=>'productId required'], 400);
        $res = $cli->productScaleSetForProduct($productId, $body);
        json_response(['http'=>$res]);
    }

    case 'server_product_scale_delete': {
        $d = read_json_body();
        $cli = server_client_from_request($d);
        $productId = (string)($d['productId'] ?? '');
        if ($productId==='') json_response(['error'=>'productId required'], 400);
        $res = $cli->productScaleDeleteForProduct($productId);
        json_response(['http'=>$res]);
    }

    /* ====== default ====== */
    default:
        json_response(['error'=>'unknown action', 'action'=>$action], 404);
}
