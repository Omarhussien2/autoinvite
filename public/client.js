const socket = io();

// Elements
const statusText = document.getElementById('status-text');
const qrContainer = document.getElementById('qr-container');
const qrImage = document.getElementById('qr-image');
const controlsContainer = document.getElementById('controls-container');
const logsArea = document.getElementById('logs-area');
const startBtn = document.getElementById('start-btn');
const startRowInput = document.getElementById('startRow');
const endRowInput = document.getElementById('endRow');
const usernameDisplay = document.getElementById('username-display');
const logoutBtn = document.getElementById('logout-btn');

// Auth/Identity Check
async function checkAuth() {
    try {
        const res = await fetch('/auth/me');
        const data = await res.json();
        if (data.loggedIn) {
            usernameDisplay.textContent = data.username;
            loadCampaigns(); // Load campaigns after auth
        } else {
            window.location.href = '/login.html';
        }
    } catch (err) {
        console.error('Auth Check Failed', err);
    }
}

// Load Saved Campaigns
let selectedCampaignId = null;

async function loadCampaigns() {
    const campaignsContainer = document.getElementById('campaigns-container');
    const campaignsList = document.getElementById('campaigns-list');

    try {
        const res = await fetch('/api/campaigns');
        const data = await res.json();

        if (data.success && data.campaigns.length > 0) {
            campaignsContainer.classList.remove('hidden');
            campaignsList.innerHTML = data.campaigns.map(c => `
                <div class="campaign-card" data-id="${c.id}" style="
                    background: rgba(255,255,255,0.05);
                    padding: 12px 15px;
                    border-radius: 8px;
                    border: 1px solid var(--border-color);
                    cursor: pointer;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <div>
                        <strong style="font-size: 1rem;">${c.name}</strong>
                        <p style="margin: 5px 0 0; font-size: 0.85rem; color: var(--text-muted);">
                            آخر صف مرسل: ${c.last_sent_row || 1} | الحالة: ${c.status}
                        </p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-small resume-btn" data-id="${c.id}" data-lastrow="${c.last_sent_row || 1}" style="background: var(--primary-color);">
                            استئناف ▶
                        </button>
                        <a href="/create_campaign.html?id=${c.id}" class="btn-small" style="background: rgba(59, 130, 246, 0.2); color: #3b82f6; border-color: rgba(59, 130, 246, 0.4);">
                            تعديل 📝
                        </a>
                        <button class="btn-small delete-campaign-btn" data-id="${c.id}" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">
                            حذف 🗑️
                        </button>
                    </div>
                </div>
            `).join('');

            // Add click handlers
            document.querySelectorAll('.resume-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    const lastRow = parseInt(btn.dataset.lastrow) || 1;

                    selectedCampaignId = id;
                    startRowInput.value = lastRow + 1; // Start from next row
                    endRowInput.value = lastRow + 50; // Default batch of 50

                    // Highlight selected
                    document.querySelectorAll('.campaign-card').forEach(card => card.style.borderColor = 'var(--border-color)');
                    btn.closest('.campaign-card').style.borderColor = 'var(--primary-color)';

                    logsArea.innerHTML = `<div class="log-entry log-INFO">تم تحميل الحملة: ${btn.closest('.campaign-card').querySelector('strong').textContent}</div>`;
                });
            });

            document.querySelectorAll('.delete-campaign-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm('هل أنت متأكد من حذف هذه الحملة؟')) return;

                    const id = btn.dataset.id;
                    const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
                    const data = await res.json();
                    if (data.success) {
                        loadCampaigns();
                    }
                });
            });
        } else {
            campaignsList.innerHTML = '<p style="color: var(--text-muted); text-align: center;">لا توجد حملات محفوظة. <a href="/create_campaign.html" style="color: var(--primary-color);">أنشئ حملة جديدة</a></p>';
            campaignsContainer.classList.remove('hidden');
        }
    } catch (err) {
        console.error('Load Campaigns Error:', err);
        campaignsList.innerHTML = '<p style="color: var(--error-color);">خطأ في تحميل الحملات</p>';
    }
}

checkAuth();

// Logout
logoutBtn.addEventListener('click', async () => {
    try {
        const res = await fetch('/auth/logout', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            window.location.href = data.redirect;
        }
    } catch (err) {
        console.error('Logout Failed', err);
    }
});

// Socket Events
socket.on('connect', () => {
    statusText.textContent = 'مُتصل بالسيرفر 🟢';
});

socket.on('disconnect', () => {
    statusText.textContent = 'انقطع الاتصال بالسيرفر 🔴';
});

socket.on('status', (msg) => {
    statusText.textContent = msg;
});

socket.on('qr', (url) => {
    qrImage.src = url;
    qrContainer.classList.remove('hidden');
    controlsContainer.classList.add('hidden');
    statusText.textContent = 'امسح الكود عشان نربط الواتساب 📱';
});

socket.on('ready', (data) => {
    qrContainer.classList.add('hidden');
    controlsContainer.classList.remove('hidden');

    if (data && data.phone) {
        // Show connected number
        const formatted = `+${data.phone}`;
        statusText.textContent = `متصل بالرقم: ${formatted} 🟢`;
        statusText.style.color = '#25D366';
        statusText.style.fontWeight = 'bold';
    } else {
        statusText.textContent = 'الواتساب جاهز! 🚀';
    }
});

socket.on('log', ({ msg, type }) => {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;

    const time = document.createElement('span');
    time.style.opacity = '0.5';
    time.style.marginRight = '10px';
    time.textContent = `[${new Date().toLocaleTimeString()}]`;

    entry.appendChild(time);
    entry.appendChild(document.createTextNode(msg));

    logsArea.appendChild(entry);
    logsArea.scrollTop = logsArea.scrollHeight;
});

// Interactions
const testBtn = document.getElementById('test-btn');
const testPhoneInput = document.getElementById('testPhone');

// Quick Test
if (testBtn) {
    testBtn.addEventListener('click', () => {
        const phone = testPhoneInput.value;
        if (!phone) {
            alert('اكتب الرقم الأول يا ريس!');
            return;
        }
        socket.emit('send_test', { phone });
    });
}

startBtn.addEventListener('click', () => {
    const startRow = startRowInput.value;
    const endRow = endRowInput.value;

    logsArea.innerHTML = ''; // Clear logs for new run
    socket.emit('start_batch', { startRow, endRow, campaignId: selectedCampaignId });
});

// Stop Button
const stopBtn = document.getElementById('stop-btn');

socket.on('working_state', (isWorking) => {
    if (isWorking) {
        startBtn.disabled = true;
        startBtn.textContent = 'جاري الإرسال... ⏳';
        startRowInput.disabled = true;
        endRowInput.disabled = true;
        stopBtn.style.display = 'inline-block';
    } else {
        startBtn.disabled = false;
        startBtn.textContent = '🚀 أطلق الحملة';
        startRowInput.disabled = false;
        endRowInput.disabled = false;
        stopBtn.style.display = 'none';
    }
});

stopBtn.addEventListener('click', () => {
    socket.emit('stop_batch');
    logsArea.innerHTML += '<div class="log-entry log-WARN">⏹️ تم طلب الإيقاف... جاري التوقف بعد الرسالة الحالية.</div>';
});
