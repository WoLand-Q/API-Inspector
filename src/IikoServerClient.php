<?php
declare(strict_types=1);

namespace App;

final class IikoServerClient
{
    private DB $dbWrap;
    private \SQLite3 $db;
    private Logger $log;
    private int $accountId;
    private string $baseUrl;
    private string $login;
    private string $passwordPlain;

    // === Auth ===
    private const EP_AUTH   = '/resto/api/auth';
    private const EP_LOGOUT = '/resto/api/logout';

    // === Elements (Products) ===
    private const EP_PRODUCTS_LIST_GET   = '/resto/api/v2/entities/products/list';   // GET
    private const EP_PRODUCTS_LIST_POST  = '/resto/api/v2/entities/products/list';   // POST form
    private const EP_PRODUCT_SAVE        = '/resto/api/v2/entities/products/save';   // POST JSON (+ generateNomenclatureCode & generateFastCode как query)
    private const EP_PRODUCT_UPDATE      = '/resto/api/v2/entities/products/update'; // POST JSON (+ override* как query)
    private const EP_PRODUCTS_DELETE     = '/resto/api/v2/entities/products/delete'; // POST JSON {items:[{id}]}
    private const EP_PRODUCTS_RESTORE    = '/resto/api/v2/entities/products/restore';// POST JSON {items:[{id}]}

    // === Groups ===
    private const EP_GROUPS_LIST_GET     = '/resto/api/v2/entities/products/group/list';
    private const EP_GROUPS_LIST_POST    = '/resto/api/v2/entities/products/group/list';
    private const EP_GROUP_SAVE          = '/resto/api/v2/entities/products/group/save';
    private const EP_GROUP_UPDATE        = '/resto/api/v2/entities/products/group/update';
    private const EP_GROUPS_DELETE       = '/resto/api/v2/entities/products/group/delete';
    private const EP_GROUPS_RESTORE      = '/resto/api/v2/entities/products/group/restore';

    // === User Categories ===
    private const EP_CAT_LIST_GET        = '/resto/api/v2/entities/products/category/list';
    private const EP_CAT_LIST_POST       = '/resto/api/v2/entities/products/category/list';
    private const EP_CAT_SAVE            = '/resto/api/v2/entities/products/category/save';
    private const EP_CAT_UPDATE          = '/resto/api/v2/entities/products/category/update';
    private const EP_CAT_DELETE          = '/resto/api/v2/entities/products/category/delete';
    private const EP_CAT_RESTORE         = '/resto/api/v2/entities/products/category/restore';

    // === Images ===
    private const EP_IMG_LOAD            = '/resto/api/v2/images/load';   // GET ?imageId=
    private const EP_IMG_SAVE            = '/resto/api/v2/images/save';   // POST JSON { data: "<base64>" }
    private const EP_IMG_DELETE          = '/resto/api/v2/images/delete'; // POST JSON { items:[{id}] }

    // === Tech Cards (Assembly Charts) ===
    private const EP_CHARTS_GET_ALL         = '/resto/api/v2/assemblyCharts/getAll';
    private const EP_CHARTS_GET_ALL_UPDATE  = '/resto/api/v2/assemblyCharts/getAllUpdate';
    private const EP_CHARTS_GET_TREE        = '/resto/api/v2/assemblyCharts/getTree';
    private const EP_CHARTS_GET_ASSEMBLED   = '/resto/api/v2/assemblyCharts/getAssembled';
    private const EP_CHARTS_GET_PREPARED    = '/resto/api/v2/assemblyCharts/getPrepared';
    private const EP_CHARTS_BY_ID           = '/resto/api/v2/assemblyCharts/byId';
    private const EP_CHARTS_GET_HISTORY     = '/resto/api/v2/assemblyCharts/getHistory';
    private const EP_CHARTS_SAVE            = '/resto/api/v2/assemblyCharts/save';
    private const EP_CHARTS_DELETE          = '/resto/api/v2/assemblyCharts/delete';

    // === Scales with sizes ===
    private const EP_SCALES_LIST_GET        = '/resto/api/v2/entities/productScales';         // GET
    private const EP_SCALES_LIST_POST       = '/resto/api/v2/entities/productScales';         // POST form
    private const EP_SCALE_BY_ID            = '/resto/api/v2/entities/productScales/{id}';    // GET
    private const EP_SCALES_SAVE            = '/resto/api/v2/entities/productScales/save';    // POST JSON
    private const EP_SCALES_UPDATE          = '/resto/api/v2/entities/productScales/update';  // POST JSON
    private const EP_SCALES_DELETE          = '/resto/api/v2/entities/productScales/delete';  // POST JSON {items:[{id}]}
    private const EP_SCALES_RESTORE         = '/resto/api/v2/entities/productScales/restore'; // POST JSON {items:[{id}]}

    // Product ↔ Scale binding
    private const EP_PRODUCT_SCALE_GET      = '/resto/api/v2/entities/products/{productId}/productScale'; // GET
    private const EP_PRODUCT_SCALE_SET      = '/resto/api/v2/entities/products/{productId}/productScale'; // POST JSON
    private const EP_PRODUCT_SCALE_DEL      = '/resto/api/v2/entities/products/{productId}/productScale'; // DELETE
    private const EP_PRODUCTS_SCALES_GET    = '/resto/api/v2/entities/products/productScales';            // GET/POST form

    public function __construct(DB $db, Logger $log, int $accountId, string $baseUrl, string $login, string $passwordPlain)
    {
        $this->dbWrap        = $db;
        $this->db            = $db->conn();
        $this->log           = $log;
        $this->accountId     = $accountId;
        $this->baseUrl       = rtrim($baseUrl, '/');
        $this->login         = $login;
        $this->passwordPlain = $passwordPlain;
    }

    // === Internals ===

    private function passHash(): string
    {
        return sha1('resto#' . $this->passwordPlain);
    }

    /** Последовательность вызовов (требование iikoServer) */
    private function withLock(callable $fn)
    {
        $lockFile = sys_get_temp_dir() . "/sc_iikoserver_{$this->accountId}.lock";
        $fh = fopen($lockFile, 'c');
        if ($fh) { flock($fh, LOCK_EX); }
        try { return $fn(); }
        finally { if ($fh) { flock($fh, LOCK_UN); fclose($fh); } }
    }

    private function trace(string $method, string $url, int $code, int $ms, ?string $err): void
    {
        $st = $this->db->prepare('INSERT INTO server_calls(account_id,method,url,http_code,duration_ms,error) VALUES(?,?,?,?,?,?)');
        $st->bindValue(1, $this->accountId, \SQLITE3_INTEGER);
        $st->bindValue(2, $method, \SQLITE3_TEXT);
        $st->bindValue(3, $url, \SQLITE3_TEXT);
        $st->bindValue(4, $code, \SQLITE3_INTEGER);
        $st->bindValue(5, $ms, \SQLITE3_INTEGER);
        $st->bindValue(6, $err, \SQLITE3_TEXT);
        $st->execute();
    }

    private function ensureToken(): string
    {
        $row = $this->db->querySingle('SELECT token FROM server_tokens WHERE account_id = '.(int)$this->accountId, true);
        if ($row && !empty($row['token'])) {
            return (string)$row['token'];
        }
        $url = "{$this->baseUrl}".self::EP_AUTH.'?login='.rawurlencode($this->login).'&pass='.$this->passHash();
        $r = $this->curl('POST', $url, null, ['Accept: text/plain']);
        $token = is_string($r['body'] ?? null) ? trim($r['body']) : trim((string)$r['raw']);
        if ($token === '' || $r['code'] !== 200) {
            throw new \RuntimeException('Auth failed: '.substr((string)($r['raw'] ?? ''), 0, 500));
        }
        $st = $this->db->prepare('INSERT OR REPLACE INTO server_tokens(account_id, token, acquired_at) VALUES(?,?,?)');
        $st->bindValue(1, $this->accountId, \SQLITE3_INTEGER);
        $st->bindValue(2, $token, \SQLITE3_TEXT);
        $st->bindValue(3, time(), \SQLITE3_INTEGER);
        $st->execute();
        return $token;
    }

    public function logout(): array
    {
        return $this->withLock(function () {
            $token = $this->ensureToken();
            $url = "{$this->baseUrl}".self::EP_LOGOUT.'?key='.rawurlencode($token);
            $r = $this->curl('POST', $url, null, ["Cookie: key={$token}"]);
            $this->db->exec('DELETE FROM server_tokens WHERE account_id = '.(int)$this->accountId);
            return $r;
        });
    }

    // === Low-level HTTP with proper key propagation ===

    private function buildQuery(array $params, array $repeatKeys = []): string
    {
        // превращаем массивы в повторяющиеся пары k=v (без []), как требует iikoServer
        $parts = [];
        foreach ($params as $k => $v) {
            if ($v === null) continue;
            if (in_array($k, $repeatKeys, true)) {
                $arr = is_array($v) ? $v : [$v];
                foreach ($arr as $item) {
                    $parts[] = rawurlencode((string)$k).'='.rawurlencode((string)$item);
                }
            } else {
                $parts[] = rawurlencode((string)$k).'='.rawurlencode(is_bool($v) ? ($v?'true':'false') : (string)$v);
            }
        }
        return implode('&', $parts);
    }

    private function encodeForm(array $form, array $repeatKeys = []): string
    {
        // аналогично buildQuery, но для тела form-urlencoded
        return $this->buildQuery($form, $repeatKeys);
    }

    private function getWithKey(string $path, array $query = [], array $repeatKeys = []): array
    {
        return $this->withLock(function () use ($path, $query, $repeatKeys) {
            $token = $this->ensureToken();
            $query['key'] = $token;
            $qs  = $this->buildQuery($query, $repeatKeys);
            $url = "{$this->baseUrl}{$path}".($qs ? "?{$qs}" : '');
            $r = $this->curl('GET', $url, null, ["Cookie: key={$token}"]);
            if ($r['code'] === 401 || $r['code'] === 403) {
                $this->db->exec('DELETE FROM server_tokens WHERE account_id = '.(int)$this->accountId);
                $token = $this->ensureToken();
                $query['key'] = $token;
                $qs  = $this->buildQuery($query, $repeatKeys);
                $url = "{$this->baseUrl}{$path}".($qs ? "?{$qs}" : '');
                $r = $this->curl('GET', $url, null, ["Cookie: key={$token}"]);
            }
            return $r;
        });
    }

    private function postFormWithKey(string $path, array $form, array $repeatKeys = []): array
    {
        return $this->withLock(function () use ($path, $form, $repeatKeys) {
            $token = $this->ensureToken();
            $qs  = 'key='.rawurlencode($token);
            $url = "{$this->baseUrl}{$path}?{$qs}";
            $body = $this->encodeForm($form, $repeatKeys);
            return $this->curl('POST', $url, $body, [
                'Content-Type: application/x-www-form-urlencoded',
                "Cookie: key={$token}",
            ]);
        });
    }

    private function postJsonWithKey(string $path, array $json, array $query = []): array
    {
        return $this->withLock(function () use ($path, $json, $query) {
            $token = $this->ensureToken();
            $query['key'] = $token;
            $qs  = $this->buildQuery($query);
            $url = "{$this->baseUrl}{$path}".($qs ? "?{$qs}" : '');
            return $this->curl('POST', $url, json_encode($json, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES), [
                'Content-Type: application/json; charset=utf-8',
                "Cookie: key={$token}",
            ]);
        });
    }

    private function deleteWithKey(string $path, array $query = []): array
    {
        return $this->withLock(function () use ($path, $query) {
            $token = $this->ensureToken();
            $query['key'] = $token;
            $qs  = $this->buildQuery($query);
            $url = "{$this->baseUrl}{$path}".($qs ? "?{$qs}" : '');
            return $this->curl('DELETE', $url, null, ["Cookie: key={$token}"]);
        });
    }

    private function curl(string $method, string $url, ?string $body = null, array $headers = []): array
    {
        $start = microtime(true);
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 90,
        ]);
        if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        $raw = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE) ?: 0;
        $err  = curl_errno($ch) ? curl_error($ch) : null;
        curl_close($ch);

        $ms = (int)round((microtime(true)-$start)*1000);
        $this->trace($method, $url, $code, $ms, $err);

        $data = null;
        if (is_string($raw) && $raw !== '') {
            $j = json_decode($raw, true);
            $data = is_array($j) ? $j : $raw;
        }
        return ['code'=>$code,'body'=>$data,'raw'=>$raw,'error'=>$err];
    }

    // === Products ===

    public function productsListGet(array $params = []): array
    {
        // repeat: ids, nums, codes, types, categoryIds, parentIds
        return $this->getWithKey(
            self::EP_PRODUCTS_LIST_GET,
            $params,
            ['ids','nums','codes','types','categoryIds','parentIds']
        );
    }

    public function productsListPost(array $form = []): array
    {
        // form: includeDeleted, revisionFrom, ids, nums, codes, types, categoryIds, parentIds
        return $this->postFormWithKey(
            self::EP_PRODUCTS_LIST_POST,
            $form,
            ['ids','nums','codes','types','categoryIds','parentIds']
        );
    }

    public function productSave(array $productBody, ?bool $generateNomenclatureCode = null, ?bool $generateFastCode = null): array
    {
        $q = [];
        if ($generateNomenclatureCode !== null) $q['generateNomenclatureCode'] = $generateNomenclatureCode;
        if ($generateFastCode        !== null) $q['generateFastCode']        = $generateFastCode;
        return $this->postJsonWithKey(self::EP_PRODUCT_SAVE, $productBody, $q);
    }

    public function productUpdate(array $productBody, ?bool $overrideFastCode = null, ?bool $overrideNomenclatureCode = null): array
    {
        $q = [];
        if ($overrideFastCode        !== null) $q['overrideFastCode']        = $overrideFastCode;
        if ($overrideNomenclatureCode!== null) $q['overrideNomenclatureCode']= $overrideNomenclatureCode;
        return $this->postJsonWithKey(self::EP_PRODUCT_UPDATE, $productBody, $q);
    }

    public function productsDelete(array $items /* [ ['id'=>UUID], ... ] */): array
    {
        return $this->postJsonWithKey(self::EP_PRODUCTS_DELETE, ['items' => $items]);
    }

    public function productsRestore(array $items, ?bool $overrideNomenclatureCode = null): array
    {
        $body = ['items' => $items];
        $q = [];
        if ($overrideNomenclatureCode !== null) $q['overrideNomenclatureCode'] = $overrideNomenclatureCode;
        return $this->postJsonWithKey(self::EP_PRODUCTS_RESTORE, $body, $q);
    }

    // === Groups ===

    public function groupsListGet(array $params = []): array
    {
        // repeat: ids, nums, codes, parentIds
        return $this->getWithKey(
            self::EP_GROUPS_LIST_GET,
            $params,
            ['ids','nums','codes','parentIds']
        );
    }

    public function groupsListPost(array $form = []): array
    {
        return $this->postFormWithKey(
            self::EP_GROUPS_LIST_POST,
            $form,
            ['ids','nums','codes','parentIds']
        );
    }

    public function groupSave(array $groupBody, ?bool $generateNomenclatureCode = null, ?bool $generateFastCode = null): array
    {
        $q = [];
        if ($generateNomenclatureCode !== null) $q['generateNomenclatureCode'] = $generateNomenclatureCode;
        if ($generateFastCode        !== null) $q['generateFastCode']        = $generateFastCode;
        return $this->postJsonWithKey(self::EP_GROUP_SAVE, $groupBody, $q);
    }

    public function groupUpdate(array $groupBody, ?bool $overrideFastCode = null, ?bool $overrideNomenclatureCode = null): array
    {
        $q = [];
        if ($overrideFastCode        !== null) $q['overrideFastCode']        = $overrideFastCode;
        if ($overrideNomenclatureCode!== null) $q['overrideNomenclatureCode']= $overrideNomenclatureCode;
        return $this->postJsonWithKey(self::EP_GROUP_UPDATE, $groupBody, $q);
    }

    public function groupsDelete(array $productsAndGroupsDto /* {products:{items:[{id}]}, productGroups:{items:[{id}]}} */): array
    {
        return $this->postJsonWithKey(self::EP_GROUPS_DELETE, $productsAndGroupsDto);
    }

    public function groupsRestore(array $productsAndGroupsDto): array
    {
        return $this->postJsonWithKey(self::EP_GROUPS_RESTORE, $productsAndGroupsDto);
    }

    // === User Categories ===

    public function categoriesListGet(array $params = []): array
    {
        // repeat: ids
        return $this->getWithKey(self::EP_CAT_LIST_GET, $params, ['ids']);
    }

    public function categoriesListPost(array $form = []): array
    {
        return $this->postFormWithKey(self::EP_CAT_LIST_POST, $form, ['ids']);
    }

    public function categorySave(string $name): array
    {
        return $this->postJsonWithKey(self::EP_CAT_SAVE, ['name' => $name]);
    }

    public function categoryUpdate(string $id, string $name): array
    {
        return $this->postJsonWithKey(self::EP_CAT_UPDATE, ['id' => $id, 'name' => $name]);
    }

    public function categoryDelete(string $id): array
    {
        return $this->postJsonWithKey(self::EP_CAT_DELETE, ['id' => $id]);
    }

    public function categoryRestore(string $id): array
    {
        return $this->postJsonWithKey(self::EP_CAT_RESTORE, ['id' => $id]);
    }

    // === Images ===

    public function imageLoad(string $imageId): array
    {
        return $this->getWithKey(self::EP_IMG_LOAD, ['imageId' => $imageId]);
    }

    /**
     * Сохранение изображения: ожидает base64 (без data:... префикса).
     * В ряде инсталляций тело — { "data": "<BASE64>" }.
     */
    public function imageSaveBase64(string $base64): array
    {
        return $this->postJsonWithKey(self::EP_IMG_SAVE, ['data' => $base64]);
    }

    public function imagesDelete(array $items /* [ ['id'=>UUID], ... ] */): array
    {
        return $this->postJsonWithKey(self::EP_IMG_DELETE, ['items' => $items]);
    }

    // === Tech Cards (Assembly Charts) ===

    public function chartsGetAll(string $dateFrom, ?string $dateTo = null, ?bool $includeDeletedProducts = null, ?bool $includePreparedCharts = null): array
    {
        $q = ['dateFrom'=>$dateFrom];
        if ($dateTo !== null) $q['dateTo'] = $dateTo;
        if ($includeDeletedProducts !== null) $q['includeDeletedProducts'] = $includeDeletedProducts;
        if ($includePreparedCharts  !== null) $q['includePreparedCharts']  = $includePreparedCharts;
        return $this->getWithKey(self::EP_CHARTS_GET_ALL, $q);
    }

    public function chartsGetAllUpdate(int $knownRevision, string $dateFrom, ?string $dateTo = null, ?bool $includeDeletedProducts = null, ?bool $includePreparedCharts = null): array
    {
        $q = ['knownRevision'=>$knownRevision, 'dateFrom'=>$dateFrom];
        if ($dateTo !== null) $q['dateTo'] = $dateTo;
        if ($includeDeletedProducts !== null) $q['includeDeletedProducts'] = $includeDeletedProducts;
        if ($includePreparedCharts  !== null) $q['includePreparedCharts']  = $includePreparedCharts;
        return $this->getWithKey(self::EP_CHARTS_GET_ALL_UPDATE, $q);
    }

    public function chartsGetTree(string $date, string $productId, ?string $departmentId = null): array
    {
        $q = ['date'=>$date, 'productId'=>$productId];
        if ($departmentId !== null) $q['departmentId'] = $departmentId;
        return $this->getWithKey(self::EP_CHARTS_GET_TREE, $q);
    }

    public function chartsGetAssembled(string $date, string $productId, ?string $departmentId = null): array
    {
        $q = ['date'=>$date, 'productId'=>$productId];
        if ($departmentId !== null) $q['departmentId'] = $departmentId;
        return $this->getWithKey(self::EP_CHARTS_GET_ASSEMBLED, $q);
    }

    public function chartsGetPrepared(string $date, string $productId, ?string $departmentId = null): array
    {
        $q = ['date'=>$date, 'productId'=>$productId];
        if ($departmentId !== null) $q['departmentId'] = $departmentId;
        return $this->getWithKey(self::EP_CHARTS_GET_PREPARED, $q);
    }

    public function chartById(string $id): array
    {
        return $this->getWithKey(self::EP_CHARTS_BY_ID, ['id'=>$id]);
    }

    public function chartsGetHistory(string $productId, ?string $departmentId = null): array
    {
        $q = ['productId'=>$productId];
        if ($departmentId !== null) $q['departmentId'] = $departmentId;
        return $this->getWithKey(self::EP_CHARTS_GET_HISTORY, $q);
    }

    public function chartSave(array $chartBody): array
    {
        return $this->postJsonWithKey(self::EP_CHARTS_SAVE, $chartBody);
    }

    public function chartDelete(string $id): array
    {
        return $this->postJsonWithKey(self::EP_CHARTS_DELETE, ['id'=>$id]);
    }

    // === Scales & Sizes ===

    public function productScalesListGet(array $params = []): array
    {
        // repeat: ids
        return $this->getWithKey(self::EP_SCALES_LIST_GET, $params, ['ids']);
    }

    public function productScalesListPost(array $form = []): array
    {
        return $this->postFormWithKey(self::EP_SCALES_LIST_POST, $form, ['ids']);
    }

    public function productScaleById(string $scaleId): array
    {
        $path = str_replace('{id}', rawurlencode($scaleId), self::EP_SCALE_BY_ID);
        return $this->getWithKey($path);
    }

    public function productScaleSave(array $scaleBody): array
    {
        return $this->postJsonWithKey(self::EP_SCALES_SAVE, $scaleBody);
    }

    public function productScaleUpdate(array $scaleBody): array
    {
        return $this->postJsonWithKey(self::EP_SCALES_UPDATE, $scaleBody);
    }

    public function productScalesDelete(array $items /* [ ['id'=>UUID], ... ] */): array
    {
        return $this->postJsonWithKey(self::EP_SCALES_DELETE, ['items'=>$items]);
    }

    public function productScalesRestore(array $items): array
    {
        return $this->postJsonWithKey(self::EP_SCALES_RESTORE, ['items'=>$items]);
    }

    public function productScaleGetForProduct(string $productId): array
    {
        $path = str_replace('{productId}', rawurlencode($productId), self::EP_PRODUCT_SCALE_GET);
        return $this->getWithKey($path);
    }

    /** GET для набора продуктов: repeat key productId */
    public function productScalesGetForProductsGet(array $productIds = [], bool $includeDeletedProducts = false): array
    {
        $params = ['includeDeletedProducts'=>$includeDeletedProducts];
        if ($productIds) $params['productId'] = $productIds;
        return $this->getWithKey(self::EP_PRODUCTS_SCALES_GET, $params, ['productId']);
    }

    /** POST form для набора продуктов: repeat key productId */
    public function productScalesGetForProductsPost(array $productIds = [], bool $includeDeletedProducts = false): array
    {
        $form = ['includeDeletedProducts'=>$includeDeletedProducts];
        if ($productIds) $form['productId'] = $productIds;
        return $this->postFormWithKey(self::EP_PRODUCTS_SCALES_GET, $form, ['productId']);
    }

    public function productScaleSetForProduct(string $productId, array $body /* {id, productSizes:[{id,disabled,factors:[{startNumber,factor}]}]} */): array
    {
        $path = str_replace('{productId}', rawurlencode($productId), self::EP_PRODUCT_SCALE_SET);
        return $this->postJsonWithKey($path, $body);
    }

    public function productScaleDeleteForProduct(string $productId): array
    {
        $path = str_replace('{productId}', rawurlencode($productId), self::EP_PRODUCT_SCALE_DEL);
        return $this->deleteWithKey($path);
    }
}
