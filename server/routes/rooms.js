const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const Room = require('../models/Room');
const User = require('../models/User');

const router = express.Router();

// Optional auth - sets req.user if token present, but doesn't block
const optionalAuth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    }
  } catch (e) { /* ignore invalid tokens */ }
  next();
};

// Create room (works for both guests and logged-in users)
router.post('/create', optionalAuth, [
  body('name').optional().trim().isLength({ max: 30 }).escape(),
  body('maxPlayers').optional().isInt({ min: 2, max: 12 }),
  body('maxRounds').optional().isInt({ min: 1, max: 10 }),
  body('drawTime').optional().isInt({ min: 30, max: 120 }),
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { name, maxPlayers, maxRounds, drawTime } = req.body;
    const roomId = uuidv4();
    const creatorName = req.user?.username || 'Guest';

    const roomData = {
      roomId,
      name: name || `${creatorName}'s Room`,
      maxPlayers: maxPlayers || 8,
      maxRounds: maxRounds || 3,
      drawTime: drawTime || 60,
      status: 'waiting',
      creatorId: req.user?.id || null,
    };

    // Create room in database
    const room = Room.create(roomId, roomData);

    if (!room) {
      return res.status(500).json({ error: 'Failed to create room' });
    }

    res.status(201).json({
      success: true,
      room: Room.toJSON(room)
    });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Server error creating room' });
  }
});

// Get available rooms
router.get('/list', (req, res) => {
  try {
    const rooms = Room.getAllRooms();
    
    const roomList = rooms.map(r => ({
      roomId: r.roomId,
      name: r.name,
      playerCount: 0, // Will be updated by Socket.io
      maxPlayers: r.maxPlayers,
      drawTime: r.drawTime,
      status: r.status,
      createdAt: r.createdAt,
    }));

    res.json({ success: true, rooms: roomList });
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Server error fetching rooms' });
  }
});

// Get room by ID
router.get('/:roomId', (req, res) => {
  try {
    const room = Room.findByRoomId(req.params.roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.json({ success: true, room: Room.toJSON(room) });
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
