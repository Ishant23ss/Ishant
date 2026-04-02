// loyalty-admin.js — HIVE Club Loyalty Admin

// ─── Auth Guard ────────────────────────────────────────────────────────────────
if (sessionStorage.getItem('hiveAdmin') !== 'true') {
    window.location.href = 'index.html';
}

function logout() {
    sessionStorage.removeItem('hiveAdmin');
    window.location.href = 'index.html';
}

// ─── Base Points Per Hour ───────────────────────────────────────────────────────
const BASE_POINTS = {
    'open-member':        50,
    'open-non-member':    25,
    'member-peak':        120,
    'member-non-peak':    140,
    'non-member-peak':    60,
    'non-member-non-peak': 80,
    'kettlebell':         50,
    'arc':                150,
    'google-review':      25   // flat rate (no hours multiplier)
};

// Activities that are flat-rate (not multiplied by hours)
const FLAT_RATE_ACTIVITIES = ['google-review'];

// ─── Data Storage ──────────────────────────────────────────────────────────────
function loadPlayers() {
    return JSON.parse(localStorage.getItem('hivePlayers') || '[]');
}

function savePlayers(players) {
    localStorage.setItem('hivePlayers', JSON.stringify(players));
}

function loadCoupons() {
    return JSON.parse(localStorage.getItem('hiveCoupons') || '[]');
}

function saveCoupons(coupons) {
    localStorage.setItem('hiveCoupons', JSON.stringify(coupons));
}

// ─── Stats ─────────────────────────────────────────────────────────────────────
function refreshStats() {
    const players = loadPlayers();
    const totalPoints = players.reduce((sum, p) => sum + (p.points || 0), 0);
    const totalCoupons = players.reduce((sum, p) => sum + (p.couponsRedeemed || 0), 0);

    const today = new Date().toDateString();
    const activeToday = players.filter(p =>
        p.history && p.history.some(h => new Date(h.date).toDateString() === today)
    ).length;

    document.getElementById('statTotal').textContent = players.length;
    document.getElementById('statActive').textContent = activeToday;
    document.getElementById('statPoints').textContent = totalPoints.toLocaleString();
    document.getElementById('statCoupons').textContent = totalCoupons;
}

// ─── Tab Navigation ────────────────────────────────────────────────────────────
function switchTab(tabId, btn) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    if (btn) btn.classList.add('active');

    if (tabId === 'players') renderPlayers();
    if (tabId === 'coupons') renderCoupons();
}

// ─── Player Rendering ──────────────────────────────────────────────────────────
function renderPlayers(filter) {
    let players = loadPlayers();
    if (filter) {
        const q = filter.toLowerCase();
        players = players.filter(p =>
            p.name.toLowerCase().includes(q) ||
            p.phone.includes(q) ||
            (p.email || '').toLowerCase().includes(q)
        );
    }

    const grid = document.getElementById('playersGrid');
    const noMsg = document.getElementById('noPlayersMsg');

    if (players.length === 0) {
        grid.innerHTML = '';
        noMsg.style.display = 'block';
        return;
    }

    noMsg.style.display = 'none';
    grid.innerHTML = players.map(p => `
        <div class="player-card">
            <div class="player-avatar">${escapeHtml(getInitials(p.name))}</div>
            <div class="player-info">
                <div class="player-name">${escapeHtml(p.name)}</div>
                <div class="player-phone">${escapeHtml(p.phone)}</div>
                <div class="player-membership badge badge-${p.membership}">${escapeHtml(formatMembership(p.membership))}</div>
            </div>
            <div class="player-points">
                <div class="points-value">${(p.points || 0).toLocaleString()}</div>
                <div class="points-label">points</div>
            </div>
            <div class="player-actions">
                <button class="btn btn-sm btn-primary" onclick="openAddPointsModal(${JSON.stringify(p.id)})">+ Points</button>
                <button class="btn btn-sm btn-outline" onclick="openPlayerDetail(${JSON.stringify(p.id)})">View</button>
            </div>
        </div>
    `).join('');
}

function searchPlayers(query) {
    renderPlayers(query);
}

// ─── Add Player ────────────────────────────────────────────────────────────────
function addPlayer(event) {
    event.preventDefault();
    const players = loadPlayers();

    const name  = document.getElementById('playerName').value.trim();
    const phone = document.getElementById('playerPhone').value.trim();
    const email = document.getElementById('playerEmail').value.trim();
    const membership = document.getElementById('playerMembership').value;

    // Check duplicate phone
    if (players.some(p => p.phone === phone)) {
        alert('A player with this phone number already exists.');
        return;
    }

    const newPlayer = {
        id: 'p_' + Date.now(),
        name,
        phone,
        email,
        membership,
        points: 0,
        couponsRedeemed: 0,
        history: [],
        createdAt: new Date().toISOString()
    };

    players.push(newPlayer);
    savePlayers(players);

    // Reset form
    document.getElementById('addPlayerForm').reset();

    alert(`Player card created for ${name}!`);
    refreshStats();
    switchTabByName('players');
}

function switchTabByName(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    // Activate the button whose data-tab attribute matches
    const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');
    renderPlayers();
}

// ─── Add Points ────────────────────────────────────────────────────────────────
function openAddPointsModal(cardId) {
    const players = loadPlayers();
    const player = players.find(p => p.id === cardId);
    if (!player) return;

    document.getElementById('addPointsCardId').value = cardId;
    document.getElementById('addPointsPlayerName').textContent = player.name + ' — Current: ' + (player.points || 0) + ' pts';
    document.getElementById('hoursPlayed').value = 1;
    document.getElementById('pointsNote').value = '';
    document.getElementById('activityType').selectedIndex = 0;

    // Show/hide hours field
    updateHoursVisibility();
    updatePointsPreview();

    document.getElementById('addPointsModal').style.display = 'flex';
}

function updateHoursVisibility() {
    const activityType = document.getElementById('activityType').value;
    const hoursGroup = document.getElementById('hoursGroup');
    hoursGroup.style.display = FLAT_RATE_ACTIVITIES.includes(activityType) ? 'none' : 'block';
}

function updatePointsPreview() {
    const activityType = document.getElementById('activityType').value;
    const basePoints = BASE_POINTS[activityType] || 0;

    updateHoursVisibility();

    let totalPoints;
    if (FLAT_RATE_ACTIVITIES.includes(activityType)) {
        totalPoints = basePoints;
    } else {
        const hours = parseFloat(document.getElementById('hoursPlayed').value) || 0;
        totalPoints = Math.round(basePoints * hours);
    }

    document.getElementById('previewValue').textContent = totalPoints;
}

function addPointsToCard(cardId, activityType, hoursPlayed, note) {
    const players = loadPlayers();
    const player = players.find(p => p.id === cardId);
    if (!player) return false;

    const basePoints = BASE_POINTS[activityType] || 0;

    let earnedPoints;
    if (FLAT_RATE_ACTIVITIES.includes(activityType)) {
        // Flat-rate: no hours multiplier
        earnedPoints = basePoints;
    } else {
        // Hours-based: Points = basePoints × hoursPlayed
        earnedPoints = Math.round(basePoints * hoursPlayed);
    }

    player.points = (player.points || 0) + earnedPoints;

    if (!player.history) player.history = [];
    player.history.unshift({
        date: new Date().toISOString(),
        activity: activityType,
        hours: FLAT_RATE_ACTIVITIES.includes(activityType) ? null : hoursPlayed,
        basePoints,
        earnedPoints,
        note: note || ''
    });

    savePlayers(players);
    return earnedPoints;
}

function submitAddPoints(event) {
    event.preventDefault();

    const cardId      = document.getElementById('addPointsCardId').value;
    const activityType = document.getElementById('activityType').value;
    const hoursPlayed  = parseFloat(document.getElementById('hoursPlayed').value) || 1;
    const note         = document.getElementById('pointsNote').value.trim();

    if (!FLAT_RATE_ACTIVITIES.includes(activityType) && hoursPlayed <= 0) {
        alert('Please enter a valid number of hours (minimum 0.5).');
        return;
    }

    const earned = addPointsToCard(cardId, activityType, hoursPlayed, note);
    if (earned === false) {
        alert('Player not found.');
        return;
    }

    closeModal('addPointsModal');
    refreshStats();
    renderPlayers();
    alert(`✅ ${earned} points added successfully!`);
}

// ─── Player Detail ─────────────────────────────────────────────────────────────
function openPlayerDetail(cardId) {
    const players = loadPlayers();
    const player = players.find(p => p.id === cardId);
    if (!player) return;

    const history = (player.history || []).slice(0, 20);

    const historyRows = history.length ? history.map(h => `
        <tr>
            <td>${escapeHtml(formatDate(h.date))}</td>
            <td>${escapeHtml(formatActivity(h.activity))}</td>
            <td>${h.hours != null ? escapeHtml(String(h.hours) + ' hr') : '—'}</td>
            <td>+${Number(h.earnedPoints) || 0}</td>
            <td>${escapeHtml(h.note || '')}</td>
        </tr>
    `).join('') : '<tr><td colspan="5" class="empty-cell">No activity yet</td></tr>';

    document.getElementById('playerDetailBody').innerHTML = `
        <div class="detail-header">
            <div class="detail-avatar">${escapeHtml(getInitials(player.name))}</div>
            <div class="detail-meta">
                <h2>${escapeHtml(player.name)}</h2>
                <p>${escapeHtml(player.phone)}</p>
                ${player.email ? `<p>${escapeHtml(player.email)}</p>` : ''}
                <span class="badge badge-${player.membership}">${escapeHtml(formatMembership(player.membership))}</span>
            </div>
            <div class="detail-points">
                <div class="big-points">${(player.points || 0).toLocaleString()}</div>
                <div>total points</div>
            </div>
        </div>
        <h4 class="history-title">Recent Activity</h4>
        <div class="table-scroll">
            <table class="coupon-table">
                <thead>
                    <tr><th>Date</th><th>Activity</th><th>Hours</th><th>Points</th><th>Note</th></tr>
                </thead>
                <tbody>${historyRows}</tbody>
            </table>
        </div>
    `;

    document.getElementById('playerDetailModal').style.display = 'flex';
}

// ─── Coupons ───────────────────────────────────────────────────────────────────
function renderCoupons() {
    const coupons = loadCoupons();
    const tbody = document.getElementById('couponTableBody');
    const noMsg = document.getElementById('noCouponsMsg');

    if (coupons.length === 0) {
        tbody.innerHTML = '';
        noMsg.style.display = 'block';
        return;
    }

    noMsg.style.display = 'none';
    tbody.innerHTML = coupons.map((c, i) => `
        <tr>
            <td><strong>${escapeHtml(c.code)}</strong></td>
            <td>${escapeHtml(c.description)}</td>
            <td>${Number(c.pointsRequired) || 0}</td>
            <td><span class="badge badge-${c.active ? 'member' : 'non-member'}">${c.active ? 'Active' : 'Inactive'}</span></td>
            <td>
                <button class="btn btn-sm btn-outline" onclick="toggleCoupon(${i})">${c.active ? 'Deactivate' : 'Activate'}</button>
                <button class="btn btn-sm btn-danger" onclick="deleteCoupon(${i})">Delete</button>
            </td>
        </tr>
    `).join('');
}

function openCouponModal() {
    document.getElementById('couponForm').reset();
    document.getElementById('couponModal').style.display = 'flex';
}

function saveCoupon(event) {
    event.preventDefault();
    const coupons = loadCoupons();

    const code   = document.getElementById('couponCode').value.trim().toUpperCase();
    const desc   = document.getElementById('couponDesc').value.trim();
    const points = parseInt(document.getElementById('couponPoints').value, 10);

    if (coupons.some(c => c.code === code)) {
        alert('Coupon code already exists.');
        return;
    }

    coupons.push({ code, description: desc, pointsRequired: points, active: true });
    saveCoupons(coupons);
    closeModal('couponModal');
    renderCoupons();
}

function toggleCoupon(index) {
    const coupons = loadCoupons();
    if (!coupons[index]) return;
    coupons[index].active = !coupons[index].active;
    saveCoupons(coupons);
    renderCoupons();
}

function deleteCoupon(index) {
    if (!confirm('Delete this coupon?')) return;
    const coupons = loadCoupons();
    coupons.splice(index, 1);
    saveCoupons(coupons);
    renderCoupons();
}

// ─── Modal Helpers ─────────────────────────────────────────────────────────────
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.style.display = 'none';
    });
});

// ─── Utilities ─────────────────────────────────────────────────────────────────
function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatMembership(m) {
    return m === 'member' ? 'Member' : 'Non Member';
}

function formatActivity(a) {
    const labels = {
        'open-member':         'Open Member',
        'open-non-member':     'Open Non Member',
        'member-peak':         'Member Peak',
        'member-non-peak':     'Member Non Peak',
        'non-member-peak':     'Non Member Peak',
        'non-member-non-peak': 'Non Member Non Peak',
        'kettlebell':          'Kettlebell',
        'arc':                 'ARC',
        'google-review':       'Google Review'
    };
    return labels[a] || a;
}

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ─── Init ──────────────────────────────────────────────────────────────────────
(function init() {
    refreshStats();
    renderPlayers();
})();
