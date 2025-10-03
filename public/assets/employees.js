/* Smart Café · Employees */
(function(){
    "use strict";

    // ── helpers ──────────────────────────────────────────────────────────────────
    const $  = (s,n=document)=>n.querySelector(s);
    const $$ = (s,n=document)=>Array.from(n.querySelectorAll(s));
    const h  = s => { const d=document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };
    const stateGet = window.stateGet || (()=>({}));

    async function api(action, body){
        return fetch((window.API_URL||'api.php')+'?action='+action, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(body||{})
        }).then(r=>r.json());
    }

    const NOTES = {
        couriers: `
<b>Назначение:</b> вернуть список курьеров по организации.<br>
<b>Обязательно:</b> <code>organizationIds</code>.<br>
<b>Совет:</b> из ответа возьмите <code>courierId</code> и/или <code>employeeId</code> для следующих запросов.`,
        couriers_by_role: `
<b>Назначение:</b> отфильтровать сотрудников по ролям.<br>
<b>Обязательно:</b> <code>organizationIds</code>, <code>rolesToCheck</code> (например <code>["Courier"]</code>).<br>
<b>Примечание:</b> роли берём автоматически из ответа «Курьеры».`,
        couriers_locations_by_time_offset: `
<b>Назначение:</b> получить локации курьеров, обновлённые за последние N минут.<br>
<b>Обязательно:</b> <code>organizationIds</code>, <code>timeOffsetInMinutes</code>.<br>
<b>Типичный кейс:</b> "кто сейчас на линии/в городе".`,
        couriers_active_location: `
<b>Назначение:</b> вернуть последнюю известную локацию указанного(ых) курьера(ов).<br>
<b>Обязательно:</b> <code>organizationIds</code>, <code>courierIds</code>.<br>
<b>Откуда взять courierId:</b> из «Курьеры»/«Курьеры по роли».`,
        couriers_active_location_by_terminal: `
<b>Назначение:</b> последние локации курьеров, закреплённых за указанными терминальными группами.<br>
<b>Обязательно:</b> <code>organizationId</code>, <code>terminalGroupIds</code>.<br>
<b>Откуда взять terminalGroupId:</b> кнопка «Терминалы» (endpoint <code>/terminal_groups</code>).`,
        info: `
<b>Назначение:</b> получить расширенную информацию по сотрудникам.<br>
<b>Обязательно:</b> <code>organizationIds</code>, <code>employeeIds</code>.<br>
<b>Где взять employeeId:</b> из ответа «Курьеры».`,
        shift_is_open: `
<b>Назначение:</b> проверить, открыта ли смена у сотрудника.<br>
<b>Обязательно:</b> <code>organizationId</code>, <code>employeeId</code>.<br>
<b>Опционально:</b> <code>terminalGroupId</code> (если в вашей конфигурации требуется).`,
        shift_clockin: `
<b>Назначение:</b> открыть смену сотруднику (начало работы).<br>
<b>Обязательно:</b> <code>organizationId</code>, <code>employeeId</code>.`,
        shift_clockout: `
<b>Назначение:</b> закрыть смену сотруднику (конец работы).<br>
<b>Обязательно:</b> <code>organizationId</code>, <code>employeeId</code>.`,
        shifts_by_courier: `
<b>Назначение:</b> получить смены курьера за период.<br>
<b>Обязательно:</b> <code>organizationIds</code>, <code>employeeIds</code>, <code>dateFrom</code>, <code>dateTo</code> (формат "YYYY-MM-DD HH:mm:ss.mmm").`
    };

    function isoLocal(dt){
        const p=n=>String(n).padStart(2,'0');
        return `${dt.getFullYear()}-${p(dt.getMonth()+1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
    }
    function syrveFmt(dt, end=false){ // "YYYY-MM-DD HH:mm:ss.mmm"
        const p=n=>String(n).padStart(2,'0');
        const ms=end?'59.999':'00.000';
        return `${dt.getFullYear()}-${p(dt.getMonth()+1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${ms}`;
    }

    // кэш обнаруженных ролей
    let __roles = [];

    // ── default payload generator ────────────────────────────────────────────────
    function defaultPayload(ep){
        const org = stateGet().org || '';
        const employeeId = $('#empEmployeeId')?.value.trim();
        const courierId  = $('#empCourierId')?.value.trim();
        const tgId       = $('#empTerminalGroupId')?.value.trim();
        const mins       = Math.max(1, +($('#empMinutes')?.value||30));
        const fromEl     = $('#empFrom'); const toEl = $('#empTo');
        const selRole    = $('#empRoleSel')?.value?.trim();

        const from = fromEl?.value ? new Date(fromEl.value) : null;
        const to   = toEl?.value   ? new Date(toEl.value)   : null;

        switch(ep){
            case 'couriers':
                return { organizationIds: org?[org]:[] };

            case 'couriers_by_role': {
                const chosen = selRole || (__roles[0] || 'Courier');
                return { organizationIds: org?[org]:[], rolesToCheck: [chosen] };
            }

            case 'couriers_locations_by_time_offset':
                return { organizationIds: org?[org]:[], timeOffsetInMinutes: mins };

            case 'couriers_active_location':
                return { organizationIds: org?[org]:[], courierIds: courierId?[courierId]:[] };

            case 'couriers_active_location_by_terminal':
                return { organizationId: org || "", terminalGroupIds: tgId?[tgId]:[] };

            case 'info':
                return { organizationId: org || "", id: employeeId || "" };



            case 'shift_is_open': {
                const body = { organizationId: org, employeeId: employeeId||"" };
                if (tgId) body.terminalGroupId = tgId; // если требуется в вашей конфигурации
                return body;
            }

            case 'shift_clockin':
                return { organizationId: org, employeeId: employeeId||"" };

            case 'shift_clockout':
                return { organizationId: org, employeeId: employeeId||"" };

            case 'shifts_by_courier':
                return {
                    organizationIds: org?[org]:[],
                    employeeIds: employeeId?[employeeId]:[],
                    dateFrom: from? syrveFmt(from,false) : "",
                    dateTo:   to?   syrveFmt(to,true)     : ""
                };

            default: return {};
        }
    }

    // ── lookups: курьеры/терминалы/роли ─────────────────────────────────────────
    function ensureRoleUI(){
        if ($('#empRoleSel')) return;
        const minsWrap = $('#empMinutes')?.closest('.input-group') || $('#empMinutes')?.parentElement;
        if (!minsWrap) return;
        const wrap = document.createElement('div');
        wrap.className = 'mt-1';
        wrap.innerHTML = `
            <label class="form-label small">Роль</label>
            <select id="empRoleSel" class="form-select form-select-sm">
                <option value="">— любое —</option>
            </select>`;
        minsWrap.insertAdjacentElement('afterend', wrap);
        $('#empRoleSel')?.addEventListener('change', ()=> {
            const ep = $('#empMenu .list-group-item.active')?.dataset.ep || 'couriers';
            if (ep==='couriers_by_role'){
                $('#empPayload').value = JSON.stringify(defaultPayload(ep), null, 2);
            }
        });
    }

    async function loadLookups(){
        const accId = +($('#selAccount')?.value||0);
        const org   = stateGet().org || '';
        if (!accId || !org) return;

        // Курьеры -> список + извлечение ролей
        try{
            const cour = await api('employees', {account_id: accId, name:'couriers', payload:{organizationIds:[org]}});
            const blocks = cour?.result?.response?.employees || [];
            const items  = [];
            for (const b of blocks){ for (const it of (b?.items||[])) items.push(it); }

            const selC = $('#empCourierSel');
            if (selC){
                selC.innerHTML = '<option value="">— выберите курьера —</option>';
                for (const it of items){
                    const e = (it?.employee?.id) || it?.employeeId || it?.id || '';
                    const c = it?.id || it?.courierId || '';
                    const nm = it?.displayName || [it?.firstName, it?.lastName].filter(Boolean).join(' ') || 'Без имени';
                    const code = it?.code ? ` (${it.code})` : '';
                    if (e) selC.insertAdjacentHTML('beforeend',
                        `<option data-emp="${h(e)}" data-courier="${h(c)}" value="${h(e)}">${h(nm+code)}</option>`);
                }
            }

            // собрать доступные роли
            const set = new Set();
            for (const it of items){
                const roles =
                    it?.roles ||
                    it?.employee?.roles ||
                    it?.employeeRoles ||
                    (typeof it?.role==='string' ? [it.role] : []) ||
                    (typeof it?.employeeRole==='string' ? [it.employeeRole] : []);
                (roles||[]).forEach(r=>{ if (typeof r === 'string' && r.trim()) set.add(r.trim()); });
            }
            __roles = Array.from(set);
            if (!__roles.length) __roles = ['Courier','Driver']; // дефолты на всякий случай

            const selR = $('#empRoleSel');
            if (selR){
                selR.innerHTML = '<option value="">— любое —</option>' + __roles.map(r=>`<option value="${h(r)}">${h(r)}</option>`).join('');
                // по умолчанию выберем Courier, если есть
                if (__roles.includes('Courier')) selR.value = 'Courier';
            }
        }catch(_){ /* silent */ }

        // Терминальные группы
        try{
            const tg = await api('terminal_groups', {account_id: accId, organizationId: org});
            const pack = tg?.terminal_groups?.response || {};
            const all = [];
            for (const b of [pack.terminalGroups||[], pack.terminalGroupsInSleep||[]]){
                for (const g of b) for (const it of (g.items||[])) all.push(it);
            }
            const selT = $('#empTerminalSel');
            if (selT){
                selT.innerHTML = '<option value="">— терминальная группа —</option>';
                for (const it of all){
                    selT.insertAdjacentHTML('beforeend',
                        `<option value="${h(it.id)}">${h(it.name || it.externalRevision || it.id)}</option>`);
                }
            }
        }catch(_){ /* silent */ }
    }

    function bindLookups(){
        $('#empLookupRefresh')?.addEventListener('click', (e)=>{ e.preventDefault(); loadLookups(); });

        $('#empCourierSel')?.addEventListener('change', (e)=>{
            const opt = e.target.selectedOptions?.[0];
            if (!opt) return;
            $('#empEmployeeId').value = opt.dataset.emp || '';
            $('#empCourierId').value  = opt.dataset.courier || '';
            const ep = $('#empMenu .list-group-item.active')?.dataset.ep || 'couriers';
            $('#empPayload').value = JSON.stringify(defaultPayload(ep), null, 2);
        });

        $('#empTerminalSel')?.addEventListener('change', (e)=>{
            $('#empTerminalGroupId').value = e.target.value || '';
            const ep = $('#empMenu .list-group-item.active')?.dataset.ep || 'couriers';
            $('#empPayload').value = JSON.stringify(defaultPayload(ep), null, 2);
        });
    }

    // ── auto-fix payload перед отправкой ─────────────────────────────────────────
    function autoFixPayload(ep, payload){
        const org = stateGet().org || '';
        const employeeId = $('#empEmployeeId')?.value.trim();
        const courierId  = $('#empCourierId')?.value.trim();
        const tgId       = $('#empTerminalGroupId')?.value.trim();
        const selRole    = $('#empRoleSel')?.value?.trim();

        // в autoFixPayload(ep, payload)
        if (ep === 'info') {
            if (!payload.organizationId && org) payload.organizationId = org;
            if (!payload.id && employeeId) payload.id = employeeId;
            // на всякий случай чистим старые массивные варианты,
            // чтобы не путать бэкенд/сервер
            delete payload.organizationIds;
            delete payload.employeeIds;
            delete payload.employees;
            delete payload.employeeId; // если раньше под это имя клали id
        }



        if (ep==='couriers_active_location'){
            if (!payload.organizationIds?.length && org) payload.organizationIds=[org];
            if (!payload.courierIds?.length && courierId) payload.courierIds=[courierId];
        }
        if (ep==='couriers_active_location_by_terminal'){
            if (!payload.organizationId && org) payload.organizationId = org;
            if (!payload.terminalGroupIds?.length && tgId) payload.terminalGroupIds=[tgId];
        }
        if (ep==='shift_is_open' || ep==='shift_clockin' || ep==='shift_clockout'){
            if (!payload.organizationId && org) payload.organizationId = org;
            if (!payload.employeeId && employeeId) payload.employeeId = employeeId;
            if (ep==='shift_is_open' && !payload.terminalGroupId && tgId) payload.terminalGroupId = tgId;
        }
        if (ep==='shifts_by_courier'){
            if (!payload.organizationIds?.length && org) payload.organizationIds=[org];
            if (!payload.employeeIds?.length && employeeId) payload.employeeIds=[employeeId];
        }
        if (ep==='couriers_by_role'){
            if (!payload.organizationIds?.length && org) payload.organizationIds=[org];
            if (!payload.rolesToCheck?.length){
                const chosen = selRole || (__roles[0] || 'Courier');
                payload.rolesToCheck = [chosen];
            }
        }
        return payload;
    }

    // повторная попытка при типичных 400 (plural ↔ singular)
    async function smartEmployeesCall(accId, ep, payload){
        const once = await api('employees', {account_id: accId, name: ep, payload});
        const http = once?.result?.http_code;
        const desc = (once?.result?.response?.errorDescription||'') + ' ' + (once?.result?.response?.error||'');
        if (http !== 400) return once;

        // employeeIds -> employeeId
        if (/employeeid/i.test(desc) && Array.isArray(payload.employeeIds) && payload.employeeIds.length===1){
            const p2 = {...payload}; p2.employeeId = p2.employeeIds[0]; delete p2.employeeIds;
            return api('employees', {account_id: accId, name: ep, payload: p2});
        }
        // organizationIds -> organizationId
        if (/organizationid/i.test(desc) && Array.isArray(payload.organizationIds) && payload.organizationIds.length===1){
            const p2 = {...payload}; p2.organizationId = p2.organizationIds[0]; delete p2.organizationIds;
            return api('employees', {account_id: accId, name: ep, payload: p2});
        }
        // terminalGroupIds -> terminalGroupId
        if (/terminalgroupid/i.test(desc) && Array.isArray(payload.terminalGroupIds) && payload.terminalGroupIds.length===1){
            const p2 = {...payload}; p2.terminalGroupId = p2.terminalGroupIds[0]; delete p2.terminalGroupIds;
            return api('employees', {account_id: accId, name: ep, payload: p2});
        }

        return once;
    }

    // ── UI render & send ────────────────────────────────────────────────────────
    async function render(ep){
        const org = stateGet().org || '';
        $('#empOrg').textContent = org || '—';
        $('#empNotes').innerHTML = NOTES[ep] || '';
        $('#empPayload').value   = JSON.stringify(defaultPayload(ep), null, 2);
        $('#empResult').textContent = '';
    }

    async function send(){
        const ep = $('#empMenu .list-group-item.active')?.dataset.ep;
        if (!ep) return;

        let payload = {};
        try{ payload = JSON.parse($('#empPayload').value||'{}'); }
        catch(e){ alert('Неверный JSON payload'); return; }

        const accId = +($('#selAccount')?.value||0);
        if (!accId){ alert('Выберите аккаунт'); return; }

        payload = autoFixPayload(ep, payload);

        const res = await smartEmployeesCall(accId, ep, payload);

        const code = $('#empResult');
        code.textContent = JSON.stringify(res, null, 2);
        if (window.hljs) hljs.highlightElement(code);
    }

    // ── bind once per modal show ────────────────────────────────────────────────
    function bind(){
        // лево-меню
        $('#empMenu').addEventListener('click', e=>{
            const it = e.target.closest('.list-group-item'); if(!it) return;
            $$('#empMenu .list-group-item').forEach(x=>x.classList.remove('active'));
            it.classList.add('active');
            render(it.dataset.ep);
        });

        // кнопки
        $('#empCopy')?.addEventListener('click', ()=>{
            const t = $('#empPayload')?.value||''; navigator.clipboard?.writeText(t);
        });

        $('#empSaveJson')?.addEventListener('click', ()=>{
            const t = $('#empResult')?.textContent||'{}';
            const a=document.createElement('a');
            a.href=URL.createObjectURL(new Blob([t],{type:'application/json'}));
            a.download='employees_response.json'; document.body.appendChild(a); a.click(); a.remove();
        });

        $('#empSend')?.addEventListener('click', send);

        $('#empFillNow')?.addEventListener('click', ()=>{
            const now=new Date(); const from=new Date(now); from.setHours(0,0,0,0);
            $('#empFrom').value = isoLocal(from);
            $('#empTo').value   = isoLocal(now);
            const ep = $('#empMenu .list-group-item.active')?.dataset.ep || 'couriers';
            $('#empPayload').value = JSON.stringify(defaultPayload(ep), null, 2);
        });

        // дефолтные даты
        const now=new Date(); const from=new Date(now); from.setHours(0,0,0,0);
        $('#empFrom').value = isoLocal(from);
        $('#empTo').value   = isoLocal(now);

        // UI для ролей + лукапы
        ensureRoleUI();
        bindLookups();
        loadLookups();

        // первичная отрисовка
        render('couriers');
    }

    document.addEventListener('shown.bs.modal', (ev)=>{
        if (ev.target && ev.target.id==='modalEmployees'){
            if (ev.target.__bound) return; // не дублируем обработчики
            ev.target.__bound = true;
            bind();
        }
    });
})();
