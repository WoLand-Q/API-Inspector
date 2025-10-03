/* ========== Smart Café · core (app.js) ========== */
/* utils, orgs, menu, product modal, logs, QR, diagnostics
   NOTE:
   - Exposes: window.renderMenu, window.stateGet/stateSet, window.MENU_LIST (via getter)
   - api(): improved errors (shows HTTP code/body when backend returns empty JSON)
*/

const $  = (s, n=document)=>n.querySelector(s);
const $$ = (s, n=document)=>Array.from(n.querySelectorAll(s));
const h = s => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };
const debounce = (fn, ms=250)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms);} };
const maskLogin = s => s ? `${s.slice(0,5)} · ${'•'.repeat(8)}${s.slice(-4)}` : '•'.repeat(8);
const fmt = n => (n!=null && !Number.isNaN(+n)) ? (+n).toFixed(2) : '';
function hl(el){ try{ if (window.hljs && el) hljs.highlightElement(el); }catch{} }

/** безопасное навешивание обработчиков */
const hook = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };

/** API helper (лучше диагностирует 4xx/5xx) */
const api = async (action, body) => {
  const base = (typeof window.API_URL === 'string' && window.API_URL) ? window.API_URL : 'api.php';
  const url = `${base}?action=${encodeURIComponent(action)}`;
  const res = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });

  const raw = await res.text().catch(()=> '');
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: raw || 'non-json response' }; }

  if (!res.ok) {
    // бросаем расширенную ошибку
    const err = (typeof data === 'object' && data) ? data : { error: String(data) };
    err.http_status = res.status;
    err.http_status_text = res.statusText;
    throw err;
  }
  return data;
};

/** download helper */
function download(name, mime, text){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text],{type:mime}));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

/* ========== URL state (умный QR) ========== */
function stateGet(){
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  return {
    acc: +(h.get('acc')||0),
    org: h.get('org')||'',
    cat: h.get('cat')||'',
    q:   h.get('q')||'',
  };
}
function stateSet(part){
  const cur = stateGet(); const next = {...cur, ...part};
  const s = new URLSearchParams();
  if (next.acc) s.set('acc', String(next.acc));
  if (next.org) s.set('org', next.org);
  if (next.cat) s.set('cat', next.cat);
  if (next.q)   s.set('q', next.q);
  const newHash = s.toString();
  if (newHash !== location.hash.replace(/^#/, '')) location.hash = newHash;
}
// expose for cart.js
window.stateGet = stateGet;
window.stateSet = stateSet;

/* ========== state ========== */
let ORGS = [];
let ORG_PAGE = 0;
const ORG_PAGE_SIZE = 12;

let MENU = null;
let MENU_LIST = [];
let MENU_FILTER = { q:'', cat:null };
let MENU_PAGE = 0;
const MENU_PAGE_SIZE = 30;

// keep MENU_LIST visible/synced on window
Object.defineProperty(window, 'MENU_LIST', {
  get(){ return MENU_LIST; },
  set(v){ MENU_LIST = Array.isArray(v) ? v : []; }
});

/* ========== accounts ========== */
async function refreshAccounts(){
  const data = await api('list_accounts');
  const sel = $('#selAccount');
  if (sel) {
    sel.innerHTML = data.accounts.map(a => `<option value="${a.id}">${h(a.title)} · ${maskLogin(a.api_login)}</option>`).join('');
  }
  const box = $('#accounts');
  if (box) {
    box.innerHTML = data.accounts.map(a => `
      <div class="item d-flex justify-content-between align-items-center gap-2">
        <div>
          <div class="small"><i class="bi bi-person-badge"></i> <strong>${h(a.title)}</strong></div>
          <div class="text-secondary small"><code>${maskLogin(a.api_login)}</code></div>
        </div>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-light" data-edit="${a.id}">✏️</button>
          <button class="btn btn-outline-danger" data-del="${a.id}">🗑️</button>
        </div>
      </div>`).join('');
  }
}

/* редактирование/удаление */
$('#accounts')?.addEventListener('click', async (e)=>{
  const ed = e.target.closest('[data-edit]'); const del = e.target.closest('[data-del]');
  if (ed) {
    const id = +ed.dataset.edit;
    const cur = (await api('list_accounts')).accounts.find(x=>x.id==id);
    const title = prompt('Новое название', cur?.title || '');
    if (title && title.trim()) { await api('update_account',{id, title:title.trim()}); await refreshAccounts(); }
  }
  if (del) {
    const id = +del.dataset.del;
    if (confirm('Удалить аккаунт?')) { await api('delete_account',{id}); await refreshAccounts(); }
  }
});

/* ========== logs ========== */
async function refreshLogs(){
  const data = await api('logs');
  const box = $('#logs');
  if (!box) return;
  box.innerHTML = data.logs.map(l => `
    <div class="item d-flex justify-content-between gap-2">
      <div class="small">
        <div class="text-secondary">${h(l.created_at)}</div>
        <div><code>${h(l.endpoint)}</code> · <span class="${l.http_code===200?'text-success':'text-danger'}">${l.http_code}</span> · ${l.duration_ms}ms</div>
        ${l.correlation_id ? `<div class="small">corrId: <code>${h(l.correlation_id)}</code></div>` : ''}
      </div>
      <button class="btn btn-sm btn-outline-light align-self-start" data-log="${l.id}"><i class="bi bi-search"></i></button>
    </div>`).join('');
}

function setupLogsDelegation(){
  const box = $('#logs');
  if (!box) return;
  box.addEventListener('click', async e=>{
    const btn = e.target.closest('[data-log]'); if(!btn) return;
    const id = btn.getAttribute('data-log');
    const data = await fetch(`${(window.API_URL||'api.php')}?action=log_detail&id=${id}`).then(r=>r.json());
    const code = $('#logDetail');
    if (code) {
      code.classList?.add('language-json');
      code.textContent = JSON.stringify(data.log, null, 2);
      hl(code);
    }
    if (window.bootstrap && $('#modalLog')) new bootstrap.Modal($('#modalLog')).show();
  });
}

/* ========== orgs ========== */
function renderOrgs(){
  const q = ($('#orgSearch')?.value || '').toLowerCase();
  const filtered = ORGS.filter(o => !q || (o.name||'').toLowerCase().includes(q));
  if ($('#orgCount')) $('#orgCount').textContent = `${filtered.length} точек`;
  const slice = filtered.slice(0, (++ORG_PAGE)*ORG_PAGE_SIZE);
  const grid = $('#orgs');
  if (grid) {
    grid.innerHTML = slice.map(o => `
      <div class="col-md-6">
        <div class="card card-body card-menu">
          <div class="d-flex justify-content-between align-items-start">
            <div class="me-2">
              <div class="title">${h(o.name ?? 'Без названия')}</div>
              <div class="text-secondary small">${o.id}</div>
            </div>
            <button class="btn btn-primary btn-sm" data-org="${o.id}"><i class="bi bi-list"></i> Меню</button>
          </div>
        </div>
      </div>`).join('');
  }
  $('#orgMore')?.classList.toggle('d-none', slice.length >= filtered.length);
}

function setupOrgsDelegation(){
  const grid = $('#orgs');
  if (!grid) return;
  grid.addEventListener('click', async e=>{
    const btn = e.target.closest('button[data-org]'); if(!btn) return;
    const accountId = +($('#selAccount')?.value || 0);
    const orgId = btn.getAttribute('data-org');
    stateSet({org: orgId});

    $('#repBox')?.classList.remove('d-none');
    $('#menuBox')?.classList.remove('d-none');
    if ($('#grid')) $('#grid').innerHTML = skeletonCards();

    const data = await api('fetch_menu', {account_id: accountId, organizationId: orgId});
    MENU = data.menu.response || {};
    prepareMenu(MENU);
    renderCats();
    MENU_PAGE = 0;
    renderMenu();
  });
}

/* ========== menu build ========== */
function prepareMenu(menu){
  const products = menu.products || menu.items || [];
  const cats     = menu.productCategories || [];
  const groups   = menu.groups || [];

  const catById   = new Map((cats||[]).map(c => [c.id, c.name]));
  const groupById = new Map((groups||[]).map(g => [g.id, g]));
  const groupPath = (gid)=>{
    const chain=[]; let cur = groupById.get(gid);
    while(cur){ chain.push(cur.name||''); cur = cur.parentGroup ? groupById.get(cur.parentGroup) : null; }
    return chain.reverse().filter(Boolean).join(' / ');
  };

  MENU_LIST = (products||[]).map(p => {
    const catName = p.productCategoryId && catById.get(p.productCategoryId)
        ? catById.get(p.productCategoryId)
        : groupPath(p.groupId || p.parentGroup);
    return {
      id: p.id,
      name: p.name || p.itemName || 'Без названия',
      desc: p.description || '',
      price: (p.sizePrices?.[0]?.price?.currentPrice) ?? p.price ?? p.defaultPrice ?? null,
      image: pickImage(p, menu),
      cat: catName || 'Без категории',
      raw: p
    };
  });

  // sync to window for cart.js
  window.MENU_LIST = MENU_LIST;
}

function pickImage(p, menu){
  if (p.imageUrls?.length) return p.imageUrls[0];
  if (p.imageUrl) return p.imageUrl;
  if (p.images?.[0]?.imageUrl) return p.images[0].imageUrl;
  if (p.imageLinks?.[0]) return p.imageLinks[0];
  if (p.imageId && Array.isArray(menu.images)){
    const m = menu.images.find(x => x.id === p.imageId);
    if (m?.imageUrl) return m.imageUrl;
    if (m?.imageBase64) return `data:image/jpeg;base64,${m.imageBase64}`;
  }
  return 'https://placehold.co/640x480?text=no+image';
}

/* ========== cats ========== */
function renderCats(){
  if (!$('#cats')) return;
  const counts = new Map();
  MENU_LIST.forEach(p => counts.set(p.cat, (counts.get(p.cat)||0)+1));
  const list = Array.from(counts.entries()).sort((a,b)=> b[1]-a[1]).slice(0, 40);
  $('#cats').innerHTML =
      `<div class="cat ${!MENU_FILTER.cat?'active':''}" data-cat="">Все (${MENU_LIST.length})</div>` +
      list.map(([name, n]) => `<div class="cat ${MENU_FILTER.cat===name?'active':''}" data-cat="${h(name)}">${h(name)} <span class="badge text-bg-dark">${n}</span></div>`).join('');
}

function setupCatsDelegation(){
  const box = $('#cats');
  if (!box) return;
  box.addEventListener('click', e=>{
    const el = e.target.closest('.cat'); if(!el) return;
    MENU_FILTER.cat = el.dataset.cat || null;
    $$('.cats .cat').forEach(x=>x.classList.remove('active'));
    el.classList.add('active');
    MENU_PAGE = 0;
    renderMenu();
    stateSet({cat: MENU_FILTER.cat||''});
  });
}

/* ========== menu render/search ========== */
function filteredMenu(){
  return MENU_LIST.filter(p => {
    const okCat = !MENU_FILTER.cat || p.cat === MENU_FILTER.cat;
    const q = MENU_FILTER.q;
    const okQ = !q || p.name.toLowerCase().includes(q) || (p.desc||'').toLowerCase().includes(q);
    return okCat && okQ;
  });
}

function renderMenu(){
  const items = filteredMenu();
  const slice = items.slice(0, (++MENU_PAGE)*MENU_PAGE_SIZE);
  const grid = $('#grid');
  if (grid) {
    grid.innerHTML = slice.map(p => `
      <div class="col-sm-6 col-xl-4">
        <div class="card-menu h-100">
          <img class="thumb" loading="lazy" decoding="async" src="${p.image}" alt="">
          <div class="p-3">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div class="flex-grow-1">
                <div class="title">${h(p.name)}</div>
                <div class="desc">${h(p.desc||'')}</div>
              </div>
              ${p.price!=null ? `<span class="badge text-bg-primary align-self-start">${fmt(p.price)}</span>` : ''}
            </div>
            <div class="mt-2 d-flex justify-content-between align-items-center">
              <span class="small text-secondary">${h(p.cat)}</span>
              <button class="btn btn-outline-light btn-sm" data-prod="${p.id}"><i class="bi bi-info-circle"></i></button>
            </div>
          </div>
        </div>
      </div>`).join('');
    initLazyImages();
  }
  $('#menuMore')?.classList.toggle('d-none', slice.length >= items.length);
}
// expose for cart.js to hook/extend
window.renderMenu = renderMenu;

function setupMenuSearch(){
  hook('#search','input', debounce(e=>{
    MENU_FILTER.q = (e.target.value || '').toLowerCase();
    MENU_PAGE = 0;
    renderMenu();
    stateSet({q: MENU_FILTER.q});
  }, 200));
}

function setupMenuMore(){
  hook('#menuMore','click', ()=> renderMenu());
}

/* ========== product modal ========== */
function setupProductDelegation(){
  const grid = $('#grid');
  if (!grid) return;
  grid.addEventListener('click', e=>{
    const btn = e.target.closest('[data-prod]'); if(!btn) return;
    const id = btn.dataset.prod;
    const p = MENU_LIST.find(x => x.id === id);
    if(!p) return;

    if ($('#prodTitle')) $('#prodTitle').textContent = p.name;
    if ($('#prodImg'))   $('#prodImg').src = p.image;

    const info = [];
    if(p.desc) info.push(`<div class="mb-2">${h(p.desc)}</div>`);
    info.push(`<div class="row row-cols-2 row-cols-md-3 g-2 small">
      <div><span class="text-secondary">Категория:</span> ${h(p.cat)}</div>
      <div><span class="text-secondary">Цена:</span> ${p.price!=null?fmt(p.price):'—'}</div>
      <div><span class="text-secondary">ID:</span> <code>${p.id}</code></div>
    </div>`);
    const sp = p.raw.sizePrices||[];
    if (sp.length){
      info.push(`<div class="mt-3">
        <div class="fw-semibold mb-1">Размеры / цены</div>
        <div class="small">${sp.map(s=>`${h(s.sizeId??'—')}: ${fmt(s.price?.currentPrice)}`).join(' · ')}</div>
      </div>`);
    }
    if ($('#prodInfo')) $('#prodInfo').innerHTML = info.join('');

    const code = $('#prodJson');
    if (code) {
      code.classList?.add('language-json');
      code.textContent = JSON.stringify(p.raw, null, 2);
      hl(code);
    }

    if ($('#prodMeta')) $('#prodMeta').textContent = `productId=${p.id}`;

    if (window.bootstrap && $('#modalProduct')) new bootstrap.Modal($('#modalProduct')).show();
  });

  hook('#btnCopyJson','click', ()=>{
    const t = $('#prodJson')?.textContent || '';
    navigator.clipboard?.writeText(t);
  });
}

/* ========== QR share ========== */
function setupQR(){
  hook('#btnShare','click', ()=>{
    const url = location.href.split('#')[0] + location.hash;
    if ($('#qrLink')) $('#qrLink').textContent = url;
    const box = $('#qr');
    if (box) {
      box.innerHTML = '';
      if (window.QRCode) {
        QRCode.toCanvas(document.createElement('canvas'), url, { width: 220 }, (err, canvas)=>{
          if(!err){ box.appendChild(canvas); }
        });
      }
    }
    if (window.bootstrap && $('#modalQR')) new bootstrap.Modal($('#modalQR')).show();
  });
}

/* ========== Lazy images fallback + fade-in ========== */
function initLazyImages(){
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries)=>{
    for (const e of entries) if (e.isIntersecting) {
      const img = e.target; const src = img.dataset.src; if (src) { img.src = src; img.removeAttribute('data-src'); }
      io.unobserve(img);
    }
  },{rootMargin:'300px'}) : null;

  $$('.thumb').forEach(img=>{
    if (!img.dataset.boundLoad) {
      img.dataset.boundLoad = '1';
      img.addEventListener('load', ()=> img.classList.add('loaded'), {once:true});
    }
    if (io && !img.dataset.lazyBound) {
      img.dataset.src = img.src; img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==';
      img.dataset.lazyBound = '1'; io.observe(img);
    } else {
      // без IO просто сделаем fade-in по событию load
    }
  });
}

/* ========== Infinite scroll ========== */
function initInfiniteMenu(){
  const s = $('#menuSentinel'); if (!s) return;
  const io = new IntersectionObserver((e)=>{ if (e[0].isIntersecting) renderMenu(); }, {rootMargin:'600px'});
  io.observe(s);
}

/* ========== skeletons ========== */
function skeletonCards(n=6){
  return Array.from({length:n},()=>`
    <div class="col-sm-6 col-xl-4"><div class="card-menu h-100 p-3">
      <div class="skel" style="height:180px"></div>
      <div class="skel mt-3" style="height:20px"></div>
      <div class="skel mt-2" style="height:14px"></div>
    </div></div>`).join('');
}

/* ========== diagnostics ========== */
function normalizeName(s){ return String(s||'').replace(/\s+/g,' ').trim().toLowerCase(); }

function computeDiagnostics(list){
  const res = { noPrice:[], noDesc:[], dupNames:[], longNames:[], spaceIssues:[], zeroPrices:[] };

  const byName = new Map();
  list.forEach(p=>{
    const norm = normalizeName(p.name);
    byName.set(norm, (byName.get(norm)||[]).concat([p]));
  });

  for (const p of list){
    const name = p.name||'';
    if (p.price == null) res.noPrice.push(p);
    if (!p.desc || !p.desc.trim()) res.noDesc.push(p);
    if (/(^\s|\s{2,}|\s$)/.test(name) || /\s{2,}/.test(name)) res.spaceIssues.push(p);
    if ((name.replace(/\s+/g,' ')).length > 48) res.longNames.push(p);
    if (Number.isFinite(+p.price) && +p.price <= 0) res.zeroPrices.push(p);
  }

  for (const [norm, arr] of byName){
    if (arr.length > 1) res.dupNames.push({name: arr[0].name, items: arr});
  }

  res._counts = {
    total: list.length,
    noPrice: res.noPrice.length,
    noDesc: res.noDesc.length,
    dupNames: res.dupNames.length,
    longNames: res.longNames.length,
    spaceIssues: res.spaceIssues.length,
    zeroPrices: res.zeroPrices.length
  };
  return res;
}

function renderDiagnostics(){
  const diag = computeDiagnostics(MENU_LIST);
  const box = $('#diagSummary'); if (!box) return;

  const section = (title, hint, rows)=>`
    <div class="diag-section">
      <div class="title">${h(title)}</div>
      ${hint?`<div class="hint">${h(hint)}</div>`:''}
      ${rows?.length ? `
      <div class="table-responsive mt-2">
        <table class="diag-table">
          <thead><tr><th>Название</th><th>Категория</th><th>Цена</th><th>ID</th></tr></thead>
          <tbody>
            ${rows.map(p=>`<tr>
              <td>${h(p.name)}</td>
              <td>${h(p.cat)}</td>
              <td>${p.price!=null?fmt(p.price):'—'}</td>
              <td><code>${p.id}</code></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : `<div class="text-secondary">Нет проблем</div>`}
    </div>`;

  const dupBlock = diag.dupNames.length ? `
    <div class="diag-section">
      <div class="title">Дубликаты по названию (${diag.dupNames.length} групп)</div>
      <div class="hint">Одинаковое имя (без учета регистра/пробелов)</div>
      ${diag.dupNames.map(g=>`
        <div class="mb-2">
          <span class="diag-badge">${h(g.name)}</span>
          ${g.items.map(p=>`<span class="diag-badge"><code>${p.id}</code> · ${h(p.cat)} · ${p.price!=null?fmt(p.price):'—'}</span>`).join('')}
        </div>`).join('')}
    </div>` : `
    <div class="diag-section"><div class="title">Дубликаты по названию</div><div class="text-secondary">Нет проблем</div></div>`;

  box.innerHTML = `
    <div class="d-flex flex-wrap gap-2 mb-2">
      <span class="diag-badge">Всего: ${diag._counts.total}</span>
      <span class="diag-badge">Без цены: ${diag._counts.noPrice}</span>
      <span class="diag-badge">Без описания: ${diag._counts.noDesc}</span>
      <span class="diag-badge">Нули/≤0: ${diag._counts.zeroPrices}</span>
      <span class="diag-badge">Длинные имена: ${diag._counts.longNames}</span>
      <span class="diag-badge">Пробелы: ${diag._counts.spaceIssues}</span>
      <span class="diag-badge">Дубликаты: ${diag._counts.dupNames}</span>
    </div>
    ${section('Без цены', 'Требуется актуальная стоимость', diag.noPrice)}
    ${section('Цена ноль или отрицательная', 'Подозрительные значения', diag.zeroPrices)}
    ${section('Без описания', 'Добавьте краткое описание', diag.noDesc)}
    ${section('Лишние пробелы/окантовка', 'Проверьте пробелы внутри/по краям', diag.spaceIssues)}
    ${section('Слишком длинные названия (>48)', 'Подумайте о сокращении', diag.longNames)}
    ${dupBlock}
  `;

  window.__diag = diag;
}

function diagCsv(){
  const rows = [['issue','id','name','category','price']];
  const push = (type, p)=> rows.push([type, p.id, p.name, p.cat, p.price??'']);

  const d = window.__diag || computeDiagnostics(MENU_LIST);
  d.noPrice.forEach(p=>push('no_price', p));
  d.zeroPrices.forEach(p=>push('price_zero_or_neg', p));
  d.noDesc.forEach(p=>push('no_desc', p));
  d.spaceIssues.forEach(p=>push('space_issues', p));
  d.longNames.forEach(p=>push('too_long', p));
  d.dupNames.forEach(g=> g.items.forEach(p=>push('dup_name', p)));

  const csv = rows.map(r=>r.map(x=>`"${String(x??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  download('diagnostics.csv','text/csv;charset=utf-8', csv);
}

/* ========== setup (DOM ready) ========== */
function setup(){
  // автозаполнение из query (?title=...&api_login=...)
  (function autofill(){
    const p = new URLSearchParams(location.search);
    if (p.get('title') && $('#inTitle'))        $('#inTitle').value = p.get('title');
    if (p.get('api_login') && $('#inApiLogin')) $('#inApiLogin').value = p.get('api_login');
  })();

  // форма добавления
  const formAdd = $('#formAdd');
  if (formAdd) {
    formAdd.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(formAdd);
      const title = String(fd.get('title')||'').trim();
      const api_login = String(fd.get('api_login')||'').trim();
      if (!title || !api_login) {
        formAdd.classList.add('was-validated');
        return;
      }
      try{
        await api('add_account', { title, api_login });
        formAdd.reset();
        formAdd.classList.remove('was-validated');
        await refreshAccounts();
      }catch(err){
        alert(`Ошибка добавления (${err?.http_status||''} ${err?.http_status_text||''}): ` + (err?.error || JSON.stringify(err)));
      }
    });
  }

  // выбор аккаунта — сохраняем в hash
  hook('#selAccount','change', ()=> stateSet({acc:+$('#selAccount').value}));

  // кнопка «получить организации»
  hook('#btnFetchOrgs','click', async ()=>{
    const id = +($('#selAccount')?.value || 0);
    if (!id) return;
    stateSet({acc:id});
    $('#orgsBox')?.classList.remove('d-none');
    if ($('#orgs')) $('#orgs').innerHTML = skeletonCards();
    try{
      const data = await api('fetch_orgs', {account_id: id});
      const orgs = (data.orgs?.response?.organizations) ?? (data.orgs?.response ?? []);
      ORGS = orgs || [];
      ORG_PAGE = 0;
      renderOrgs();
    }catch(err){
      if ($('#orgs')) $('#orgs').innerHTML = `<div class="text-danger">Ошибка: ${h(JSON.stringify(err))}</div>`;
    }
  });
  hook('#orgMore','click', ()=> renderOrgs());
  hook('#orgSearch','input', debounce(()=>{ ORG_PAGE=0; renderOrgs(); }, 200));

  // Диагностика
  hook('#btnDiag','click', ()=>{
    renderDiagnostics();
    if (window.bootstrap && $('#modalDiag')) new bootstrap.Modal($('#modalDiag')).show();
  });
  hook('#btnDiagCsv','click', ()=> diagCsv());
  hook('#btnDiagJson','click', ()=> download('diagnostics.json','application/json;charset=utf-8', JSON.stringify(window.__diag || computeDiagnostics(MENU_LIST), null, 2)));

  setupOrgsDelegation();
  setupLogsDelegation();
  setupCatsDelegation();
  setupMenuSearch();
  setupMenuMore();
  setupProductDelegation();
  setupQR();
  initInfiniteMenu();

  // восстановление из хэша
  (function restoreFromHash(){
    const st = stateGet();
    if (st.acc) {
      const sel = $('#selAccount');
      if (sel) sel.value = String(st.acc); // без optional chaining на LHS
    }
    if (st.q)   { const el=$('#search'); if(el){ el.value=st.q; MENU_FILTER.q=st.q.toLowerCase(); } }
    if (st.acc && st.org) {
      $('#orgsBox')?.classList.remove('d-none');
      api('fetch_orgs', {account_id: st.acc}).then(data=>{
        ORGS = (data.orgs?.response?.organizations) ?? (data.orgs?.response ?? []);
        renderOrgs();
        const btn = $(`[data-org="${CSS.escape(st.org)}"]`, $('#orgs'));
        if (btn) btn.click();
      }).catch(()=>{});
    }
    if (st.cat) {
      MENU_FILTER.cat = st.cat;
    }
  })();
}

/* ========== boot ========== */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setup);
} else {
  setup();
}

(async function init(){
  try { await refreshAccounts(); } catch {}
  try { await refreshLogs(); } catch {}
  setInterval(()=>{ refreshLogs().catch(()=>{}); }, 8000);
})();
