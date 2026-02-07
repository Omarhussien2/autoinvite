const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');
const imgUpload = document.getElementById('imgUpload');
const fontSizeInput = document.getElementById('fontSize');
const fontColorInput = document.getElementById('fontColor');
const form = document.getElementById('campaign-form');
const addMsgBtn = document.getElementById('addMsgBtn');
const msgsList = document.getElementById('messages-list');

// State
let currentImage = null;
let textPos = { x: 100, y: 100 };
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

// 1. Handle Image Upload
imgUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            currentImage = img;
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;

            // Set initial text position to center
            textPos = { x: canvas.width / 2, y: canvas.height / 2 };

            draw();
            document.getElementById('placeholder-text').style.display = 'none';
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

// 2. Draw Function
function draw() {
    if (!currentImage) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Image
    ctx.drawImage(currentImage, 0, 0);

    // Draw Placeholder Text
    const fontSize = fontSizeInput.value || 60;
    const color = fontColorInput.value || '#000000';

    ctx.font = `bold ${fontSize}px 'IBM Plex Sans Arabic', Arial`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText('الاسم هنا', textPos.x, textPos.y);

    // Draw Box around text for drag hint
    const metrics = ctx.measureText('الاسم هنا');
    const w = metrics.width;
    const h = parseInt(fontSize);

    ctx.strokeStyle = 'rgba(37, 211, 102, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(textPos.x - w / 2 - 10, textPos.y - h / 2 - 10, w + 20, h + 20);
    ctx.setLineDash([]);
}

// 3. Interactions (Drag & Drop)
function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
        x: (evt.clientX - rect.left) * scaleX,
        y: (evt.clientY - rect.top) * scaleY
    };
}

canvas.addEventListener('mousedown', (e) => {
    const pos = getMousePos(e);
    const dist = Math.sqrt(Math.pow(pos.x - textPos.x, 2) + Math.pow(pos.y - textPos.y, 2));

    if (dist < 100) {
        isDragging = true;
        dragOffset = { x: pos.x - textPos.x, y: pos.y - textPos.y };
        canvas.style.cursor = 'grabbing';
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (isDragging) {
        const pos = getMousePos(e);
        textPos.x = pos.x - dragOffset.x;
        textPos.y = pos.y - dragOffset.y;
        draw();
    }
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.style.cursor = 'default';
});

// Update on inputs change
fontSizeInput.addEventListener('input', draw);
fontColorInput.addEventListener('input', draw);

// 4. Message Rotation Logic
addMsgBtn.addEventListener('click', () => {
    const div = document.createElement('div');
    div.className = 'message-box';
    div.innerHTML = `
        <span class="remove-msg">x</span>
        <div style="display: flex; gap: 10px; margin-bottom: 5px;">
            <select class="msg-weight" style="background: rgba(255,255,255,0.1); border: 1px solid var(--border-color); color: white; padding: 5px; border-radius: 5px;">
                <option value="3">🌟 أولوية عالية (50%)</option>
                <option value="2">⚖️ متوسطة (30%)</option>
                <option value="1">🔽 منخفضة (20%)</option>
            </select>
        </div>
        <textarea name="message[]" placeholder="صيغة ثانية للرسالة..."></textarea>
    `;
    msgsList.appendChild(div);

    div.querySelector('.remove-msg').addEventListener('click', () => div.remove());
});

// 5. Handle Edit Mode (Load Campaign)
const urlParams = new URLSearchParams(window.location.search);
const campaignId = urlParams.get('id');

async function loadCampaignForEdit() {
    if (!campaignId) return;

    try {
        const res = await fetch(`/api/campaigns/${campaignId}`);
        const data = await res.json();
        if (data.success) {
            const campaign = data.campaign;
            document.getElementById('campName').value = campaign.name;

            // Load canvas config
            const config = JSON.parse(campaign.canvas_config);
            fontSizeInput.value = config.fontSize;
            fontColorInput.value = config.color;
            textPos = { x: config.x, y: config.y };

            // Load messages
            const messages = JSON.parse(campaign.message_templates);
            msgsList.innerHTML = ''; // Clear default
            messages.forEach(m => {
                const div = document.createElement('div');
                div.className = 'message-box';
                div.innerHTML = `
                    <span class="remove-msg">x</span>
                    <div style="display: flex; gap: 10px; margin-bottom: 5px;">
                        <select class="msg-weight" style="background: rgba(255,255,255,0.1); border: 1px solid var(--border-color); color: white; padding: 5px; border-radius: 5px;">
                            <option value="3" ${m.weight == 3 ? 'selected' : ''}>🌟 أولوية عالية (50%)</option>
                            <option value="2" ${m.weight == 2 ? 'selected' : ''}>⚖️ متوسطة (30%)</option>
                            <option value="1" ${m.weight == 1 ? 'selected' : ''}>🔽 منخفضة (20%)</option>
                        </select>
                    </div>
                    <textarea name="message[]">${m.text}</textarea>
                `;
                msgsList.appendChild(div);
                div.querySelector('.remove-msg').addEventListener('click', () => div.remove());
            });

            // Try to load image
            if (campaign.template_path) {
                // In a real cloud env, this would be an accessible URL. 
                // For local, we show a notice that they might need to re-upload if it's not a browser-safe path
                // But for now, just tell them it's loaded.
                document.getElementById('placeholder-text').textContent = '⚠️ تم تحميل إعدادات النص. يرجى إعادة رفع الصورة إذا أردت تغييرها.';
            }
        }
    } catch (err) {
        console.error('Error loading campaign:', err);
    }
}

loadCampaignForEdit();

// 6. Submit Form
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // In search of currentImage if editing, we might allow no new image
    if (!currentImage && !campaignId) {
        alert('يا الغالي، لازم ترفع صورة الدعوة أول!');
        return;
    }

    const formData = new FormData();
    formData.append('name', document.getElementById('campName').value);

    if (imgUpload.files[0]) {
        formData.append('template', imgUpload.files[0]);
    }

    if (document.getElementById('contactsUpload').files[0]) {
        formData.append('contacts', document.getElementById('contactsUpload').files[0]);
    } else if (!campaignId) {
        alert('لازم ترفع ملف الأسماء (Excel/CSV)!');
        return;
    }

    const messages = [];
    document.querySelectorAll('.message-box').forEach(box => {
        const text = box.querySelector('textarea').value.trim();
        const weight = parseInt(box.querySelector('select').value);
        if (text) messages.push({ text, weight });
    });

    if (messages.length === 0) {
        alert('لازم تكتب رسالة وحدة على الأقل.');
        return;
    }

    formData.append('message_templates', JSON.stringify(messages));

    const config = {
        x: Math.round(textPos.x),
        y: Math.round(textPos.y),
        fontSize: parseInt(fontSizeInput.value),
        color: fontColorInput.value
    };
    formData.append('canvas_config', JSON.stringify(config));

    try {
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        btn.textContent = 'جاري الحفظ...';
        btn.disabled = true;

        const url = campaignId ? `/api/campaigns/${campaignId}` : '/api/campaigns';
        const method = campaignId ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            body: formData
        });

        const data = await res.json();

        if (data.success) {
            alert(campaignId ? 'تم تحديث الحملة بنجاح! ✨' : 'تم إنشاء الحملة بنجاح! 🚀');
            window.location.href = '/dashboard';
        } else {
            alert('صار خطأ بسيط: ' + data.message);
            btn.textContent = originalText;
            btn.disabled = false;
        }
    } catch (err) {
        console.error(err);
        alert('فشل الاتصال بالسيرفر.');
    }
});
