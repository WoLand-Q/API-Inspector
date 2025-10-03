<?php
declare(strict_types=1);

namespace App;

final class Config
{
    public const APP_NAME = 'Smart Café · Syrve Cloud Menu Inspector';
    public const DB_PATH  = __DIR__ . '/../var/db.db';
    // Switch region if needed, e.g. https://api-ru.syrve.live
    public const SYRVE_BASE_URL = 'https://api-eu.syrve.live';
}
