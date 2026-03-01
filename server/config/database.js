const path = require('path');
let db;
const USE_POSTGRES = !!process.env.DATABASE_URL;

if (USE_POSTGRES) {
  // PostgreSQL for production (Vercel, Railway, etc.)
  const { Pool } = require('pg');
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  console.log('🔌 Connecting to PostgreSQL...');
  
  // Wrap pool for compatibility
  db._isPostgres = true;
  db.prepare = (sql) => ({
    run: (...params) => db.query(sql, params),
    get: (...params) => db.query(sql, params),
    all: (...params) => db.query(sql, params)
  });
  
  db.exec = (sql) => db.query(sql).catch(err => 
    console.warn('⚠️ Query warning:', err.message)
  );
} else {
  // SQLite for local development
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, '../data/drawbattle.db');
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db._isPostgres = false;
  
  console.log('🗄️ Using SQLite database at:', dbPath);
}

// Initialize tables
async function initializeDatabase() {
  try {
    console.log('📦 Initializing database tables...');
    
    if (USE_POSTGRES) {
      const client = await db.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            avatar TEXT DEFAULT 'default',
            score INTEGER DEFAULT 0,
            gamesPlayed INTEGER DEFAULT 0,
            gamesWon INTEGER DEFAULT 0,
            totalDrawTime INTEGER DEFAULT 0,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        
        await client.query(`
          CREATE TABLE IF NOT EXISTS games (
            id SERIAL PRIMARY KEY,
            player1Id INTEGER,
            player2Id INTEGER,
            winnerUserId INTEGER,
            gameType TEXT DEFAULT 'solo',
            rounds INTEGER DEFAULT 1,
            totalDuration INTEGER,
            result TEXT DEFAULT 'pending',
            gameData TEXT,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        
        await client.query(`
          CREATE TABLE IF NOT EXISTS leaderboard_cache (
            userId INTEGER PRIMARY KEY,
            username TEXT NOT NULL,
            rank INTEGER,
            score INTEGER,
            gamesPlayed INTEGER,
            gamesWon INTEGER,
            winRate REAL,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        
        console.log('✅ PostgreSQL tables initialized');
      } finally {
        client.release();
      }
    } else {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          avatar TEXT DEFAULT 'default',
          score INTEGER DEFAULT 0,
          gamesPlayed INTEGER DEFAULT 0,
          gamesWon INTEGER DEFAULT 0,
          totalDrawTime INTEGER DEFAULT 0,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      db.exec(`
        CREATE TABLE IF NOT EXISTS games (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          player1Id INTEGER,
          player2Id INTEGER,
          winnerUserId INTEGER,
          gameType TEXT DEFAULT 'solo',
          rounds INTEGER DEFAULT 1,
          totalDuration INTEGER,
          result TEXT DEFAULT 'pending',
          gameData TEXT,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      db.exec(`
        CREATE TABLE IF NOT EXISTS leaderboard_cache (
          userId INTEGER PRIMARY KEY,
          username TEXT NOT NULL,
          rank INTEGER,
          score INTEGER,
          gamesPlayed INTEGER,
          gamesWon INTEGER,
          winRate REAL,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      console.log('✅ SQLite tables initialized');
    }
  } catch (err) {
    console.error('❌ Database error:', err.message);
  }
}

// Initialize on startup
initializeDatabase();

module.exports = { db, initializeDatabase };
