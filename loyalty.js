// loyalty.js
// Firebase v9+ modular SDK

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, collection, getDocs, addDoc,
  updateDoc, onSnapshot, query, orderBy, where, Timestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

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
const storage = getStorage(app);

// ─── Reward Tiers ─────────────────────────────────────────────────────────────
const REWARDS = [
  { id: "r1", name: "Free Drink", cost: 100, icon: "🥤", description: "One complimentary beverage" },
  { id: "r2", name: "1hr Court Discount", cost: 250, icon: "🎾", description: "50% off 1-hour court booking" },
  { id: "r3", name: "Free Open Game", cost: 400, icon: "🏓", description: "1 free open game session" },
  { id: "r4", name: "Guest Pass",     cost: 600, icon: "🎟️", description: "Bring a friend for free" },
  { id: "r5", name: "Monthly Membership", cost: 1200, icon: "⭐", description: "1-month complimentary membership" },
  { id: "r6", name: "Pro Coaching (30min)", cost: 2000, icon: "🏆", description: "30-min session with a pro coach" }
];

// Level thresholds
const LEVELS = [
  { name: "Bronze", min: 0,    max: 499,  color: "#cd7f32" },
  { name: "Silver", min: 500,  max: 999,  color: "#c0c0c0" },
  { name: "Gold",   min: 1000, max: 1999, color: "#ffd700" },
  { name: "Platinum", min: 2000, max: Infinity, color: "#e5e4e2" }
];

// ─── State ────────────────────────────────────────────────────────────────────
let currentPlayer = null;
let currentPlayerData = null;

// ─── Search ───────────────────────────────────────────────────────────────────
window.searchPlayer = async function () {
  const name = document.getElementById("searchInput").value.trim();
  if (!name) {
    showToast("⚠️ Enter your name", "error");
    return;
  }

  try {
    const playerDoc = await getDoc(doc(db, "loyalty", name));
    if (!playerDoc.exists()) {
      showToast(`❌ Player "${name}" not found. Ask staff to register you.`, "error");
      return;
    }
    currentPlayer = name;
    currentPlayerData = playerDoc.data();
    renderPlayerCard(name, currentPlayerData);
    loadMyCoupons(name);
    document.getElementById("playerSection").style.display = "block";
    document.getElementById("playerSection").scrollIntoView({ behavior: "smooth" });

    // Subscribe to live updates
    onSnapshot(doc(db, "loyalty", name), snap => {
      if (snap.exists()) {
        currentPlayerData = snap.data();
        renderPlayerCard(name, currentPlayerData);
        loadMyCoupons(name);
      }
    });
  } catch (err) {
    console.error("Search error:", err);
    showToast("❌ Error searching. Check your connection.", "error");
  }
};

// Allow Enter key to trigger search
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("searchInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") window.searchPlayer();
  });
  loadLeaderboard();
});

// ─── Render Player Card ───────────────────────────────────────────────────────
function renderPlayerCard(name, data) {
  const points = data.totalPoints || 0;
  const redeemable = data.redeemPoints || 0;

  document.getElementById("playerName").textContent = name;
  document.getElementById("playerPoints").textContent = `${points.toLocaleString()} pts  |  ${redeemable.toLocaleString()} redeemable`;

  // Level
  const level = LEVELS.find(l => points >= l.min && points <= l.max) || LEVELS[0];
  const nextLevel = LEVELS[LEVELS.indexOf(level) + 1];
  const levelEl = document.getElementById("playerLevel");
  levelEl.textContent = `${level.name} Member`;
  levelEl.style.color = level.color;

  // Progress bar
  const progressPct = nextLevel
    ? Math.min(100, ((points - level.min) / (nextLevel.min - level.min)) * 100)
    : 100;
  document.getElementById("progressBar").style.width = progressPct + "%";
  document.getElementById("progressBar").style.background = level.color;
  document.getElementById("progressLabel").textContent = nextLevel
    ? `${points - level.min} / ${nextLevel.min - level.min} pts to ${nextLevel.name}`
    : "🏆 Max level reached!";

  // Ring
  const circle = document.getElementById("progressCircle");
  const circumference = 2 * Math.PI * 60;
  circle.style.strokeDashoffset = circumference - (progressPct / 100) * circumference;
  circle.style.stroke = level.color;

  // Avatar
  if (data.avatarURL) {
    const img = document.getElementById("avatarImg");
    img.src = data.avatarURL;
    img.style.display = "block";
    document.getElementById("avatarPlaceholder").style.display = "none";
  } else {
    document.getElementById("avatarPlaceholder").textContent = name.charAt(0).toUpperCase();
    document.getElementById("avatarPlaceholder").style.display = "flex";
    document.getElementById("avatarImg").style.display = "none";
  }

  // Rewards
  renderRewards(redeemable);
}

// ─── Render Rewards ───────────────────────────────────────────────────────────
function renderRewards(redeemable) {
  const grid = document.getElementById("rewardsGrid");
  grid.innerHTML = REWARDS.map(r => {
    const canAfford = redeemable >= r.cost;
    return `
      <div class="reward-card ${canAfford ? "" : "reward-locked"}">
        <div class="reward-icon">${r.icon}</div>
        <h4 class="reward-name">${r.name}</h4>
        <p class="reward-desc">${r.description}</p>
        <p class="reward-cost">${r.cost} pts</p>
        <button class="btn-claim ${canAfford ? "" : "btn-claim-locked"}"
          onclick="openClaimModal('${r.id}', '${r.name}', '${r.description}', ${r.cost}, ${canAfford})"
          ${canAfford ? "" : "disabled"}>
          ${canAfford ? "🎁 Claim" : "🔒 Need " + r.cost + " pts"}
        </button>
      </div>
    `;
  }).join("");
}

// ─── Claim Modal ──────────────────────────────────────────────────────────────
window.openClaimModal = function (rewardId, rewardName, description, cost, canAfford) {
  if (!canAfford) return;
  const modal = document.getElementById("claimModal");
  document.getElementById("claimModalTitle").textContent = `Claim: ${rewardName}`;
  document.getElementById("claimModalDesc").textContent = description;
  document.getElementById("claimModalCost").textContent = `Cost: ${cost} pts`;
  document.getElementById("claimConfirmBtn").onclick = () => claimReward(rewardId, rewardName, cost);
  modal.style.display = "flex";
};

window.closeClaimModal = function (e) {
  if (e.target === document.getElementById("claimModal")) {
    document.getElementById("claimModal").style.display = "none";
  }
};

async function claimReward(rewardId, rewardName, cost) {
  if (!currentPlayer) return;

  try {
    document.getElementById("claimModal").style.display = "none";

    // Deduct points immediately
    await updateDoc(doc(db, "loyalty", currentPlayer), {
      redeemPoints: increment(-cost)
    });

    // Create coupon request with "pending" status
    await addDoc(collection(db, "coupons"), {
      playerName: currentPlayer,
      couponId: rewardId,
      couponName: rewardName,
      cost: cost,
      status: "pending",
      timestamp: Timestamp.now()
    });

    showToast(`🎉 "${rewardName}" claimed! Status: Pending ⏳ – wait for staff approval.`, "success");
  } catch (err) {
    console.error("Claim error:", err);
    showToast("❌ Failed to claim reward. Try again.", "error");
    // Refund points on error
    try {
      await updateDoc(doc(db, "loyalty", currentPlayer), {
        redeemPoints: increment(cost)
      });
    } catch (_) {}
  }
}

// ─── My Coupons ───────────────────────────────────────────────────────────────
async function loadMyCoupons(name) {
  try {
    const q = query(
      collection(db, "coupons"),
      where("playerName", "==", name),
      orderBy("timestamp", "desc")
    );
    const snap = await getDocs(q);
    const coupons = [];
    snap.forEach(d => coupons.push({ id: d.id, ...d.data() }));
    renderMyCoupons(coupons);

    // Live updates for coupon status
    onSnapshot(q, snapshot => {
      const updated = [];
      snapshot.forEach(d => updated.push({ id: d.id, ...d.data() }));
      renderMyCoupons(updated);
    });
  } catch (err) {
    console.error("Load coupons error:", err);
  }
}

function renderMyCoupons(coupons) {
  const container = document.getElementById("myCoupons");
  if (coupons.length === 0) {
    container.innerHTML = `<p style="color:rgba(255,255,255,.4); text-align:center; padding:16px;">No coupons yet – claim a reward above!</p>`;
    return;
  }

  container.innerHTML = coupons.map(c => {
    const ts = c.timestamp?.toDate ? c.timestamp.toDate() : new Date(c.timestamp);
    const dateStr = ts.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });

    let statusBadge = "";
    let statusClass = "";
    if (c.status === "pending") {
      statusBadge = "⏳ Pending";
      statusClass = "badge-pending";
    } else if (c.status === "approved") {
      statusBadge = "✅ Approved";
      statusClass = "badge-approved";
    } else if (c.status === "used") {
      statusBadge = "🎯 Used";
      statusClass = "badge-used";
    } else if (c.status === "rejected") {
      statusBadge = "❌ Rejected";
      statusClass = "badge-rejected";
    }

    return `
      <div class="coupon-item">
        <div class="coupon-item-left">
          <strong>${c.couponName || c.couponId}</strong>
          <span class="coupon-date">${dateStr}</span>
        </div>
        <div class="coupon-item-right">
          <span class="coupon-cost">-${c.cost} pts</span>
          <span class="badge ${statusClass}">${statusBadge}</span>
        </div>
      </div>
    `;
  }).join("");
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
async function loadLeaderboard() {
  try {
    const q = query(collection(db, "loyalty"), orderBy("totalPoints", "desc"));
    onSnapshot(q, snapshot => {
      const players = [];
      snapshot.forEach(d => players.push({ name: d.id, ...d.data() }));
      renderLeaderboard(players.slice(0, 10));
    });
  } catch (err) {
    console.error("Leaderboard error:", err);
  }
}

function renderLeaderboard(players) {
  const container = document.getElementById("leaderboardList");
  if (players.length === 0) {
    container.innerHTML = `<p style="color:rgba(255,255,255,.4);text-align:center;">No players yet</p>`;
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  container.innerHTML = players.map((p, i) => {
    const level = LEVELS.find(l => (p.totalPoints || 0) >= l.min && (p.totalPoints || 0) <= l.max) || LEVELS[0];
    return `
      <div class="leaderboard-row ${i < 3 ? "leaderboard-top" : ""}">
        <div class="lb-rank">${medals[i] || (i + 1)}</div>
        <div class="lb-avatar">
          ${p.avatarURL
            ? `<img src="${p.avatarURL}" class="lb-avatar-img" alt="${p.name}" onerror="this.style.display='none'"><span class="lb-avatar-fallback" style="display:none">${p.name.charAt(0).toUpperCase()}</span>`
            : `<div class="lb-avatar-placeholder">${p.name.charAt(0).toUpperCase()}</div>`
          }
        </div>
        <div class="lb-info">
          <span class="lb-name">${p.name}</span>
          <span class="lb-level" style="color:${level.color}">${level.name}</span>
        </div>
        <div class="lb-points">${(p.totalPoints || 0).toLocaleString()} pts</div>
      </div>
    `;
  }).join("");
}

// ─── Avatar Upload to Firebase Storage ───────────────────────────────────────
window.handleAvatarUpload = async function (event) {
  if (!currentPlayer) {
    showToast("⚠️ Search for your profile first", "error");
    return;
  }
  const file = event.target.files[0];
  if (!file) return;

  // Validate file type
  if (!file.type.startsWith("image/")) {
    showToast("⚠️ Please select an image file", "error");
    return;
  }

  // 5MB limit
  if (file.size > 5 * 1024 * 1024) {
    showToast("⚠️ Image must be under 5MB", "error");
    return;
  }

  showToast("⏳ Uploading photo…", "success");

  try {
    // Upload to Firebase Storage: avatars/{playerName}
    const imgRef = storageRef(storage, `avatars/${currentPlayer}`);
    await uploadBytes(imgRef, file);
    const downloadURL = await getDownloadURL(imgRef);

    // Save URL to Firestore so it syncs across all devices
    await updateDoc(doc(db, "loyalty", currentPlayer), {
      avatarURL: downloadURL
    });

    // Update UI immediately
    const img = document.getElementById("avatarImg");
    img.src = downloadURL;
    img.style.display = "block";
    document.getElementById("avatarPlaceholder").style.display = "none";

    showToast("✅ Profile photo updated!", "success");
  } catch (err) {
    console.error("Avatar upload error:", err);
    showToast("❌ Upload failed. Check Firebase Storage rules.", "error");
  }
};

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 3500);
}
