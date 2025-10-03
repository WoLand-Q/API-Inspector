/* Smart Café · Cart + Delivery + Order Types + KB Tips (extends app.js) */
/* eslint-disable no-undef */
(function () {
    "use strict";

    // ---- tiny utils ----------------------------------------------------------
    const q  = (s, n=document) => n.querySelector(s);
    const qa = (s, n=document) => Array.from(n.querySelectorAll(s));
    const on = (sel, ev, fn) => { const el=q(sel); if (el) el.addEventListener(ev, fn); };
    const money = n => (Math.round((+n || 0) * 100) / 100).toFixed(2);
    const phoneValid = s => /^\+\d{8,40}$/.test(String(s||"").trim());
    const _hl = el => { try{ if (window.hljs && el) hljs.highlightElement(el); }catch{} };
    const isGuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s||""));

    // ---- knowledge base (client-side) ---------------------------------------
    const KB = [
        ['System.ArgumentOutOfRangeException', 'Вероятно, сумма заказа не укладывается в настройки валюты.'],
        ["Sum ... doesn't fit for the currency settings", 'Убедитесь, что сумма заказа корректна и соответствует настройкам.'],
        ['PASSED_COMMAND_NOT_FOUND', 'Команда не найдена. Проверьте correlationId/устаревание. Или заказ не дошёл до системы.'],
        ['Command not found in commands storage', 'Команда не найдена в хранилище. Возможно, истёк TTL — создайте заказ заново.'],
        ['Passed organization(s)', 'Организация не входит в список, разрешённый API-логину. Проверьте выбор заведения.'],
        ['ApiLogin is inactive', 'API-логин деактивирован — проверьте его статус в Back Office.'],
        ['Apilogin has been blocked.', 'API-логин заблокирован. Обычно из-за некорректных запросов — разблокируйте в Back Office.'],
        ['Success', 'Заказ принят. Если его не видно — возможно, задержка. Обновите вкладку «Доставка».'],
        ['Creation timeout expired, command automatically transited to error status', 'Таймаут/связь. Проверьте кассу и плагины.'],
        ['Payment of cash payment type must have', 'Несогласованность типа оплаты — API ожидало другой paymentType/Kind.'],
        ["Product doesn't have cooking place type", 'У товара не задан тип места приготовления (cooking place type).'],
        ['Current settings require the delivery to be paid before sending.', 'Требуется предоплата до отправки доставки.'],
        ['ConstraintViolationException: Product', 'Товар исключён из меню для зала/стола. Проверьте доступность в Back Office.'],
        ['CannotAddInactiveProductException: Product', 'Товар деактивирован. Активируйте его перед добавлением.'],
        [/Payment type .+ is deleted\./i, 'Тип оплаты удалён/скрыт. Активируйте и синхронизируйте.'],
        ['INVALID_BODY_JSON_FORMAT', 'Для is_alive добавьте идентификатор(ы) организации (organizationIds).'],
        ['At least one organization identifier is required', 'Для /terminal_groups/is_alive обязательно передать organizationIds: [orgId].'],
        [/self-service delivery with address/i, 'Выбран тип заказа «самообслуживание/самовывоз», но в запросе передан адрес доставки. ' + 'Решение: выберите тип заказа «Доставка» или отправляйте заказ без address/deliveryPoint.']
    ];


    function kbSuggest(apiResponse) {
        const parts = [];
        if (apiResponse) {
            const flat = (o,p='') => {
                Object.entries(o||{}).forEach(([k,v])=>{
                    if (v && typeof v==='object') flat(v, p ? `${p}.${k}` : k);
                    else if (v!=null) parts.push(String(v));
                });
            };
            flat(apiResponse);
        }
        const hay = parts.join(' ');
        for (const [key, tip] of KB) {
            let rx;
            if (key instanceof RegExp) rx = key;
            else if (/^\/.*\/[a-z]*$/i.test(String(key))) {
                const m = String(key).match(/^\/(.*)\/([a-z]*)$/i); rx = new RegExp(m[1], m[2] || 'i');
            } else {
                const words = String(key).split(/\s+/).filter(Boolean).map(s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
                rx = new RegExp(words.join('.*'), 'i');
            }
            if (rx.test(hay)) return tip;
        }
        return null;
    }

    // ---- cart state ----------------------------------------------------------
    let CART = []; // {id,name,price,qty,raw}

    function renderCart() {
        const box = q('#cartItems'); const badge=q('#cartBadge'); const totalEl=q('#cartTotal');
        if (!box || !totalEl) return;

        let total = 0;
        if (!CART.length) {
            box.innerHTML = `<div class="text-secondary">Корзина пуста</div>`;
        } else {
            box.innerHTML = CART.map(it => `
        <div class="d-flex justify-content-between align-items-center gap-2 border-bottom pb-2">
          <div class="small flex-grow-1">
            <div class="fw-semibold">${it.name}</div>
            <div class="text-secondary">${money(it.price)} × ${it.qty}</div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-outline-light" data-dec="${it.id}">−</button>
            <button class="btn btn-sm btn-outline-light" data-inc="${it.id}">+</button>
            <button class="btn btn-sm btn-outline-danger" data-del="${it.id}"><i class="bi bi-x"></i></button>
          </div>
        </div>`).join('');
            CART.forEach(it => total += it.price * it.qty);
        }
        totalEl.textContent = money(total);
        if (badge) {
            const cnt = CART.reduce((a,b)=>a+b.qty,0);
            badge.textContent = String(cnt);
            badge.classList.toggle('d-none', cnt===0);
        }

        qa('[data-dec]', box).forEach(b => b.addEventListener('click', ()=>{
            const it = CART.find(x=>x.id===b.dataset.dec); if(!it) return;
            it.qty = Math.max(0, it.qty-1); if(!it.qty) CART=CART.filter(x=>x.id!==it.id); renderCart();
        }));
        qa('[data-inc]', box).forEach(b => b.addEventListener('click', ()=>{
            const it = CART.find(x=>x.id===b.dataset.inc); if(!it) return; it.qty+=1; renderCart();
        }));
        qa('[data-del]', box).forEach(b => b.addEventListener('click', ()=>{
            CART = CART.filter(x=>x.id!==b.dataset.del); renderCart();
        }));
    }

    // ---- enhance product cards with "Add" -----------------------------------
    function boostMenuCards() {
        qa('#grid [data-prod]').forEach(btnInfo=>{
            const wrap = btnInfo.parentElement;
            if (!wrap || wrap.querySelector('[data-add]')) return;
            const id = btnInfo.getAttribute('data-prod');
            const add = document.createElement('button');
            add.className = 'btn btn-primary btn-sm';
            add.setAttribute('data-add', id);
            add.title='В корзину';
            add.innerHTML='<i class="bi bi-bag-plus"></i>';
            wrap.appendChild(add);
        });
    }
    const oldRenderMenu = window.renderMenu;
    if (typeof oldRenderMenu === 'function') {
        window.renderMenu = function () { const r = oldRenderMenu.apply(this, arguments); setTimeout(boostMenuCards,0); return r; };
    } else {
        const mo = new MutationObserver(boostMenuCards); const grid=q('#grid'); if (grid) mo.observe(grid,{childList:true,subtree:true});
    }
    document.addEventListener('click', e=>{
        const add = e.target.closest('[data-add]'); if(!add) return;
        const id = add.getAttribute('data-add');
        const p = (window.MENU_LIST||[]).find(x=>x.id===id);
        if(!p) return;
        const price = +p.price; if(!Number.isFinite(price)) return alert('У товара нет цены');
        const ex = CART.find(x=>x.id===id); if(ex) ex.qty+=1; else CART.push({id:p.id,name:p.name,price,qty:1,raw:p.raw});
        renderCart();
    });

    // ---- offcanvas / checkout modal -----------------------------------------
    let offCart;
    on('#btnCart','click', ()=>{ if(!offCart && window.bootstrap) offCart = new bootstrap.Offcanvas(q('#offCart')); offCart?.show(); });
    on('#btnCheckout','click', ()=>{ if (window.bootstrap) new bootstrap.Modal(q('#modalCheckout')).show(); primeCheckoutForm(); });

    // ---- API wrappers (backend actions expected) -----------------------------
    async function fetchTerminalGroups(accountId, orgId){
        return await api('terminal_groups', {account_id:accountId, organizationId:orgId}).catch(()=>({}));
    }
    // ВАЖНО: передаём organizationId/organizationIds (бэкенд должен пробросить их дальше!)
    async function fetchIsAlive(accountId, orgId, ids){
        return await api('terminal_is_alive', {
            account_id: accountId,
            organizationId: orgId,
            organizationIds: orgId ? [orgId] : [],
            terminalGroupIds: ids
        }).catch(()=>({}));
    }
    async function fetchPaymentTypes(accountId, orgId){
        return await api('payment_types', {account_id:accountId, organizationId:orgId}).catch(()=>({}));
    }
    async function fetchOrderTypes(accountId, orgId){
        return await api('order_types', {account_id:accountId, organizationId:orgId}).catch(()=>({}));
    }
    async function fetchCities(accountId, orgId){
        return await api('cities', {account_id:accountId, organizationId:orgId}).catch(()=>({}));
    }
    async function fetchStreets(accountId, orgId, cityId){
        return await api('streets_by_city', {account_id:accountId, organizationId:orgId, cityId}).catch(()=>({}));
    }
    // --- Quick access buttons (open modals) -------------------------------------
    // кнопки быстрого доступа в шапке (нужно явно указать событие 'click')
    on('#btnOpenStatus', 'click', () => {
        if (!window.bootstrap) return;
        try {
            const hist = JSON.parse(localStorage.getItem('sc_history')||'[]');
            if (hist && hist.length) {
                q('#stCorrId').value = hist[0].corrId || '';
                q('#stOrgId').value  = hist[0].orgId  || '';
            }
        } catch {}
        new bootstrap.Modal(q('#modalStatus')).show();
    });

    on('#btnOpenAlive', 'click', () => {
        if (!window.bootstrap) return;
        new bootstrap.Modal(q('#modalAlive')).show();
        renderAliveOnce();
    });

    // обновление списка терминалов
    on('#btnAliveRefresh', 'click', () => {
        refreshAliveList().catch(()=>{});
    });


    // --- Online terminals modal --------------------------------------------------
    let aliveTimer = null;

    async function refreshAliveList(){
        const accountId = +(q('#selAccount')?.value || 0);
        const orgId = (window.stateGet && stateGet().org) || '';
        const empty = q('#aliveEmpty');
        const listBox = q('#aliveList');
        const orgCode = q('#aliveOrg');

        if (!accountId || !orgId) {
            if (orgCode) orgCode.textContent = '—';
            if (listBox) listBox.innerHTML = '';
            if (empty) { empty.textContent = 'Выберите аккаунт и организацию выше, затем повторите.'; empty.classList.remove('d-none'); }
            return;
        }
        if (empty) empty.classList.add('d-none');
        if (orgCode) orgCode.textContent = orgId;

        // 1) получаем терминалы надёжно
        const tg = await fetchTerminalGroups(accountId, orgId);
        const terms = extractTerminalGroups(tg);

        // 2) статус is_alive — чанками (например по 50)
        const ids = terms.map(t => t.id).filter(Boolean);
        const status = {};
        const chunk = (arr, n) => Array.from({length: Math.ceil(arr.length/n)}, (_,i)=>arr.slice(i*n, (i+1)*n));
        for (const part of chunk(ids, 50)) {
            try{
                const alive = await fetchIsAlive(accountId, orgId, part);
                (alive.is_alive?.response?.isAliveStatus || []).forEach(x => { status[x.terminalGroupId] = !!x.isAlive; });
            }catch{}
        }

        if (listBox) {
            listBox.innerHTML = terms.length ? terms.map(t => {
                const ok = !!status[t.id];
                const dot = ok ? '🟢' : '🔴';
                const name = String(t.name||'').replace(/</g,'&lt;');
                const addr = String(t.address||'').replace(/</g,'&lt;');
                return `
        <div class="d-flex justify-content-between align-items-center border rounded p-2">
          <div class="me-3">
            <div class="fw-semibold">${dot} ${name}</div>
            <div class="small text-secondary">${addr}</div>
          </div>
          <button class="btn btn-sm btn-outline-light" data-pick-term="${t.id}">Выбрать</button>
        </div>`;
            }).join('') : '<div class="text-secondary">Терминалы не найдены</div>';

            // чтобы не плодить обработчики на каждом refresh — навесим один раз
            listBox.onclick = (e)=>{
                const btn = e.target.closest('[data-pick-term]');
                if (!btn) return;
                const id = btn.getAttribute('data-pick-term');
                if (!window.bootstrap) return;

                const mod = new bootstrap.Modal(q('#modalCheckout'));
                mod.show();
                (async ()=>{
                    await primeCheckoutForm();
                    const sel = q('#selTerminal');
                    if (sel) {
                        sel.value = id;
                        await updateSelectedTerminalStatus();
                        previewCheckout();
                    }
                })();
                bootstrap.Modal.getInstance(q('#modalAlive'))?.hide();
            };
        }
    }


    function renderAliveOnce(){
        refreshAliveList().catch(()=>{});
        const chk = q('#aliveAuto');
        if (chk && !chk.dataset.bound) {
            chk.dataset.bound = '1';
            chk.checked = true;                      // стартуем авто-обновление
            if (aliveTimer) clearInterval(aliveTimer);
            aliveTimer = setInterval(refreshAliveList, 30000);
            chk.addEventListener('change', ()=>{
                if (aliveTimer) { clearInterval(aliveTimer); aliveTimer = null; }
                if (chk.checked) aliveTimer = setInterval(refreshAliveList, 30000);
            });
        }
    }


    // на закрытии модалки — отключить автопуллинг
    document.addEventListener('hidden.bs.modal', (e)=>{
        if (e.target && e.target.id === 'modalAlive') {
            if (aliveTimer) { clearInterval(aliveTimer); aliveTimer = null; }
        }
    });

    // также перерисовывать список при открытии
    document.addEventListener('shown.bs.modal', (e)=>{
        if (e.target && e.target.id === 'modalAlive') renderAliveOnce();
    });

    // ---- helper: извлечь orderTypes из «любой» формы ответа ------------------
    function extractOrderTypes(root){
        // 1) стандартный путь
        let list = root?.order_types?.response?.orderTypes;
        // иногда orderTypes — массив с объектами, у каждого есть items
        if (Array.isArray(list)) {
            list = list.flatMap(o => Array.isArray(o?.items) ? o.items : []);
        }
        // 2) альтернативные группы
        if (!Array.isArray(list) || !list.length) {
            const groups = root?.order_types?.response?.items || root?.order_types?.response?.orderTypesGroups;
            if (Array.isArray(groups)) list = groups.flatMap(g => g.items || []);
        }
        // 3) универсальный поиск по дереву: любой массив объектов с id+name
        if (!Array.isArray(list) || !list.length) {
            const found = [];
            (function walk(x){
                if (Array.isArray(x) && x.length && typeof x[0]==='object') {
                    if (x.every(o => o && typeof o==='object' && 'id' in o && 'name' in o)) found.push(...x);
                } else if (x && typeof x==='object') {
                    Object.values(x).forEach(walk);
                }
            })(root);
            list = found;
        }
        // фильтры и уникализация
        const seen = new Set();
        return (Array.isArray(list)?list:[])
            .filter(o=>!o.isDeleted && isGuid(o?.id) && (o?.name||'').trim())
            .filter(o => (seen.has(o.id) ? false : seen.add(o.id)));
    }
    // ---- helper: извлечь terminalGroups из «любой» формы ответа ----------------
    function extractTerminalGroups(root){
        const resp = root?.terminal_groups?.response || {};
        let list = resp.terminalGroups ?? resp.items ?? [];

        // если это массив «групп» с .items — расплющим
        if (Array.isArray(list) && list.some(g => Array.isArray(g?.items))) {
            list = list.flatMap(g => g.items || []);
        }

        // универсальный поиск по дереву: массив объектов с id (+ name/address)
        if (!Array.isArray(list) || !list.length) {
            const found = [];
            (function walk(x){
                if (Array.isArray(x) && x.length && typeof x[0]==='object') {
                    if (x.every(o => o && typeof o==='object' && 'id' in o && ('name' in o || 'address' in o))) {
                        found.push(...x);
                    } else {
                        x.forEach(walk);
                    }
                } else if (x && typeof x==='object') {
                    Object.values(x).forEach(walk);
                }
            })(resp);
            list = found;
        }

        // дедуп по id
        const seen = new Set();
        return (Array.isArray(list)?list:[])
            .filter(t => t && t.id && (seen.has(t.id) ? false : seen.add(t.id)));
    }

    // ---- selected terminal status (only one) --------------------------------
    async function updateSelectedTerminalStatus(){
        const hint = q('#termHint');
        const accountId = +(q('#selAccount')?.value || 0);
        const orgId = (window.stateGet && stateGet().org) || '';
        const termId = q('#selTerminal')?.value || '';
        if (!hint) return;
        if (!accountId || !orgId || !termId) { hint.textContent=''; return; }

        const alive = await fetchIsAlive(accountId, orgId, [termId]).catch(()=>({}));
        const rec = (alive.is_alive?.response?.isAliveStatus || []).find(x => x.terminalGroupId === termId);
        const ok = !!rec?.isAlive;
        hint.innerHTML = `<span class="me-2 small">${ok?'🟢 Онлайн':'🔴 Офлайн'}</span>`;
    }

    // ---- History (status checks) --------------------------------------------
    function loadHistory(){ try { return JSON.parse(localStorage.getItem('sc_history')||'[]'); } catch { return []; } }
    function saveHistory(arr){ localStorage.setItem('sc_history', JSON.stringify(arr.slice(0,50))); }
    function pushHistory(entry){
        const arr = loadHistory();
        if (!arr.some(e=>e.corrId===entry.corrId)) arr.unshift(entry);
        saveHistory(arr);
    }
    function buildNiceTitle(cart, name, total){
        const n = cart.reduce((a,b)=>a+b.qty,0);
        const first = cart[0] || {name:'Товар', qty:n||1};
        const tailQty = n - (first.qty||0);
        const tail = tailQty>0 ? ` +${tailQty}` : '';
        const who = (name||'Гость').trim();
        return `${who} · ${first.name}×${first.qty}${tail} · ${money(total)}`;
    }
    // ---- History (status checks) --------------------------------------------
    const HISTORY_KEY = 'sc_history';
    function loadHistory(){ try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; } }
    function saveHistory(arr){ localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0,50))); }
    function pushHistory(entry){
        const arr = loadHistory();
        if (!arr.some(e => e.corrId === entry.corrId)) arr.unshift(entry);
        saveHistory(arr);
    }
    function buildNiceTitle(cart, name, total){
        const n = cart.reduce((a,b)=>a+b.qty,0);
        const first = cart[0] || {name:'Товар', qty:n||1};
        const tailQty = n - (first.qty||0);
        const tail = tailQty>0 ? ` +${tailQty}` : '';
        const who = (name||'Гость').trim();
        return `${who} · ${first.name}×${first.qty}${tail} · ${money(total)}`;
    }

// отдельная функция — наполняем существующий селект
    function fillStatusHistorySelect(){
        const sel = q('#statusHistory'); if (!sel) return;
        const list = loadHistory();
        const fmt = ts => new Date(ts).toLocaleString();
        sel.innerHTML = list.length
            ? list.map(e=>`<option value="${e.corrId}">${fmt(e.ts)} — ${e.title}</option>`).join('')
            : `<option value="">История пуста</option>`;
    }

    function renderStatusHistory(){
        const modal = q('#modalStatus'); if (!modal) return;
        const box = modal.querySelector('.modal-body');

        // если UI уже был — просто обновим список и выходим
        if (q('#statusHistory')) { fillStatusHistorySelect(); return; }

        const wrap = document.createElement('div');
        wrap.className = 'vstack gap-2';
        wrap.innerHTML = `
    <label class="form-label small">Недавние заказы</label>
    <div class="d-flex gap-2">
      <select id="statusHistory" class="form-select"></select>
      <button id="statusUse" class="btn btn-outline-light">Подставить</button>
      <button id="statusDel" class="btn btn-outline-danger" title="Удалить выбранный"><i class="bi bi-trash"></i></button>
    </div>`;
        box.prepend(wrap);

        fillStatusHistorySelect();

        on('#statusUse','click', ()=>{
            const list = loadHistory();
            const corrId = q('#statusHistory').value;
            const rec = list.find(x=>x.corrId===corrId);
            if (!rec) return;
            q('#stCorrId').value = rec.corrId;
            q('#stOrgId').value  = rec.orgId;
        });

        on('#statusDel','click', ()=>{
            const corrId = q('#statusHistory').value;
            const list = loadHistory().filter(x=>x.corrId!==corrId);
            saveHistory(list);
            fillStatusHistorySelect();
        });

    }

    // каждый раз при открытии модалки — обновляем список
    document.addEventListener('shown.bs.modal', e=>{
        if (e.target && e.target.id === 'modalStatus') renderStatusHistory();
    });


    // ---- prime checkout form -------------------------------------------------
    async function primeCheckoutForm(){
        const accountId = +(q('#selAccount')?.value || 0);
        const orgId = (window.stateGet && stateGet().org) || '';
        if(!accountId || !orgId) return;

        // terminals
        const tg = await fetchTerminalGroups(accountId, orgId);
        const items = (tg.terminal_groups?.response?.terminalGroups||[]).flatMap(g=>g.items||[]);
        q('#selTerminal').innerHTML = `<option value="">— выберите —</option>` + items.map(t =>
            `<option value="${t.id}">${(t.name||'').replace(/</g,'&lt;')} — ${(t.address||'').replace(/</g,'&lt;')}</option>`
        ).join('');

        on('#selTerminal','change', ()=>{ previewCheckout(); updateSelectedTerminalStatus(); });
        updateSelectedTerminalStatus();

        // payment types + привязка Kind
        const pt = await fetchPaymentTypes(accountId, orgId);
        const plist = (pt.payment_types?.response?.paymentTypes)||[];
        q('#selPayment').innerHTML = `<option value="">— выберите —</option>` + plist.map(p =>
            `<option value="${p.id}" data-kind="${p.kind||''}">${(p.name||'').replace(/</g,'&lt;')}${p.kind?` (${p.kind})`:''}</option>`
        ).join('');
        on('#selPayment','change', ()=>{
            const kind = q('#selPayment')?.selectedOptions?.[0]?.dataset?.kind || '';
            const kindSel = q('#selPaymentKind');
            if (kindSel && kind && !kindSel.value) { kindSel.value = kind; }
            previewCheckout();
        });
        on('#selPaymentKind','change', previewCheckout);

        // order types (надёжное извлечение + валидация GUID)
        const ot = await fetchOrderTypes(accountId, orgId);
        const olist = extractOrderTypes(ot);
        const sel = q('#selOrderType');
        sel.innerHTML = `<option value="">— тип заказа —</option>` +
            olist.map(o=>`<option value="${o.id}">${(o.name||'').replace(/</g,'&lt;')}</option>`).join('');
        sel.disabled = !olist.length;

        // авто-выбор «доставка»
        const preferred = qa('#selOrderType option').find(o=>/доставк/i.test(o.textContent));
        if (preferred) preferred.selected = true;
        on('#selOrderType','change', previewCheckout);

        // cities + streets
        const c = await fetchCities(accountId, orgId);
        const cityItems = ((c.cities?.response?.cities)||[]).flatMap(gr=>gr.items||[]).filter(x=>!x.isDeleted);
        q('#selCity').innerHTML = `<option value="">— город —</option>` + cityItems.map(ci =>
            `<option value="${ci.id}">${(ci.name||'').replace(/</g,'&lt;')}</option>`
        ).join('');
        q('#selStreet').innerHTML = `<option value="">— улица —</option>`;
        q('#selStreet').disabled = true;

        on('#selCity','change', async ()=>{
            const cityId = q('#selCity').value;
            if (!cityId){
                q('#selStreet').innerHTML = `<option value="">— улица —</option>`;
                q('#selStreet').disabled = true; previewCheckout(); return;
            }
            const st = await fetchStreets(accountId, orgId, cityId);
            const streets = (st.streets?.response?.streets)||[];
            q('#selStreet').innerHTML = `<option value="">— улица —</option>` +
                streets.filter(s=>!s.isDeleted).map(s=>`<option value="${s.id}">${(s.name||'').replace(/</g,'&lt;')}</option>`).join('');
            q('#selStreet').disabled = false;
        });
        on('#selStreet','change', previewCheckout);

        // inputs
        ['custName','custPhone','addrHouse','addrFlat','addrEntrance','addrFloor','orderComment']
            .forEach(id => on('#'+id,'input', ()=>previewCheckout()));

        previewCheckout();
    }

    function previewCheckout(){
        const orgId = (window.stateGet && stateGet().org) || '';
        const terminalGroupId = q('#selTerminal')?.value || '';
        const orderTypeRaw = q('#selOrderType')?.value || '';
        const phone = q('#custPhone')?.value || '';
        const name  = q('#custName')?.value || '';
        const cityId = q('#selCity')?.value || '';
        const streetId = q('#selStreet')?.value || '';
        const house = q('#addrHouse')?.value || '';
        const flat  = q('#addrFlat')?.value || '';
        const entrance = q('#addrEntrance')?.value || '';
        const floor = q('#addrFloor')?.value || '';
        const paymentTypeId = q('#selPayment')?.value || '';
        const kindSel = q('#selPaymentKind')?.value || '';
        const paymentKindAttr = q('#selPayment')?.selectedOptions?.[0]?.dataset?.kind || '';
        const paymentKind = kindSel || paymentKindAttr || '';
        const comment = q('#orderComment')?.value || '';

        const items = CART.map(it => ({ type:'Product', productId: it.id, amount: it.qty, price: it.price }));

        const order = {
            externalNumber: 'WEB_' + Date.now(),
            phone,
            ...(isGuid(orderTypeRaw) ? { orderTypeId: orderTypeRaw } : {}), // только если GUID
            deliveryPoint: {
                coordinates: { latitude: 0, longitude: 0 },
                address: { type:'legacy', cityId, street:{id:streetId}, house, flat, entrance, floor },
                comment: 'Оставить у двери'
            },
            comment,
            customer: { type:'regular', name },
            guests: { count:1, splitBetweenPersons:true },
            items,
            payments: paymentTypeId ? [{
                sum: +(q('#cartTotal')?.textContent || '0'),
                paymentTypeId,
                paymentTypeKind: paymentKind, // Cash/Card/Online…
                isProcessedExternally:false, isFiscalizedExternally:false, isPrepay:false
            }] : [],
            sourceKey: 'SmartCafe-Inspector'
        };

        const payload = {
            organizationId: orgId,
            terminalGroupId,
            createOrderSettings: { transportToFrontTimeout: 0, checkStopList: false },
            order
        };

        const code = q('#checkoutPreview');
        if (code){ code.classList?.add('language-json'); code.textContent = JSON.stringify(payload, null, 2); _hl(code); }
        const meta = q('#checkoutMeta'); if (meta) meta.textContent = `Позиции: ${CART.reduce((a,b)=>a+b.qty,0)} · Сумма: ${q('#cartTotal')?.textContent||'0.00'}`;
        return payload;
    }

    on('#btnSendDelivery','click', async ()=>{
        if (!CART.length) return alert('Корзина пуста');
        if (!q('#selTerminal').value) return alert('Выберите терминал');
        const otid = q('#selOrderType')?.value || '';
        if (!isGuid(otid)) return alert('Выберите тип заказа');
        const ph = q('#custPhone').value.trim(); if (!phoneValid(ph)) return alert('Телефон в формате +XXXXXXXX');
        if (!q('#selCity').value || !q('#selStreet').value || !q('#addrHouse').value.trim()) return alert('Заполните адрес');

        const accountId = +(q('#selAccount')?.value || 0);
        const payload = previewCheckout();
        const paymentKind = q('#selPaymentKind')?.value || q('#selPayment')?.selectedOptions?.[0]?.dataset?.kind || '';

        try{
            // Дополнительно передаём вид оплаты на бэкенд (на случай, если он использует его отдельно)
            const res = await api('create_delivery', { account_id: accountId, payment_type_kind: paymentKind || null, payload });
            const http = res.result || {};
            const corr = http.response?.correlationId || http.correlationId || http.headers?.['x-correlation-id'] || null;
            alert('Заказ отправлен' + (corr ? `\nCorrelationId: ${corr}` : ''));

            if (corr){
                // сохраняем историю для быстрого статуса
                const total = +(q('#cartTotal')?.textContent || '0');
                const title = buildNiceTitle([...CART], q('#custName')?.value || '', total);
                pushHistory({ corrId: corr, orgId: payload.organizationId, title, total, ts: Date.now() });

                q('#stCorrId').value = corr;
                q('#stOrgId').value = payload.organizationId;
                if (window.bootstrap) new bootstrap.Modal(q('#modalStatus')).show();
            }
            CART = []; renderCart();
            window.bootstrap?.Modal.getInstance(q('#modalCheckout'))?.hide();
        }catch(err){
            alert('Ошибка отправки: ' + (err?.error || JSON.stringify(err)));
        }
    });

    // ---- commands/status + KB output ----------------------------------------
    on('#btnStatusCheck','click', async ()=>{
        const accountId = +(q('#selAccount')?.value || 0);
        const organizationId = q('#stOrgId').value.trim();
        const correlationId  = q('#stCorrId').value.trim();
        if (!organizationId || !correlationId) return;

        const st = await api('command_status', { account_id: accountId, organizationId, correlationId }).catch(()=>({}));
        const data = st.status?.response || st || {};
        const el = q('#statusJson'); if (el){ el.classList?.add('language-json'); el.textContent = JSON.stringify(data, null, 2); _hl(el); }

        const tip = kbSuggest(data);
        const box = q('#kbTip');
        if (box){
            if (tip){ box.textContent = tip; box.classList.remove('d-none'); }
            else { box.textContent = 'Описание ошибки не найдено в базе знаний.'; box.classList.remove('d-none'); }
        }
    });

    // ---- periodic isAlive refresh (selected only) ----------------------------
    setInterval(async ()=>{
        const mod = q('#modalCheckout'); if (!mod || !mod.classList.contains('show')) return;
        await updateSelectedTerminalStatus();
    }, 30000);

    // ---- init ----------------------------------------------------------------
    document.addEventListener('shown.bs.modal', e=>{
        if (e.target && e.target.id === 'modalStatus') renderStatusHistory();
    });

    on('#btnCart','click', ()=> renderCart());
    renderCart();
    // экспорт только на чтение
    window.Cart = {
        getItems(){ return (CART||[]).map(it => ({
            id: it.id, productId: it.id, name: it.name, amount: it.qty, qty: it.qty, price: it.price
        }));}
    };

})();