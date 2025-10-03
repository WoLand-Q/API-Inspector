// Smart Café · Addresses & Delivery (stable v6)
(function () {
    "use strict";

    // ---------- helpers ----------
    const $  = (s, n = document) => n.querySelector(s);
    const $$ = (s, n = document) => Array.from(n.querySelectorAll(s));
    const h  = (s) => { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; };

    // глобальный стейт или hash (#acc=..&org=..)
    function parseHash() {
        const p = new URLSearchParams((location.hash || "").replace(/^#/, ""));
        return { acc: p.get("acc") || p.get("a") || "", org: p.get("org") || "" };
    }
    const stateGet = typeof window.stateGet === "function" ? window.stateGet : parseHash;

    function getAccId() {
        const v = $("#selAccount")?.value?.trim();
        if (v) return v;
        const st = stateGet() || {};
        return (st.acc || "").toString();
    }
    function getOrgId() {
        const st = stateGet() || {};
        if (st.org) return st.org.toString();
        return parseHash().org || "";
    }

    async function api(action, body) {
        const url  = (window.API_URL || "api.php") + "?action=" + action;
        const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body || {})
        });
        return resp.json();
    }

    // ---------- robust extractors ----------
    function flattenItems(x) {
        if (!x) return [];
        if (Array.isArray(x)) {
            if (x.length && x[0] && Array.isArray(x[0].items)) {
                return x.flatMap(b => Array.isArray(b.items) ? b.items : []);
            }
            return x;
        }
        return [];
    }
    const take = {
        cities(res) {
            return (
                flattenItems(res?.cities?.response?.cities) ??
                (Array.isArray(res?.cities?.response?.items) ? res.cities.response.items : null) ??
                flattenItems(res?.response?.cities) ??
                (Array.isArray(res?.response?.items) ? res.response.items : null) ??
                flattenItems(res?.cities) ??
                (Array.isArray(res?.items) ? res.items : []) ??
                []
            );
        },
        streets(res) {
            return (
                flattenItems(res?.streets?.response?.streets) ??
                (Array.isArray(res?.streets?.response?.items) ? res.streets.response.items : null) ??
                flattenItems(res?.response?.streets) ??
                (Array.isArray(res?.response?.items) ? res.response.items : null) ??
                flattenItems(res?.streets) ??
                (Array.isArray(res?.items) ? res.items : []) ??
                []
            );
        }
    };

    const NOTES = {
        regions: `
<b>Назначение:</b> список регионов по организации.<br>
<b>Обязательно:</b> <code>organizationId</code>.<br>
<b>Подсказка:</b> сначала получите регионы → затем города/улицы.`,
        cities: `
<b>Назначение:</b> список городов по организации.<br>
<b>Обязательно:</b> <code>organizationId</code>.`,
        streets_by_city: `
<b>Назначение:</b> список улиц по выбранному городу.<br>
<b>Обязательно:</b> <code>organizationId</code>, <code>cityId</code>.`,
        delivery_restrictions: `
<b>Назначение:</b> ограничения доставки (зоны/радиусы/окна).<br>
<b>Обязательно:</b> <code>organizationId</code>.`,
        delivery_restrictions_allowed: `
<b>Назначение:</b> проверить, разрешён ли адрес доставки.<br>
<b>Обязательно:</b> <code>organizationId</code>, <code>deliveryAddress</code> (минимум <code>cityId</code>, <code>streetId</code>) и <code>isCourierDelivery</code> (true/false).<br>
<b>Опционально:</b> координаты (<code>latitude</code>/<code>longitude</code>), <code>terminalGroupId</code>.`,
        marketing_sources: `
<b>Назначение:</b> список маркетинговых источников.<br>
<b>Обязательно:</b> <code>organizationId</code>.`,
    };

    // ---------- lookups ----------
    async function loadLookups() {
        const accId = getAccId();
        const org   = getOrgId();

        const citySel   = $("#addrCitySel");
        const streetSel = $("#addrStreetSel");

        if (citySel)   citySel.innerHTML   = '<option value="">— не выбрано —</option>';
        if (streetSel) streetSel.innerHTML = '<option value="">— не выбрано —</option>';

        if (!accId || !org) return;

        try {
            const res  = await api("cities", { account_id: accId, organizationId: org });
            const list = take.cities(res);
            if (Array.isArray(list) && list.length && citySel) {
                for (const c of list) {
                    if (!c || c.isDeleted) continue;
                    const val = String(c.id || "").trim();
                    const txt = String(c.name || c.externalRevision || c.id || "").trim();
                    if (!val || !txt) continue;
                    citySel.insertAdjacentHTML(
                        "beforeend",
                        `<option value="${h(val)}">${h(txt)}</option>`
                    );
                }
            }
        } catch (e) {
            console.warn("cities lookup failed", e);
        }
    }

    async function loadStreets() {
        const accId = getAccId();
        const org   = getOrgId();
        const city  = $("#addrCitySel")?.value || "";

        const streetSel = $("#addrStreetSel");
        if (streetSel) streetSel.innerHTML = '<option value="">— не выбрано —</option>';

        if (!accId || !org || !city) return;

        try {
            const res  = await api("streets_by_city", { account_id: accId, organizationId: org, cityId: city });
            const list = take.streets(res);
            if (Array.isArray(list) && list.length && streetSel) {
                for (const s of list) {
                    if (!s || s.isDeleted) continue;
                    const val = String(s.id || "").trim();
                    const txt = String(s.name || s.externalRevision || s.id || "").trim();
                    if (!val || !txt) continue;
                    streetSel.insertAdjacentHTML(
                        "beforeend",
                        `<option value="${h(val)}">${h(txt)}</option>`
                    );
                }
            }
        } catch (e) {
            console.warn("streets lookup failed", e);
        }
    }

    // ---------- payload helpers ----------
    function readIsCourier() {
        const el = $("#addrIsCourier");
        if (!el) return true; // по умолчанию true
        return !!el.checked;
    }

    function defaultPayload(ep) {
        const org    = getOrgId();
        const city   = $("#addrCitySel")?.value?.trim() || "";
        const street = $("#addrStreetSel")?.value?.trim() || "";
        const house  = $("#addrHouse")?.value?.trim() || "";
        const lat    = $("#addrLat")?.value?.trim();
        const lon    = $("#addrLon")?.value?.trim();
        const isCour = readIsCourier();

        switch (ep) {
            case "regions":
            case "cities":
            case "delivery_restrictions":
            case "marketing_sources":
                return { organizationId: org || "" };

            case "streets_by_city":
                return { organizationId: org || "", cityId: city || "" };

            case "delivery_restrictions_allowed": {
                const body = {
                    organizationId: org || "",
                    deliveryAddress: { cityId: city || "", streetId: street || "" },
                    isCourierDelivery: isCour
                };
                if (house) body.deliveryAddress.house = house;
                if (lat && lon) body.coordinates = { latitude: +lat, longitude: +lon };
                return body;
            }

            default: return {};
        }
    }

    function autoFixPayload(ep, payload) {
        const org    = getOrgId();
        const city   = $("#addrCitySel")?.value?.trim() || "";
        const street = $("#addrStreetSel")?.value?.trim() || "";
        const house  = $("#addrHouse")?.value?.trim() || "";
        const lat    = $("#addrLat")?.value?.trim();
        const lon    = $("#addrLon")?.value?.trim();

        if (!payload.organizationId && org) payload.organizationId = org;

        if (ep === "delivery_restrictions_allowed") {
            // deliveryAddress
            if (!payload.deliveryAddress) {
                payload.deliveryAddress = {};
                if (payload.cityId   || city)   payload.deliveryAddress.cityId   = payload.cityId   || city;
                if (payload.streetId || street) payload.deliveryAddress.streetId = payload.streetId || street;
                if (payload.house    || house)  payload.deliveryAddress.house    = payload.house    || house;
                delete payload.cityId; delete payload.streetId; delete payload.house;
            }
            // isCourierDelivery (строки "true"/"false" → bool; если нет — берём из UI или true)
            const fromUI = readIsCourier();
            const v = payload.isCourierDelivery;
            if (typeof v === "string") payload.isCourierDelivery = v.toLowerCase() === "true";
            if (typeof payload.isCourierDelivery !== "boolean") payload.isCourierDelivery = fromUI;

            // coords
            if (!payload.coordinates && lat && lon) {
                payload.coordinates = { latitude: +lat, longitude: +lon };
            }
        }
        return payload;
    }

    // Пересчитать payload без сброса всего экрана
    function updatePayloadOnly() {
        const ep = $("#addrMenu .list-group-item.active")?.dataset.ep || currentEp;
        $("#addrPayload").value = JSON.stringify(defaultPayload(ep), null, 2);
    }

    // ---------- UI / events ----------
    let currentEp = "regions";

    async function render(ep) {
        currentEp = ep || currentEp;

        // Организация — видно в любой теме
        const org = getOrgId();
        const orgBox = $("#addrOrg");
        if (orgBox) {
            orgBox.textContent = org || "—";
            orgBox.style.backgroundColor = getComputedStyle(document.body).getPropertyValue("--bs-tertiary-bg") || "#f8f9fa";
            orgBox.style.color = getComputedStyle(document.body).getPropertyValue("--bs-body-color") || "#212529";
        }

        $("#addrNotes").innerHTML    = NOTES[currentEp] || "";
        $("#addrPayload").value      = JSON.stringify(defaultPayload(currentEp), null, 2);
        $("#addrResult").textContent = "";
    }

    async function send() {
        const epBtn = $("#addrMenu .list-group-item.active");
        var ep = epBtn?.dataset.ep || currentEp;
        if (!ep) return;

        let payload = {};
        try { payload = JSON.parse($("#addrPayload").value || "{}"); }
        catch { alert("Неверный JSON payload"); return; }

        const accId = getAccId();
        if (!accId) { alert("Выберите аккаунт в основной панели"); return; }

        payload = autoFixPayload(ep, payload);

        let res;
        if (ep === "regions")                            res = await api("regions",                       { ...payload, account_id: accId });
        else if (ep === "cities")                        res = await api("cities",                        { ...payload, account_id: accId });
        else if (ep === "streets_by_city")               res = await api("streets_by_city",               { ...payload, account_id: accId });
        else if (ep === "delivery_restrictions")         res = await api("delivery_restrictions",         { ...payload, account_id: accId });
        else if (ep === "delivery_restrictions_allowed") res = await api("delivery_restrictions_allowed", { ...payload, account_id: accId });
        else if (ep === "marketing_sources")             res = await api("marketing_sources",             { ...payload, account_id: accId });

        const code = $("#addrResult");
        code.textContent = JSON.stringify(res || {}, null, 2);
        if (window.hljs) window.hljs.highlightElement(code);
    }

    function bindOnce(modalEl) {
        // слева — переключатель разделов
        $("#addrMenu")?.addEventListener("click", async (e) => {
            const it = e.target.closest(".list-group-item"); if (!it) return;
            $$("#addrMenu .list-group-item").forEach(x => x.classList.remove("active"));
            it.classList.add("active");

            if (["cities","streets_by_city","delivery_restrictions_allowed"].includes(it.dataset.ep)) {
                await loadLookups();
                if ($("#addrCitySel")?.value) await loadStreets();
            }
            render(it.dataset.ep);
        });

        $("#addrSend")?.addEventListener("click", send);
        $("#addrCopy")?.addEventListener("click", () => {
            const t = $("#addrPayload")?.value || "";
            navigator.clipboard?.writeText(t);
        });
        $("#addrSaveJson")?.addEventListener("click", () => {
            const t = $("#addrResult")?.textContent || "{}";
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([t], { type: "application/json" }));
            a.download = "addresses_response.json";
            document.body.appendChild(a); a.click(); a.remove();
        });

        // --- обновление payload из UI (город/улица/дом/координаты/курьерка) ---
        $("#addrLookupRefresh")?.addEventListener("click", async (e) => {
            e.preventDefault();
            await loadLookups();
            if ($("#addrCitySel")?.value) await loadStreets();
            updatePayloadOnly();
        });
        $("#addrCitySel")?.addEventListener("change", async () => { await loadStreets(); updatePayloadOnly(); });
        $("#addrStreetSel")?.addEventListener("change", updatePayloadOnly);
        $("#addrHouse")?.addEventListener("input",  updatePayloadOnly);
        $("#addrLat")?.addEventListener("input",    updatePayloadOnly);
        $("#addrLon")?.addEventListener("input",    updatePayloadOnly);
        $("#addrIsCourier")?.addEventListener("change", updatePayloadOnly);

        // синхронизация с основной панелью (hash)
        const onHashChange = async () => { await loadLookups(); render(currentEp); };
        window.addEventListener("hashchange", onHashChange);

        loadLookups().then(() => render("regions"));

        modalEl.addEventListener("hidden.bs.modal", () => {
            window.removeEventListener("hashchange", onHashChange);
        }, { once: true });
    }

    document.addEventListener("shown.bs.modal", (ev) => {
        const el = ev.target;
        if (!el || el.id !== "modalAddresses") return;
        if (el.__bound) return;
        el.__bound = true;
        bindOnce(el);
    });
})();
