const Database = require('better-sqlite3');

const db = new Database('./data/drawbattle.db');

console.log('\n📊 Database Status:\n');

try {
  const roomCount = db.prepare('SELECT COUNT(*) as count FROM rooms').get();
  console.log(`✅ Total Rooms: ${roomCount.count}`);
  
  const recentRooms = db.prepare('SELECT roomId, name, maxPlayers, status, createdAt FROM rooms ORDER BY createdAt DESC LIMIT 5').all();
  if (recentRooms.length > 0) {
    console.log('\n📋 Recent Rooms:');
    recentRooms.forEach((r, i) => {
      console.log(`  ${i+1}. ${r.name} (${r.roomId.substring(0, 8)}) - ${r.status}`);
    });
  }
  
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  console.log(`\n✅ Total Users: ${userCount.count}`);
  
  const gameCount = db.prepare('SELECT COUNT(*) as count FROM games').get();
  console.log(`✅ Total Games Played: ${gameCount.count}`);
  
  console.log('\n✨ Database is healthy and working correctly!\n');
} catch (err) {
  console.error('❌ Database error:', err.message);
  process.exit(1);
} finally {
  db.close();
}
