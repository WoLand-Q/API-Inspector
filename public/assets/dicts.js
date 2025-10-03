/* Smart Café · Dictionaries explorer */
(function(){
    "use strict";
    const $  = (s,n=document)=>n.querySelector(s);
    const $$ = (s,n=document)=>Array.from(n.querySelectorAll(s));
    const h = s => { const d=document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };
    const stateGet = (window.stateGet||(()=>({})));

    async function callDict(name){
        const accId = +($('#selAccount')?.value || 0);
        const orgId = stateGet().org || '';
        if (!accId || !orgId) {
            $('#dictInfo').innerHTML = '<span class="text-danger">Выберите аккаунт и точку в основной панели.</span>';
            $('#dictResult').textContent = '';
            return;
        }

        $('#dictOrg').textContent = orgId;
        $('#dictInfo').innerHTML = `Запрос: <code>${name}</code>…`;

        try{
            const data = await fetch((window.API_URL||'api.php')+'?action=dict', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ account_id: accId, organizationId: orgId, name })
            }).then(r=>r.json());

            const code = $('#dictResult');
            code.textContent = JSON.stringify(data, null, 2);
            if (window.hljs) hljs.highlightElement(code);
            $('#dictInfo').innerHTML = `Готово: <code>${name}</code>`;
        }catch(e){
            $('#dictInfo').innerHTML = '<span class="text-danger">'+h(e?.message||'Ошибка запроса')+'</span>';
        }
    }

    function bind(){
        // меню
        $('#dictMenu')?.addEventListener('click', (e)=>{
            const btn = e.target.closest('[data-dict]'); if(!btn) return;
            $$('#dictMenu .list-group-item').forEach(x=>x.classList.remove('active'));
            btn.classList.add('active');
            callDict(btn.dataset.dict);
        });

        // копировать/скачать
        $('#btnDictCopy')?.addEventListener('click', ()=>{
            const t = $('#dictResult')?.textContent || '';
            navigator.clipboard?.writeText(t);
        });
        $('#btnDictJson')?.addEventListener('click', ()=>{
            const t = $('#dictResult')?.textContent || '';
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([t],{type:'application/json'}));
            a.download = 'dictionary.json'; document.body.appendChild(a); a.click(); a.remove();
        });

        // показать активный первый раз
        const first = $('#dictMenu [data-dict]');
        if (first) { first.classList.add('active'); callDict(first.dataset.dict); }
    }

    // инициализация при открытии модалки
    document.addEventListener('shown.bs.modal', (ev)=>{
        if (ev.target && ev.target.id === 'modalDicts') bind();
    });
})();
