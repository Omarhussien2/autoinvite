(function () {
    const REDUCTION_LABELS = {
        send_window_capacity: 'سعة نافذة الإرسال',
        hard_daily_limit: 'الحد اليومي الأعلى',
        safety_distribution: 'توزيع الأمان',
        remaining_contacts: 'العدد المتبقي',
    };
    let campaignId;
    let currentPlanHash = null;

    function initCampaignPreflight(currentCampaignId) {
        campaignId = currentCampaignId;
        document.getElementById('run-preflight').addEventListener('click', runPreflight);
        document.getElementById('approve-plan').addEventListener('click', approvePlan);
        const form = document.getElementById('campaign-form');
        form.addEventListener('input', markPlanDirty);
        form.addEventListener('change', markPlanDirty);
        ['schedule-immediate', 'schedule-later', 'schedule-fixed', 'schedule-smart'].forEach(id => {
            const button = document.getElementById(id);
            if (button) button.addEventListener('click', markPlanDirty);
        });
        runPreflight();
    }

    function markPlanDirty() {
        currentPlanHash = null;
        document.getElementById('approve-plan').disabled = true;
        document.getElementById('run-preflight').disabled = true;
        showError('توجد تعديلات غير محفوظة. احفظ الحملة أولًا ثم شغّل الفحص على بيانات الخادم.');
    }

    async function runPreflight() {
        setLoading(true);
        hideError();
        try {
            const payload = await postJson(`/api/campaigns/${campaignId}/preflight`, {});
            renderPreflight(payload.preflight);
        } catch (error) {
            showError(error.message);
        } finally {
            setLoading(false);
        }
    }

    function renderPreflight(preflight) {
        currentPlanHash = preflight.planHash;
        Object.entries(preflight.counts || {}).forEach(([key, value]) => setText(`preflight-${key}`, value));
        renderPreviews(preflight.previews || []);
        renderPlan(preflight.plan || []);
        setText('plan-hash-summary', `معرّف الخطة: ${preflight.planHash}`);
        document.getElementById('preflight-results').classList.remove('hidden');
        document.getElementById('approve-plan').disabled = false;
    }

    function renderPreviews(previews) {
        const container = document.getElementById('preflight-previews');
        container.innerHTML = '';
        previews.forEach(preview => {
            const card = document.createElement('article');
            card.className = 'min-w-0 rounded-xl border border-gray-100 bg-gray-50 p-3';
            const name = document.createElement('p');
            name.className = 'font-semibold text-xs text-gray-900 break-words';
            name.textContent = preview.finalName;
            const text = document.createElement('p');
            text.className = 'text-[11px] text-gray-600 mt-2 leading-5 break-words';
            text.textContent = preview.text;
            const imageState = document.createElement('p');
            imageState.className = 'text-[10px] text-brand-dark mt-2';
            imageState.textContent = preview.image && preview.image.possible ? 'تم التحقق من إمكانية توليد الصورة' : 'تعذر التحقق من الصورة';
            card.append(name, text, imageState);
            container.appendChild(card);
        });
    }

    function renderPlan(plan) {
        const body = document.getElementById('preflight-plan');
        body.innerHTML = '';
        plan.forEach(day => {
            const row = document.createElement('tr');
            [day.batchNumber, day.scheduledLocal, day.messageCount, day.requestedCount, REDUCTION_LABELS[day.reductionReason] || 'لا يوجد'].forEach(value => {
                const cell = document.createElement('td');
                cell.className = 'p-3 whitespace-nowrap text-gray-700';
                cell.textContent = value;
                row.appendChild(cell);
            });
            body.appendChild(row);
        });
    }

    async function approvePlan() {
        const button = document.getElementById('approve-plan');
        button.disabled = true;
        button.textContent = 'جاري الاعتماد';
        try {
            await postJson(`/api/campaigns/${campaignId}/approve-plan`, { planHash: currentPlanHash });
            button.textContent = 'تم اعتماد الخطة';
            showToast('success', 'تم اعتماد الخطة وتجهيز الجدولة');
        } catch (error) {
            button.disabled = false;
            button.textContent = 'اعتماد الخطة';
            showError(error.message);
        }
    }

    async function postJson(url, body) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
        });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || 'تعذر تنفيذ الطلب');
        return payload;
    }

    function setLoading(loading) {
        document.getElementById('preflight-loading').classList.toggle('hidden', !loading);
        document.getElementById('run-preflight').disabled = loading;
    }

    function showError(message) {
        const element = document.getElementById('preflight-error');
        element.textContent = message;
        element.classList.remove('hidden');
    }

    function hideError() {
        document.getElementById('preflight-error').classList.add('hidden');
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }

    window.initCampaignPreflight = initCampaignPreflight;
})();
