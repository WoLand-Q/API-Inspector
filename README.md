# Smart Café — Syrve Cloud Menu Inspector (PHP)

Мини-приложение для ТП: логин по apiLogin, выбор организации, загрузка номенклатуры и отрисовка QR‑меню. Есть встроенный логгер HTTP-вызовов (SQLite).

## Стек
- PHP 8.1+ (ext-sqlite3, ext-curl)
- Bootstrap 5, animate.css, qrcode.js
- SQLite (файл `var/db.db`)

## Запуск
1. Скопируйте папку `public` в веб-корень (или `php -S 0.0.0.0:8080 -t public`).
2. Убедитесь, что PHP имеет права записи в `var/`.
3. Откройте `http://localhost/` (или ваш виртуальный хост).
4. Добавьте apiLogin, нажмите «Получить организации», выберите точку — меню отрисуется.

## Структура
```
public/
  index.php        — UI
  api.php          — XHR эндпойнты
  assets/app.js    — фронтенд-логика
src/
  Config.php       — базовый конфиг (регион, путь БД)
  DB.php           — SQLite и схема
  Http.php         — HTTP POST JSON (cURL)
  Logger.php       — журнал вызовов
  SyrveClient.php  — клиенты API + нормализация токена
var/
  db.db            — создастся автоматически
```

## Примечания по API
- Токен получаем POST `/api/1/access_token` с телом `{"apiLogin":"..."}`. Сервер может вернуть **чистую строку** или **JSON с полем `token`** — клиент поддерживает оба варианта.
- Организации: POST `/api/1/organizations` (Bearer <token>).
- Номенклатура: POST `/api/1/nomenclature` с `{"organizationId":"...","startRevision":0}`.

Документы:
- Swagger UI (EU): https://api-eu.syrve.live/  (разделы Authorization / Organizations / Menu — Nomenclature)
- Syrve Help — Delivery creation (включает требование подготовить/выгрузить меню перед чтением номенклатуры): https://en.syrve.help/articles/api/delivery-creation
- Syrve Help — Menu preparation / Export menu: https://en.syrve.help/articles/api/menu-preparation
