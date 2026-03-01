const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', [
  body('username').trim().isLength({ min: 3, max: 20 }).escape()
    .withMessage('Username must be 3-20 characters'),
  body('password').isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { username, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Create new user
    const user = await User.create(username, password);

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({ token, user: User.toJSON(user) });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login
router.post('/login', [
  body('username').trim().notEmpty().escape(),
  body('password').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const { username, password } = req.body;

    // Authenticate user
    const user = await User.authenticate(username, password);
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({ token, user: User.toJSON(user) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: User.toJSON(user) });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user stats
router.get('/stats/:userId', async (req, res) => {
  try {
    const stats = await User.getStats(parseInt(req.params.userId));
    if (!stats) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(stats);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const leaderboard = await User.getLeaderboard(limit);
    res.json({ leaderboard, total: leaderboard.length });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Record game result (protected)
router.post('/game-result', auth, async (req, res) => {
  try {
    const { player2Id, winnerUserId, gameType } = req.body;
    const gameId = await User.recordGameResult(
      req.user.id,
      player2Id,
      winnerUserId,
      gameType || 'multiplayer'
    );

    res.json({ gameId, message: 'Game recorded successfully' });
  } catch (error) {
    console.error('Record game error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
