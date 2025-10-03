<?php
declare(strict_types=1);
const APP_NAME = 'Smart Café · Syrve Cloud Menu Inspector';
?>
<!doctype html>
<html lang="ru" data-bs-theme="dark">
<head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title><?=htmlspecialchars(APP_NAME)?></title>

    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet">

    <!-- highlight.js (browser CDN build) -->
    <link href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css" rel="stylesheet">
    <link href="assets/app.css?v=6" rel="stylesheet">
</head>
<body>

<!-- ТОП-ПАНЕЛЬ -->
<nav class="navbar navbar-expand-lg navbar-dark topbar glass sticky-top">
    <div class="container">
        <a class="navbar-brand fw-semibold"><?=htmlspecialchars(APP_NAME)?></a>

        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#topbarNav">
            <span class="navbar-toggler-icon"></span>
        </button>

        <div class="collapse navbar-collapse" id="topbarNav">
            <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                <!-- API Cloud -->
                <li class="nav-item dropdown">
                    <a class="nav-link dropdown-toggle" href="#" data-bs-toggle="dropdown">
                        <i class="bi bi-cloud"></i> API Cloud
                    </a>
                    <ul class="dropdown-menu dropdown-menu-dark">
                        <li><a class="dropdown-item" href="#" id="miStatus"><i class="bi bi-activity"></i> Статусы</a></li>
                        <li><a class="dropdown-item" href="#" id="miAlive"><i class="bi bi-broadcast-pin"></i> Терминалы</a></li>
                        <li><a class="dropdown-item" href="#" id="miReports"><i class="bi bi-clipboard-data"></i> Отчёты</a></li>
                        <li><a class="dropdown-item" href="#" id="miDicts"><i class="bi bi-journal-text"></i> Словари</a></li>
                        <li><a class="dropdown-item" href="#" id="miEmployees"><i class="bi bi-people"></i> Сотрудники</a></li>
                        <li><a class="dropdown-item" href="#" id="miAddresses"><i class="bi bi-geo-alt"></i> Адреса / Доставка</a></li>
                        <li><a class="dropdown-item" href="#" id="miLoyalty"><i class="bi bi-stars"></i> Лояльность</a></li>
                    </ul>
                </li>

                <!-- будущий раздел API Server -->
                <li class="nav-item">
                    <a class="nav-link" href="partials/server.html">
                        <i class="bi bi-hdd-network"></i> API Server
                    </a>
                </li>
            </ul>

            <div class="d-flex gap-2">
                <a class="btn btn-outline-info btn-sm" href="readme.html" target="_blank" rel="noopener">
                    <i class="bi bi-book"></i> README
                </a>
            </div>
        </div>
    </div>
</nav>

<main class="container pb-5">
    <div class="row g-3">
        <!-- Sidebar -->
        <aside class="col-lg-3">
            <div class="panel glass p-3">
                <h2 class="h6"><i class="bi bi-key"></i> API логины</h2>
                <form id="formAdd" class="needs-validation" novalidate>
                    <div class="mb-2">
                        <label class="form-label">Метка (название заведения)</label>
                        <input class="form-control" name="title" required placeholder="Напр.: SushiStory"/>
                        <div class="invalid-feedback">Укажите метку</div>
                    </div>
                    <div class="mb-2">
                        <label class="form-label">API Login</label>
                        <input class="form-control" name="api_login" required placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>
                        <div class="invalid-feedback">Укажите apiLogin</div>
                    </div>
                    <button class="btn btn-primary w-100"><i class="bi bi-plus-lg"></i> Добавить</button>
                </form>

                <hr>
                <div id="accounts" class="vstack gap-2"></div>
            </div>

            <div class="panel glass p-3 mt-3">
                <h2 class="h6 d-flex align-items-center justify-content-between">
                    <span><i class="bi bi-activity"></i> Последние вызовы</span>
                </h2>
                <div id="logs" class="logs-list"></div>
            </div>
        </aside>

        <!-- Workspace -->
        <section class="col-lg-9">
            <!-- Orgs -->
            <span class="small text-secondary">Region: <code id="region">https://api-eu.syrve.live</code></span>
            <div class="panel glass p-3 mb-3">
                <div class="row g-2 align-items-end">
                    <div class="col-md">
                        <label class="form-label mb-1">1) Выберите аккаунт</label>
                        <select id="selAccount" class="form-select"></select>
                    </div>
                    <div class="col-auto">
                        <button id="btnFetchOrgs" class="btn btn-outline-light">
                            <i class="bi bi-building"></i> Получить организации
                        </button>
                    </div>
                </div>

                <div id="orgsBox" class="mt-3 d-none">
                    <label class="form-label mb-1">2) Выберите точку</label>
                    <div class="d-flex gap-2 mb-2">
                        <input id="orgSearch" class="form-control" placeholder="Фильтр по названию…">
                        <span class="small text-secondary align-self-center" id="orgCount"></span>
                    </div>
                    <div id="orgs" class="row g-2"></div>
                    <div class="text-center mt-2">
                        <button id="orgMore" class="btn btn-outline-secondary btn-sm d-none">Показать ещё</button>
                    </div>
                </div>
            </div>

            <!-- Menu -->
            <div id="menuBox" class="d-none">
                <div class="panel glass p-3 mb-3">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <input id="search" class="form-control" placeholder="Поиск по меню…">
                        </div>
                        <div class="col-auto">
                            <div class="btn-group">
                                <button class="btn btn-outline-info" id="btnShare"><i class="bi bi-qr-code"></i> QR</button>
                                <button class="btn btn-outline-warning" id="btnDiag"><i class="bi bi-clipboard-data"></i> Диагностика</button>
                                <button class="btn btn-primary position-relative" id="btnCart">
                                    <i class="bi bi-basket2"></i> Корзина
                                    <span id="cartBadge" class="position-absolute top-0 start-100 translate-middle badge rounded-pill text-bg-danger d-none">0</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="row g-3">
                    <div class="col-md-3">
                        <!-- ДОБАВЛЕНО: sticky-cats (z-index, изоляция) -->
                        <div class="panel glass p-3 sticky-top sticky-cats" style="top: 12px">
                            <h2 class="h6 mb-2">Категории</h2>
                            <div id="cats" class="d-flex flex-column gap-2 cats"></div>
                        </div>
                    </div>
                    <div class="col-md-9">
                        <div id="grid" class="row g-3"></div>
                        <div id="menuSentinel" class="py-3 text-center text-secondary"> </div>
                        <div class="text-center mt-2">
                            <button id="menuMore" class="btn btn-outline-secondary d-none">Показать ещё</button>
                        </div>
                    </div>
                </div>
            </div>

        </section>
    </div>
</main>

<!-- Offcanvas: Cart -->
<div class="offcanvas offcanvas-end text-bg-dark" tabindex="-1" id="offCart" aria-labelledby="offCartLabel" style="width: 420px">
    <div class="offcanvas-header">
        <h5 id="offCartLabel"><i class="bi bi-basket2"></i> Корзина</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="offcanvas"></button>
    </div>
    <div class="offcanvas-body d-flex flex-column gap-2">
        <div id="cartItems" class="vstack gap-2"></div>
        <div class="d-flex justify-content-between align-items-center mt-auto">
            <div class="fw-semibold">Итого: <span id="cartTotal">0.00</span></div>
            <button class="btn btn-success" id="btnCheckout"><i class="bi bi-send"></i> Оформить</button>
        </div>
    </div>
</div>

<!-- Модалки, уже в DOM -->
<div class="modal fade" id="modalCheckout" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content glass">
            <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-truck"></i> Оформление доставки</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="row g-3">
                    <div class="col-md-6">
                        <label class="form-label">Терминал</label>
                        <select id="selTerminal" class="form-select"></select>
                        <div class="small mt-1" id="termHint"></div>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Тип оплаты</label>
                        <select id="selPayment" class="form-select"></select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Тип оплаты Kind</label>
                        <select id="selPaymentKind" class="form-select">
                            <option value="">— выберите kind —</option>
                            <option value="Cash">Cash</option>
                            <option value="Card">Card</option>
                            <option value="Online">Online</option>
                        </select>
                        <div class="small text-secondary">Если не уверены — оставьте как у типа оплаты.</div>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Тип заказа</label>
                        <select id="selOrderType" class="form-select"></select>
                    </div>

                    <div class="col-md-6">
                        <label class="form-label">Имя</label>
                        <input id="custName" class="form-control" placeholder="Имя клиента">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Телефон</label>
                        <input id="custPhone" class="form-control" placeholder="+380XXXXXXXXX">
                        <div class="small text-secondary">Формат: +цифры (8–40)</div>
                    </div>

                    <div class="col-md-6">
                        <label class="form-label">Город</label>
                        <select id="selCity" class="form-select"></select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Улица</label>
                        <select id="selStreet" class="form-select" disabled></select>
                    </div>

                    <div class="col-3"><input id="addrHouse" class="form-control" placeholder="Дом"></div>
                    <div class="col-3"><input id="addrFlat" class="form-control" placeholder="Кв"></div>
                    <div class="col-3"><input id="addrEntrance" class="form-control" placeholder="Подъезд"></div>
                    <div class="col-3"><input id="addrFloor" class="form-control" placeholder="Этаж"></div>

                    <div class="col-12">
                        <label class="form-label">Комментарий</label>
                        <textarea id="orderComment" class="form-control" rows="2" placeholder="Комментарий к заказу"></textarea>
                    </div>

                    <div class="col-12">
                        <pre class="code small"><code id="checkoutPreview" class="language-json"></code></pre>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <div class="me-auto small text-secondary" id="checkoutMeta"></div>
                <button class="btn btn-primary" id="btnSendDelivery"><i class="bi bi-rocket-takeoff"></i> Отправить</button>
            </div>
        </div>
    </div>
</div>

<div class="modal fade" id="modalStatus" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content glass">
            <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-activity"></i> Проверка статуса</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body vstack gap-2">
                <input id="stCorrId" class="form-control" placeholder="CorrelationId">
                <input id="stOrgId"  class="form-control" placeholder="OrganizationId (из выбранной точки)" />
                <div id="kbTip" class="alert alert-secondary d-none small"></div>
                <pre class="code small"><code id="statusJson" class="language-json"></code></pre>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline-light" id="btnStatusCheck">Проверить</button>
            </div>
        </div>
    </div>
</div>

<div class="modal fade" id="modalProduct" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content glass">
            <div class="modal-header">
                <h5 class="modal-title" id="prodTitle">Блюдо</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="row g-3">
                    <div class="col-lg-5">
                        <img id="prodImg" class="w-100 rounded object-cover" style="aspect-ratio: 4/3" alt="">
                    </div>
                    <div class="col-lg-7">
                        <ul class="nav nav-tabs" role="tablist">
                            <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tabInfo" type="button">Инфо</button></li>
                            <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tabJson" type="button">JSON</button></li>
                        </ul>
                        <div class="tab-content pt-3">
                            <div class="tab-pane fade show active" id="tabInfo"><div id="prodInfo"></div></div>
                            <div class="tab-pane fade" id="tabJson">
                                <div class="d-flex justify-content-end mb-2">
                                    <button id="btnCopyJson" class="btn btn-outline-light btn-sm"><i class="bi bi-clipboard"></i> Скопировать JSON</button>
                                </div>
                                <pre class="code small"><code class="language-json" id="prodJson"></code></pre>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <small class="text-secondary" id="prodMeta"></small>
            </div>
        </div>
    </div>
</div>

<div class="modal fade" id="modalQR" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content glass">
            <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-qr-code"></i> QR меню (демо-ссылка)</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="d-flex flex-column align-items-center gap-2">
                    <div id="qr" class="qr"></div>
                    <div id="qrLink" class="text-break small"></div>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="modal fade" id="modalDiag" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content glass">
            <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-clipboard-data"></i> Диагностика качества меню</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div id="diagSummary" class="vstack gap-3"></div>
            </div>
            <div class="modal-footer">
                <div class="btn-group">
                    <button class="btn btn-outline-secondary" id="btnDiagCsv">Экспорт CSV</button>
                    <button class="btn btn-outline-secondary" id="btnDiagJson">Экспорт JSON</button>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="modal fade" id="modalLog" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content glass">
            <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-search"></i> Детали вызова</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <pre class="code small"><code class="language-json" id="logDetail"></code></pre>
            </div>
        </div>
    </div>
</div>

<!-- Modal: Онлайн терминалы -->
<div class="modal fade" id="modalAlive" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content glass">
            <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-broadcast-pin"></i> Онлайн-статус терминалов</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="alert alert-secondary small d-none" id="aliveEmpty"></div>

                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div class="small text-secondary">Организация: <code id="aliveOrg"></code></div>
                    <div class="d-flex align-items-center gap-2">
                        <button id="btnAliveRefresh" class="btn btn-outline-light btn-sm">
                            <i class="bi bi-arrow-repeat"></i> Обновить
                        </button>
                        <div class="form-check form-switch">
                            <input class="form-check-input" type="checkbox" id="aliveAuto">
                            <label class="form-check-label small" for="aliveAuto">Авто 30с</label>
                        </div>
                    </div>
                </div>

                <div id="aliveList" class="vstack gap-2"></div>
            </div>
        </div>
    </div>
</div>

<!-- Контейнер для догружаемых модалок -->
<div id="modals-root"></div>

<!-- highlight.js -->
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/languages/json.min.js"></script>
<script>window.hljs && hljs.highlightAll();</script>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>

<script>window.API_URL='api.php';</script>
<script src="assets/app.js?v=18" defer></script>
<script src="assets/cart.js?v=9" defer></script>

<script>
    // Универсальный ленивый загрузчик модалок
    async function lazyModal({ modalId, htmlUrl, scriptUrl }) {
        if (!document.getElementById(modalId)) {
            const resp = await fetch(htmlUrl);
            const html = await resp.text();
            document.getElementById('modals-root').insertAdjacentHTML('beforeend', html);
            if (scriptUrl) {
                await new Promise((res, rej) => {
                    const s = document.createElement('script');
                    s.src = scriptUrl; s.defer = true;
                    s.onload = res; s.onerror = rej; document.body.appendChild(s);
                });
            }
        }
        const el = document.getElementById(modalId);
        if (window.bootstrap && el) new bootstrap.Modal(el).show();
    }

    (function(){
        const $ = s => document.querySelector(s);

        $('#miStatus')?.addEventListener('click', (e)=>{ e.preventDefault(); const el = document.getElementById('modalStatus'); if (el) new bootstrap.Modal(el).show(); });
        $('#miAlive') ?.addEventListener('click', (e)=>{ e.preventDefault(); const el = document.getElementById('modalAlive');  if (el) new bootstrap.Modal(el).show(); });

        $('#miReports')   ?.addEventListener('click', (e)=>{ e.preventDefault(); lazyModal({ modalId:'modalReports',   htmlUrl:'partials/modal_reports.html?v=3',    scriptUrl:'assets/reports.js?v=3'   }); });
        $('#miDicts')     ?.addEventListener('click', (e)=>{ e.preventDefault(); lazyModal({ modalId:'modalDicts',     htmlUrl:'partials/modal_dicts.html?v=3',     scriptUrl:'assets/dicts.js?v=3'     }); });
        $('#miEmployees') ?.addEventListener('click', (e)=>{ e.preventDefault(); lazyModal({ modalId:'modalEmployees', htmlUrl:'partials/modal_employees.htm?v=3', scriptUrl:'assets/employees.js?v=3'}); });
        $('#miAddresses') ?.addEventListener('click', (e)=>{ e.preventDefault(); lazyModal({ modalId:'modalAddresses', htmlUrl:'partials/addresses_delivery.html?v=5', scriptUrl:'assets/ui.addresses.js?v=5'}); });
        $('#miLoyalty')?.addEventListener('click', (e)=>{
            e.preventDefault();
            lazyModal({
                modalId:'modalLoyalty',
                htmlUrl:'partials/modal_loyalty.html?v=4',
                scriptUrl:'assets/loyalty.js?v=4'
            });
        });
    })();
</script>

</body>
</html>
