/**
 * AutoInvite — Campaign Runner
 * Manages the real-time log panel, start/stop controls,
 * and live counters via Socket.IO.
 */

(function () {

    let _socket, _campaignId;
    let successCount = 0, failCount = 0, totalSent = 0;
    let isRunning = false;

    /* ──────────── Init ──────────── */
    function initRunner(socket, campaignId) {
        _socket = socket;
        _campaignId = campaignId;

        bindButtons();
        bindSocketEvents();
        checkInitialWhatsAppStatus();
    }

    /* ──────────── Socket.IO Events ──────────── */
    function bindSocketEvents() {
        _socket.on('log', function (data) {
            appendLog(data.message, data.type);

            if (data.type === 'SUCCESS') {
                successCount++;
                totalSent++;
            } else if (data.type === 'ERROR') {
                failCount++;
                totalSent++;
            }

            updateCounters();
        });

        _socket.on('done', function () {
            setRunningState(false);
            appendLog('تم الانتهاء من تنفيذ الحملة ✅', 'DONE');
            setStatus('مكتملة');
            showToast('انتهت الحملة بنجاح 🎉', 'success');
        });

        _socket.on('error', function (msg) {
            appendLog('خطأ: ' + msg, 'ERROR');
            setRunningState(false);
            setStatus('خطأ');
        });

        _socket.on('ready', function (data) {
            updateWaStatusBadge('connected');
        });

        _socket.on('qr', function () {
            updateWaStatusBadge('qr');
        });

        _socket.on('disconnected', function () {
            updateWaStatusBadge('disconnected');
        });

        _socket.on('working_state', function (state) {
            setRunningState(state);
        });
    }

    /* ──────────── Button Handlers ──────────── */
    function bindButtons() {
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');
        const testBtn = document.getElementById('test-btn');
        const clearBtn = document.getElementById('clear-logs');

        if (startBtn) {
            startBtn.addEventListener('click', startCampaign);
        }

        if (stopBtn) {
            stopBtn.addEventListener('click', stopCampaign);
        }

        if (testBtn) {
            testBtn.addEventListener('click', sendTestMessage);
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                const logsArea = document.getElementById('logs-area');
                if (logsArea) logsArea.innerHTML = '<p class="text-gray-600 italic text-xs">تم مسح السجلات...</p>';
                document.getElementById('log-count').textContent = '0 سجل';
            });
        }
    }

    /* ──────────── Campaign Control ──────────── */
    async function startCampaign() {
        const startRow = parseInt(document.getElementById('startRow').value) || 1;
        const endRow = parseInt(document.getElementById('endRow').value) || 100;

        if (startRow < 1 || endRow < startRow) {
            showToast('تأكد من نطاق الصفوف (من ← إلى)', 'error');
            return;
        }

        // Reset counters
        successCount = 0;
        failCount = 0;
        totalSent = 0;
        updateCounters();

        appendLog(`🚀 بدء الحملة من صف ${startRow} إلى صف ${endRow}...`, 'INFO');

        try {
            const res = await fetch('/api/whatsapp/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startRow, endRow, campaignId: _campaignId })
            });
            const data = await res.json();

            if (!data.success) {
                showToast('خطأ: ' + data.message, 'error');
                appendLog('فشل البدء: ' + data.message, 'ERROR');
            } else {
                setRunningState(true);
                setStatus('جارية');
                showToast('بدأت الحملة 🚀', 'success');
            }
        } catch (err) {
            showToast('فشل الاتصال بالسيرفر', 'error');
            appendLog('خطأ في الاتصال: ' + err.message, 'ERROR');
        }
    }

    async function stopCampaign() {
        if (!confirm('هل تريد إيقاف الحملة؟')) return;
        try {
            const res = await fetch('/api/whatsapp/stop', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                appendLog('⏹️ تم طلب الإيقاف، في انتظار توقف الإرسال الحالي...', 'WARN');
                setStatus('متوقفة');
                setRunningState(false);
            }
        } catch (err) {
            showToast('فشل الإيقاف', 'error');
        }
    }

    async function sendTestMessage() {
        const phone = document.getElementById('testPhone').value.trim();
        if (!phone) {
            showToast('أدخل رقم الهاتف للتجربة', 'warning');
            return;
        }

        const btn = document.getElementById('test-btn');
        btn.textContent = '...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/whatsapp/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });
            const data = await res.json();

            if (data.success) {
                showToast('تم إرسال رسالة التجربة ✅', 'success');
                appendLog(`تجربة: تم إرسال رسالة تجريبية إلى ${phone}`, 'SUCCESS');
            } else {
                showToast('فشلت التجربة: ' + data.message, 'error');
                appendLog('فشل التجربة: ' + data.message, 'ERROR');
            }
        } catch (err) {
            showToast('خطأ في الاتصال', 'error');
        } finally {
            btn.textContent = 'تجربة';
            btn.disabled = false;
        }
    }

    /* ──────────── UI Helpers ──────────── */
    function appendLog(message, type) {
        const logsArea = document.getElementById('logs-area');
        if (!logsArea) return;

        // Remove placeholder text on first real log
        const placeholder = logsArea.querySelector('p.italic');
        if (placeholder) placeholder.remove();

        const line = document.createElement('p');
        line.className = `log-${type || 'INFO'} mb-1`;

        const time = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        line.innerHTML = `<span class="text-gray-600 text-[10px] ml-2 font-mono">${time}</span>${escapeHtml(message)}`;
        logsArea.appendChild(line);
        logsArea.scrollTop = logsArea.scrollHeight;

        // Update log count
        const countEl = document.getElementById('log-count');
        if (countEl) {
            const current = parseInt(countEl.textContent) || 0;
            countEl.textContent = (current + 1) + ' سجل';
        }
    }

    function updateCounters() {
        const totalEl = document.getElementById('total-sent');
        const successEl = document.getElementById('success-count');
        const failEl = document.getElementById('fail-count');
        if (totalEl) totalEl.textContent = totalSent;
        if (successEl) successEl.textContent = successCount;
        if (failEl) failEl.textContent = failCount;
    }

    function setRunningState(running) {
        isRunning = running;
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');
        if (!startBtn || !stopBtn) return;

        if (running) {
            startBtn.classList.add('hidden');
            stopBtn.classList.remove('hidden');
        } else {
            startBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');
        }
    }

    function setStatus(text) {
        const el = document.getElementById('run-status');
        if (el) el.textContent = text;
    }

    function updateWaStatusBadge(state) {
        const badge = document.getElementById('wa-status-badge');
        const dot = document.getElementById('wa-status-dot');
        const statusText = document.getElementById('wa-status-text');
        if (!badge || !dot || !statusText) return;

        if (state === 'connected') {
            dot.className = 'w-2 h-2 rounded-full bg-brand-green status-pulse';
            statusText.textContent = 'متصل';
            badge.className = 'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border bg-brand-light border-brand-green text-brand-dark';
        } else if (state === 'qr') {
            dot.className = 'w-2 h-2 rounded-full bg-amber-400';
            statusText.textContent = 'في انتظار الربط';
            badge.className = 'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border bg-amber-50 border-amber-200 text-amber-700';
        } else {
            dot.className = 'w-2 h-2 rounded-full bg-gray-300';
            statusText.textContent = 'غير متصل';
            badge.className = 'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border bg-gray-50 border-gray-200 text-gray-500';
        }
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ──────────── WhatsApp Init Check ──────────── */
    async function checkInitialWhatsAppStatus() {
        try {
            const res = await fetch('/api/whatsapp/status');
            const data = await res.json();
            if (data.success && data.state) {
                const status = data.state.status;
                if (status === 'READY') {
                    updateWaStatusBadge('connected');
                } else if (status === 'QUERY_QR') {
                    updateWaStatusBadge('qr');
                } else {
                    updateWaStatusBadge('disconnected');
                }
            }
        } catch (e) {
            // ignore
        }
    }

    /* ──────────── Expose ──────────── */
    window.initRunner = initRunner;

})();
