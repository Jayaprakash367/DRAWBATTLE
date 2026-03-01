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

// Serve HTML files from html subdirectory
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'html', 'index.html'));
});
app.get('/home.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'html', 'home.html'));
});
app.get('/game.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'html', 'game.html'));
});
app.get('/solo.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'html', 'solo.html'));
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Health check
app.get('/health', (req, res) => {
  try {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(500).json({ error: 'Health check failed' });
  }
});

// Fallback: serve index.html for unknown routes (not API, not static)
app.use((req, res, next) => {
  try {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      res.sendFile(path.join(__dirname, 'public', 'html', 'index.html'));
    } else {
      next();
    }
  } catch (error) {
    console.error('❌ Routing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ Global error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Express Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Don't expose internal error details to clients
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Setup websocket handlers with error handling
try {
  setupSocket(io);
} catch (error) {
  console.error('❌ Socket.io setup error:', error);
}

// ✅ Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't crash the server on unhandled rejections in Vercel
});

// ✅ Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Log but don't crash in production
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// Start server
const PORT = process.env.PORT || 5000;

// Check if running in Vercel serverless environment
const IS_VERCEL = !!process.env.VERCEL;

async function startServer() {
  try {
    console.log('🚀 Starting DrawBattle Server...');
    console.log('📊 Database Mode:', process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite');
    console.log('🌍 Environment:', IS_VERCEL ? 'Vercel Serverless' : 'Local/Self-hosted');
    
    // Initialize database tables
    if (typeof db.initializeDatabase === 'function') {
      await db.initializeDatabase();
    }
    
    console.log('✅ Database initialized successfully');
    
    // For local/self-hosted deployment, start the HTTP server
    if (!IS_VERCEL) {
      server.listen(PORT, () => {
        console.log(`\n  🎨 DrawBattle Server running at:`);
        console.log(`  → http://localhost:${PORT}`);
        console.log(`  🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`  🔐 Rate limiting: Enabled`);
        console.log(`  💾 Database: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite'}\n`);
      });
    } else {
      console.log('✅ Running in Vercel serverless mode (no HTTP server needed)');
    }

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    console.error(error);
    
    // In Vercel, don't exit - the function will be retried
    if (!IS_VERCEL) {
      process.exit(1);
    }
  }
}

// ✅ Start the server
startServer();

// Export app for Vercel serverless + local server support
module.exports = { app, server, io };
