const { db } = require('../config/database');

class Room {
  static create(roomId, roomData) {
    try {
      const stmt = db.prepare(`
        INSERT INTO rooms (roomId, name, maxPlayers, maxRounds, drawTime, status, creatorId)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        roomId,
        roomData.name || 'Game Room',
        roomData.maxPlayers || 8,
        roomData.maxRounds || 3,
        roomData.drawTime || 60,
        'waiting',
        roomData.creatorId || null
      );
      
      return this.findByRoomId(roomId);
    } catch (error) {
      console.error('Error creating room:', error);
      throw error;
    }
  }

  static findByRoomId(roomId) {
    try {
      const stmt = db.prepare('SELECT * FROM rooms WHERE roomId = ?');
      return stmt.get(roomId);
    } catch (error) {
      console.error('Error finding room:', error);
      return null;
    }
  }

  static getAllRooms() {
    try {
      const stmt = db.prepare(`
        SELECT * FROM rooms 
        WHERE status IN ('waiting', 'playing')
        ORDER BY createdAt DESC
        LIMIT 50
      `);
      return stmt.all() || [];
    } catch (error) {
      console.error('Error getting all rooms:', error);
      return [];
    }
  }

  static updateRoom(roomId, updateData) {
    try {
      const fields = [];
      const values = [];
      
      if (updateData.status) {
        fields.push('status = ?');
        values.push(updateData.status);
      }
      if (updateData.round !== undefined) {
        fields.push('round = ?');
        values.push(updateData.round);
      }
      if (updateData.currentDrawer) {
        fields.push('currentDrawer = ?');
        values.push(updateData.currentDrawer);
      }
      if (updateData.currentWord) {
        fields.push('currentWord = ?');
        values.push(updateData.currentWord);
      }
      
      if (fields.length === 0) return;
      
      values.push(roomId);
      const stmt = db.prepare(`
        UPDATE rooms 
        SET ${fields.join(', ')}
        WHERE roomId = ?
      `);
      stmt.run(...values);
    } catch (error) {
      console.error('Error updating room:', error);
    }
  }

  static deleteRoom(roomId) {
    try {
      const stmt = db.prepare('DELETE FROM rooms WHERE roomId = ?');
      stmt.run(roomId);
    } catch (error) {
      console.error('Error deleting room:', error);
    }
  }

  static toJSON(room) {
    if (!room) return null;
    return {
      roomId: room.roomId,
      name: room.name,
      maxPlayers: room.maxPlayers,
      maxRounds: room.maxRounds,
      drawTime: room.drawTime,
      round: room.round || 0,
      status: room.status,
      currentDrawer: room.currentDrawer,
      currentWord: room.currentWord,
      createdAt: room.createdAt,
      playerCount: room.playerCount || 0,
    };
  }
}

// Create rooms table if it doesn't exist
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roomId TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT 'Game Room',
      maxPlayers INTEGER DEFAULT 8,
      maxRounds INTEGER DEFAULT 3,
      drawTime INTEGER DEFAULT 60,
      round INTEGER DEFAULT 0,
      currentDrawer TEXT,
      currentWord TEXT,
      status TEXT DEFAULT 'waiting',
      creatorId INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creatorId) REFERENCES users(id)
    );
  `);
} catch (err) {
  // Table already exists
}

module.exports = Room;
