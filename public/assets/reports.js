/* Smart Café · Reports (Deliveries & Hall) */
(function(){
    "use strict";

    const $  = (s,n=document)=>n.querySelector(s);
    const $$ = (s,n=document)=>Array.from(n.querySelectorAll(s));
    const on = (sel,ev,fn)=>{ const el=$(sel); if (el) el.addEventListener(ev,fn); };
    const h = s => { const d=document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };
    const money = n => (Math.round((+n||0)*100)/100).toFixed(2);
    const getState = ()=> (window.stateGet ? stateGet() : {});

    // show/hide whole panel when org выбрана
    function togglePanel(){
        const ok = !!($('#selAccount')?.value) && !!getState().org;
        $('#repBox')?.classList.toggle('d-none', !ok);
    }
    document.addEventListener('DOMContentLoaded', togglePanel);
    window.addEventListener('hashchange', togglePanel);
    on('#selAccount','change', togglePanel);

    // defaults for datetime inputs (сегодня 00:00 – сейчас)
    function isoLocal(dt){ const pad = n=>String(n).padStart(2,'0');
        return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    }
    function bootDateInputs(){
        const now = new Date();
        const from = new Date(now); from.setHours(0,0,0,0);
        $('#repFrom').value = isoLocal(from);
        $('#repTo').value   = isoLocal(now);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootDateInputs);
    else bootDateInputs();

    // helpers
    const dtFmt = (s,end)=>{ // to Syrve "YYYY-MM-DD HH:mm:ss.mmm"
        if (!s) return '';
        const [d, t] = s.split('T');
        const [hh, mm] = (t||'00:00').split(':');
        return `${d} ${hh}:${mm}:${end?'59.999':'00.000'}`;
    };
    const phone = o => String((o.order||o).phone || '—');

    /* ---------------------- sections/tables ---------------------- */
    let _sections = [];
    async function loadSections(){
        const accountId = +($('#selAccount')?.value || 0);
        const orgId = getState().org || '';
        if (!accountId || !orgId) return;

        $('#repSection').innerHTML = '<option value="">Загрузка…</option>';
        $('#repTable').innerHTML   = '<option value="">—</option>';

        try{
            const resp = await api('hall_sections', {account_id:accountId, organizationId:orgId});
            const secs = resp.sections?.response?.restaurantSections || [];
            _sections = secs;

            const secSel = $('#repSection');
            secSel.innerHTML = secs.map(s=>`<option value="${h(s.id)}">${h(s.name||s.id)}</option>`).join('');
            if (secs[0]) fillTables(secs[0].id);

        }catch(err){
            $('#repSection').innerHTML = '<option value="">Ошибка</option>';
        }
    }
    function fillTables(sectionId){
        const sec = _sections.find(s=>s.id===sectionId);
        const tables = sec?.tables || [];
        const tsel = $('#repTable');
        tsel.innerHTML = tables.length
            ? `<option value="__ALL__">Все столы</option>` + tables.map(t=>`<option value="${h(t.id)}">${h(t.name || t.number || t.id)}</option>`).join('')
            : `<option value="">— столы не найдены —</option>`;
    }
    on('#repSection','change', e=> fillTables(e.target.value));
    on('#btnRepSections','click', loadSections);

    /* ---------------------- deliveries report -------------------- */
    function renderSummaryDeliveries(s){
        $('#repSummary').innerHTML = `
      <div class="d-flex flex-wrap gap-2">
        <span class="diag-badge">Всего: ${s.total}</span>
        <span class="diag-badge">Без клиента: ${s.noClient}</span>
        <span class="diag-badge">Без телефона: ${s.noPhone}</span>
        <span class="diag-badge">Нулевые суммы: ${s.zeroSum}</span>
        <span class="diag-badge">Уникальных телефонов: ${s.uniquePhones}</span>
        <span class="diag-badge">Неверных номеров: ${s.invalidPhones}</span>
      </div>`;
    }
    function renderOrdersTable(list){
        const tb = $('#repTableOrders tbody'); if (!tb) return;
        tb.innerHTML = list.map(o=>{
            const ord = o.order || o;
            return `<tr data-raw="1">
        <td>${h(ord.number ?? '')}</td>
        <td>${h(ord.phone || '—')}</td>
        <td>${h(ord.whenCreated || '')}</td>
        <td>${h(money(ord.sum || 0))}</td>
        <td>${h(ord.status || '')}</td>
      </tr>`;
        }).join('');
        // attach click -> modal
        $$('#repTableOrders tbody tr').forEach((tr,i)=>{
            tr.addEventListener('click', ()=> showOrder(list[i]));
        });
    }

    on('#btnRepDeliveries','click', async ()=>{
        const accountId = +($('#selAccount')?.value || 0);
        const orgId = getState().org || '';
        const from = dtFmt($('#repFrom').value, false);
        const to   = dtFmt($('#repTo').value,   true);
        if (!accountId || !orgId || !from || !to) return;

        $('#repSummary').innerHTML = '<div class="text-secondary">Загрузка доставок…</div>';
        $('#repTableOrders tbody').innerHTML = '';

        const data = await api('deliveries_report', {
            account_id: accountId,
            organizationId: orgId,
            dateFrom: from, dateTo: to
        }).catch(err => ({error: err?.error || 'fail'}));

        if (data.error){ $('#repSummary').innerHTML = `<div class="text-danger">${h(data.error)}</div>`; return; }
        renderSummaryDeliveries(data.summary || {});
        const batches = data.ordersByOrganizations || [];
        renderOrdersTable(batches.flatMap(b=>b.orders || []));
    });

    /* ---------------------- hall orders -------------------------- */
    function renderSummaryHall(s){
        $('#repSummary').innerHTML = `
      <div class="d-flex flex-wrap gap-2">
        <span class="diag-badge">Всего: ${s.total}</span>
        <span class="diag-badge">Без клиента: ${s.noClient}</span>
        <span class="diag-badge">Нулевые суммы: ${s.zeroSum}</span>
      </div>`;
    }

    on('#btnRepHall','click', async ()=>{
        const accountId = +($('#selAccount')?.value || 0);
        const orgId = getState().org || '';
        const from = dtFmt($('#repFrom').value, false);
        const to   = dtFmt($('#repTo').value,   true);
        const sel  = $('#repTable')?.value || '';
        if (!accountId || !orgId || !from || !to) return;

        let tableIds = [];
        if (sel === '__ALL__') {
            tableIds = _sections.flatMap(s => (s.tables||[]).map(t=>t.id));
        } else if (sel) tableIds = [sel];

        if (!tableIds.length){ $('#repSummary').innerHTML = '<div class="text-secondary">Выберите стол или загрузите секции</div>'; return; }

        $('#repSummary').innerHTML = '<div class="text-secondary">Загрузка заказов зала…</div>';
        $('#repTableOrders tbody').innerHTML = '';

        const data = await api('hall_orders', {
            account_id: accountId,
            organizationId: orgId,
            tableIds, dateFrom: from, dateTo: to,
            statuses: ['Closed'] // по умолчанию
        }).catch(err => ({error: err?.error || 'fail'}));

        if (data.error){ $('#repSummary').innerHTML = `<div class="text-danger">${h(data.error)}</div>`; return; }
        renderSummaryHall(data.summary || {});
        renderOrdersTable(data.orders || []);
    });

    /* ---------------------- order modal -------------------------- */
    function byPath(o,p){ return p.split(/[\.\[\]]+/).filter(Boolean).reduce((x,k)=>(x||{})[k], o); }
    function fillDl(id,obj,map){
        const dl = $('#'+id); if (!dl) return; dl.innerHTML='';
        Object.entries(map).forEach(([path,label])=>{
            const v = byPath(obj,path);
            dl.insertAdjacentHTML('beforeend', `<dt class="col-sm-4">${h(label)}</dt><dd class="col-sm-8">${h(v ?? '—')}</dd>`);
        });
    }
    function showOrder(o){
        const ord = o.order || o;
        fillDl('ordGeneral', ord, {
            number:'Номер', externalNumber:'Внешний №', status:'Статус',
            sourceKey:'Источник', sum:'Сумма'
        });
        fillDl('ordClient', ord, {
            phone:'Телефон', 'deliveryPoint.address.street.name':'Улица',
            'deliveryPoint.address.house':'Дом', 'deliveryPoint.address.flat':'Кв',
            'deliveryPoint.address.city.name':'Город', 'customer.type':'Тип клиента',
            'deliveryPoint.comment':'Комментарий к адресу'
        });
        fillDl('ordTimes', ord, {
            whenCreated:'Создан', whenConfirmed:'Подтверждён', whenCookingCompleted:'Готов',
            whenSended:'Отправлен', whenDelivered:'Доставлен', whenClosed:'Закрыт'
        });

        const fin = {};
        (ord.payments||[]).forEach((p,i)=>{ fin[`payments[${i}].paymentType.name`] = `Платёж ${i+1}`; fin[`payments[${i}].sum`] = `Сумма ${i+1}`; });
        (ord.items||[]).forEach((it,i)=>{ fin[`items[${i}].type`] = `Позиция ${i+1}`; fin[`items[${i}].amount`] = `Кол-во ${i+1}`; });
        fillDl('ordFin', ord, fin);

        if (window.bootstrap) new bootstrap.Modal($('#modalOrder')).show();
    }

    // auto-load sections when org chosen
    document.addEventListener('shown.bs.modal', ()=>{});
    window.addEventListener('hashchange', ()=>{
        if (getState().org) loadSections();
    });
    // первичный запуск (если страница открыта уже с org из hash)
    if (getState().org) {
        loadSections();
    }
})();
