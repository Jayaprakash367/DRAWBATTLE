// ============================================
// DrawBattle - Home / Lobby Logic (Pure JS)
// ============================================

const API_BASE = '';

function $(id) { return document.getElementById(id); }

// ---- Auth check ----
let currentUser = null;

(function init() {
  const userStr = localStorage.getItem('user');
  if (!userStr) {
    window.location.href = '/';
    return;
  }
  currentUser = JSON.parse(userStr);
  renderProfile();
  loadRooms();
  loadLeaderboard();
  // Auto-refresh rooms every 10s
  setInterval(loadRooms, 10000);
})();

// ---- Profile ----
function renderProfile() {
  if (!currentUser) return;
  const initial = currentUser.username ? currentUser.username.charAt(0).toUpperCase() : '?';

  $('headerAvatar').textContent = initial;
  $('headerUsername').textContent = currentUser.username;
  $('profileAvatar').textContent = initial;
  $('profileName').textContent = currentUser.username;

  if (currentUser.isGuest) {
    $('profileJoined').textContent = 'Guest Player';
  } else {
    $('profileJoined').textContent = 'Registered Player';
    // Refresh user data from server
    fetchProfile();
  }

  $('statScore').textContent = currentUser.score || 0;
  $('statWins').textContent = currentUser.gamesWon || 0;
  $('statPlayed').textContent = currentUser.gamesPlayed || 0;
  const wr = currentUser.gamesPlayed > 0
    ? Math.round((currentUser.gamesWon / currentUser.gamesPlayed) * 100) : 0;
  $('statWinRate').textContent = wr + '%';
}

async function fetchProfile() {
  const token = localStorage.getItem('token');
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      currentUser = { ...currentUser, ...data };
      localStorage.setItem('user', JSON.stringify(currentUser));
      renderProfile();
    }
  } catch (e) {
    console.error('Failed to fetch profile:', e);
  }
}

// ---- Leaderboard ----
async function loadLeaderboard() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/leaderboard`);
    if (!res.ok) throw new Error('Failed');
    const users = await res.json();
    renderLeaderboard(users);
  } catch (e) {
    $('leaderboardList').innerHTML = '<p class="text-muted text-sm" style="text-align:center;">Could not load leaderboard</p>';
  }
}

function renderLeaderboard(users) {
  if (!users.length) {
    $('leaderboardList').innerHTML = '<p class="text-muted text-sm" style="text-align:center; padding:20px 0;">No players yet</p>';
    return;
  }
  const rankClass = ['gold', 'silver', 'bronze'];
  let html = '';
  users.slice(0, 10).forEach((u, i) => {
    const rClass = i < 3 ? rankClass[i] : 'normal';
    const initial = u.username.charAt(0).toUpperCase();
    html += `
      <div class="leaderboard-item">
        <div class="leaderboard-item-left">
          <span class="leaderboard-rank ${rClass}">${i < 3 ? ['🥇','🥈','🥉'][i] : '#'+(i+1)}</span>
          <div class="user-avatar" style="width:28px;height:28px;font-size:0.7rem;">${initial}</div>
          <span style="font-size:0.85rem;font-weight:600;">${escapeHtml(u.username)}</span>
        </div>
        <span class="leaderboard-item-score">${u.score}</span>
      </div>`;
  });
  $('leaderboardList').innerHTML = html;
}

// ---- Rooms ----
async function loadRooms() {
  try {
    const res = await fetch(`${API_BASE}/api/rooms/list`);
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    const rooms = data.rooms || data || [];
    renderRooms(rooms);
  } catch (e) {
    console.error('Failed to load rooms:', e);
  }
}

function renderRooms(rooms) {
  const waiting = rooms.filter(r => r.status === 'waiting');

  if (!waiting.length) {
    $('roomsList').innerHTML = `
      <div class="rooms-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="8" y1="15" x2="16" y2="15"/>
          <line x1="9" y1="9" x2="9.01" y2="9"/>
          <line x1="15" y1="9" x2="15.01" y2="9"/>
        </svg>
        <p>No rooms available</p>
        <p class="text-xs text-muted">Create one to get started!</p>
      </div>`;
    return;
  }

  let html = '';
  waiting.forEach(room => {
    const playerCount = room.players ? room.players.length : 0;
    const maxP = room.maxPlayers || 8;
    html += `
      <div class="room-item" onclick="joinRoom('${room.roomId}')">
        <div class="room-item-left">
          <div class="room-item-icon">🎮</div>
          <div class="room-item-info">
            <h4>Room ${room.roomId.substring(0, 8).toUpperCase()}</h4>
            <p>${playerCount}/${maxP} players · ${room.drawTime || 60}s draw time</p>
          </div>
        </div>
        <button class="btn btn-primary btn-sm">Join</button>
      </div>`;
  });
  $('roomsList').innerHTML = html;
}

// ---- Create Room ----
function createRoom() {
  $('createRoomModal').classList.remove('hidden');
}

function closeCreateModal() {
  $('createRoomModal').classList.add('hidden');
}

async function submitCreateRoom() {
  const btn = $('createRoomBtn');
  const maxPlayers = parseInt($('roomMaxPlayers').value) || 8;
  const maxRounds = parseInt($('roomMaxRounds').value) || 3;
  const drawTime = parseInt($('roomDrawTime').value) || 60;

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner spinner-sm"></div>';

  try {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/api/rooms/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ maxPlayers, maxRounds, drawTime })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to create room');
    }

    const data = await res.json();
    const roomId = data.room?.roomId || data.roomId;
    if (!roomId) throw new Error('Invalid room response');
    closeCreateModal();
    window.location.href = `/game.html?room=${roomId}`;
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create';
  }
}

// ---- Join Room ----
function joinRoom(roomId) {
  window.location.href = `/game.html?room=${roomId}`;
}

function joinByCode() {
  const code = $('joinCodeInput').value.trim();
  if (!code) return;
  joinRoom(code);
}

// ---- Logout ----
function handleLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/';
}

// ---- Escape HTML ----
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Close modal on click outside
$('createRoomModal')?.addEventListener('click', function(e) {
  if (e.target === this) closeCreateModal();
});
