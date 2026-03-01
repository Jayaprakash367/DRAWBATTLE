require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { db } = require('./config/database');
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const setupSocket = require('./socket/gameHandler');

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors());

// Rate limiting - strict only for auth, relaxed for game endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many login attempts, please try again later.' },
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 500,
  message: { error: 'Too many requests, please try again later.' },
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/', apiLimiter);

// Body parser
app.use(express.json({ limit: '10kb' }));

// Serve static HTML/CSS/JS files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback: serve index.html for unknown routes (not API, not static)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    next();
  }
});

// Setup websocket handlers
setupSocket(io);

// Start server with SQLite
const PORT = process.env.PORT || 5000;

try {
  // Verify database is ready
  const testQuery = db.prepare('SELECT 1').get();
  console.log('✅ SQLite database connected successfully');
  
  server.listen(PORT, () => {
    console.log(`\n  🎨 DrawBattle Server running at:`);
    console.log(`  → http://localhost:${PORT}`);
    console.log(`  📊 Data stored in: data/drawbattle.db\n`);
  });
} catch (err) {
  console.error('❌ Database error:', err);
  process.exit(1);
}

module.exports = { app, server, io };
