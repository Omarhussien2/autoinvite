/**
 * Azzam — Campaign Visual Editor
 * Handles: image upload preview, draggable name overlay on canvas,
 * font size/color controls, and form submission (multipart).
 */

(function () {
    /* ──────────── State ──────────── */
    let canvas, ctx;
    let bgImage = null;
    let fullImageWidth = 0;   // original image width (for scale-up on save)
    let nameX = 0, nameY = 0;
    let isDragging = false;
    let dragOffsetX = 0, dragOffsetY = 0;
    let fontSize = 60;
    let fontColor = '#000000';
    let previewName = 'محمد أحمد';  // realistic Arabic name for preview

    // Font must match backend generator.js — Readex Pro (loaded from Google Fonts)
    const CANVAS_FONT_FAMILY = "'Readex Pro', sans-serif";

    /* ──────────── Enable canvas UI ──────────── */
    function enableCanvasUI() {
        const container = document.getElementById('canvas-container');
        if (container) {
            container.classList.remove('opacity-50', 'pointer-events-none');
        }
        const controls = document.getElementById('canvas-controls');
        if (controls) {
            controls.classList.remove('opacity-50', 'pointer-events-none');
        }
        const fsInput = document.getElementById('fontSize');
        const fcInput = document.getElementById('fontColor');
        if (fsInput) fsInput.disabled = false;
        if (fcInput) fcInput.disabled = false;
    }

    /* ──────────── Init ──────────── */
    function initCampaignEditor() {
        canvas = document.getElementById('previewCanvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');

        fontSize = parseInt(document.getElementById('fontSize').value) || 60;
        fontColor = document.getElementById('fontColor').value || '#000000';

        bindEvents();

        // If editing existing campaign, load existing image
        const campaignData = window.CAMPAIGN_DATA;
        if (campaignData && campaignData.template_path) {
            loadImageFromUrl('/uploads/' + campaignData.template_path.split('/').pop(), campaignData.canvas_config);
        }
    }

    /* ──────────── Event binding ──────────── */
    function bindEvents() {
        // Image upload
        const imgInput = document.getElementById('imgUpload');
        if (imgInput) imgInput.addEventListener('change', onImageUpload);

        // Contacts file upload — show filename feedback + CSV header validation
        const contactsInput = document.getElementById('contactsUpload');
        const contactsLabel = document.getElementById('contactsUploadLabel');
        if (contactsInput && contactsLabel) {
            contactsInput.addEventListener('change', function () {
                if (this.files && this.files[0]) {
                    const file = this.files[0];
                    const fileName = file.name;
                    const fileSize = (file.size / 1024).toFixed(0);
                    const ext = fileName.split('.').pop().toLowerCase();

                    // Basic feedback
                    contactsLabel.textContent = fileName + ' (' + fileSize + ' KB)';
                    contactsLabel.classList.remove('text-gray-500', 'border-gray-300');
                    contactsLabel.classList.add('text-brand-green', 'border-brand-green');

                    // CSV Header Validation
                    if (ext === 'csv') {
                        const reader = new FileReader();
                        reader.onload = function (e) {
                            const firstLine = e.target.result.split('\n')[0].toLowerCase();
                            const hasName = /name|الاسم|اسم|fullname|full_name/.test(firstLine);
                            const hasPhone = /phone|mobile|رقم|جوال|هاتف|telephone|number/.test(firstLine);

                            if (!hasName || !hasPhone) {
                                showToast('error', 'الملف لا يحتوي على الأعمدة المطلوبة (الاسم، الجوال)');
                                contactsLabel.textContent = 'تنسيق غير صالح';
                                contactsLabel.classList.remove('text-brand-green', 'border-brand-green');
                                contactsLabel.classList.add('text-red-500', 'border-red-300');
                                contactsInput.value = '';
                            }
                        };
                        reader.readAsText(file.slice(0, 2048)); // Read first 2KB for headers
                    }
                }
            });
        }

        // Controls
        document.getElementById('fontSize').addEventListener('input', function () {
            fontSize = parseInt(this.value) || 60;
            drawCanvas();
        });
        document.getElementById('fontColor').addEventListener('input', function () {
            fontColor = this.value;
            drawCanvas();
        });

        // Canvas mouse events (drag)
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', () => { isDragging = false; canvas.style.cursor = 'default'; });
        canvas.addEventListener('mouseleave', () => { if (!isDragging) canvas.style.cursor = 'default'; });

        // Touch events (mobile) — passive:false to prevent scroll during drag
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', () => { isDragging = false; });

        // Form submission
        const form = document.getElementById('campaign-form');
        if (form) form.addEventListener('submit', onFormSubmit);

        // Add message variation button
        const addMsgBtn = document.getElementById('addMsgBtn');
        if (addMsgBtn) {
            addMsgBtn.addEventListener('click', addMessageVariation);
            // Bind remove buttons for existing messages
            document.querySelectorAll('.remove-msg').forEach(btn => bindRemoveBtn(btn));
            document.querySelectorAll('.msg-weight').forEach(select => {
                select.addEventListener('change', updateMessageRatios);
            });
            updateMessageRatios();
        }
    }

    /* ──────────── Image Upload ──────────── */
    function onImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (ev) {
            const img = new Image();
            img.onload = function () {
                bgImage = img;
                fullImageWidth = img.width;

                // Scale canvas to image, max 600px wide
                const maxW = 600;
                const scale = Math.min(1, maxW / img.width);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;

                // Initial name position: center horizontally, 70% down
                nameX = canvas.width / 2;
                nameY = canvas.height * 0.70;

                // Show canvas, hide placeholder
                canvas.classList.remove('hidden');
                const ph = document.getElementById('placeholder-text');
                if (ph) ph.classList.add('hidden');

                enableCanvasUI();
                drawCanvas();
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    function loadImageFromUrl(url, canvasConfigRaw) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            bgImage = img;
            fullImageWidth = img.width;
            const maxW = 600;
            const scale = Math.min(1, maxW / img.width);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            // Load saved position — coordinates are stored in full-image space, scale to canvas
            const scaleDown = canvas.width / img.width;
            if (canvasConfigRaw) {
                try {
                    const cc = typeof canvasConfigRaw === 'string' ? JSON.parse(canvasConfigRaw) : canvasConfigRaw;
                    nameX = cc.x != null ? cc.x * scaleDown : canvas.width / 2;
                    nameY = cc.y != null ? cc.y * scaleDown : canvas.height * 0.70;
                    fontSize = cc.fontSize ? Math.round(cc.fontSize * scaleDown) : fontSize;
                    fontColor = cc.color || fontColor;
                    document.getElementById('fontSize').value = fontSize;
                    document.getElementById('fontColor').value = fontColor;
                } catch (e) {
                    nameX = canvas.width / 2;
                    nameY = canvas.height * 0.70;
                }
            } else {
                nameX = canvas.width / 2;
                nameY = canvas.height * 0.70;
            }

            canvas.classList.remove('hidden');
            const ph = document.getElementById('placeholder-text');
            if (ph) ph.classList.add('hidden');

            enableCanvasUI();
            drawCanvas();
        };
        img.onerror = () => console.warn('Could not load template image from URL:', url);
        img.src = url;
    }

    /* ──────────── Draw ──────────── */
    function drawCanvas() {
        if (!ctx || !bgImage) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Scale image to fit canvas
        ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);

        // Draw name text — use Readex Pro to match backend generator
        ctx.save();
        ctx.font = `bold ${fontSize}px ${CANVAS_FONT_FAMILY}`;
        ctx.fillStyle = fontColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.direction = 'rtl';  // proper Arabic text shaping

        // Shadow for readability on any background
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 2;

        ctx.fillText(previewName, nameX, nameY);
        ctx.restore();

        // Draw drag handle indicator — measure actual text width (accurate for Arabic)
        ctx.save();
        ctx.font = `bold ${fontSize}px ${CANVAS_FONT_FAMILY}`;
        const textMetrics = ctx.measureText(previewName);
        const textW = textMetrics.width;
        ctx.strokeStyle = 'rgba(0, 200, 83, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(nameX - textW / 2 - 10, nameY - fontSize / 2 - 6, textW + 20, fontSize + 12);
        ctx.restore();
    }

    /* ──────────── Drag logic ──────────── */
    function getTextHitBox() {
        // Measure actual text width for accurate hit testing (critical for Arabic)
        ctx.font = `bold ${fontSize}px ${CANVAS_FONT_FAMILY}`;
        const textW = ctx.measureText(previewName).width;
        const hitH = fontSize + 16;
        return { halfW: Math.max(50, textW / 2) + 10, halfH: hitH / 2 };
    }

    function getCanvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    function onMouseDown(e) {
        if (!bgImage) return;
        const pos = getCanvasPos(e);
        const hit = getTextHitBox();
        if (Math.abs(pos.x - nameX) < hit.halfW && Math.abs(pos.y - nameY) < hit.halfH) {
            isDragging = true;
            dragOffsetX = pos.x - nameX;
            dragOffsetY = pos.y - nameY;
            canvas.style.cursor = 'grabbing';
        }
    }

    function onMouseMove(e) {
        if (!bgImage) return;
        // Change cursor on hover over text
        const pos = getCanvasPos(e);
        if (isDragging) {
            e.preventDefault();
            nameX = Math.max(fontSize, Math.min(canvas.width - fontSize, pos.x - dragOffsetX));
            nameY = Math.max(fontSize, Math.min(canvas.height - fontSize, pos.y - dragOffsetY));
            drawCanvas();
        } else {
            const hit = getTextHitBox();
            const isOverText = Math.abs(pos.x - nameX) < hit.halfW && Math.abs(pos.y - nameY) < hit.halfH;
            canvas.style.cursor = isOverText ? 'grab' : 'default';
        }
    }

    function onTouchStart(e) {
        if (!bgImage || !e.touches[0]) return;
        const pos = getCanvasPos(e.touches[0]);
        const hit = getTextHitBox();
        if (Math.abs(pos.x - nameX) < hit.halfW && Math.abs(pos.y - nameY) < hit.halfH) {
            isDragging = true;
            dragOffsetX = pos.x - nameX;
            dragOffsetY = pos.y - nameY;
        }
    }

    function onTouchMove(e) {
        if (!isDragging || !e.touches[0]) return;
        e.preventDefault();
        const pos = getCanvasPos(e.touches[0]);
        nameX = Math.max(fontSize, Math.min(canvas.width - fontSize, pos.x - dragOffsetX));
        nameY = Math.max(fontSize, Math.min(canvas.height - fontSize, pos.y - dragOffsetY));
        drawCanvas();
    }

    /* ──────────── Message Variations ──────────── */
    function addMessageVariation() {
        const list = document.getElementById('messages-list');
        const box = document.createElement('div');
        box.className = 'message-box relative group bg-gray-50/50 p-4 rounded-xl border border-gray-100 hover:border-brand-green transition';
        box.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <select class="msg-weight text-[10px] bg-white border border-gray-200 rounded px-2 py-1 outline-none">
                    <option value="3">عالي (50%)</option>
                    <option value="2">متوسط (30%)</option>
                    <option value="1">منخفض (20%)</option>
                </select>
                <button type="button" class="remove-msg text-gray-300 hover:text-red-500 transition">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>
            <textarea name="message[]" rows="2" placeholder="حياك الله يا [الاسم]..."
                class="w-full bg-transparent border-none text-sm focus:ring-0 resize-none outline-none"></textarea>
        `;
        list.appendChild(box);
        bindRemoveBtn(box.querySelector('.remove-msg'));
        box.querySelector('.msg-weight').addEventListener('change', updateMessageRatios);
        updateMessageRatios();
        box.querySelector('textarea').focus();
    }

    function bindRemoveBtn(btn) {
        btn.addEventListener('click', function () {
            const boxes = document.querySelectorAll('.message-box');
            if (boxes.length > 1) {
                this.closest('.message-box').remove();
            } else {
                this.closest('.message-box').querySelector('textarea').value = '';
            }
            updateMessageRatios();
        });
    }

    function updateMessageRatios() {
        const boxes = Array.from(document.querySelectorAll('.message-box'));
        const weights = boxes.map(box => {
            const select = box.querySelector('.msg-weight');
            return Math.max(1, parseInt(select && select.value, 10) || 1);
        });
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;

        boxes.forEach((box, index) => {
            const header = box.querySelector('.flex.items-center.justify-between');
            const select = box.querySelector('.msg-weight');
            if (!header || !select) return;

            let ratio = box.querySelector('.msg-ratio');
            if (!ratio) {
                ratio = document.createElement('span');
                ratio.className = 'msg-ratio text-[10px] text-gray-400 mr-2';
                select.insertAdjacentElement('afterend', ratio);
            }

            ratio.textContent = Math.round((weights[index] / totalWeight) * 100) + '%';
        });
    }

    /* ──────────── Form Submit ──────────── */
    function getContactRepairMessage(report) {
        if (!report || !report.validCount) return '';
        const parts = [`تم تجهيز ملف الأرقام: ${report.validCount} جهة اتصال صالحة`];
        if (report.repairedFormat) parts.push('تم توحيد التنسيق تلقائيا');
        if (report.duplicateCount) parts.push(`تم حذف ${report.duplicateCount} رقم مكرر`);
        if (report.invalidCount) parts.push(`تم استبعاد ${report.invalidCount} صف غير صالح`);
        return parts.join('، ') + '.';
    }

    async function onFormSubmit(e) {
        e.preventDefault();

        const btn = document.getElementById('save-btn');
        const origText = btn.textContent;
        btn.textContent = 'جاري الحفظ...';
        btn.disabled = true;

        try {
            const formData = new FormData();

            // Campaign name
            formData.append('name', document.getElementById('campName').value.trim());

            // Files
            const imgFile = document.getElementById('imgUpload').files[0];
            if (imgFile) formData.append('template', imgFile);

            const contactsFile = document.getElementById('contactsUpload').files[0];
            if (contactsFile) formData.append('contacts', contactsFile);

            // Voice note file (only if voice mode is active)
            const isVoiceMode = window.CAMPAIGN_MODE === 'voice';
            const voicenoteFile = document.getElementById('voicenoteUpload')
                ? document.getElementById('voicenoteUpload').files[0]
                : null;
            if (isVoiceMode && voicenoteFile) {
                formData.append('voicenote', voicenoteFile);
            }

            // Messages — read from the active tab's list
            const messages = [];
            if (isVoiceMode) {
                // Voice mode: optional caption from voice message boxes
                document.querySelectorAll('.message-box-voice').forEach(box => {
                    const text = box.querySelector('textarea').value.trim();
                    if (text) messages.push({ text, weight: 3 });
                });
            } else {
                document.querySelectorAll('.message-box').forEach(box => {
                    const text = box.querySelector('textarea').value.trim();
                    const weight = box.querySelector('.msg-weight').value;
                    if (text) messages.push({ text, weight: parseInt(weight) });
                });
            }
            formData.append('message_templates', JSON.stringify(messages));

            // Canvas config — scale from editor canvas to full image coordinates
            if (bgImage) {
                const scaleUp = bgImage.width / canvas.width;
                const canvasConfig = {
                    x: Math.round(nameX * scaleUp),
                    y: Math.round(nameY * scaleUp),
                    fontSize: Math.round(fontSize * scaleUp),
                    color: fontColor
                };
                formData.append('canvas_config', JSON.stringify(canvasConfig));
            }

            // Scheduling — send both local wall-clock time and timezone so the server
            // can store the exact intended instant in UTC.
            const scheduleMode = window.CAMPAIGN_SCHEDULE_MODE || 'immediate';
            const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Riyadh';
            formData.append('schedule_mode', scheduleMode);
            formData.append('timezone', browserTimezone);

            if (scheduleMode === 'later') {
                const dateVal = document.getElementById('schedule-date').value;
                const timeVal = document.getElementById('schedule-time').value;
                if (dateVal && timeVal) {
                    // Create Date from user's local timezone input, then convert to UTC ISO
                    const scheduledLocal = dateVal + 'T' + timeVal;
                    const localDate = new Date(scheduledLocal);
                    if (isNaN(localDate.getTime())) {
                        showToast('error', 'تاريخ أو وقت غير صالح');
                        btn.textContent = origText;
                        btn.disabled = false;
                        return;
                    }
                    formData.append('scheduled_at_local', scheduledLocal);
                    formData.append('scheduled_at', localDate.toISOString());
                } else {
                    showToast('error', 'يرجى اختيار التاريخ والوقت');
                    btn.textContent = origText;
                    btn.disabled = false;
                    return;
                }
            } else if (scheduleMode === 'smart' || scheduleMode === 'fixed') {
                formData.append('smart_schedule_enabled', 'true');
                formData.append('daily_limit', document.getElementById('dailyLimit').value || '100');
                formData.append('safety_mode', document.getElementById('safetyMode').value || 'balanced');
                formData.append('send_window_start', document.getElementById('sendWindowStart').value || '10:00');
                formData.append('send_window_end', document.getElementById('sendWindowEnd').value || '20:00');
                formData.append('min_delay_seconds', document.getElementById('minDelaySeconds').value || '120');
                formData.append('max_delay_seconds', document.getElementById('maxDelaySeconds').value || '240');
            }

            // Validate: voice mode requires an audio file (create only)
            const campaignData = window.CAMPAIGN_DATA;
            if (isVoiceMode && !voicenoteFile && !campaignData) {
                showToast('error', 'يرجى رفع ملف صوتي للحملة الصوتية');
                btn.textContent = origText;
                btn.disabled = false;
                return;
            }

            // Determine if create or update
            const method = campaignData ? 'PUT' : 'POST';
            const url = campaignData ? `/api/campaigns/${campaignData.id}` : '/api/campaigns';

            const res = await fetch(url, { method, body: formData });
            const result = await res.json();

            if (result.success) {
                const repairMessage = getContactRepairMessage(result.contactRepair);
                if (repairMessage) {
                    sessionStorage.setItem('contactRepairNotice', JSON.stringify({
                        type: result.contactRepair.invalidCount ? 'warning' : 'success',
                        message: repairMessage
                    }));
                }
                showToast('success', 'تم حفظ الحملة بنجاح');
                const savedCampaignId = result.campaignId || (campaignData && campaignData.id);
                setTimeout(() => {
                    window.location.href = savedCampaignId ? `/campaigns/${savedCampaignId}/edit` : '/campaigns';
                }, 1000);
            } else {
                const repairMessage = getContactRepairMessage(result.contactRepair);
                showToast('error', (result.message || 'فشل الحفظ') + (repairMessage ? ' ' + repairMessage : ''));
                btn.textContent = origText;
                btn.disabled = false;
            }
        } catch (err) {
            showToast('error', 'فشل الاتصال بالسيرفر');
            btn.textContent = origText;
            btn.disabled = false;
        }
    }

    /* ──────────── Expose ──────────── */
    window.initCampaignEditor = initCampaignEditor;
})();
