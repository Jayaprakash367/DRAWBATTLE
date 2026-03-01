const Room = require('../models/Room');
const User = require('../models/User');
const { getRandomWord, getWordChoices, generateHint } = require('../utils/words');

const rooms = new Map(); // In-memory room state for speed
const timers = new Map();

function setupSocket(io) {
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join Room
    socket.on('joinRoom', async ({ roomId, username }) => {
      try {
        if (!roomId || !username) return;
        const sanitizedUsername = username.replace(/[<>&"']/g, '');

        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = sanitizedUsername;

        // Initialize in-memory room if not exists
        if (!rooms.has(roomId)) {
          rooms.set(roomId, {
            roomId,
            players: [],
            currentDrawer: null,
            currentWord: null,
            wordHint: null,
            round: 0,
            maxRounds: 3,
            turnIndex: 0,
            status: 'waiting',
            drawTime: 60,
            drawingData: [],
            chatMessages: [],
          });
        }

        const room = rooms.get(roomId);

        // Prevent duplicate players
        const existingIdx = room.players.findIndex(p => p.username === sanitizedUsername);
        if (existingIdx !== -1) {
          room.players[existingIdx].socketId = socket.id;
          room.players[existingIdx].connected = true;
        } else {
          if (room.players.length >= (room.maxPlayers || 8)) {
            socket.emit('error', { message: 'Room is full' });
            return;
          }
          room.players.push({
            username: sanitizedUsername,
            socketId: socket.id,
            score: 0,
            isDrawing: false,
            hasGuessed: false,
            connected: true,
          });
        }

        // Notify everyone
        io.to(roomId).emit('playerJoined', {
          players: room.players.map(p => ({
            username: p.username,
            score: p.score,
            isDrawing: p.isDrawing,
            hasGuessed: p.hasGuessed,
            connected: p.connected,
          })),
          message: `${sanitizedUsername} joined the room!`,
        });

        // Send current state to the joining player
        socket.emit('roomState', {
          players: room.players.map(p => ({
            username: p.username,
            score: p.score,
            isDrawing: p.isDrawing,
            hasGuessed: p.hasGuessed,
            connected: p.connected,
          })),
          status: room.status,
          round: room.round,
          maxRounds: room.maxRounds,
          currentDrawer: room.currentDrawer,
          wordHint: room.wordHint,
          drawingData: room.drawingData,
          chatMessages: room.chatMessages.slice(-50),
        });

        // Send system message
        const msg = {
          type: 'system',
          message: `${sanitizedUsername} joined the room!`,
          timestamp: Date.now(),
        };
        room.chatMessages.push(msg);
        io.to(roomId).emit('chatMessage', msg);

      } catch (error) {
        console.error('joinRoom error:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Start Game
    socket.on('startGame', ({ roomId }) => {
      try {
        const room = rooms.get(roomId);
        if (!room || room.players.length < 2) {
          socket.emit('error', { message: 'Need at least 2 players to start' });
          return;
        }
        if (room.status === 'playing') return;

        room.status = 'playing';
        room.round = 1;
        room.turnIndex = 0;

        // Reset scores
        room.players.forEach(p => {
          p.score = 0;
          p.hasGuessed = false;
        });

        io.to(roomId).emit('gameStarted', {
          round: room.round,
          maxRounds: room.maxRounds,
        });

        startNewTurn(io, roomId);
      } catch (error) {
        console.error('startGame error:', error);
      }
    });

    // Drawing data
    socket.on('draw', ({ roomId, drawData }) => {
      const room = rooms.get(roomId);
      if (!room || room.currentDrawer !== socket.username) return;

      // Store drawing data for late joiners
      if (drawData.type === 'clear') {
        room.drawingData = [];
      } else {
        room.drawingData.push(drawData);
      }

      // Broadcast to others
      socket.to(roomId).emit('draw', drawData);
    });

    // Guess
    socket.on('guess', ({ roomId, message }) => {
      try {
        const room = rooms.get(roomId);
        if (!room || !message) return;

        const sanitizedMessage = message.trim().substring(0, 100).replace(/[<>&"']/g, '');
        const player = room.players.find(p => p.username === socket.username);
        if (!player) return;

        // Drawer can't guess
        if (player.isDrawing) return;

        // Already guessed correctly
        if (player.hasGuessed) return;

        // Check if guess is correct
        if (room.currentWord &&
            sanitizedMessage.toLowerCase() === room.currentWord.toLowerCase()) {

          player.hasGuessed = true;

          // Calculate score based on time remaining (faster = more points)
          const guessersCount = room.players.filter(p => p.hasGuessed).length;
          const baseScore = 100;
          const bonus = Math.max(0, 50 - (guessersCount - 1) * 10);
          player.score += baseScore + bonus;

          // Give drawer points too
          const drawer = room.players.find(p => p.isDrawing);
          if (drawer) {
            drawer.score += 25;
          }

          // Notify correct guess
          io.to(roomId).emit('correctGuess', {
            username: socket.username,
            players: room.players.map(p => ({
              username: p.username,
              score: p.score,
              isDrawing: p.isDrawing,
              hasGuessed: p.hasGuessed,
              connected: p.connected,
            })),
          });

          const sysMsg = {
            type: 'correct',
            message: `${socket.username} guessed the word!`,
            timestamp: Date.now(),
          };
          room.chatMessages.push(sysMsg);
          io.to(roomId).emit('chatMessage', sysMsg);

          // Check if all non-drawers have guessed
          const activePlayers = room.players.filter(p => !p.isDrawing && p.connected);
          const allGuessed = activePlayers.every(p => p.hasGuessed);

          if (allGuessed) {
            endTurn(io, roomId);
          }
        } else {
          // Wrong guess - broadcast as chat message
          const chatMsg = {
            type: 'guess',
            username: socket.username,
            message: sanitizedMessage,
            timestamp: Date.now(),
          };
          room.chatMessages.push(chatMsg);
          io.to(roomId).emit('chatMessage', chatMsg);
        }
      } catch (error) {
        console.error('guess error:', error);
      }
    });

    // Chat message (non-game chat)
    socket.on('chatMessage', ({ roomId, message }) => {
      const room = rooms.get(roomId);
      if (!room || !message) return;
      const sanitized = message.trim().substring(0, 200).replace(/[<>&"']/g, '');
      const chatMsg = {
        type: 'chat',
        username: socket.username,
        message: sanitized,
        timestamp: Date.now(),
      };
      room.chatMessages.push(chatMsg);
      io.to(roomId).emit('chatMessage', chatMsg);
    });

    // Clear canvas
    socket.on('clearCanvas', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room || room.currentDrawer !== socket.username) return;
      room.drawingData = [];
      io.to(roomId).emit('clearCanvas');
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      const roomId = socket.roomId;
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        player.connected = false;

        const msg = {
          type: 'system',
          message: `${player.username} left the room.`,
          timestamp: Date.now(),
        };
        room.chatMessages.push(msg);
        io.to(roomId).emit('chatMessage', msg);

        io.to(roomId).emit('playerLeft', {
          username: player.username,
          players: room.players.map(p => ({
            username: p.username,
            score: p.score,
            isDrawing: p.isDrawing,
            hasGuessed: p.hasGuessed,
            connected: p.connected,
          })),
        });

        // If drawer left, end turn
        if (player.isDrawing && room.status === 'playing') {
          endTurn(io, roomId);
        }

        // If no connected players, clean up room after a delay
        const connectedPlayers = room.players.filter(p => p.connected);
        if (connectedPlayers.length === 0) {
          setTimeout(() => {
            const currentRoom = rooms.get(roomId);
            if (currentRoom && currentRoom.players.filter(p => p.connected).length === 0) {
              clearRoomTimer(roomId);
              rooms.delete(roomId);
              console.log(`Room ${roomId} cleaned up`);
            }
          }, 30000);
        }
      }
    });
  });
}

function startNewTurn(io, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  // Reset turn state
  room.drawingData = [];
  room.players.forEach(p => {
    p.isDrawing = false;
    p.hasGuessed = false;
  });

  const connectedPlayers = room.players.filter(p => p.connected);
  if (connectedPlayers.length < 2) {
    endGame(io, roomId);
    return;
  }

  // Select next drawer
  room.turnIndex = room.turnIndex % connectedPlayers.length;
  const drawer = connectedPlayers[room.turnIndex];
  drawer.isDrawing = true;
  room.currentDrawer = drawer.username;

  // Pick word
  const word = getRandomWord();
  room.currentWord = word;
  room.wordHint = word.replace(/[a-zA-Z]/g, '_');

  // Send word to drawer only
  const drawerSocket = io.sockets.sockets.get(drawer.socketId);
  if (drawerSocket) {
    drawerSocket.emit('yourTurn', { word });
  }

  // Send hint to everyone else
  io.to(roomId).emit('newTurn', {
    drawer: drawer.username,
    wordHint: room.wordHint,
    wordLength: word.length,
    round: room.round,
    maxRounds: room.maxRounds,
    players: room.players.map(p => ({
      username: p.username,
      score: p.score,
      isDrawing: p.isDrawing,
      hasGuessed: p.hasGuessed,
      connected: p.connected,
    })),
    drawTime: room.drawTime,
  });

  // Reveal hint progressively
  let hintLevel = 0;
  const hintInterval = setInterval(() => {
    hintLevel++;
    if (!rooms.has(roomId) || room.status !== 'playing') {
      clearInterval(hintInterval);
      return;
    }
    const revealed = word.split('').map((char, i) => {
      if (char === ' ') return ' ';
      if (Math.random() < hintLevel * 0.15) return char;
      return '_';
    }).join('');
    room.wordHint = revealed;
    io.to(roomId).emit('hintUpdate', { wordHint: revealed });
  }, room.drawTime * 250); // Reveal at 25%, 50%, 75%

  // Turn timer
  clearRoomTimer(roomId);
  const timer = setTimeout(() => {
    clearInterval(hintInterval);
    endTurn(io, roomId);
  }, room.drawTime * 1000);

  timers.set(roomId, { timer, hintInterval });

  // Countdown
  let timeLeft = room.drawTime;
  const countdown = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0 || !rooms.has(roomId)) {
      clearInterval(countdown);
      return;
    }
    io.to(roomId).emit('timerUpdate', { timeLeft });
  }, 1000);

  const existing = timers.get(roomId);
  if (existing) existing.countdown = countdown;
}

function endTurn(io, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  clearRoomTimer(roomId);

  // Reveal the word
  io.to(roomId).emit('turnEnded', {
    word: room.currentWord,
    players: room.players.map(p => ({
      username: p.username,
      score: p.score,
      isDrawing: p.isDrawing,
      hasGuessed: p.hasGuessed,
      connected: p.connected,
    })),
  });

  const sysMsg = {
    type: 'system',
    message: `The word was: ${room.currentWord}`,
    timestamp: Date.now(),
  };
  room.chatMessages.push(sysMsg);
  io.to(roomId).emit('chatMessage', sysMsg);

  // Move to next turn
  const connectedPlayers = room.players.filter(p => p.connected);
  room.turnIndex++;

  // Check if round is complete (all players have drawn)
  if (room.turnIndex >= connectedPlayers.length) {
    room.turnIndex = 0;
    room.round++;

    if (room.round > room.maxRounds) {
      endGame(io, roomId);
      return;
    }
  }

  // Wait before starting next turn
  setTimeout(() => {
    if (rooms.has(roomId) && room.status === 'playing') {
      startNewTurn(io, roomId);
    }
  }, 4000);
}

function endGame(io, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.status = 'finished';
  clearRoomTimer(roomId);

  // Sort by score
  const finalScores = [...room.players]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({
      rank: i + 1,
      username: p.username,
      score: p.score,
    }));

  io.to(roomId).emit('gameEnded', {
    finalScores,
    winner: finalScores[0]?.username,
  });

  const sysMsg = {
    type: 'system',
    message: `Game Over! Winner: ${finalScores[0]?.username} with ${finalScores[0]?.score} points!`,
    timestamp: Date.now(),
  };
  room.chatMessages.push(sysMsg);
  io.to(roomId).emit('chatMessage', sysMsg);

  // Update user scores in DB
  Promise.all(
    room.players.map((p) =>
      User.updateByUsername(
        p.username,
        p.score,
        p.username === finalScores[0]?.username
      ).catch((err) => {
        console.error(`Score update error for ${p.username}:`, err);
      })
    )
  ).catch((error) => {
    console.error('Batch score update error:', error);
  });

  // Reset room to waiting after delay
  setTimeout(() => {
    if (rooms.has(roomId)) {
      room.status = 'waiting';
      room.round = 0;
      room.turnIndex = 0;
      room.currentWord = null;
      room.currentDrawer = null;
      room.drawingData = [];
      room.players.forEach(p => {
        p.score = 0;
        p.isDrawing = false;
        p.hasGuessed = false;
      });
      io.to(roomId).emit('roomState', {
        players: room.players.map(p => ({
          username: p.username,
          score: p.score,
          isDrawing: p.isDrawing,
          hasGuessed: p.hasGuessed,
          connected: p.connected,
        })),
        status: room.status,
        round: 0,
        maxRounds: room.maxRounds,
        currentDrawer: null,
        wordHint: null,
        drawingData: [],
        chatMessages: room.chatMessages.slice(-50),
      });
    }
  }, 10000);
}

function clearRoomTimer(roomId) {
  const timerData = timers.get(roomId);
  if (timerData) {
    if (timerData.timer) clearTimeout(timerData.timer);
    if (timerData.hintInterval) clearInterval(timerData.hintInterval);
    if (timerData.countdown) clearInterval(timerData.countdown);
    timers.delete(roomId);
  }
}

module.exports = setupSocket;
