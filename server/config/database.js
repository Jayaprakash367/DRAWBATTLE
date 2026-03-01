const path = require('path');
let db;
const USE_POSTGRES = !!process.env.DATABASE_URL;

console.log('🔧 Database Config:', USE_POSTGRES ? 'PostgreSQL' : 'SQLite');

// Helper to convert SQLite ? placeholders to PostgreSQL $1, $2 placeholders
function convertPlaceholders(sql, params) {
  if (!params || params.length === 0) {
    return { sql, params };
  }
  let paramIndex = 1;
  const convertedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
  return { sql: convertedSql, params };
}

if (USE_POSTGRES) {
  // PostgreSQL for production (Vercel, Railway, etc.)
  try {
    const { Pool } = require('pg');
    db = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      // Serverless connection pooling
      max: 1,  // Keep only 1 connection in Vercel
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    
    console.log('✅ PostgreSQL Pool created');
    
    // Wrap pool for compatibility
    db._isPostgres = true;
    
    db.prepare = (sql) => ({
      run: async (...params) => {
        try {
          const { sql: convertedSql, params: convertedParams } = convertPlaceholders(sql, params);
          const result = await db.query(convertedSql, convertedParams);
          return result;
        } catch (err) {
          console.error('❌ PostgreSQL Query Error:', { sql, params, error: err.message });
          throw err;
        }
      },
      get: async (...params) => {
        try {
          const { sql: convertedSql, params: convertedParams } = convertPlaceholders(sql, params);
          const result = await db.query(convertedSql, convertedParams);
          return result.rows ? result.rows[0] : null;
        } catch (err) {
          console.error('❌ PostgreSQL Query Error:', { sql, params, error: err.message });
          throw err;
        }
      },
      all: async (...params) => {
        try {
          const { sql: convertedSql, params: convertedParams } = convertPlaceholders(sql, params);
          const result = await db.query(convertedSql, convertedParams);
          return result.rows || [];
        } catch (err) {
          console.error('❌ PostgreSQL Query Error:', { sql, params, error: err.message });
          throw err;
        }
      }
    });
    
    db.exec = async (sql) => {
      try {
        await db.query(sql);
      } catch (err) {
        if (!err.message.includes('already exists')) {
          console.warn('⚠️ Query warning:', err.message);
        }
      }
    };

  } catch (error) {
    console.error('❌ PostgreSQL initialization error:', error.message);
  }
} else {
  // SQLite for local development
  try {
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, '../data/drawbattle.db');
    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    db._isPostgres = false;
    
    console.log('✅ SQLite initialized at:', dbPath);
  } catch (error) {
    console.error('❌ SQLite error:', error.message);
    // Create a mock db object so app doesn't crash
    db = {
      _isPostgres: false,
      prepare: () => ({ run: () => null, get: () => null, all: () => [] }),
      exec: () => null
    };
  }
}

// Initialize tables (non-blocking)
async function initializeDatabase() {
  if (!db) {
    console.warn('⚠️ Database not available, skipping table creation');
    return;
  }

  try {
    if (USE_POSTGRES) {
      const client = await db.connect();
      if (!client) {
        console.warn('⚠️ Could not get PostgreSQL client');
        return;
      }
      
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
          CREATE TABLE IF NOT EXISTS rooms (
            id SERIAL PRIMARY KEY,
            roomId TEXT UNIQUE NOT NULL,
            name TEXT DEFAULT 'Game Room',
            maxPlayers INTEGER DEFAULT 8,
            maxRounds INTEGER DEFAULT 3,
            drawTime INTEGER DEFAULT 60,
            round INTEGER DEFAULT 0,
            currentDrawer TEXT,
            currentWord TEXT,
            status TEXT DEFAULT 'waiting',
            creatorId INTEGER REFERENCES users(id),
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        
        await client.query(`
          CREATE TABLE IF NOT EXISTS games (
            id SERIAL PRIMARY KEY,
            player1Id INTEGER REFERENCES users(id),
            player2Id INTEGER REFERENCES users(id),
            winnerUserId INTEGER REFERENCES users(id),
            gameType TEXT DEFAULT 'multiplayer',
            rounds INTEGER DEFAULT 0,
            result TEXT DEFAULT 'pending',
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        
        console.log('✅ PostgreSQL tables created successfully');
      } catch (err) {
        if (!err.message.includes('already exists')) {
          console.warn('⚠️ Table creation warning:', err.message);
        }
      } finally {
        client.release();
      }
    } else if (db.exec) {
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
          player1Id INTEGER REFERENCES users(id),
          player2Id INTEGER REFERENCES users(id),
          winnerUserId INTEGER REFERENCES users(id),
          gameType TEXT DEFAULT 'multiplayer',
          rounds INTEGER DEFAULT 0,
          result TEXT DEFAULT 'pending',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      console.log('✅ SQLite tables created successfully');
    }
  } catch (err) {
    console.warn('⚠️ Database initialization warning:', err.message);
    // Don't crash on DB init errors
  }
}

// Export with sync wrapper
module.exports = { 
  db, 
  initializeDatabase,
  isPostgres: USE_POSTGRES
};
