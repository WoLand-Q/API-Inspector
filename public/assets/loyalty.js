// Smart Café · Loyalty (v3+) — пресеты, авто-валидатор, конструкторы, "calculate как доставка"
(function () {
    "use strict";

    // -------- helpers --------
    const $  = (s, n = document) => n.querySelector(s);
    const $$ = (s, n = document) => Array.from(n.querySelectorAll(s));
    const h  = s => { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; };

    const api = async (action, body) => {
        const base = (typeof window.API_URL === "string" && window.API_URL) ? window.API_URL : "api.php";
        const url  = `${base}?action=${encodeURIComponent(action)}`;
        const res  = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
        const raw  = await res.text().catch(() => "");
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: raw || "non-json response" }; }
        if (!res.ok) { const err = (typeof data === "object" && data) ? data : { error: String(data) }; err.http_status = res.status; throw err; }
        return data;
    };

    const stateGet   = () => { const p = new URLSearchParams(location.hash.replace(/^#/, "")); return { acc: +(p.get("acc") || 0), org: p.get("org") || "" }; };
    const getAccId   = () => { const v = $("#selAccount")?.value; if (v) return +v; const st = stateGet(); return st.acc || 0; };
    const getOrgId   = () => { const st = stateGet(); return st.org || ""; };
    const normalizePhone        = s => (s || "").replace(/\s+/g, "");
    const isIso8601Z            = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s);
    const toIsoOrNull           = s => { const t = (s ?? "").toString().trim(); if (!t) return null; if (isIso8601Z(t)) return t; const ts = Date.parse(t); if (Number.isNaN(ts)) return null; return new Date(ts).toISOString().replace("Z", ".000Z").replace(/\.\d{3}\.000Z$/, ".000Z"); };
    const ISO                   = d => new Date(d).toISOString();
    const monthRangeIso         = () => { const now = new Date(); const from = new Date(now.getFullYear(), now.getMonth(), 1); const to = new Date(now.getFullYear(), now.getMonth() + 1, 1); return { from: ISO(from), to: ISO(to) }; };
    const pad                   = (n, len = 2) => String(n).padStart(len, "0");
    const formatLocalMs         = dt => `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}.${pad(dt.getMilliseconds(),3)}`;
    const nowPlusMinutesLocal   = min => formatLocalMs(new Date(Date.now() + (Number(min)||0)*60000));
    const guidLike              = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==="x"?r:(r&0x3|0x8);return v.toString(16);});
    const genExternalNumber     = () => `SC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const splitIds              = s => (s || "").split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
    const parseDynDiscounts     = s => (s || "").split(/\n+/).map(l => l.trim()).filter(Boolean).map(row => { const m = row.split(/[:,\s]+/); return { manualConditionId: m[0], sum: Number(m[1]||0) }; }); // sum (нижний регистр!)

    // small utils
    function pruneEmpty(obj) {
        if (!obj || typeof obj !== "object") return obj;
        for (const k of Object.keys(obj)) {
            const v = obj[k];
            if (v === "" || v === null || typeof v === "undefined") { delete obj[k]; continue; }
            if (typeof v === "object" && !Array.isArray(v)) {
                pruneEmpty(v);
                if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) delete obj[k];
            }
        }
        return obj;
    }
    const assignDeep = (dst, src) => {
        if (!src || typeof src !== "object") return dst;
        for (const k of Object.keys(src)) {
            const sv = src[k], dv = dst[k];
            if (Array.isArray(sv)) dst[k] = sv.slice();
            else if (sv && typeof sv === "object") dst[k] = (dv && typeof dv === "object" && !Array.isArray(dv)) ? assignDeep(dv, sv) : assignDeep({}, sv);
            else dst[k] = sv;
        }
        return dst;
    };

    // ---------- dynamic datalists (no HTML changes needed) ----------
    const LOY = {
        orderTypes: [],
        paymentTypes: [],
        tipsTypes: [],
        discounts: [],
        marketingSources: [],
        terminalGroups: [],
        _ready: false
    };
    const DL_IDS = {
        orderType: "dlOrderType",
        payIds: "dlPaymentTypeIds",
        payKinds: "dlPaymentKinds",
        tipsIds: "dlTipsTypeIds",
        marketingSources: "dlMarketingSources",
        terminalGroups: "dlTerminalGroups",
        discounts: "dlDiscountTypes"
    };
    function ensureDatalist(id){
        let dl = document.getElementById(id);
        if (!dl) {
            dl = document.createElement("datalist");
            dl.id = id;
            // прячем под модалкой
            const host = $("#modalLoyalty") || document.body;
            host.appendChild(dl);
        }
        return dl;
    }
    function setInputDatalist(input, id){
        if (!input) return;
        input.setAttribute("list", id);
    }
    function fillDatalist(id, items){
        const dl = ensureDatalist(id);
        dl.innerHTML = ""; // reset
        for (const it of items) {
            const opt = document.createElement("option");
            opt.value = it.value ?? "";
            if (it.label) opt.label = it.label;
            dl.appendChild(opt);
        }
    }
    function optionize(list, vKey, lKey){
        return (list||[])
            .map(x => {
                const v = (x?.[vKey]) ?? (x?.id) ?? (x?.uuid) ?? (x?.orderTypeId) ?? "";
                const nm = (x?.[lKey]) ?? x?.name ?? x?.fullName ?? x?.caption ?? "";
                return (v || nm) ? { value: String(v||nm), label: nm ? String(nm) : undefined } : null;
            })
            .filter(Boolean);
    }

    // -------- Order items (products) --------
    function obAddRow(it = { productId: "", amount: 1, price: 0, name: "" }) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
      <td><input class="form-control form-control-sm ob-pid"   placeholder="GUID продукта" value="${h(it.productId)}"></td>
      <td><input class="form-control form-control-sm ob-amt"   type="number" min="0" step="1"    value="${Number(it.amount)||1}"></td>
      <td><input class="form-control form-control-sm ob-price" type="number" min="0" step="0.01" value="${Number(it.price)||0}"></td>
      <td><input class="form-control form-control-sm ob-name"  placeholder="для себя" value="${h(it.name||"")}"></td>
      <td class="text-end"><button class="btn btn-outline-danger btn-sm ob-del"><i class="bi bi-x-lg"></i></button></td>
    `;
        $("#obTable tbody").appendChild(tr);
    }
    function obGetItems() {
        // обязательный дискриминатор type для Syrve loyalty/calculate
        return $$("#obTable tbody tr").map(tr => ({
            type: "Product",
            productId: $(".ob-pid", tr).value.trim(),
            amount: Math.max(0, +$(".ob-amt", tr).value || 0),
            price:  Math.max(0, +$(".ob-price", tr).value || 0),
        })).filter(x => x.productId);
    }
    function obClear() { $("#obTable tbody").innerHTML = ""; }
    async function obImportFromCart() {
        if (window.Cart && typeof window.Cart.getItems === "function") {
            const items = (window.Cart.getItems() || []).map(x => ({
                productId: x.productId || x.id || "",
                amount: x.amount || x.qty || 1,
                price: x.price || 0,
                name: x.name || x.title || ""
            }));
            obClear(); items.forEach(obAddRow); return;
        }
        try {
            const raw = localStorage.getItem("cart") || localStorage.getItem("sc_cart") || "";
            if (raw) {
                const c = JSON.parse(raw);
                const items = (c.items || c || []).map(x => ({
                    productId: x.productId || x.id || "",
                    amount: x.amount || x.qty || 1,
                    price: x.price || 0,
                    name: x.name || x.title || ""
                }));
                obClear(); items.forEach(obAddRow);
            }
        } catch {}
    }

    // -------- Payments / Tips / ExternalData tables --------
    function payAddRow(it={paymentTypeKind:"", sum:0, paymentTypeId:"", isProcessedExternally:false, isFiscalizedExternally:false, isPrepay:false}){
        const tr = document.createElement("tr");
        tr.innerHTML = `
      <td><input class="form-control form-control-sm pay-kind" placeholder="kind" value="${h(it.paymentTypeKind||"")}"></td>
      <td><input class="form-control form-control-sm pay-id"   placeholder="paymentTypeId" value="${h(it.paymentTypeId||"")}"></td>
      <td><input class="form-control form-control-sm pay-sum"  type="number" min="0" step="0.01" value="${Number(it.sum)||0}"></td>
      <td class="text-nowrap">
        <label class="me-2"><input type="checkbox" class="form-check-input pay-proc" ${it.isProcessedExternally?"checked":""}> proc</label>
        <label class="me-2"><input type="checkbox" class="form-check-input pay-fisc" ${it.isFiscalizedExternally?"checked":""}> fisc</label>
        <label><input type="checkbox" class="form-check-input pay-prepay" ${it.isPrepay?"checked":""}> prepay</label>
      </td>
      <td class="text-end"><button class="btn btn-outline-danger btn-sm pay-del"><i class="bi bi-x-lg"></i></button></td>
    `;
        $("#payTable tbody").appendChild(tr);
        setInputDatalist($(".pay-id", tr),   DL_IDS.payIds);
        setInputDatalist($(".pay-kind", tr), DL_IDS.payKinds);
    }
    function payGetItems(){
        return $$("#payTable tbody tr").map(tr=>({
            paymentTypeKind: $(".pay-kind",tr).value.trim() || undefined,
            paymentTypeId:   $(".pay-id",tr).value.trim()   || undefined,
            sum: Math.max(0, +$(".pay-sum",tr).value || 0),
            isProcessedExternally: $(".pay-proc",tr).checked || undefined,
            isFiscalizedExternally: $(".pay-fisc",tr).checked || undefined,
            isPrepay: $(".pay-prepay",tr).checked || undefined,
        })).filter(x => x.paymentTypeId || x.paymentTypeKind || x.sum > 0);
    }

    function tipAddRow(it={paymentTypeKind:"", tipsTypeId:"", sum:0, paymentTypeId:"", isProcessedExternally:false, isFiscalizedExternally:false, isPrepay:false}){
        const tr = document.createElement("tr");
        tr.innerHTML = `
      <td><input class="form-control form-control-sm tip-kind" placeholder="kind" value="${h(it.paymentTypeKind||"")}"></td>
      <td><input class="form-control form-control-sm tip-type" placeholder="tipsTypeId" value="${h(it.tipsTypeId||"")}"></td>
      <td><input class="form-control form-control-sm tip-pay"  placeholder="paymentTypeId" value="${h(it.paymentTypeId||"")}"></td>
      <td><input class="form-control form-control-sm tip-sum"  type="number" min="0" step="0.01" value="${Number(it.sum)||0}"></td>
      <td class="text-nowrap">
        <label class="me-2"><input type="checkbox" class="form-check-input tip-proc" ${it.isProcessedExternally?"checked":""}> proc</label>
        <label class="me-2"><input type="checkbox" class="form-check-input tip-fisc" ${it.isFiscalizedExternally?"checked":""}> fisc</label>
        <label><input type="checkbox" class="form-check-input tip-prepay" ${it.isPrepay?"checked":""}> prepay</label>
      </td>
      <td class="text-end"><button class="btn btn-outline-danger btn-sm tip-del"><i class="bi bi-x-lg"></i></button></td>
    `;
        $("#tipsTable tbody").appendChild(tr);
        setInputDatalist($(".tip-type", tr), DL_IDS.tipsIds);
        setInputDatalist($(".tip-pay",  tr), DL_IDS.payIds);
        setInputDatalist($(".tip-kind", tr),DL_IDS.payKinds);
    }
    function tipGetItems(){
        return $$("#tipsTable tbody tr").map(tr=>({
            paymentTypeKind: $(".tip-kind",tr).value.trim() || undefined,
            tipsTypeId:      $(".tip-type",tr).value.trim() || undefined,
            paymentTypeId:   $(".tip-pay",tr).value.trim()  || undefined,
            sum: Math.max(0, +$(".tip-sum",tr).value || 0),
            isProcessedExternally: $(".tip-proc",tr).checked || undefined,
            isFiscalizedExternally: $(".tip-fisc",tr).checked || undefined,
            isPrepay: $(".tip-prepay",tr).checked || undefined,
        })).filter(x => x.paymentTypeId || x.tipsTypeId || x.sum > 0);
    }

    function extAddRow(it={key:"", value:"", isPublic:true}){
        const tr = document.createElement("tr");
        tr.innerHTML = `
      <td><input class="form-control form-control-sm ext-key" placeholder="key"   value="${h(it.key||"")}"></td>
      <td><input class="form-control form-control-sm ext-val" placeholder="value" value="${h(it.value||"")}"></td>
      <td class="text-center"><input type="checkbox" class="form-check-input ext-pub" ${it.isPublic?"checked":""}></td>
      <td class="text-end"><button class="btn btn-outline-danger btn-sm ext-del"><i class="bi bi-x-lg"></i></button></td>
    `;
        $("#extDataTable tbody").appendChild(tr);
    }
    function extGetItems(){
        return $$("#extDataTable tbody tr").map(tr=>({
            key: $(".ext-key",tr).value.trim(),
            value: $(".ext-val",tr).value,
            isPublic: $(".ext-pub",tr).checked,
        })).filter(x => x.key);
    }

    // -------- Presets --------
    const NOTES = {
        calculate: `<b>Рассчитать скидки/бонусы</b><br>Передайте <code>organizationId</code>, при необходимости клиента и <code>order</code> (позиции ниже). Это эмуляция заказа для расчёта: в кассу не уходит.`,
        manual_condition: `<b>Ручные условия</b><br><code>organizationId</code>, <code>conditionId</code>, <code>context</code>.`,
        customer_info: `<b>Инфо клиента</b><br>Поиск по <code>phone</code>, <code>id</code> или <code>cardNumber</code>.`,
        customer_create_or_update: `<b>Создать/обновить клиента</b><br>Минимум: <code>organizationId</code> + (phone|id).`,
        customer_wallet_topup: `<b>Пополнение кошелька</b><br><code>customerId</code>, <code>walletId</code> и сумма (<code>sum</code>|<code>amount</code>).`,
        customer_wallet_chargeoff: `<b>Списание кошелька</b><br><code>customerId</code>, <code>walletId</code> и сумма (положительная).`,
        customer_wallet_hold: `<b>Холд</b><br><code>customerId</code>, <code>walletId</code> и сумма.`,
        customer_wallet_cancel_hold: `<b>Снять холд</b><br><code>customerId</code> и <code>transactionId</code>.`,
        coupons_info: `<b>Инфо по купону</b><br>Поле <code>number</code> (алиас <code>coupon</code> подхватим).`,
        customer_transactions_by_date: `<b>Транзакции (дата)</b><br><code>customerId</code>, <code>dateFrom</code>/<code>dateTo</code>, <code>pageNumber</code>/<code>pageSize</code>.`,
        program: `<b>Программы лояльности</b> по организации.`,
        customer_program_add: `<b>Привязать к программе</b><br><code>customerId</code> + <code>programId</code>.`,
        customer_card_add: `<b>Привязать карту</b><br><code>customerId</code> + <code>cardTrack</code> (или <code>cardNumber</code>).`,
        customer_card_remove: `<b>Удалить карту</b><br><code>customerId</code> + <code>cardTrack</code>/<code>cardNumber</code>.`,
        customer_category: `<b>Категории клиента</b> — нужен <code>customerId</code>.`,
        customer_category_add: `<b>Добавить категорию</b><br><code>customerId</code> + <code>categoryId</code>.`,
        customer_category_remove:`<b>Удалить категорию</b><br><code>customerId</code> + <code>categoryId</code>.`,
        get_counters:`<b>Счётчики клиента</b> — укажите <code>source</code>.`,
        message_send_sms:`<b>SMS</b><br><code>phone</code> + <code>text</code>.`,
        message_send_email:`<b>Email</b><br><code>receiver</code> (email) и <code>body</code> (алиасы <code>email</code>/<code>text</code> поддержаны).`,
        check_sms_sending_possibility:`<b>Проверка возможности SMS</b> по номеру.`,
        check_sms_status:`<b>Статус SMS</b> — <code>smsIds</code> (массив). Алиас <code>messageId</code> поддержан.`,
        customer_transactions_by_revision:`<b>Транзакции по ревизии</b><br><code>customerId</code> + <code>startRevision</code>.`,
    };

    const PRESETS = {
        calculate: (org, phone) => ({
            organizationId: org || "",
            customer: phone ? { phone: normalizePhone(phone) } : undefined,
            order: { id: null, items: obGetItems().length ? obGetItems() : [] }
        }),
        manual_condition: (org)=>({ organizationId: org||""}),
        customer_info: (org, phoneOrId)=>({
            organizationId: org||"",
            phone: phoneOrId && phoneOrId.startsWith("+") ? normalizePhone(phoneOrId) : undefined,
            id:    phoneOrId && !phoneOrId.startsWith("+") ? String(phoneOrId) : undefined,
        }),
        customer_create_or_update: (org, phone)=>({ organizationId: org||"", phone: normalizePhone(phone||""), name:"Имя Фамилия" }),

        coupons_info: (org, id)=>({ organizationId: org||"", number: id||"" }),
        coupons_series: (org)=>({ organizationId: org||"" }),
        coupons_by_series: (org)=>({ organizationId: org||"", seriesId: "SERIES_ID" }),

        customer_wallet_topup:      (org, phone)=>({ organizationId: org||"", phone: normalizePhone(phone||""), walletId:"WALLET_ID", amount: 100 }),
        customer_wallet_chargeoff:  (org, phone)=>({ organizationId: org||"", phone: normalizePhone(phone||""), walletId:"WALLET_ID", amount:  50 }),
        customer_wallet_hold:       (org, phone)=>({ organizationId: org||"", phone: normalizePhone(phone||""), walletId:"WALLET_ID", amount:  50 }),
        customer_wallet_cancel_hold:(org, phone)=>({ organizationId: org||"", phone: normalizePhone(phone||""), transactionId: "HOLD_TRANSACTION_ID" }),

        customer_transactions_by_date: (org, phone)=>{ const {from,to} = monthRangeIso(); return { organizationId:org||"", phone: normalizePhone(phone||""), dateFrom:from, dateTo:to, pageNumber:1, pageSize:50 }; },
        customer_transactions_by_revision: (org, phone)=>({ organizationId: org||"", phone: normalizePhone(phone||""), startRevision: 0 }),

        program: (org)=>({ organizationId: org||"" }),
        customer_program_add: (org, phoneOrId)=>({ organizationId: org||"", phone: normalizePhone(phoneOrId||""), programId: "PROGRAM_ID" }),
        customer_card_add:    (org, phone)=>({ organizationId: org||"", phone: normalizePhone(phone||""), cardTrack: "1234567890" }),
        customer_card_remove: (org, phone)=>({ organizationId: org||"", phone: normalizePhone(phone||""), cardTrack: "1234567890" }),
        customer_category:     (org, phone)=>({ organizationId: org||"", phone: normalizePhone(phone||"") }),
        customer_category_add: (org, phoneOrId)=>({ organizationId: org||"", phone: normalizePhone(phoneOrId||""), customerCategoryId: "CATEGORY_ID" }),
        customer_category_remove:(org, phoneOrId)=>({ organizationId: org||"", phone: normalizePhone(phoneOrId||""), customerCategoryId: "CATEGORY_ID" }),

        get_counters: (org, phone)=>({ organizationId: org||"", phone: normalizePhone(phone||""), source: "" }),

        message_send_sms:     (org, phone)=>({ phone: normalizePhone(phone||""), text:"Ваш промокод: 1234" }),
        message_send_email:   ()=>({ receiver:"demo@example.com", subject:"Промо", body:"Здравствуйте!" }),
        check_sms_sending_possibility: (org, phone)=>({ phone: normalizePhone(phone||"") }),
        check_sms_status: ()=>({ smsIds: ["MESSAGE_ID"] }),
    };

    // -------- calculate: сборка из UI --------
    function buildCalculateFromUI() {
        // Order block
        const etaMin = +$("#calcEta")?.value || 0;
        const completeBefore = nowPlusMinutesLocal(etaMin);

        const deliveryPoint = {};
        const lat = $("#calcLat")?.value?.trim();
        const lon = $("#calcLon")?.value?.trim();
        if (lat || lon) {
            deliveryPoint.coordinates = {
                latitude: Number(lat || 0),
                longitude: Number(lon || 0),
            };
        }
        const addrType = $("#calcAddrText")?.value?.trim();
        const addrExtId = $("#calcAddrExtId")?.value?.trim();
        const addrComment = $("#calcAddrComment")?.value?.trim();
        if (addrType || addrExtId || addrComment) {
            if (addrType) {
                // Попробуем выдрать дом из хвоста (если есть)
                const m = addrType.match(/^(.*?)(?:,\s*)?(\d+\w?)\s*$/i);
                const streetName = m ? m[1] : addrType;
                const house      = m ? m[2] : undefined;

                deliveryPoint.address = { street: { name: streetName.trim() } };
                if (house) deliveryPoint.address.house = house;
            }

            // комментарии — внутрь address.comment
            if (addrComment) {
                deliveryPoint.address = deliveryPoint.address || {};
                deliveryPoint.address.comment = addrComment;
            }

            if (addrExtId) deliveryPoint.externalCartographyId = addrExtId;
        }


        const discountsInfo = {};
        const cardTrack = $("#calcDiscountCardTrack")?.value?.trim();
        if (cardTrack) discountsInfo.card = { track: cardTrack };
        const discountTypes = splitIds($("#calcDiscountsList")?.value);
        if (discountTypes.length) discountsInfo.discounts = discountTypes.map(t => ({ type: t }));
        if ($("#calcFixedLoyalty")?.checked) discountsInfo.fixedLoyaltyDiscounts = true;

        const loyaltyInfo = {};
        const coup = $("#calcCoupon")?.value?.trim();
        if (coup) loyaltyInfo.coupon = coup;
        const applManConds = splitIds($("#calcApplicableManualConditionsList")?.value);
        if (applManConds.length) loyaltyInfo.applicableManualConditions = applManConds;

        const guests = {};
        const gCount = +$("#calcGuestsCount")?.value || 0;
        if (gCount) guests.count = gCount;
        if ($("#calcGuestsSplit")?.checked) guests.splitBetweenPersons = true;

        const chequeAdditionalInfo = {};
        if ($("#calcNeedReceipt")?.checked) chequeAdditionalInfo.needReceipt = true;
        const chEmail = $("#calcReceiptEmail")?.value?.trim();
        if (chEmail) chequeAdditionalInfo.email = chEmail;
        const chPlace = $("#calcReceiptPlace")?.value?.trim();
        if (chPlace) chequeAdditionalInfo.settlementPlace = chPlace;
        const chPhone = $("#calcReceiptPhone")?.value?.trim();
        if (chPhone) chequeAdditionalInfo.phone = chPhone;

        const order = {
            id: null,
            externalNumber: $("#calcExtNum")?.value?.trim() || undefined,
            completeBefore,
            phone: $("#calcOrderPhone")?.value?.trim() || undefined,
            phoneExtension: $("#calcOrderPhoneExt")?.value?.trim() || undefined,
            orderTypeId: $("#calcOrderTypeId")?.value?.trim() || undefined,
            orderServiceType: $("#calcServiceType")?.value || undefined,
            deliveryPoint: Object.keys(deliveryPoint).length ? deliveryPoint : undefined,
            comment: $("#calcOrderComment")?.value?.trim() || undefined,
            customer: ($("#calcOrderCustomerType")?.value?.trim()) ? { type: $("#calcOrderCustomerType").value.trim() } : undefined,
            guests: Object.keys(guests).length ? guests : undefined,
            marketingSourceId: $("#calcMarketingSourceId")?.value?.trim() || undefined,
            operatorId: $("#calcOperatorId")?.value?.trim() || undefined,
            deliveryDuration: +$("#calcDeliveryDuration")?.value || undefined,
            deliveryZone: $("#calcDeliveryZone")?.value?.trim() || undefined,
            priceCategoryId: $("#calcPriceCategoryId")?.value?.trim() || undefined,
            items: obGetItems(),
            payments: payGetItems(),
            tips: tipGetItems(),
            sourceKey: $("#calcSourceKey")?.value?.trim() || undefined,
            discountsInfo: Object.keys(discountsInfo).length ? discountsInfo : undefined,
            loyaltyInfo: Object.keys(loyaltyInfo).length ? loyaltyInfo : undefined,
            chequeAdditionalInfo: Object.keys(chequeAdditionalInfo).length ? chequeAdditionalInfo : undefined,
            externalData: extGetItems(),
        };

        // Root-level fields
        const root = {
            coupon: $("#calcRootCoupon")?.value?.trim() || undefined,
            referrerId: $("#calcReferrerId")?.value?.trim() || undefined,
            terminalGroupId: $("#calcTerminalGroupId")?.value?.trim() || undefined,
            availablePaymentMarketingCampaignIds: splitIds($("#calcAvailPayMcIds")?.value),
            applicableManualConditions: splitIds($("#calcRootApplicableManualConditions")?.value),
            dynamicDiscounts: parseDynDiscounts($("#calcDynamicDiscounts")?.value),
            isLoyaltyTraceEnabled: $("#calcTrace")?.checked || undefined
        };

        pruneEmpty(order);
        pruneEmpty(root);

        return { order, ...root };
    }

    // -------- endpoint-specific normalization before send --------
    function normalizePayloadByEndpoint(ep, payload) {
        const p = { ...payload };

        if (p.phone) p.phone = normalizePhone(p.phone);
        if (p.customer?.phone) p.customer.phone = normalizePhone(p.customer.phone);

        for (const k of ["phone","cardNumber","id"]) {
            if (k in p && String(p[k]).trim() === "") delete p[k];
            if (p.customer && k in p.customer && String(p.customer[k]).trim() === "") delete p.customer[k];
        }

        if (ep === "calculate") {
            p.order = p.order || {};
            p.order.id = (p.order.id === undefined) ? null : p.order.id;
            if (!Array.isArray(p.order.items)) p.order.items = [];
            // гарантируем дискриминатор на позициях
            if (Array.isArray(p.order.items)) {
                p.order.items = p.order.items.map(it => {
                    if (it && typeof it === "object" && !it.type && (it.productId || it.id)) it.type = "Product";
                    return it;
                });
            }
        }

        if (/^customer_wallet_(topup|chargeoff|hold)$/.test(ep)) {
            if (typeof p.sum === "undefined" && typeof p.amount !== "undefined") p.sum = +p.amount;
            if (p.sum && p.sum < 0) p.sum = Math.abs(p.sum);
        }
        if (ep === "customer_card_add" || ep === "customer_card_remove") {
            if (!p.cardTrack && p.cardNumber) p.cardTrack = p.cardNumber;
        }
        if (ep === "customer_category_add" || ep === "customer_category_remove") {
            if (!p.categoryId && p.customerCategoryId) p.categoryId = p.customerCategoryId;
        }
        if (ep === "coupons_info") {
            if (!p.number && p.coupon) p.number = p.coupon;
        }
        if (ep === "customer_transactions_by_date") {
            if (p.dateFrom && !isIso8601Z(p.dateFrom)) { const z = toIsoOrNull(p.dateFrom); if (z) p.dateFrom = z; }
            if (p.dateTo   && !isIso8601Z(p.dateTo))   { const z = toIsoOrNull(p.dateTo);   if (z) p.dateTo   = z; }
            if (typeof p.pageNumber === "undefined") p.pageNumber = 1;
            if (typeof p.pageSize   === "undefined") p.pageSize   = 50;
        }
        if (ep === "message_send_email") {
            if (!p.receiver && p.email) { p.receiver = String(p.email); delete p.email; }
            if (!p.body && p.text)     { p.body = String(p.text); delete p.text; }
        }
        if (ep === "check_sms_status") {
            if (!Array.isArray(p.smsIds) && p.messageId) { p.smsIds = [String(p.messageId)]; delete p.messageId; }
        }

        pruneEmpty(p);
        return p;
    }

    // -------- need customerId map (in case server auto-resolves) --------
    const NEED_CUST_ID = new Set([
        "customer_transactions_by_date","customer_transactions_by_revision",
        "customer_wallet_topup","customer_wallet_chargeoff","customer_wallet_hold","customer_wallet_cancel_hold",
        "customer_program_add","customer_card_add","customer_card_remove",
        "customer_category","customer_category_add","customer_category_remove",
        "get_counters"
    ]);

    // helper: автоподстановка paymentTypeId по paymentTypeKind (если не указан)
    function autopickPaymentIds(payload){
        if (!payload?.order) return;
        const list = LOY.paymentTypes || [];
        if (!Array.isArray(list) || !list.length) return;
        const byKind = new Map();
        for (const pt of list) {
            const kind = String(pt.paymentTypeKind || pt.kind || "").trim();
            const id = pt.id || pt.uuid || pt.paymentTypeId;
            if (kind && id && !byKind.has(kind)) byKind.set(kind, String(id));
        }
        (payload.order.payments || []).forEach(p => {
            if (!p.paymentTypeId && p.paymentTypeKind && byKind.has(p.paymentTypeKind)) {
                p.paymentTypeId = byKind.get(p.paymentTypeKind);
            }
        });
        (payload.order.tips || []).forEach(t => {
            if (!t.paymentTypeId && t.paymentTypeKind && byKind.has(t.paymentTypeKind)) {
                t.paymentTypeId = byKind.get(t.paymentTypeKind);
            }
        });
    }

    // -------- UI refresh + payload preview --------
    function refreshMeta(ep) {
        const org = getOrgId(); const acc = getAccId();
        $("#loyOrg").textContent = org || "—";
        $("#loyAcc").textContent = acc ? String(acc) : "—";
        $("#loyNotes").innerHTML = NOTES[ep] || "";
        $("#loyMeta").textContent = `endpoint=${ep}`;

        const phone = $("#loyPhone")?.value?.trim() || "";
        const id    = $("#loyId")?.value?.trim() || "";

        let def = (PRESETS[ep] || (() => ({ organizationId: org || "" })))(org, phone || id);

        if (ep === "calculate") {
            // подсказка по ETA
            const etaMin = +$("#calcEta")?.value || 0;
            const preview = nowPlusMinutesLocal(etaMin);
            $("#calcEtaPreview").textContent = preview;

            // расширяем calculate UI-значениями
            const fromUI = buildCalculateFromUI();
            def = assignDeep(def, fromUI);

            // root customer
            if (phone && (!def.customer || !def.customer.phone)) {
                def.customer = def.customer || {};
                def.customer.phone = normalizePhone(phone);
            }
        }

        // показываем только калькуляторные секции на вкладке calculate
        const isCalc = ep === "calculate";
        $("#orderBuilderWrap")?.classList.toggle("d-none", !isCalc);
        $("#calcSection")?.classList.toggle("d-none", !isCalc);
        $("#paymentsSection")?.classList.toggle("d-none", !isCalc);
        $("#tipsSection")?.classList.toggle("d-none", !isCalc);
        $("#extDataSection")?.classList.toggle("d-none", !isCalc);
        // если есть обёртка корневых полей — тоже прячем на других вкладках
        $("#calcRootSection")?.classList.toggle("d-none", !isCalc);

        $("#loyPayload").value = JSON.stringify(def, null, 2);
    }

    // ====== CATALOGS & AUTOFILL =================================================
    function parseResponseList(obj, keys){
        // try multiple paths until array found
        for (const k of keys){
            const parts = k.split(".");
            let cur = obj;
            let ok = true;
            for (const p of parts){
                if (cur && typeof cur === "object" && p in cur){ cur = cur[p]; }
                else { ok=false; break; }
            }
            if (ok && Array.isArray(cur)) return cur;
        }
        return [];
    }

    async function primeCatalogs(){
        if (LOY._ready) return;
        const account_id = getAccId();
        const organizationId = getOrgId();
        if (!account_id || !organizationId) return;

        try {
            const [
                orderTypesRes,
                paymentsRes,
                tipsDictRes,
                mktRes,
                tgroupsRes,
                discountsRes
            ] = await Promise.all([
                api("order_types", { account_id, organizationId }),
                api("payment_types", { account_id, organizationId }),
                api("dict", { account_id, organizationId, name: "tips_types" }),
                api("marketing_sources", { account_id, organizationId }),
                api("terminal_groups", { account_id, organizationId }),
                api("dict", { account_id, organizationId, name: "discounts" }),
            ]);

            // ---- order types
            {
                const r = orderTypesRes?.order_types || {};
                const list = parseResponseList(r, [
                    "response.orderTypes",            // general
                    "response.availableOrderTypes",   // alt
                    "response.items"
                ]);
                LOY.orderTypes = optionize(list, "id", "name");
                fillDatalist(DL_IDS.orderType, LOY.orderTypes);
                setInputDatalist($("#calcOrderTypeId"), DL_IDS.orderType);

                // default if empty
                if (!$("#calcOrderTypeId")?.value && LOY.orderTypes[0]) {
                    $("#calcOrderTypeId").value = LOY.orderTypes[0].value;
                }
            }

            // ---- payment types
            {
                const r = paymentsRes?.payment_types || {};
                const list = parseResponseList(r, [
                    "response.paymentTypes",
                    "response.items"
                ]);
                // ids list
                const asOptions = optionize(list, "id", "name");
                LOY.paymentTypes = list;
                fillDatalist(DL_IDS.payIds, asOptions);
                setInputDatalist($("#calcPriceCategoryId"), DL_IDS.payIds); // если захотят выбрать платежный GUID куда-то

                // kinds list
                const kinds = [...new Set(list.map(x => String(x.paymentTypeKind || x.kind || "").trim()).filter(Boolean))];
                fillDatalist(DL_IDS.payKinds, kinds.map(v => ({ value: v })));
            }

            // ---- tips types (dict)
            {
                const r = tipsDictRes?.result || {};
                const list = parseResponseList(r, [
                    "response.tipsTypes",
                    "response.items"
                ]);
                fillDatalist(DL_IDS.tipsIds, optionize(list, "id", "name"));
            }

            // ---- marketing sources
            {
                const r = mktRes?.marketing_sources || {};
                const list = parseResponseList(r, [
                    "response.marketingSources",
                    "response.items"
                ]);
                LOY.marketingSources = optionize(list, "id", "name");
                fillDatalist(DL_IDS.marketingSources, LOY.marketingSources);
                setInputDatalist($("#calcMarketingSourceId"), DL_IDS.marketingSources);
                if (!$("#calcMarketingSourceId")?.value && LOY.marketingSources[0]) {
                    $("#calcMarketingSourceId").value = LOY.marketingSources[0].value;
                }
            }

            // ---- terminal groups
            {
                const r = tgroupsRes?.terminal_groups || {};
                const tgA = parseResponseList(r, ["response.terminalGroups"]);
                const tgB = parseResponseList(r, ["response.terminalGroupsInSleep"]);
                const flat = [];
                for (const g of [...tgA, ...tgB]) for (const it of (g?.items||[])) flat.push(it);
                LOY.terminalGroups = optionize(flat, "id", "name");
                fillDatalist(DL_IDS.terminalGroups, LOY.terminalGroups);
                setInputDatalist($("#calcTerminalGroupId"), DL_IDS.terminalGroups);
                if (!$("#calcTerminalGroupId")?.value && LOY.terminalGroups[0]) {
                    $("#calcTerminalGroupId").value = LOY.terminalGroups[0].value;
                }
            }

            // ---- discounts (types)
            {
                const r = discountsRes?.result || {};
                const list = parseResponseList(r, [
                    "response.discounts",
                    "response.items"
                ]);
                const opts = list.map(x => ({ value: String(x?.type || x?.name || "").trim(), label: x?.name ? String(x.name) : undefined }))
                    .filter(o => o.value);
                LOY.discounts = opts;
                fillDatalist(DL_IDS.discounts, opts);
                setInputDatalist($("#calcDiscountsList"), DL_IDS.discounts);
            }

            // attach datalists to static inputs (one time)
            setInputDatalist($("#calcOrderTypeId"),      DL_IDS.orderType);
            setInputDatalist($("#calcMarketingSourceId"),DL_IDS.marketingSources);
            setInputDatalist($("#calcTerminalGroupId"),  DL_IDS.terminalGroups);

            LOY._ready = true;
            refreshMeta($("#loyMenu .list-group-item.active")?.dataset.ep || "calculate");
        } catch (e) {
            console.warn("primeCatalogs failed", e);
        }
    }

    // -------- send handler --------
    async function send() {
        const ep = $("#loyMenu .list-group-item.active")?.dataset.ep || "calculate";
        let payload = {};
        try { payload = JSON.parse($("#loyPayload").value || "{}"); }
        catch { alert("Неверный JSON"); return; }

        const acc = getAccId();
        if (!acc) { alert("Выберите аккаунт в основной панели"); return; }

        if (!payload.organizationId) payload.organizationId = getOrgId() || "";

        payload = normalizePayloadByEndpoint(ep, payload);

        // defaults quality-of-life for calculate
        if (ep === "calculate") {
            // externalNumber авто если пусто
            if (!payload.order?.externalNumber) {
                payload.order = payload.order || {};
                payload.order.externalNumber = genExternalNumber();
            }
            // service type default если пусто
            if (!payload.order.orderServiceType) payload.order.orderServiceType = $("#calcServiceType")?.value || "DeliveryByCourier";
            // terminalGroupId/ orderTypeId автозаполнение из справочников (если пусто)
            if (!payload.terminalGroupId && LOY.terminalGroups[0]) payload.terminalGroupId = LOY.terminalGroups[0].value;
            if (!payload.order.orderTypeId && LOY.orderTypes[0])  payload.order.orderTypeId = LOY.orderTypes[0].value;

            // автоподстановка paymentTypeId по kind
            autopickPaymentIds(payload);
        }

        const auto = $("#loyAutoResolve")?.checked;
        const req  = { account_id: acc, name: ep, payload, organizationId: payload.organizationId };
        const res  = await api("loyalty", auto ? { ...req, _auto: true } : req);

        const code = $("#loyResult");
        code.textContent = JSON.stringify(res, null, 2);
        if (window.hljs) window.hljs.highlightElement(code);
    }

    // -------- bind events once modal is shown --------
    function bindOnce(modalEl) {
        // menu
        $("#loyMenu")?.addEventListener("click", e => {
            const it = e.target.closest(".list-group-item"); if (!it) return;
            $$("#loyMenu .list-group-item").forEach(x => x.classList.remove("active"));
            it.classList.add("active");
            refreshMeta(it.dataset.ep);
        });

        // left fields sync
        const sync = () => {
            const ep = $("#loyMenu .list-group-item.active")?.dataset.ep || "calculate";
            refreshMeta(ep);
        };
        $("#loyPhone")?.addEventListener("input", sync);
        $("#loyId")?.addEventListener("input", sync);

        // order builder
        $("#obAddRow")?.addEventListener("click", ()=>{ obAddRow({}); refreshMeta("calculate"); });
        $("#obClear")?.addEventListener("click", ()=>{ obClear(); refreshMeta("calculate"); });
        $("#obImportCart")?.addEventListener("click", async ()=>{ await obImportFromCart(); refreshMeta("calculate"); });
        $("#obTable")?.addEventListener("click", e => {
            if (e.target.closest(".ob-del")) { e.preventDefault(); e.target.closest("tr")?.remove(); refreshMeta("calculate"); }
        });
        $("#obTable")?.addEventListener("input", ()=>refreshMeta("calculate"));

        // payments
        $("#payAddRow")?.addEventListener("click", ()=>{ payAddRow({}); refreshMeta("calculate"); });
        $("#payClear")?.addEventListener("click", ()=>{ $("#payTable tbody").innerHTML = ""; refreshMeta("calculate"); });
        $("#payTable")?.addEventListener("click", e => {
            if (e.target.closest(".pay-del")) { e.preventDefault(); e.target.closest("tr")?.remove(); refreshMeta("calculate"); }
        });
        $("#payTable")?.addEventListener("input", ()=>refreshMeta("calculate"));

        // tips
        $("#tipsAddRow")?.addEventListener("click", ()=>{ tipAddRow({}); refreshMeta("calculate"); });
        $("#tipsClear")?.addEventListener("click", ()=>{ $("#tipsTable tbody").innerHTML = ""; refreshMeta("calculate"); });
        $("#tipsTable")?.addEventListener("click", e => {
            if (e.target.closest(".tip-del")) { e.preventDefault(); e.target.closest("tr")?.remove(); refreshMeta("calculate"); }
        });
        $("#tipsTable")?.addEventListener("input", ()=>refreshMeta("calculate"));

        // external data
        $("#extAddRow")?.addEventListener("click", ()=>{ extAddRow({}); refreshMeta("calculate"); });
        $("#extClear")?.addEventListener("click", ()=>{ $("#extDataTable tbody").innerHTML = ""; refreshMeta("calculate"); });
        $("#extDataTable")?.addEventListener("click", e => {
            if (e.target.closest(".ext-del")) { e.preventDefault(); e.target.closest("tr")?.remove(); refreshMeta("calculate"); }
        });
        $("#extDataTable")?.addEventListener("input", ()=>refreshMeta("calculate"));

        // calc-only controls
        $("#calcExtGen")?.addEventListener("click", ()=>{ $("#calcExtNum").value = genExternalNumber(); refreshMeta("calculate"); });
        $("#calcEtaNow")?.addEventListener("click", ()=>{ $("#calcEta").value = 0; refreshMeta("calculate"); });
        $("#calcUseGeoloc")?.addEventListener("click", ()=>{
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition(pos => {
                const { latitude, longitude } = pos.coords || {};
                if (typeof latitude === "number") $("#calcLat").value = String(latitude);
                if (typeof longitude=== "number") $("#calcLon").value = String(longitude);
                refreshMeta("calculate");
            });
        });

        // any input within calc blocks -> refresh
        ["#calcSection","#paymentsSection","#tipsSection","#extDataSection","#calcRootSection"].forEach(sel=>{
            $(sel)?.addEventListener("input", ()=>refreshMeta("calculate"));
            $(sel)?.addEventListener("change", ()=>refreshMeta("calculate"));
        });

        // actions
        $("#loySend")?.addEventListener("click", send);
        $("#loyCopy")?.addEventListener("click", ()=>{
            const t = $("#loyPayload")?.value || "";
            navigator.clipboard?.writeText(t);
        });
        $("#loySave")?.addEventListener("click", ()=>{
            const t = $("#loyResult")?.textContent || "{}";
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([t], { type: "application/json" }));
            a.download = "loyalty_response.json";
            document.body.appendChild(a); a.click(); a.remove();
        });
        $("#loyTpl")?.addEventListener("click", ()=>{
            const ep = $("#loyMenu .list-group-item.active")?.dataset.ep || "calculate";
            refreshMeta(ep);
        });

        // подключаем datalist'ы и тянем справочники
        setInputDatalist($("#calcOrderTypeId"),      DL_IDS.orderType);
        setInputDatalist($("#calcMarketingSourceId"),DL_IDS.marketingSources);
        setInputDatalist($("#calcTerminalGroupId"),  DL_IDS.terminalGroups);
        setInputDatalist($("#calcDiscountsList"),    DL_IDS.discounts);

        refreshMeta("calculate");
        primeCatalogs(); // авто-загрузка списков

        modalEl.addEventListener("hidden.bs.modal", ()=>{}, { once: true });
    }

    // -------- mount on modal show --------
    document.addEventListener("shown.bs.modal", (ev) => {
        const el = ev.target;
        if (!el || el.id !== "modalLoyalty") return;
        if (el.__bound) return; el.__bound = true;
        bindOnce(el);
    });
})();
