// ============================================
// DrawBattle - Game Logic (Pure JS)
// Canvas drawing + Socket.io + Chat
// ============================================

// ---- Helpers ----
function $(id) { return document.getElementById(id); }
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ---- Config ----
const COLORS = [
  '#FFFFFF', '#C0C0C0', '#808080', '#000000',
  '#EF4444', '#F97316', '#FBBF24', '#22C55E',
  '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4',
  '#84CC16', '#A855F7', '#F43F5E', '#14B8A6',
];

const BRUSH_SIZES = [
  { size: 3, dotSize: 4 },
  { size: 6, dotSize: 7 },
  { size: 10, dotSize: 10 },
  { size: 16, dotSize: 14 },
  { size: 24, dotSize: 18 },
];

// ---- State ----
let socket = null;
let roomId = null;
let currentUser = null;
let isDrawing = false;
let isMyTurn = false;
let currentWord = null;
let gameStatus = 'waiting';
let players = [];
let msgCount = 0;

// Drawing state
let drawing = false;
let currentColor = '#FFFFFF';
let currentBrushSize = 6;
let currentTool = 'pen'; // pen | eraser
let lastX = 0, lastY = 0;
let drawHistory = []; // for undo
let canvasWidth = 800, canvasHeight = 600;

// ---- Init ----
(function init() {
  const userStr = localStorage.getItem('user');
  if (!userStr) {
    window.location.href = '/';
    return;
  }
  currentUser = JSON.parse(userStr);

  const params = new URLSearchParams(window.location.search);
  roomId = params.get('room');
  if (!roomId) {
    window.location.href = '/home.html';
    return;
  }

  $('roomCodeText').textContent = roomId.substring(0, 8).toUpperCase();
  initCanvas();
  initToolbar();
  connectSocket();
})();

// ---- Socket Connection ----
function connectSocket() {
  socket = io(window.location.origin, {
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    socket.emit('joinRoom', {
      roomId,
      username: currentUser.username,
    });
  });

  // Room state (initial or reset)
  socket.on('roomState', (data) => {
    players = data.players || [];
    gameStatus = data.status;
    renderPlayers();
    updateGameUI(data);

    // Replay drawing data
    if (data.drawingData && data.drawingData.length > 0) {
      const canvas = $('game-canvas');
      const ctx = canvas.getContext('2d');
      data.drawingData.forEach(d => drawFromData(ctx, d));
    }

    // Replay chat messages
    if (data.chatMessages) {
      data.chatMessages.forEach(msg => addChatMessage(msg, false));
    }
  });

  // Player joined
  socket.on('playerJoined', (data) => {
    players = data.players;
    renderPlayers();
    updateStartButton();
  });

  // Player left
  socket.on('playerLeft', (data) => {
    players = data.players;
    renderPlayers();
  });

  // Game started
  socket.on('gameStarted', (data) => {
    gameStatus = 'playing';
    $('startGameBtn').classList.add('hidden');
    $('canvasOverlay').classList.add('hidden');
    $('scoreOverlay').classList.add('hidden');
  });

  // New turn
  socket.on('newTurn', (data) => {
    players = data.players;
    gameStatus = 'playing';
    isMyTurn = false;
    currentWord = null;

    renderPlayers();
    clearCanvasLocal();

    $('roundNum').textContent = data.round;
    $('maxRound').textContent = data.maxRounds;
    $('timerText').textContent = data.drawTime || 60;
    $('turnOverlay').classList.add('hidden');

    // Update word display
    if (data.drawer === currentUser.username) {
      // I'm the drawer — wait for 'yourTurn' event
    } else {
      // I'm guessing — show hint
      showWordHint(data.wordHint);
      $('canvasOverlay').classList.add('hidden');
      $('drawToolbar').classList.add('hidden');
      $('chatInput').placeholder = 'Type your guess...';
      $('chatInput').disabled = false;
    }
  });

  // My turn to draw
  socket.on('yourTurn', (data) => {
    isMyTurn = true;
    currentWord = data.word;
    gameStatus = 'playing';

    $('canvasOverlay').classList.add('hidden');
    $('drawToolbar').classList.remove('hidden');
    $('chatInput').placeholder = 'You are drawing...';
    $('chatInput').disabled = true;

    // Show the word to draw
    const wordArea = $('wordArea');
    wordArea.innerHTML = `<span class="drawer-word">Draw: ${escapeHtml(data.word.toUpperCase())}</span>`;
  });

  // Drawing data from others
  socket.on('draw', (drawData) => {
    const canvas = $('game-canvas');
    const ctx = canvas.getContext('2d');
    drawFromData(ctx, drawData);
  });

  // Clear canvas
  socket.on('clearCanvas', () => {
    clearCanvasLocal();
  });

  // Hint update
  socket.on('hintUpdate', (data) => {
    if (!isMyTurn) {
      showWordHint(data.wordHint);
    }
  });

  // Timer update
  socket.on('timerUpdate', (data) => {
    const el = $('timerText');
    el.textContent = data.timeLeft;

    const badge = $('timerBadge');
    badge.classList.remove('timer-warning', 'timer-danger');
    if (data.timeLeft <= 10) {
      badge.classList.add('timer-danger');
    } else if (data.timeLeft <= 20) {
      badge.classList.add('timer-warning');
    }
  });

  // Correct guess
  socket.on('correctGuess', (data) => {
    players = data.players;
    renderPlayers();
  });

  // Chat message
  socket.on('chatMessage', (data) => {
    addChatMessage(data, true);
  });

  // Turn ended
  socket.on('turnEnded', (data) => {
    players = data.players;
    isMyTurn = false;
    currentWord = null;
    renderPlayers();

    $('drawToolbar').classList.add('hidden');
    $('chatInput').disabled = false;
    $('chatInput').placeholder = 'Type your guess...';

    // Show turn result overlay
    $('turnResultWord').textContent = data.word ? data.word.toUpperCase() : '';
    $('turnResultTitle').textContent = "Time's Up!";
    $('turnResultText').textContent = 'Next turn starting soon...';
    $('turnOverlay').classList.remove('hidden');

    // Reset word area
    $('wordArea').innerHTML = '<span class="topbar-badge" id="statusBadge" style="font-size:0.85rem;">Next turn starting...</span>';

    // Auto-hide after 3.5s
    setTimeout(() => {
      $('turnOverlay').classList.add('hidden');
    }, 3500);
  });

  // Game ended
  socket.on('gameEnded', (data) => {
    gameStatus = 'finished';
    isMyTurn = false;
    currentWord = null;

    $('drawToolbar').classList.add('hidden');
    $('turnOverlay').classList.add('hidden');
    $('chatInput').disabled = false;

    renderScoreOverlay(data);
  });

  // Error
  socket.on('error', (data) => {
    addChatMessage({ type: 'system', message: data.message || 'An error occurred' }, true);
  });

  // Disconnect
  socket.on('disconnect', () => {
    addChatMessage({ type: 'system', message: 'Connection lost. Reconnecting...' }, true);
  });

  socket.on('reconnect', () => {
    socket.emit('joinRoom', { roomId, username: currentUser.username });
  });
}

// ---- UI Updates ----
function updateGameUI(data) {
  $('roundNum').textContent = data.round || 0;
  $('maxRound').textContent = data.maxRounds || 3;

  if (data.status === 'waiting') {
    gameStatus = 'waiting';
    $('canvasOverlay').classList.remove('hidden');
    $('overlayTitle').textContent = 'Waiting for players…';
    $('overlaySubtitle').textContent = 'Need at least 2 players to start';
    $('drawToolbar').classList.add('hidden');
    updateStartButton();
  } else if (data.status === 'playing') {
    gameStatus = 'playing';
    $('canvasOverlay').classList.add('hidden');

    if (data.currentDrawer === currentUser.username) {
      // Reconnecting as drawer
      isMyTurn = true;
      $('drawToolbar').classList.remove('hidden');
    } else {
      isMyTurn = false;
      $('drawToolbar').classList.add('hidden');
      if (data.wordHint) showWordHint(data.wordHint);
    }
  }
}

function updateStartButton() {
  const btn = $('startGameBtn');
  const connected = players.filter(p => p.connected);
  if (gameStatus === 'waiting' && connected.length >= 2) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

function showWordHint(hint) {
  if (!hint) return;
  const letters = hint.split('').map(ch => {
    if (ch === ' ') return '<span class="letter space"> </span>';
    if (ch === '_') return '<span class="letter blank">_</span>';
    return `<span class="letter revealed">${ch}</span>`;
  }).join('');
  $('wordArea').innerHTML = `<div class="word-display topbar-badge">${letters}</div>`;
}

// ---- Render Players ----
function renderPlayers() {
  $('playerCount').textContent = players.filter(p => p.connected).length;

  let html = '';
  const sorted = [...players].sort((a, b) => b.score - a.score);
  sorted.forEach(p => {
    const isMe = p.username === currentUser.username;
    const initial = p.username.charAt(0).toUpperCase();
    const cardClass = [
      'player-card',
      p.isDrawing ? 'drawing' : '',
      p.hasGuessed ? 'guessed' : '',
      !p.connected ? 'disconnected' : '',
      isMe ? 'is-me' : '',
    ].filter(Boolean).join(' ');

    const avatarClass = p.isDrawing ? 'drawing-avatar' : 'default-avatar';

    let statusIcon = '';
    if (p.isDrawing) statusIcon = '<span class="status-icon pencil-icon">✏️</span>';
    else if (p.hasGuessed) statusIcon = '<span class="status-icon check-icon">✓</span>';

    html += `
      <div class="${cardClass}">
        <div class="player-avatar ${avatarClass}">
          ${initial}
          ${statusIcon}
        </div>
        <div class="player-info">
          <div class="player-name ${isMe ? 'me' : ''}">${escapeHtml(p.username)}${isMe ? '<span class="you-tag">(you)</span>' : ''}</div>
          <div class="player-score">${p.score} pts</div>
        </div>
      </div>`;
  });
  $('playerList').innerHTML = html;
}

// ---- Chat ----
function addChatMessage(msg, scroll) {
  const container = $('chatMessages');
  const div = document.createElement('div');

  if (msg.type === 'system') {
    div.className = 'chat-msg system';
    div.textContent = msg.message;
  } else if (msg.type === 'correct') {
    div.className = 'chat-msg correct';
    div.textContent = '🎉 ' + msg.message;
  } else {
    div.className = 'chat-msg guess';
    const isMe = msg.username === currentUser.username;
    div.innerHTML = `<span class="sender ${isMe ? 'me' : ''}">${escapeHtml(msg.username)}:</span> ${escapeHtml(msg.message)}`;
  }

  container.appendChild(div);
  msgCount++;
  if ($('msgCount')) $('msgCount').textContent = msgCount;

  if (scroll) {
    container.scrollTop = container.scrollHeight;
  }
}

function sendGuess() {
  const input = $('chatInput');
  const message = input.value.trim();
  if (!message || !socket) return;

  if (isMyTurn) {
    // Drawer can send chat messages
    socket.emit('chatMessage', { roomId, message });
  } else {
    // Guessers send guesses
    socket.emit('guess', { roomId, message });
  }
  input.value = '';
  input.focus();
}

// ---- Canvas ----
function initCanvas() {
  const canvas = $('game-canvas');
  const wrapper = $('canvasWrapper');

  function resize() {
    const rect = wrapper.getBoundingClientRect();
    canvasWidth = rect.width;
    canvasHeight = rect.height;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const ctx = canvas.getContext('2d');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Mouse events
  canvas.addEventListener('mousedown', (e) => startDraw(e, canvas));
  canvas.addEventListener('mousemove', (e) => doDraw(e, canvas));
  canvas.addEventListener('mouseup', () => stopDraw());
  canvas.addEventListener('mouseleave', () => stopDraw());

  // Touch events
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    startDraw(touch, canvas);
  });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    doDraw(touch, canvas);
  });
  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    stopDraw();
  });
}

function getCanvasPos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) / rect.height,
  };
}

function startDraw(e, canvas) {
  if (!isMyTurn) return;
  drawing = true;
  const pos = getCanvasPos(e, canvas);
  lastX = pos.x;
  lastY = pos.y;

  // Save snapshot for undo
  saveDrawSnapshot();
}

function doDraw(e, canvas) {
  if (!drawing || !isMyTurn) return;
  const pos = getCanvasPos(e, canvas);
  const ctx = canvas.getContext('2d');

  const drawData = {
    type: 'draw',
    x0: lastX,
    y0: lastY,
    x1: pos.x,
    y1: pos.y,
    color: currentTool === 'eraser' ? '#1E293B' : currentColor,
    size: currentBrushSize,
  };

  drawLine(ctx, drawData);
  socket.emit('draw', { roomId, drawData });

  lastX = pos.x;
  lastY = pos.y;
}

function stopDraw() {
  drawing = false;
}

function drawLine(ctx, d) {
  ctx.beginPath();
  ctx.strokeStyle = d.color;
  ctx.lineWidth = d.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.moveTo(d.x0 * canvasWidth, d.y0 * canvasHeight);
  ctx.lineTo(d.x1 * canvasWidth, d.y1 * canvasHeight);
  ctx.stroke();
}

function drawFromData(ctx, d) {
  if (d.type === 'clear') {
    clearCanvasLocal();
  } else if (d.type === 'fill') {
    ctx.fillStyle = d.color;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  } else {
    drawLine(ctx, d);
  }
}

function clearCanvasLocal() {
  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
}

function clearCanvasAction() {
  if (!isMyTurn) return;
  clearCanvasLocal();
  socket.emit('clearCanvas', { roomId });
}

function fillCanvas() {
  if (!isMyTurn) return;
  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d');
  const fillColor = currentTool === 'eraser' ? '#1E293B' : currentColor;
  ctx.fillStyle = fillColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  socket.emit('draw', {
    roomId,
    drawData: { type: 'fill', color: fillColor },
  });
}

function saveDrawSnapshot() {
  const canvas = $('game-canvas');
  const data = canvas.toDataURL();
  drawHistory.push(data);
  if (drawHistory.length > 20) drawHistory.shift();
}

function undoCanvas() {
  if (!isMyTurn || drawHistory.length === 0) return;
  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d');
  const imgData = drawHistory.pop();
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
  };
  img.src = imgData;
  // Note: undo only works locally, doesn't sync
}

// ---- Toolbar ----
function initToolbar() {
  // Render color palette
  const palette = $('colorPalette');
  COLORS.forEach((color, i) => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch' + (i === 0 ? ' active' : '');
    swatch.style.backgroundColor = color;
    swatch.style.color = color;
    swatch.dataset.color = color;
    swatch.onclick = () => selectColor(color, swatch);
    palette.appendChild(swatch);
  });

  // Render brush sizes
  const sizes = $('brushSizes');
  BRUSH_SIZES.forEach((b, i) => {
    const btn = document.createElement('div');
    btn.className = 'brush-size-btn' + (i === 1 ? ' active' : '');
    btn.dataset.size = b.size;
    btn.innerHTML = `<span class="brush-dot" style="width:${b.dotSize}px;height:${b.dotSize}px;"></span>`;
    btn.onclick = () => selectBrushSize(b.size, btn);
    sizes.appendChild(btn);
  });
}

function selectColor(color, el) {
  currentColor = color;
  currentTool = 'pen';
  updateToolButtons();
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
}

function selectBrushSize(size, el) {
  currentBrushSize = size;
  document.querySelectorAll('.brush-size-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

function selectTool(tool) {
  currentTool = tool;
  updateToolButtons();
}

function updateToolButtons() {
  $('penTool').classList.toggle('active', currentTool === 'pen');
  $('eraserTool').classList.toggle('active', currentTool === 'eraser');
}

// ---- Game Actions ----
function startGame() {
  if (!socket) return;
  socket.emit('startGame', { roomId });
}

function leaveGame() {
  if (socket) socket.disconnect();
  window.location.href = '/home.html';
}

function copyRoomCode() {
  navigator.clipboard.writeText(roomId).then(() => {
    const el = $('roomCodeText');
    const orig = el.textContent;
    el.textContent = 'Copied!';
    setTimeout(() => { el.textContent = orig; }, 1500);
  }).catch(() => {});
}

function playAgain() {
  $('scoreOverlay').classList.add('hidden');
  // Room resets automatically on server side
}

// ---- Score Overlay ----
function renderScoreOverlay(data) {
  const rankEmoji = ['🥇', '🥈', '🥉'];
  const rankClass = ['gold', 'silver', 'bronze'];

  $('winnerText').textContent = data.winner
    ? `${data.winner} wins with ${data.finalScores[0]?.score || 0} points!`
    : 'No winner';

  let html = '';
  data.finalScores.forEach((p, i) => {
    const rClass = i < 3 ? rankClass[i] : '';
    html += `
      <div class="score-item">
        <span class="score-rank ${rClass}">${i < 3 ? rankEmoji[i] : '#'+(i+1)}</span>
        <div class="player-avatar ${i === 0 ? 'drawing-avatar' : 'default-avatar'}" style="width:36px;height:36px;font-size:0.85rem;">
          ${p.username.charAt(0).toUpperCase()}
        </div>
        <span class="score-name">${escapeHtml(p.username)}${p.username === currentUser.username ? ' (you)' : ''}</span>
        <span class="score-points">${p.score} pts</span>
      </div>`;
  });
  $('scoreList').innerHTML = html;
  $('scoreOverlay').classList.remove('hidden');
}
