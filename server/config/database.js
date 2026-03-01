const Database = require('better-sqlite3');
const path = require('path');

// Create database file in data directory
const dbPath = path.join(__dirname, '../data/drawbattle.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize tables
function initializeDatabase() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
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

  // Games table - to track game history
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player1Id INTEGER NOT NULL,
      player2Id INTEGER,
      winnerUserId INTEGER,
      gameType TEXT DEFAULT 'solo',
      rounds INTEGER DEFAULT 1,
      totalDuration INTEGER,
      result TEXT DEFAULT 'pending',
      gameData TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player1Id) REFERENCES users(id),
      FOREIGN KEY (player2Id) REFERENCES users(id),
      FOREIGN KEY (winnerUserId) REFERENCES users(id)
    );
  `);

  // Leaderboard table (materialized view for performance)
  db.exec(`
    CREATE TABLE IF NOT EXISTS leaderboard_cache (
      userId INTEGER PRIMARY KEY,
      username TEXT NOT NULL,
      rank INTEGER,
      score INTEGER,
      gamesPlayed INTEGER,
      gamesWon INTEGER,
      winRate REAL,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id)
    );
  `);

  console.log('✅ Database tables initialized successfully');
}

function updateLeaderboard() {
  try {
    const updateStmt = db.prepare(`
      INSERT INTO leaderboard_cache (userId, username, rank, score, gamesPlayed, gamesWon, winRate)
      SELECT 
        u.id,
        u.username,
        ROW_NUMBER() OVER (ORDER BY u.score DESC, u.gamesWon DESC) as rank,
        u.score,
        u.gamesPlayed,
        u.gamesWon,
        CASE WHEN u.gamesPlayed > 0 THEN CAST(u.gamesWon AS REAL) / u.gamesPlayed ELSE 0 END as winRate
      FROM users u
      ON CONFLICT(userId) DO UPDATE SET
        rank = excluded.rank,
        score = excluded.score,
        gamesPlayed = excluded.gamesPlayed,
        gamesWon = excluded.gamesWon,
        winRate = excluded.winRate,
        updatedAt = CURRENT_TIMESTAMP
    `);
    
    updateStmt.run();
  } catch (error) {
    console.error('Error updating leaderboard:', error);
  }
}

// Initialize on startup
initializeDatabase();

module.exports = { db, updateLeaderboard };
