# DrawBattle 🎨✨

A real-time multiplayer drawing and guessing game with a futuristic "aura" UI/UX design.

Built with **pure HTML/CSS/JavaScript** (no frameworks) and Node.js/Express backend.

## Features

- **Real-time Drawing**: Draw on canvas with mouse/touch, 16 colors, 5 brush sizes, eraser, fill, clear, undo
- **Multiplayer Rooms**: Create or join game rooms with socket.io for instant play
- **Live Guessing**: Real-time chat for guessing with server-validated scoring
- **Futuristic UI**: Dark neon glassmorphism theme with animated gradient orbs and grid overlay
- **Responsive Design**: Works on desktop and mobile with touch canvas support
- **Auth System**: JWT login/register with guest mode (no account required)
- **Leaderboard**: Global leaderboard tracking top scores (requires MongoDB)
- **Progressive Hints**: Word hints progressively revealed during each drawing turn

## Tech Stack

### Frontend
- Pure **HTML/CSS/JavaScript** (no React, Vue, or frameworks)
- CSS Grid + Flexbox, gradients, animations, glassmorphism
- Socket.io Client for WebSocket real-time communication
- Canvas API for drawing with full touch/mouse support
- LocalStorage for auth tokens and user data

### Backend
- **Node.js + Express** - HTTP server
- **Socket.io** - Real-time game engine
- **MongoDB + Mongoose** - User scores & room data (optional)
- **JWT + bcrypt** - Authentication
- **Helmet + Rate Limiting** - Security

## Project Structure

```
Drawing/
├── server/
│   ├── public/                 # Static HTML/CSS/JS
│   │   ├── html/               # HTML pages (NEW FOLDER)
│   │   │   ├── index.html      # Auth page (login/register/guest)
│   │   │   ├── home.html       # Lobby & room list
│   │   │   ├── game.html       # Game room with canvas
│   │   │   └── solo.html       # Solo draw mode with AI
│   │   ├── css/
│   │   │   └── style.css       # Complete futuristic theme
│   │   └── js/
│   │       ├── auth.js         # Auth logic
│   │       ├── app.js          # Lobby logic
│   │       ├── game.js         # Canvas & game logic
│   │       └── solo.js         # Solo draw with AI
│   ├── config/
│   │   └── database.js         # SQLite connection
│   ├── models/
│   │   ├── User.js             # User schema (SQLite)
│   │   └── Room.js             # Room schema (SQLite)
│   ├── routes/
│   │   ├── auth.js             # /api/auth/* endpoints
│   │   └── rooms.js            # /api/rooms/* endpoints
│   ├── socket/
│   │   └── gameHandler.js      # Socket.io game logic
│   ├── data/
│   │   └── drawbattle.db       # SQLite database file
│   ├── index.js                # Express server entry point
│   ├── package.json
│   └── .env                    # Config (PORT, JWT_SECRET)
├── client/                     # ⚠️ DEPRECATED - Old React app (can be deleted)
└── README.md
```

## Getting Started

### Prerequisites
- **Node.js** 18+ (for server)
- **SQLite** (included with better-sqlite3 - no separate installation needed)

### Installation

```bash
# Install server dependencies
cd server
npm install

# That's it! No client build needed - pure HTML/CSS/JS
```

### Configuration

Create `server/.env`:
```env
PORT=5000
JWT_SECRET=your_secret_key_here
NODE_ENV=development
```

The SQLite database will be automatically created at `server/data/drawbattle.db` on first run.

### Running

```bash
cd server
npm start
```

Server will start at **http://localhost:5000**

The SQLite database will be automatically created and initialized on first run.

## How to Play

1. **Visit** http://localhost:5000
2. **Choose**: Sign in, create account, or play as Guest
3. **Create or Join Room**: Use room code or create a new room
4. **Wait for Players**: Need at least 2 players
5. **Start Game**: Creator clicks "Start Game" button
6. **Draw or Guess**: 
   - If it's your turn: Draw using toolbar tools
   - If waiting: Type guesses in chat (case-insensitive)
7. **Score**: Correct guesses earn 100+ points (faster = more bonus), drawer gets 25 per correct guess
8. **Rounds**: Game has 3 rounds (each player draws once)
9. **Winner**: Highest score at end wins!

## Game Files

### Frontend HTML Pages
- **index.html**: Login/Register/Guest auth page with animated logo
- **home.html**: Lobby with room creation, player list, leaderboard, profile stats
- **game.html**: Game room with canvas, player panel, chat, toolbar

### Frontend JavaScript

#### auth.js (~100 lines)
- Login, register, guest signup
- Token stored in localStorage
- Form validation and error handling

#### app.js (~200 lines)
- Room creation & joining
- Fetch & display available rooms
- Leaderboard loading
- Profile stats display
- Room listing with real-time updates

#### game.js (~550 lines)
- **Socket.io connections**: joinRoom, startGame, draw, guess, clearCanvas, disconnect
- **Canvas drawing**: 
  - Mouse & touch event handling
  - 16 colors + 5 brush sizes
  - Pen, eraser, fill, clear, undo tools
  - Real-time drawing sync to all players
- **Game state**: Turn management, word hints, scoring, player list
- **Chat**: System messages, correct guesses, player guesses
- **UI overlays**: Word choice, turn results, score screen

### Backend

#### gameHandler.js (~541 lines)
Complete game engine handling:
- `joinRoom` - Player joins with name
- `startGame` - Start new game round
- `draw` - Relay canvas drawing data
- `guess` - Check answer, validate scoring, broadcast correct guesses
- `clearCanvas` - Clear drawing for next drawer
- `newTurn` - Select next drawer, send word, reveal hints progressively
- `endTurn` - Reveal word, move to next turn
- `endGame` - Calculate final scores, update user DB, reset room

#### Auth Routes
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Sign in (returns JWT)
- `GET /api/auth/me` - Get current user (protected)
- `GET /api/auth/leaderboard` - Get top 10 players

#### Room Routes
- `POST /api/rooms/create` - Create new room (optional auth)
- `GET /api/rooms/list` - List waiting rooms
- `GET /api/rooms/:roomId` - Get room details

## Styling

### Colors (CSS Variables)
- **Background**: `#0A0E1A` (pure black + dark slate)
- **Purple**: `#7F5AF0` (primary, glowing buttons)
- **Cyan**: `#00D9FF` (secondary, word hints, accents)
- **Green**: `#2CB67D` (success, start button)
- **Text**: `#E2E8F0` (primary), `#94A3B8` (secondary)

### Components
- **Glassmorphism**: Blurred semi-transparent cards with gradient borders
- **Neon Glow**: `text-shadow` and `box-shadow` for glowing effects
- **Animations**: Floating orbs, pulse effects, smooth transitions
- **Font**: "Orbitron" (font family via Google Fonts) for display text

## Socket.io Events

### Client → Server
| Event | Data | Description |
|-------|------|-------------|
| `joinRoom` | `{roomId, username}` | Join a room (auto-creates if new) |
| `startGame` | `{roomId}` | Start the game (needs 2+ players) |
| `draw` | `{roomId, drawData}` | Send drawing stroke (drawer only) |
| `guess` | `{roomId, message}` | Submit a guess |
| `clearCanvas` | `{roomId}` | Clear drawing (drawer only) |
| `disconnect` | - | Player left/disconnected |

### Server → Client
| Event | Data | Description |
|-------|------|-------------|
| `playerJoined` | `{players, message}` | New player joined |
| `gameStarted` | `{round, maxRounds}` | Game started |
| `newTurn` | `{drawer, wordHint, wordLength, ...}` | New drawing turn |
| `yourTurn` | `{word}` | You're the drawer (word for you only) |
| `draw` | `{drawData}` | Another player drew something |
| `hintUpdate` | `{wordHint}` | Word hint revealed (progressive) |
| `timerUpdate` | `{timeLeft}` | Time remaining (1 sec intervals) |
| `correctGuess` | `{username, players}` | Someone guessed correctly |
| `turnEnded` | `{word, players}` | Turn time up, reveal word |
| `gameEnded` | `{finalScores, winner}` | Game finished, show winners |
| `chatMessage` | `{type, username?, message}` | Chat/system message |

## API Endpoints

### Authentication
```
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me (requires Bearer token)
GET  /api/auth/leaderboard
```

### Rooms
```
POST /api/rooms/create (optional Bearer token)
GET  /api/rooms/list
GET  /api/rooms/:roomId
```

### Health
```
GET  /health → {status: "ok", timestamp}
```

## Scoring System

| Action | Points |
|--------|--------|
| Correct guess | 100 + bonus |
| Bonus for speed | 50, 40, 30, 20, 10 (decreases per guesser) |
| Drawer per correct guess | 25 |
| Winner bonus | None (just highest score) |

**Example**: 
- First correct guess: 100 + 50 = **150 pts**
- Second correct guess: 100 + 40 = **140 pts**
- Drawer gets: 25 pts per guess

## Database Schema (SQLite)

### User Table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL (hashed),
  score INTEGER DEFAULT 0,
  gamesPlayed INTEGER DEFAULT 0,
  gamesWon INTEGER DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Room Table
```sql
CREATE TABLE rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  roomId TEXT UNIQUE NOT NULL,
  maxPlayers INTEGER,
  currentPlayers INTEGER DEFAULT 0,
  status TEXT DEFAULT 'waiting',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## Troubleshooting

### Port Already in Use
```bash
# Windows
netstat -aon | findstr :5000
taskkill /f /pid <PID>

# macOS/Linux
lsof -i :5000
kill -9 <PID>
```

### SQLite Connection Fails
- Check that `server/data/` directory has write permissions
- Database file `drawbattle.db` should be auto-created
- Check server logs for detailed error messages

### Socket.io Connection Issues
- Check browser console (F12) for errors
- Ensure server is running: `curl http://localhost:5000`
- Try reloading page
- Check firewall isn't blocking port 5000

## Performance Notes

- Drawing strokes sent per mouse move (optimized locally)
- Chat messages stored in memory (last 50 per room)
- Rooms auto-deleted after 1 hour of inactivity
- Rate limited at 200 req/15min on API endpoints
- Socket.io with WebSocket + polling fallback

## Future Enhancements

- [ ] Drawing preview in lobby
- [ ] Custom word packs
- [ ] Spectator mode
- [ ] Mobile app (React Native)
- [ ] Friend invites & private rooms
- [ ] Achievements/badges
- [ ] Replay/GIF export of drawings
- [ ] Multiple language support

## License

MIT - Feel free to use, modify, and distribute!

---

**Made with ❤️ by Jayaprakash367**
Repository: [github.com/Jayaprakash367/Scannon.Ai](https://github.com/Jayaprakash367/Scannon.Ai)

JWT_SECRET=your_secret_key_here
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

### Development

```bash
# Terminal 1: Start backend
cd server && npm run dev

# Terminal 2: Start frontend
cd client && npm run dev
```

Open http://localhost:5173

## Game Flow

1. Register/Login or play as Guest
2. Create a room or join with a code
3. Wait for 2+ players, then start
4. Take turns drawing words on canvas
5. Other players guess in the chat
6. Points awarded for correct guesses
7. After all rounds, winner is declared!

## Project Structure

```
├── server/
│   ├── config/db.js          # MongoDB connection
│   ├── middleware/auth.js     # JWT middleware
│   ├── models/
│   │   ├── User.js           # User schema
│   │   └── Room.js           # Room schema
│   ├── routes/
│   │   ├── auth.js           # Auth endpoints
│   │   └── rooms.js          # Room endpoints
│   ├── socket/gameHandler.js  # Socket.io game logic
│   ├── utils/words.js        # Word bank
│   └── index.js              # Server entry
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Canvas.jsx     # Drawing canvas
│   │   │   ├── ChatBox.jsx    # Chat/guess box
│   │   │   ├── GameHeader.jsx # Timer/word hint bar
│   │   │   ├── PlayerList.jsx # Player sidebar
│   │   │   ├── ScoreOverlay.jsx # End-game scores
│   │   │   └── Toolbar.jsx    # Drawing tools
│   │   ├── context/
│   │   │   └── GameContext.jsx # Global state
│   │   ├── pages/
│   │   │   ├── Auth.jsx       # Login/Register
│   │   │   ├── Home.jsx       # Lobby/room list
│   │   │   └── GameRoom.jsx   # Main game page
│   │   ├── services/
│   │   │   ├── api.js         # REST API calls
│   │   │   └── socket.js      # Socket.io client
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   └── index.html
```

## Deployment

- **Frontend**: Deploy `client/` to Vercel
- **Backend**: Deploy `server/` to Render
- **Database**: Use MongoDB Atlas

Set environment variables accordingly on each platform.

## License

MIT
"# DRAWBATTLE" 
