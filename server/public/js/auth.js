// ============================================
// DrawBattle - Auth Logic (Pure JS)
// ============================================

const API_BASE = '';  // Same origin

// ---- State ----
let currentTab = 'login';

// ---- DOM ----
function $(id) { return document.getElementById(id); }

// ---- Check if already logged in ----
(function init() {
  const token = localStorage.getItem('token');
  if (token) {
    window.location.href = '/home.html';
  }
})();

// ---- Tab Switching ----
function switchTab(tab) {
  currentTab = tab;
  $('authError').classList.add('hidden');

  if (tab === 'login') {
    $('loginTab').classList.add('active');
    $('registerTab').classList.remove('active');
    $('loginForm').classList.remove('hidden');
    $('registerForm').classList.add('hidden');
  } else {
    $('registerTab').classList.add('active');
    $('loginTab').classList.remove('active');
    $('registerForm').classList.remove('hidden');
    $('loginForm').classList.add('hidden');
  }
}

// ---- Show Error ----
function showError(msg) {
  const el = $('authError');
  el.textContent = msg;
  el.classList.remove('hidden');
  // Re-trigger animation
  el.style.animation = 'none';
  el.offsetHeight; // force reflow
  el.style.animation = '';
}

// ---- Toggle Password Visibility ----
function togglePassword(inputId, btn) {
  const input = $(inputId);
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  // Update icon
  btn.innerHTML = isPassword
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
       </svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
       </svg>`;
}

// ---- API Helper ----
async function apiRequest(endpoint, method, body) {
  try {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const token = localStorage.getItem('token');
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${API_BASE}${endpoint}`, opts);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || data.message || data.errors?.[0]?.msg || 'Something went wrong');
    }
    return data;
  } catch (err) {
    throw err;
  }
}

// ---- Login ----
async function handleLogin(e) {
  e.preventDefault();
  const btn = $('loginBtn');
  const username = $('loginUsername').value.trim();
  const password = $('loginPassword').value;

  if (!username || !password) {
    showError('Please fill in all fields');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner spinner-sm"></div>';
  $('authError').classList.add('hidden');

  try {
    const data = await apiRequest('/api/auth/login', 'POST', { username, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.location.href = '/home.html';
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>Sign In</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="5" y1="12" x2="19" y2="12"/>
        <polyline points="12 5 19 12 12 19"/>
      </svg>`;
  }
}

// ---- Register ----
async function handleRegister(e) {
  e.preventDefault();
  const btn = $('registerBtn');
  const username = $('regUsername').value.trim();
  const password = $('regPassword').value;
  const confirm = $('regConfirm').value;

  if (!username || !password || !confirm) {
    showError('Please fill in all fields');
    return;
  }

  if (password !== confirm) {
    showError('Passwords do not match');
    return;
  }

  if (username.length < 3) {
    showError('Username must be at least 3 characters');
    return;
  }

  if (password.length < 6) {
    showError('Password must be at least 6 characters');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner spinner-sm"></div>';
  $('authError').classList.add('hidden');

  try {
    const data = await apiRequest('/api/auth/register', 'POST', { username, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.location.href = '/home.html';
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>Create Account</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="5" y1="12" x2="19" y2="12"/>
        <polyline points="12 5 19 12 12 19"/>
      </svg>`;
  }
}

// ---- Guest Login ----
function handleGuest() {
  const guestName = 'Guest_' + Math.random().toString(36).substring(2, 7).toUpperCase();
  localStorage.setItem('user', JSON.stringify({ username: guestName, score: 0, gamesPlayed: 0, gamesWon: 0, isGuest: true }));
  localStorage.removeItem('token');
  window.location.href = '/home.html';
}
