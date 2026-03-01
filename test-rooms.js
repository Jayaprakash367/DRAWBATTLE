async function test() {
  console.log('🧪 Testing Room API...\n');
  
  try {
    // Create a room
    const createRes = await fetch('http://localhost:5000/api/rooms/create', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({maxPlayers: 4, maxRounds: 2, drawTime: 45})
    });
    const createData = await createRes.json();
    if (!createData.success) throw new Error(createData.error);
    console.log('✅ Room Created:', createData.room.roomId);
    
    // List rooms
    const listRes = await fetch('http://localhost:5000/api/rooms/list');
    const listData = await listRes.json();
    if (!listData.success) throw new Error('Failed to list');
    console.log('✅ Rooms Listed:', listData.rooms.length, 'rooms available');
    
    // Get specific room
    const getRes = await fetch(`http://localhost:5000/api/rooms/${createData.room.roomId}`);
    const getData = await getRes.json();
    if (!getData.success) throw new Error(getData.error);
    console.log('✅ Room Details Retrieved:', getData.room.name);
    
    console.log('\n✨ All Room APIs working correctly!');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

test();
