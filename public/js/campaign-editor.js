/**
 * AutoInvite — Campaign Visual Editor
 * Handles: image upload preview, draggable name overlay on canvas,
 * font size/color controls, and form submission (multipart).
 */

(function () {
    /* ──────────── State ──────────── */
    let canvas, ctx;
    let bgImage = null;
    let nameX = 0, nameY = 0;
    let isDragging = false;
    let dragOffsetX = 0, dragOffsetY = 0;
    let fontSize = 60;
    let fontColor = '#000000';
    let previewName = 'الاسم';

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
                    contactsLabel.textContent = '✅ ' + fileName + ' (' + fileSize + ' KB)';
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
                                showToast('⚠️ الملف لا يحتوي على الأعمدة المطلوبة (الاسم، الجوال)!', 'error');
                                contactsLabel.textContent = '❌ تنسيق غير صالح';
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
        canvas.addEventListener('mouseup', () => { isDragging = false; });
        canvas.addEventListener('mouseleave', () => { isDragging = false; });

        // Touch events (mobile)
        canvas.addEventListener('touchstart', onTouchStart, { passive: true });
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
            const maxW = 600;
            const scale = Math.min(1, maxW / img.width);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            // Load saved position if available
            if (canvasConfigRaw) {
                try {
                    const cc = typeof canvasConfigRaw === 'string' ? JSON.parse(canvasConfigRaw) : canvasConfigRaw;
                    nameX = cc.x || canvas.width / 2;
                    nameY = cc.y || canvas.height * 0.70;
                    fontSize = cc.fontSize || fontSize;
                    fontColor = cc.color || fontColor;
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

        // Draw name text
        ctx.save();
        ctx.font = `bold ${fontSize}px "IBM Plex Sans Arabic", "Cairo", sans-serif`;
        ctx.fillStyle = fontColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Shadow for readability
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        ctx.fillText(previewName, nameX, nameY);
        ctx.restore();

        // Draw drag handle indicator
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 200, 83, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        const textW = ctx.measureText(previewName).width;
        ctx.strokeRect(nameX - textW / 2 - 8, nameY - fontSize / 2 - 4, textW + 16, fontSize + 8);
        ctx.restore();
    }

    /* ──────────── Drag logic ──────────── */
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
        const hitW = Math.max(100, fontSize * previewName.length * 0.6);
        const hitH = fontSize + 16;
        if (Math.abs(pos.x - nameX) < hitW / 2 && Math.abs(pos.y - nameY) < hitH / 2) {
            isDragging = true;
            dragOffsetX = pos.x - nameX;
            dragOffsetY = pos.y - nameY;
        }
    }

    function onMouseMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        const pos = getCanvasPos(e);
        nameX = Math.max(fontSize, Math.min(canvas.width - fontSize, pos.x - dragOffsetX));
        nameY = Math.max(fontSize, Math.min(canvas.height - fontSize, pos.y - dragOffsetY));
        drawCanvas();
    }

    function onTouchStart(e) {
        if (!bgImage || !e.touches[0]) return;
        const pos = getCanvasPos(e.touches[0]);
        const hitW = Math.max(100, fontSize * previewName.length * 0.6);
        const hitH = fontSize + 16;
        if (Math.abs(pos.x - nameX) < hitW / 2 && Math.abs(pos.y - nameY) < hitH / 2) {
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
                    <option value="3">🌟 عالي (50%)</option>
                    <option value="2">⚖️ متوسط (30%)</option>
                    <option value="1">🔽 منخفض (20%)</option>
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
        });
    }

    /* ──────────── Form Submit ──────────── */
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

            // Canvas config
            if (bgImage) {
                const canvasConfig = {
                    x: Math.round(nameX),
                    y: Math.round(nameY),
                    fontSize: fontSize,
                    color: fontColor
                };
                formData.append('canvas_config', JSON.stringify(canvasConfig));
            }

            // Scheduling
            if (window.CAMPAIGN_SCHEDULE_MODE === 'later') {
                const dateVal = document.getElementById('schedule-date').value;
                const timeVal = document.getElementById('schedule-time').value;
                if (dateVal && timeVal) {
                    formData.append('scheduled_at', dateVal + 'T' + timeVal + ':00');
                }
            }

            // Validate: voice mode requires an audio file (create only)
            const campaignData = window.CAMPAIGN_DATA;
            if (isVoiceMode && !voicenoteFile && !campaignData) {
                showToast('يرجى رفع ملف صوتي للحملة الصوتية', 'error');
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
                showToast('تم حفظ الحملة بنجاح ✅', 'success');
                setTimeout(() => { window.location.href = '/campaigns'; }, 1000);
            } else {
                showToast('خطأ: ' + (result.message || 'فشل الحفظ'), 'error');
                btn.textContent = origText;
                btn.disabled = false;
            }
        } catch (err) {
            showToast('فشل الاتصال بالسيرفر', 'error');
            btn.textContent = origText;
            btn.disabled = false;
        }
    }

    /* ──────────── Expose ──────────── */
    window.initCampaignEditor = initCampaignEditor;
})();
