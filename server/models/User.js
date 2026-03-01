const bcrypt = require('bcryptjs');
const { db } = require('../config/database');

class User {
  static async findByUsername(username) {
    const stmt = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE');
    return stmt.get(username);
  }

  static async findById(id) {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
  }

  static async create(username, password) {
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const stmt = db.prepare(`
      INSERT INTO users (username, password)
      VALUES (?, ?)
    `);

    const result = stmt.run(username, hashedPassword);
    return this.findById(result.lastInsertRowid);
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
    const stmt = db.prepare(`
      UPDATE users 
      SET gamesPlayed = ?, gamesWon = ?, score = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(gamesPlayed, gamesWon, score, userId);
  }

  static async recordGameResult(player1Id, player2Id, winnerUserId, gameType = 'multiplayer') {
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

    // Update winner stats
    if (winnerUserId) {
      const winner = await this.findById(winnerUserId);
      if (winner) {
        this.updateStats(
          winnerUserId,
          winner.gamesPlayed + 1,
          winner.gamesWon + 1,
          winner.score + 10
        );
      }
    }

    return result.lastInsertRowid;
  }

  static async getLeaderboard(limit = 100) {
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
    
    return stmt.all(limit);
  }

  static async getGameHistory(userId, limit = 20) {
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
    
    return stmt.all(userId, userId, limit);
  }

  static async getStats(userId) {
    const user = await this.findById(userId);
    if (!user) return null;

    const gameHistory = this.getGameHistory(userId, 10);
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

  static toJSON(user) {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}

module.exports = User;
