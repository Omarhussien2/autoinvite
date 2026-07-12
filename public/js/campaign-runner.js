(function () {
    const WHATSAPP_STATES = {
        connected: ['متصل', 'bg-brand-light border-brand-green text-brand-dark', 'bg-brand-green'],
        preparing: ['جاري التجهيز', 'bg-blue-50 border-blue-200 text-blue-700', 'bg-blue-500'],
        qr_required: ['مطلوب مسح QR', 'bg-amber-50 border-amber-200 text-amber-700', 'bg-amber-500'],
        disconnected: ['غير متصل', 'bg-gray-50 border-gray-200 text-gray-600', 'bg-gray-400'],
        restricted: ['مقيد', 'bg-red-50 border-red-200 text-red-700', 'bg-red-500'],
        stopped: ['متوقف', 'bg-gray-100 border-gray-300 text-gray-700', 'bg-gray-500'],
    };
    let socket;
    let campaignId;
    let snapshot = null;
    let refreshTimer = null;

    function initRunner(socketClient, currentCampaignId) {
        socket = socketClient;
        campaignId = currentCampaignId;
        bindControls();
        bindSocketRefresh();
        refreshSnapshot();
    }

    async function refreshSnapshot() {
        try {
            const response = await fetch(`/api/campaigns/${campaignId}/execution-state`, { headers: { Accept: 'application/json' } });
            const payload = await response.json();
            if (!response.ok || !payload.success) throw new Error(payload.message || 'تعذر تحميل حالة الحملة');
            snapshot = payload.state;
            renderSnapshot(snapshot);
        } catch (error) {
            appendLog(error.message, 'ERROR');
        }
    }

    function scheduleRefresh() {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refreshSnapshot, 250);
    }

    function bindSocketRefresh() {
        ['log', 'done', 'working_state', 'session_lost', 'ready', 'qr', 'disconnected'].forEach(eventName => {
            socket.on(eventName, payload => {
                if (eventName === 'log' && payload) appendLog(payload.message, payload.type);
                scheduleRefresh();
            });
        });
    }

    function renderSnapshot(state) {
        const counts = state.counts || {};
        setText('stat-sent', counts.sent || 0);
        setText('stat-failed', counts.failed || 0);
        setText('stat-skipped', counts.skipped || 0);
        setText('stat-pending', counts.pending || 0);
        setText('stat-needs-review', counts.needs_review || 0);
        setText('stat-current-row', state.currentRow || 0);
        setText('last-success', formatLastSuccess(state.lastSuccess));
        setText('run-status', campaignStatusLabel(state.campaignStatus));
        renderWhatsAppState(state.whatsappStatus || 'disconnected');
        renderRunningControls(state.campaignStatus, state.stopState);
    }

    function renderRunningControls(campaignStatus, stopState) {
        const running = campaignStatus === 'running' || stopState === 'requested';
        document.getElementById('start-btn').classList.toggle('hidden', running);
        document.getElementById('stop-btn').classList.toggle('hidden', !running);
        const stopButton = document.getElementById('stop-btn');
        stopButton.disabled = stopState === 'requested';
        stopButton.textContent = stopState === 'requested' ? 'تم طلب الإيقاف' : 'طلب الإيقاف';
    }

    function bindControls() {
        document.getElementById('start-btn').addEventListener('click', startCampaign);
        document.getElementById('stop-btn').addEventListener('click', stopCampaign);
        document.getElementById('test-btn').addEventListener('click', sendTestMessage);
        document.getElementById('clear-logs').addEventListener('click', () => {
            document.getElementById('logs-area').innerHTML = '<p class="text-gray-600">تم مسح السجل المرئي</p>';
        });
        document.querySelectorAll('.export-recipients').forEach(button => {
            button.addEventListener('click', () => exportRecipients(button.dataset.exportStatus));
        });
    }

    async function startCampaign() {
        const startRow = parseInt(document.getElementById('startRow').value, 10) || 1;
        const endRow = parseInt(document.getElementById('endRow').value, 10) || 1;
        if (startRow < 1 || endRow < startRow) return showToast('error', 'نطاق الصفوف غير صحيح');
        try {
            await postJson('/api/whatsapp/start', { startRow, endRow, campaignId });
            showToast('success', 'بدأ تنفيذ الحملة');
            scheduleRefresh();
        } catch (error) {
            showToast('error', error.message);
        }
    }

    async function stopCampaign() {
        if (!window.confirm('هل تريد طلب إيقاف الحملة؟')) return;
        renderRunningControls('running', 'requested');
        appendLog('تم إرسال طلب الإيقاف إلى الخادم', 'WARN');
        try {
            await postJson('/api/whatsapp/stop', { campaignId });
            await refreshUntilPaused();
        } catch (error) {
            showToast('error', error.message);
            await refreshSnapshot();
        }
    }

    async function refreshUntilPaused() {
        for (let attempt = 0; attempt < 10; attempt += 1) {
            await refreshSnapshot();
            if (snapshot && snapshot.campaignStatus === 'paused') return;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    async function sendTestMessage() {
        const phone = document.getElementById('testPhone').value.trim();
        if (!phone) return showToast('warning', 'أدخل رقم الهاتف');
        try {
            await postJson('/api/whatsapp/test', { phone });
            showToast('success', 'تم إرسال رسالة الاختبار');
        } catch (error) {
            showToast('error', error.message);
        }
    }

    async function postJson(url, body) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
        });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || 'فشل الطلب');
        return payload;
    }

    function exportRecipients(status) {
        const recipients = snapshot && snapshot.recipients ? snapshot.recipients[status] || [] : [];
        if (recipients.length === 0) return showToast('warning', 'لا توجد بيانات للتنزيل');
        const rows = [['الاسم', 'رقم الهاتف', 'الحالة', 'عدد المحاولات', 'آخر خطأ']];
        recipients.forEach(recipient => rows.push([
            recipient.name || '', recipient.phone || '', status,
            recipient.attempt_count || 0, recipient.last_error || '',
        ]));
        const csv = '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `campaign-${campaignId}-${status}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function csvCell(value) {
        return `"${String(value).replace(/"/g, '""')}"`;
    }

    function appendLog(message, type) {
        if (!message) return;
        const logsArea = document.getElementById('logs-area');
        const line = document.createElement('p');
        line.className = type === 'ERROR' ? 'text-red-300' : (type === 'WARN' ? 'text-amber-300' : 'text-gray-300');
        line.textContent = `${new Date().toLocaleTimeString('ar-EG')} — ${message}`;
        logsArea.appendChild(line);
        while (logsArea.childElementCount > 300) logsArea.firstElementChild.remove();
        logsArea.scrollTop = logsArea.scrollHeight;
    }

    function renderWhatsAppState(rawState) {
        const normalized = String(rawState).toLowerCase().replace(/\s+/g, '_');
        const state = WHATSAPP_STATES[normalized] || WHATSAPP_STATES.disconnected;
        document.getElementById('wa-status-text').textContent = state[0];
        document.getElementById('wa-status-badge').className = `inline-flex self-start sm:self-auto items-center gap-2 px-3 py-2 rounded-xl border text-xs ${state[1]}`;
        document.getElementById('wa-status-dot').className = `w-2 h-2 rounded-full ${state[2]}`;
    }

    function formatLastSuccess(lastSuccess) {
        if (!lastSuccess) return 'لا يوجد بعد';
        const sentAt = new Date(lastSuccess.sent_at);
        return `${lastSuccess.name || lastSuccess.phone} — ${sentAt.toLocaleString('ar-EG')}`;
    }

    function campaignStatusLabel(status) {
        return ({ running: 'جارية', paused: 'متوقفة', completed: 'مكتملة', partial_failure: 'مكتملة جزئيًا', scheduled: 'مجدولة', failed: 'فشلت' })[status] || 'متوقفة';
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }

    window.initRunner = initRunner;
})();
