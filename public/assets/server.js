
(() => {
    const API_URL = window.API_URL || '/public/api.server.php';

    // ===== Утилиты =====
    const $  = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    const fmt = (v) => {
        try { return JSON.stringify(v, null, 2); }
        catch { return String(v); }
    };

    const safeParse = (text, fallback = {}) => {
        if (typeof text !== 'string' || text.trim() === '') return fallback;
        try { return JSON.parse(text); } catch { return fallback; }
    };

    const copy = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            toast('Скопировано в буфер обмена');
        } catch {
            alert('Скопируй вручную:\n' + text);
        }
    };

    const downloadJson = (obj, name = 'response.json') => {
        try {
            const blob = new Blob([fmt(obj)], { type: 'application/json;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (e) {
            alert('Не удалось сохранить файл: ' + e.message);
        }
    };

    let toastTimer = null;
    const toast = (msg) => {
        let el = $('#__toast');
        if (!el) {
            el = document.createElement('div');
            el.id = '__toast';
            el.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);background:#0a0f1c;border:1px solid #1f2b45;color:#cfe2ff;padding:8px 12px;border-radius:10px;font:12px/1.3 ui-sans-serif,system-ui;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,.3)';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.opacity = '1';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 1800);
    };

    const api = async (action, payload = {}) => {
        let data, resp;
        try {
            resp = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json;charset=utf-8' },
                body: JSON.stringify(payload)
            });
        } catch (e) {
            return { error: 'fetch_failed', message: e?.message || String(e), __http: { ok: false, status: 0 } };
        }

        try { data = await resp.json(); }
        catch { data = { error: 'invalid_json_response' }; }

        data.__http = { ok: resp.ok, status: resp.status };
        return data;
    };

    // ===== DOM =====
    const el = {
        // accounts
        formAcc: $('#form-server-account'),
        add:     $('#btn-acc-add'),
        upd:     $('#btn-acc-update'),
        del:     $('#btn-acc-delete'),
        editId:  $('#edit-id'),
        tbody:   $('#tbl-accounts tbody'),

        selectedServer: $('#selected-server'),
        btnLogin:  $('#btn-login'),
        btnLogout: $('#btn-logout'),
        tokenState: $('#token-state'),

        // runner
        method:  $('#method-select'),
        payload: $('#payload'),
        hint:    $('#hint'),
        exec:    $('#btn-exec'),
        clr:     $('#btn-clear'),
        out:     $('#out'),
        copyCurl: $('#btn-copy-curl'),
        copyOut:  $('#btn-copy-out'),
        saveOut:  $('#btn-save-out'),

        quickFillBtn: $$('[data-fill]')
    };

    // текущий выбранный server_id
    let selectedId = +(localStorage.getItem('server.selected') || 0);

    const setSelected = (id, labelText = null) => {
        selectedId = id;
        localStorage.setItem('server.selected', String(id || '0'));

        if (id) {
            el.selectedServer.textContent = labelText ?? `ID ${id}`;
            el.selectedServer.classList.add('sv-badge');
            el.btnLogin.disabled = false;
            el.btnLogout.disabled = false;
        } else {
            el.selectedServer.textContent = '—';
            el.btnLogin.disabled = true;
            el.btnLogout.disabled = true;
            el.tokenState.textContent = '—';
        }
    };

    // ===== CRUD: аккаунты =====
    const clearForm = () => {
        el.formAcc.reset();
        el.editId.textContent = '—';
        el.upd.disabled = true;
        el.del.disabled = true;
    };

    const fillForm = (row) => {
        el.formAcc.label.value = row.label || '';
        el.formAcc.base_url.value = row.base_url || '';
        el.formAcc.login.value = row.login || '';
        el.formAcc.password_plain.value = row.password_plain || '';
    };

    const loadAccounts = async () => {
        const res = await api('server_accounts', {});
        const rows = (res.accounts_server || res.accounts || res.rows || []);
        el.tbody.innerHTML = '';

        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
        <td>${r.id}</td>
        <td>${escapeHtml(r.label)}</td>
        <td>${escapeHtml(r.base_url)}</td>
        <td>${escapeHtml(r.login)}</td>
        <td class="sv-col-actions">
          <div class="sv-row">
            <button type="button" class="sv-btn sv-btn--ok btn-select" data-id="${r.id}" data-label="${escapeAttr(r.label)}">Выбрать</button>
            <button type="button" class="sv-btn btn-edit" data-id="${r.id}">Ред.</button>
            <button type="button" class="sv-btn sv-btn--danger btn-del" data-id="${r.id}">Удалить</button>
          </div>
        </td>`;
            tr.dataset.json = JSON.stringify(r);
            el.tbody.appendChild(tr);
        });

        // действия по строкам
        el.tbody.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', onEditRow));
        el.tbody.querySelectorAll('.btn-del').forEach(b => b.addEventListener('click', onDeleteRow));
        el.tbody.querySelectorAll('.btn-select').forEach(b => b.addEventListener('click', onSelectRow));

        // восстановить авто-выбор
        if (selectedId) {
            const r = rows.find(x => +x.id === +selectedId);
            if (r) {
                setSelected(+selectedId, `${r.label} (#${r.id})`);
                // авто-авторизация на старте
                await doLogin(true);
            } else {
                setSelected(0);
            }
        }
    };

    const onEditRow = (e) => {
        const id = +e.currentTarget.dataset.id;
        const tr = e.currentTarget.closest('tr');
        const row = JSON.parse(tr.dataset.json || '{}');
        fillForm(row);
        el.editId.textContent = id;
        el.upd.disabled = false;
        el.del.disabled = false;
    };

    const onDeleteRow = async (e) => {
        const id = +e.currentTarget.dataset.id;
        if (!confirm(`Удалить аккаунт #${id}?`)) return;
        const res = await api('server_account_delete', { id });
        if (res.ok || res.success) {
            toast('Удалено');
            if (selectedId === id) setSelected(0);
            await loadAccounts();
            clearForm();
        } else {
            alert('Ошибка удаления:\n' + fmt(res));
        }
    };

    const onSelectRow = async (e) => {
        const id = +e.currentTarget.dataset.id;
        const label = e.currentTarget.dataset.label || `ID ${id}`;
        setSelected(id, `${label} (#${id})`);
        // авто-логин при выборе
        await doLogin(true);
    };

    el.add?.addEventListener('click', async () => {
        const body = {
            label: el.formAcc.label.value.trim(),
            base_url: el.formAcc.base_url.value.trim(),
            login: el.formAcc.login.value.trim(),
            password_plain: el.formAcc.password_plain.value
        };
        if (!body.label || !body.base_url || !body.login || !body.password_plain) {
            toast('Заполни все поля');
            return;
        }
        const res = await api('server_account_add', body);
        if (res.ok || res.id) {
            toast('Добавлено');
            clearForm();
            await loadAccounts();
        } else {
            alert('Ошибка добавления:\n' + fmt(res));
        }
    });

    el.upd?.addEventListener('click', async () => {
        const id = +el.editId.textContent || 0;
        if (!id) return;
        const body = {
            id,
            label: el.formAcc.label.value.trim(),
            base_url: el.formAcc.base_url.value.trim(),
            login: el.formAcc.login.value.trim(),
            password_plain: el.formAcc.password_plain.value
        };
        const res = await api('server_account_update', body);
        if (res.ok || res.success) {
            toast('Сохранено');
            await loadAccounts();
        } else {
            alert('Ошибка сохранения:\n' + fmt(res));
        }
    });

    el.del?.addEventListener('click', async () => {
        const id = +el.editId.textContent || 0;
        if (!id) return;
        if (!confirm(`Удалить аккаунт #${id}?`)) return;
        const res = await api('server_account_delete', { id });
        if (res.ok || res.success) {
            toast('Удалено');
            if (selectedId === id) setSelected(0);
            await loadAccounts();
            clearForm();
        } else {
            alert('Ошибка удаления:\n' + fmt(res));
        }
    });

    // ===== Логин / логаут =====
    async function doLogin(silent = false) {
        if (!selectedId) {
            if (!silent) toast('Сначала выбери аккаунт слева');
            return;
        }
        if (!silent) toast('Авторизация…');
        const res = await api('server_login', { server_id: selectedId });
        el.out.textContent = fmt(res);
        if ((res.__http?.ok) && (res.token || res.response || res.http)) {
            const token = (res.token || res.response || '').toString();
            el.tokenState.textContent = token ? `token: ${token}` : 'токен получен, см. ответ ниже';
            if (!silent) toast('Авторизовано');
        } else {
            toast('Логин завершился с ошибкой (см. ответ)');
        }
    }

    el.btnLogin?.addEventListener('click', () => doLogin(false));

    el.btnLogout?.addEventListener('click', async () => {
        if (!selectedId) return toast('Сначала выбери аккаунт слева');
        const res = await api('server_logout', { server_id: selectedId });
        el.out.textContent = fmt(res);
        el.tokenState.textContent = '—';
        toast('Выход выполнен');
    });

    // ===== Раннер =====
    const HINTS = {
        server_products_list_get:  `{"server_id":1,"params":{"includeDeleted":false,"ids":[],"nums":[],"types":[],"categoryIds":[],"parentIds":[]}}`,
        server_products_list_post: `{"server_id":1,"form":{"includeDeleted":false,"revisionFrom":-1,"ids":[],"nums":[],"codes":[],"types":[],"categoryIds":[],"parentIds":[]}}`,
        server_product_save:       `{"server_id":1,"body":{"name":"Тест","type":"Dish","parent":null,"category":null,"num":null,"code":null}}`,
        server_product_update:     `{"server_id":1,"body":{"id":"UUID","name":"Новое имя"}}`,
        server_products_delete:    `{"server_id":1,"items":[{"id":"UUID"}]}`,
        server_products_restore:   `{"server_id":1,"items":[{"id":"UUID"}]}`,

        server_groups_list_get:    `{"server_id":1,"params":{"includeDeleted":false,"ids":[],"parentIds":[],"revisionFrom":-1,"nums":[],"codes":[]}}`,
        server_groups_list_post:   `{"server_id":1,"form":{"includeDeleted":false,"revisionFrom":-1,"ids":[],"nums":[],"codes":[],"parentIds":[]}}`,
        server_group_save:         `{"server_id":1,"body":{"name":"Группа","description":"","parent":null}}`,
        server_group_update:       `{"server_id":1,"body":{"id":"UUID","name":"Группа 1 (ред.)"}}`,
        server_groups_delete:      `{"server_id":1,"payload":{"products":{"items":[]},"productGroups":{"items":[{"id":"UUID"}]}}}`,
        server_groups_restore:     `{"server_id":1,"payload":{"products":{"items":[]},"productGroups":{"items":[{"id":"UUID"}]}}}`,

        server_categories_list_get:`{"server_id":1,"params":{"includeDeleted":false,"ids":[],"revisionFrom":-1}}`,
        server_categories_list_post:`{"server_id":1,"form":{"includeDeleted":false,"ids":[],"revisionFrom":-1}}`,
        server_category_save:      `{"server_id":1,"name":"Категория 1"}`,
        server_category_update:    `{"server_id":1,"id":"UUID","name":"Категория 2"}`,
        server_category_delete:    `{"server_id":1,"id":"UUID"}`,
        server_category_restore:   `{"server_id":1,"id":"UUID"}`,

        server_image_load:         `{"server_id":1,"imageId":"UUID"}`,
        server_image_save_base64:  `{"server_id":1,"data":"<BASE64>"}`,
        server_images_delete:      `{"server_id":1,"items":[{"id":"UUID"}]}`,

        server_charts_get_all:     `{"server_id":1,"dateFrom":"2020-01-01","dateTo":"2020-01-31","includeDeletedProducts":true,"includePreparedCharts":false}`,
        server_charts_get_all_update:`{"server_id":1,"knownRevision":-1,"dateFrom":"2020-01-01","dateTo":"2020-01-31","includeDeletedProducts":true,"includePreparedCharts":false}`,
        server_charts_get_tree:    `{"server_id":1,"date":"2024-01-01","productId":"UUID","departmentId":"UUID"}`,
        server_charts_get_assembled:`{"server_id":1,"date":"2024-01-01","productId":"UUID","departmentId":"UUID"}`,
        server_charts_get_prepared:`{"server_id":1,"date":"2024-01-01","productId":"UUID","departmentId":"UUID"}`,
        server_chart_by_id:        `{"server_id":1,"id":"UUID"}`,
        server_charts_get_history: `{"server_id":1,"productId":"UUID","departmentId":"UUID"}`,
        server_chart_save:         `{"server_id":1,"body":{"assembledProductId":"UUID","dateFrom":"2024-01-01","items":[]}}`,
        server_chart_delete:       `{"server_id":1,"id":"UUID"}`,

        server_scales_list_get:    `{"server_id":1,"params":{"ids":[],"includeDeleted":false}}`,
        server_scales_list_post:   `{"server_id":1,"form":{"ids":[],"includeDeleted":false}}`,
        server_scale_by_id:        `{"server_id":1,"id":"UUID"}`,
        server_scales_save:        `{"server_id":1,"body":{"name":"Шкала 1","productSizes":[{"name":"S","shortName":"S","priority":1,"default":true}]}}`,
        server_scales_update:      `{"server_id":1,"body":{"id":"UUID","name":"Шкала X","productSizes":[{"id":"UUID","name":"M","priority":2}]}}`,
        server_scales_delete:      `{"server_id":1,"items":[{"id":"UUID"}]}`,
        server_scales_restore:     `{"server_id":1,"items":[{"id":"UUID"}]}`,
        server_product_scale_get:  `{"server_id":1,"productId":"UUID"}`,
        server_products_scales_get:`{"server_id":1,"productIds":["UUID1","UUID2"],"includeDeletedProducts":false}`,
        server_products_scales_post:`{"server_id":1,"productIds":["UUID1","UUID2"],"includeDeletedProducts":false}`,
        server_product_scale_set:  `{"server_id":1,"productId":"UUID","body":{"id":"UUID_SCALE","productSizes":[{"id":"UUID_SIZE","disabled":false,"factors":[{"startNumber":1,"factor":1.0}]}]}}`,
        server_product_scale_delete:`{"server_id":1,"productId":"UUID"}`
    };

    const updateHint = () => {
        const key = el.method.value;
        const tmpl = HINTS[key] || `{"server_id":1}`;
        el.hint.textContent = 'Пример тела: ' + tmpl;
        el.payload.placeholder = tmpl;
    };

    el.method?.addEventListener('change', updateHint);

    el.quickFillBtn.forEach(b => {
        b.addEventListener('click', () => {
            const mode = b.dataset.fill;
            const key  = el.method.value;
            let v = HINTS[key] || `{"server_id":1}`;

            // универсальные вставки
            if (mode === 'list_get')  v = `{"server_id":1,"params":{"includeDeleted":false}}`;
            if (mode === 'list_post') v = `{"server_id":1,"form":{"includeDeleted":false,"revisionFrom":-1}}`;
            if (mode === 'ids_one')   v = `{"server_id":1,"body":{"id":"UUID"}}`;
            if (mode === 'ids_many')  v = `{"server_id":1,"items":[{"id":"UUID1"},{"id":"UUID2"}]}`;

            el.payload.value = v;
            toast('Шаблон вставлен');
        });
    });

    // Последний запрос для cURL
    let lastRequest = null;
    const buildCurl = () => {
        if (!lastRequest) return '—';
        const { action, payload } = lastRequest;
        const body = JSON.stringify(payload).replace(/'/g, "'\\''");
        return `curl -sS -X POST '${API_URL}?action=${encodeURIComponent(action)}' \
  -H 'Content-Type: application/json' \
  --data '${body}'`;
    };

    el.exec?.addEventListener('click', async () => {
        const action = el.method.value;
        if (!action) return;

        // тело
        let body = safeParse(el.payload.value, {});
        // автоматически подставим server_id из выбранного
        if (!body.server_id && selectedId) body.server_id = selectedId;

        lastRequest = { action, payload: body };

        const res = await api(action, body);
        el.out.textContent = fmt(res);
        if (!res.__http?.ok) toast(`Ошибка HTTP ${res.__http?.status ?? ''}`);
    });

    el.clr?.addEventListener('click', () => {
        el.out.textContent = '—';
        el.payload.value = '';
        lastRequest = null;
    });

    el.copyCurl?.addEventListener('click', () => copy(buildCurl()));
    el.copyOut?.addEventListener('click', () => copy(el.out.textContent || ''));
    el.saveOut?.addEventListener('click', () => downloadJson(safeParse(el.out.textContent, {})));

    // helpers
    function escapeHtml(s) {
        return String(s ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }
    function escapeAttr(s) {
        return String(s ?? '').replaceAll('"', '&quot;');
    }

    // init
    (async () => {
        updateHint();
        await loadAccounts();
    })();
})();
