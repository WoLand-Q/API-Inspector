<?php
declare(strict_types=1);

require __DIR__ . '/Config.php';
require __DIR__ . '/DB.php';
require __DIR__ . '/Http.php';
require __DIR__ . '/Logger.php';
require __DIR__ . '/SyrveClient.php';

use App\DB; // initialize DB
DB::conn();
