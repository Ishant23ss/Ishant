// loyalty-admin.js
// Firebase v9+ modular SDK

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc,
  updateDoc, deleteDoc, onSnapshot, increment, orderBy, query,
  where, Timestamp, addDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Firebase Config ──────────────────────────────────────────────────────────
// Replace with your Firebase project config from https://console.firebase.google.com
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ─── Base Points Per Hour ─────────────────────────────────────────────────────
const POINTS = {
  openMember:     50,   // Open Game Member
  openNonMember:  25,   // Open Game Non-Member
  memberPeak:    120,   // Member Peak Hour
  memberNonPeak: 140,   // Member Non-Peak
  nonPeak:        60,   // Non-Member Peak
  nonNonPeak:     80,   // Non-Member Non-Peak
  kettlebell:     50,   // Kettlebell Session
  arc:           150,   // ARC Session
  google:         25    // Google Review (no hours multiplier)
};

// Sessions that don't use an hours multiplier
const FLAT_POINTS = new Set(["google"]);

// ─── State ────────────────────────────────────────────────────────────────────
let allPlayers = {};
let filteredPlayers = {};
let currentTab = "pending";
let unsubscribePlayers = null;
let unsubscribeCoupons = null;

// ─── Auth Guard ───────────────────────────────────────────────────────────────
(function checkAuth() {
  const token = sessionStorage.getItem("adminToken");
  if (!token) {
    window.location.href = "index.html";
    return;
  }
  try {
    const data = atob(token);
    const timestamp = parseInt(data.split(":")[1]);
    if (Date.now() - timestamp > 8 * 60 * 60 * 1000) {
      sessionStorage.removeItem("adminToken");
      window.location.href = "index.html";
    }
  } catch (e) {
    window.location.href = "index.html";
  }
})();

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  subscribePlayers();
  subscribeCoupons();
});

// ─── Real-time Player Subscription ───────────────────────────────────────────
function subscribePlayers() {
  const q = query(collection(db, "loyalty"), orderBy("totalPoints", "desc"));
  unsubscribePlayers = onSnapshot(q, snapshot => {
    allPlayers = {};
    snapshot.forEach(docSnap => {
      allPlayers[docSnap.id] = docSnap.data();
    });
    filteredPlayers = { ...allPlayers };
    renderPlayerCards();
    updateStats();
  }, err => {
    console.error("Players snapshot error:", err);
    showToast("⚠️ Error loading players", "error");
  });
}

// ─── Real-time Coupon Subscription ───────────────────────────────────────────
function subscribeCoupons() {
  const q = query(collection(db, "coupons"), orderBy("timestamp", "desc"));
  unsubscribeCoupons = onSnapshot(q, snapshot => {
    const coupons = [];
    snapshot.forEach(docSnap => coupons.push({ id: docSnap.id, ...docSnap.data() }));
    renderCouponTable(coupons);
    updateCouponStats(coupons);
  }, err => {
    console.error("Coupons snapshot error:", err);
  });
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById("statPlayers").textContent = Object.keys(allPlayers).length;
  const totalPoints = Object.values(allPlayers).reduce((sum, p) => sum + (p.totalPoints || 0), 0);
  document.getElementById("statPoints").textContent = totalPoints.toLocaleString();
}

function updateCouponStats(coupons) {
  const pending = coupons.filter(c => c.status === "pending").length;
  document.getElementById("statPending").textContent = pending;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const approved = coupons.filter(c => {
    if (c.status !== "approved") return false;
    const ts = c.timestamp?.toDate ? c.timestamp.toDate() : new Date(c.timestamp);
    return ts >= today;
  }).length;
  document.getElementById("statApproved").textContent = approved;
}

// ─── Render Player Cards ──────────────────────────────────────────────────────
function renderPlayerCards() {
  const grid = document.getElementById("playersGrid");
  const entries = Object.entries(filteredPlayers)
    .sort((a, b) => (b[1].totalPoints || 0) - (a[1].totalPoints || 0));

  if (entries.length === 0) {
    grid.innerHTML = `<div class="loading-text">No players found.</div>`;
    return;
  }

  grid.innerHTML = entries.map(([name, p]) => `
    <div class="player-card-admin" id="card-${CSS.escape(name)}">
      <div class="player-card-top">
        ${p.avatarURL
          ? `<img src="${p.avatarURL}" class="admin-avatar" alt="${name}" onerror="this.style.display='none'">`
          : `<div class="admin-avatar-placeholder">${name.charAt(0).toUpperCase()}</div>`
        }
        <div class="player-card-info">
          <h3 class="player-card-name">${name}</h3>
          <p class="player-card-pts">${(p.totalPoints || 0).toLocaleString()} pts</p>
          <p class="player-card-redeem">Redeemable: ${(p.redeemPoints || 0).toLocaleString()} pts</p>
        </div>
      </div>

      <div class="points-form">
        <div class="points-form-row">
          <div class="input-group">
            <label>Booking Type</label>
            <select id="bookingType-${name}" class="form-select">
              <option value="">– Select –</option>
              <option value="openMember">Open Game Member (50/hr)</option>
              <option value="openNonMember">Open Game Non-Member (25/hr)</option>
              <option value="memberPeak">Member Peak (120/hr)</option>
              <option value="memberNonPeak">Member Non-Peak (140/hr)</option>
              <option value="nonPeak">Non-Member Peak (60/hr)</option>
              <option value="nonNonPeak">Non-Member Non-Peak (80/hr)</option>
              <option value="kettlebell">Kettlebell (50/hr)</option>
              <option value="arc">ARC (150/hr)</option>
              <option value="google">Google Review (+25 flat)</option>
            </select>
          </div>
          <div class="input-group hours-group" id="hoursGroup-${name}">
            <label>Hours Played</label>
            <input type="number" id="hours-${name}" class="form-input-sm"
              placeholder="1.0" min="0.5" max="12" step="0.5" value="1">
          </div>
        </div>
        <div class="points-preview" id="preview-${name}">
          Select booking type to see points
        </div>
        <button class="btn-add-pts" onclick="addPointsToCard('${name}')">
          ➕ Add Points
        </button>
      </div>

      <button class="btn-delete-player" onclick="deletePlayer('${name}')">
        🗑️ Delete Player
      </button>
    </div>
  `).join("");

  // Attach live preview listeners
  entries.forEach(([name]) => {
    const typeEl = document.getElementById(`bookingType-${name}`);
    const hoursEl = document.getElementById(`hours-${name}`);
    if (typeEl) typeEl.addEventListener("change", () => updatePreview(name));
    if (hoursEl) hoursEl.addEventListener("input", () => updatePreview(name));
  });
}

// ─── Points Preview ───────────────────────────────────────────────────────────
function updatePreview(name) {
  const type = document.getElementById(`bookingType-${name}`)?.value;
  const hours = parseFloat(document.getElementById(`hours-${name}`)?.value) || 1;
  const previewEl = document.getElementById(`preview-${name}`);
  const hoursGroup = document.getElementById(`hoursGroup-${name}`);
  if (!previewEl) return;

  if (!type) {
    previewEl.textContent = "Select booking type to see points";
    previewEl.className = "points-preview";
    return;
  }

  const basePoints = POINTS[type] || 0;
  const isFlat = FLAT_POINTS.has(type);
  const totalPts = isFlat ? basePoints : basePoints * hours;

  // Hide hours input for flat-rate sessions
  if (hoursGroup) hoursGroup.style.display = isFlat ? "none" : "";

  previewEl.innerHTML = isFlat
    ? `<strong>+${totalPts} pts</strong> (flat rate)`
    : `<strong>+${totalPts} pts</strong> (${basePoints} × ${hours} hr${hours !== 1 ? "s" : ""})`;
  previewEl.className = "points-preview active";
}

// ─── Add Points ───────────────────────────────────────────────────────────────
window.addPointsToCard = async function (name) {
  const type = document.getElementById(`bookingType-${name}`)?.value;
  const hours = parseFloat(document.getElementById(`hours-${name}`)?.value) || 1;

  if (!type) {
    showToast("⚠️ Please select a booking type", "error");
    return;
  }

  const isFlat = FLAT_POINTS.has(type);
  if (!isFlat && (hours <= 0 || hours > 12)) {
    showToast("⚠️ Enter valid hours (0.5 – 12)", "error");
    return;
  }

  const basePoints = POINTS[type] || 0;
  const pts = isFlat ? basePoints : Math.round(basePoints * hours);

  try {
    const playerRef = doc(db, "loyalty", name);
    await updateDoc(playerRef, {
      totalPoints: increment(pts),
      redeemPoints: increment(pts)
    });

    // Reset form
    document.getElementById(`bookingType-${name}`).value = "";
    document.getElementById(`hours-${name}`).value = "1";
    const previewEl = document.getElementById(`preview-${name}`);
    if (previewEl) {
      previewEl.textContent = "Select booking type to see points";
      previewEl.className = "points-preview";
    }

    showToast(`✅ +${pts} pts added to ${name}!`, "success");
  } catch (err) {
    console.error("Add points error:", err);
    showToast("❌ Failed to add points. Check your Firebase config.", "error");
  }
};

// ─── Delete Player ────────────────────────────────────────────────────────────
window.deletePlayer = async function (name) {
  const confirmed = confirm(`⚠️ Delete player "${name}"?\n\nThis will permanently remove their account and all ${(allPlayers[name]?.totalPoints || 0)} points.\n\nThis action cannot be undone.`);
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "loyalty", name));
    showToast(`🗑️ Player "${name}" deleted`, "success");
  } catch (err) {
    console.error("Delete player error:", err);
    showToast("❌ Failed to delete player", "error");
  }
};

// ─── Add New Player ───────────────────────────────────────────────────────────
window.addNewPlayer = async function () {
  const input = document.getElementById("newPlayerName");
  const name = input.value.trim();
  if (!name) {
    showToast("⚠️ Enter a player name", "error");
    return;
  }
  if (allPlayers[name]) {
    showToast(`⚠️ Player "${name}" already exists`, "error");
    return;
  }

  try {
    await setDoc(doc(db, "loyalty", name), {
      totalPoints: 0,
      redeemPoints: 0,
      avatarURL: "",
      createdAt: Timestamp.now()
    });
    input.value = "";
    showToast(`✅ Player "${name}" added!`, "success");
  } catch (err) {
    console.error("Add player error:", err);
    showToast("❌ Failed to add player", "error");
  }
};

// ─── Search / Filter ──────────────────────────────────────────────────────────
window.filterPlayers = function (query) {
  const q = query.toLowerCase();
  filteredPlayers = {};
  Object.entries(allPlayers).forEach(([name, data]) => {
    if (name.toLowerCase().includes(q)) filteredPlayers[name] = data;
  });
  renderPlayerCards();
};

// ─── Coupon Table ─────────────────────────────────────────────────────────────
function renderCouponTable(coupons) {
  const filtered = coupons.filter(c => c.status === currentTab);
  const tbody = document.getElementById("couponTableBody");

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:rgba(255,255,255,.4);padding:24px;">No ${currentTab} coupons</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const ts = c.timestamp?.toDate ? c.timestamp.toDate() : new Date(c.timestamp);
    const dateStr = ts.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });

    let statusBadge = "";
    if (c.status === "pending")  statusBadge = `<span class="badge badge-pending">⏳ Pending</span>`;
    if (c.status === "approved") statusBadge = `<span class="badge badge-approved">✅ Approved</span>`;
    if (c.status === "used")     statusBadge = `<span class="badge badge-used">🎯 Used</span>`;

    let actions = "";
    if (c.status === "pending") {
      actions = `
        <button class="btn-approve" onclick="approveCoupon('${c.id}', '${c.playerName}', ${c.cost || 0})">Approve</button>
        <button class="btn-reject"  onclick="rejectCoupon('${c.id}', '${c.playerName}', ${c.cost || 0})">Reject</button>
      `;
    } else if (c.status === "approved") {
      actions = `<button class="btn-approve" onclick="markCouponUsed('${c.id}')">Mark Used</button>`;
    }

    return `
      <tr>
        <td data-label="Player">${c.playerName || "–"}</td>
        <td data-label="Coupon">${c.couponName || c.couponId || "–"}</td>
        <td data-label="Points">${c.cost || 0} pts</td>
        <td data-label="Date">${dateStr}</td>
        <td data-label="Status">${statusBadge}</td>
        <td data-label="Actions"><div class="action-buttons">${actions}</div></td>
      </tr>
    `;
  }).join("");
}

// ─── Coupon Tabs ──────────────────────────────────────────────────────────────
window.showTab = function (tab) {
  currentTab = tab;
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  event.target.classList.add("active");
  // Re-render using current snapshot — the onSnapshot will re-fire or we trigger manually
  subscribeCoupons();
};

// ─── Approve / Reject / Mark Used ────────────────────────────────────────────
window.approveCoupon = async function (couponDocId, playerName, cost) {
  try {
    await updateDoc(doc(db, "coupons", couponDocId), { status: "approved" });
    showToast(`✅ Coupon approved for ${playerName}`, "success");
  } catch (err) {
    console.error(err);
    showToast("❌ Failed to approve coupon", "error");
  }
};

window.rejectCoupon = async function (couponDocId, playerName, cost) {
  const confirmed = confirm(`Reject coupon for ${playerName}? Their ${cost} pts will be refunded.`);
  if (!confirmed) return;
  try {
    await updateDoc(doc(db, "coupons", couponDocId), { status: "rejected" });
    if (playerName && cost > 0) {
      await updateDoc(doc(db, "loyalty", playerName), {
        redeemPoints: increment(cost)
      });
    }
    showToast(`❌ Coupon rejected – ${cost} pts refunded to ${playerName}`, "success");
  } catch (err) {
    console.error(err);
    showToast("❌ Failed to reject coupon", "error");
  }
};

window.markCouponUsed = async function (couponDocId) {
  try {
    await updateDoc(doc(db, "coupons", couponDocId), { status: "used" });
    showToast("🎯 Coupon marked as used", "success");
  } catch (err) {
    console.error(err);
    showToast("❌ Failed to update coupon", "error");
  }
};

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 3200);
}
