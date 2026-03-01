const bcrypt = require('bcryptjs');
const { db } = require('../config/database');

class User {
  static async findByUsername(username) {
    if (db._isPostgres) {
      const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
      return result.rows ? result.rows[0] : null;
    } else {
      const stmt = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE');
      return stmt.get(username);
    }
  }

  static async findById(id) {
    if (db._isPostgres) {
      const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
      return result.rows ? result.rows[0] : null;
    } else {
      const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
      return stmt.get(id);
    }
  }

  static async create(username, password) {
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (db._isPostgres) {
      // PostgreSQL: Use RETURNING clause
      const result = await db.query(
        `INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id`,
        [username, hashedPassword]
      );
      if (result.rows && result.rows.length > 0) {
        return this.findById(result.rows[0].id);
      }
    } else {
      // SQLite: Use lastInsertRowid
      const stmt = db.prepare(`
        INSERT INTO users (username, password)
        VALUES (?, ?)
      `);
      const result = stmt.run(username, hashedPassword);
      return this.findById(result.lastInsertRowid);
    }
  }

  static async authenticate(username, password) {
    const user = await this.findByUsername(username);
    if (!user) {
      return null;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    return isMatch ? user : null;
  }

  static async updateStats(userId, gamesPlayed, gamesWon, score) {
    if (db._isPostgres) {
      // PostgreSQL
      await db.query(
        `UPDATE users SET gamesPlayed = $1, gamesWon = $2, score = $3, updatedAt = CURRENT_TIMESTAMP WHERE id = $4`,
        [gamesPlayed, gamesWon, score, userId]
      ).catch(err => console.error('❌ PostgreSQL updateStats error:', err));
    } else {
      // SQLite
      const stmt = db.prepare(`
        UPDATE users 
        SET gamesPlayed = ?, gamesWon = ?, score = ?, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(gamesPlayed, gamesWon, score, userId);
    }
  }

  static async updateByUsername(username, scoreIncrease, isWinner = false) {
    try {
      const user = await this.findByUsername(username);
      if (!user) {
        console.warn(`⚠️ User not found: ${username}`);
        return null;
      }

      const stmt = db.prepare(`
        UPDATE users 
        SET score = score + ?,
            gamesPlayed = gamesPlayed + 1,
            gamesWon = gamesWon + ?,
            updatedAt = CURRENT_TIMESTAMP
        WHERE username = ?
      `);
      
      stmt.run(scoreIncrease, isWinner ? 1 : 0, username);
      return this.findByUsername(username);
    } catch (err) {
      console.error(`❌ Error updating user ${username}:`, err);
      throw err;
    }
  }

  static async recordGameResult(player1Id, player2Id, winnerUserId, gameType = 'multiplayer') {
    let gameId = null;
    
    if (db._isPostgres) {
      // PostgreSQL: Use RETURNING clause
      const result = await db.query(
        `INSERT INTO games (player1Id, player2Id, winnerUserId, gameType, result) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [player1Id, player2Id, winnerUserId, gameType, winnerUserId ? 'completed' : 'pending']
      );
      if (result.rows && result.rows.length > 0) {
        gameId = result.rows[0].id;
      }
    } else {
      // SQLite: Use lastInsertRowid
      const stmt = db.prepare(`
        INSERT INTO games (player1Id, player2Id, winnerUserId, gameType, result)
        VALUES (?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        player1Id,
        player2Id,
        winnerUserId,
        gameType,
        winnerUserId ? 'completed' : 'pending'
      );
      gameId = result.lastInsertRowid;
    }

    // Update winner stats
    if (winnerUserId) {
      const winner = await this.findById(winnerUserId);
      if (winner) {
        await this.updateStats(
          winnerUserId,
          winner.gamesPlayed + 1,
          winner.gamesWon + 1,
          winner.score + 10
        );
      }
    }

    return gameId;
  }

  static async getLeaderboard(limit = 100) {
    try {
      if (db._isPostgres) {
        const result = await db.query(`
          SELECT 
            u.id,
            u.username,
            u.score,
            u.gamesplayed,
            u.gameswon,
            ROUND(CAST(u.gameswon AS NUMERIC) / NULLIF(u.gamesplayed, 0) * 100, 2) as winrate,
            ROW_NUMBER() OVER (ORDER BY u.score DESC, u.gameswon DESC) as rank,
            u.avatar
          FROM users u
          WHERE u.gamesplayed > 0
          ORDER BY u.score DESC, u.gameswon DESC
          LIMIT $1
        `, [limit]);
        return result.rows || [];
      } else {
        const stmt = db.prepare(`
          SELECT 
            u.id,
            u.username,
            u.score,
            u.gamesPlayed,
            u.gamesWon,
            CASE WHEN u.gamesPlayed > 0 THEN ROUND(CAST(u.gamesWon AS REAL) / u.gamesPlayed * 100, 2) ELSE 0 END as winRate,
            ROW_NUMBER() OVER (ORDER BY u.score DESC, u.gamesWon DESC) as rank,
            u.avatar
          FROM users u
          WHERE u.gamesPlayed > 0
          ORDER BY u.score DESC, u.gamesWon DESC
          LIMIT ?
        `);
        return stmt.all(limit) || [];
      }
    } catch (err) {
      console.error('\u274c getLeaderboard error:', err);
      return [];
    }
  }

  static async getGameHistory(userId, limit = 20) {
    try {
      if (db._isPostgres) {
        const result = await db.query(`
          SELECT 
            g.id,
            g.player1id,
            g.player2id,
            g.winneruserid,
            g.gametype,
            g.rounds,
            g.result,
            g.createdat,
            u1.username as player1username,
            u2.username as player2username,
            u3.username as winnerusername
          FROM games g
          LEFT JOIN users u1 ON g.player1id = u1.id
          LEFT JOIN users u2 ON g.player2id = u2.id
          LEFT JOIN users u3 ON g.winneruserid = u3.id
          WHERE g.player1id = $1 OR g.player2id = $1
          ORDER BY g.createdat DESC
          LIMIT $2
        `, [userId, limit]);
        return result.rows || [];
      } else {
        const stmt = db.prepare(`
          SELECT 
            g.id,
            g.player1Id,
            g.player2Id,
            g.winnerUserId,
            g.gameType,
            g.rounds,
            g.result,
            g.createdAt,
            u1.username as player1Username,
            u2.username as player2Username,
            u3.username as winnerUsername
          FROM games g
          LEFT JOIN users u1 ON g.player1Id = u1.id
          LEFT JOIN users u2 ON g.player2Id = u2.id
          LEFT JOIN users u3 ON g.winnerUserId = u3.id
          WHERE g.player1Id = ? OR g.player2Id = ?
          ORDER BY g.createdAt DESC
          LIMIT ?
        `);
        return stmt.all(userId, userId, limit) || [];
      }
    } catch (err) {
      console.error('\u274c getGameHistory error:', err);
      return [];
    }
  }

  static async getStats(userId) {
    const user = await this.findById(userId);
    if (!user) return null;

    const gameHistory = await this.getGameHistory(userId, 10);
    
    if (db._isPostgres) {
      const leaderboardRank = await db.query(`
        SELECT COUNT(*) + 1 as rank FROM users 
        WHERE score > (SELECT score FROM users WHERE id = $1)
      `, [userId]);
      const rankValue = leaderboardRank.rows && leaderboardRank.rows[0] ? leaderboardRank.rows[0].rank : 0;
      return {
        ...user,
        rank: rankValue,
        recentGames: gameHistory,
        winRate: user.gamesplayed > 0 ? (user.gameswon / user.gamesplayed * 100).toFixed(2) : 0
      };
    } else {
      const leaderboardRank = db.prepare(`
        SELECT COUNT(*) + 1 as rank FROM users 
        WHERE score > (SELECT score FROM users WHERE id = ?)
      `).get(userId);
      return {
        ...user,
        rank: leaderboardRank.rank,
        recentGames: gameHistory,
        winRate: user.gamesPlayed > 0 ? (user.gamesWon / user.gamesPlayed * 100).toFixed(2) : 0
      };
    }
  }

  static toJSON(user) {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}

module.exports = User;
