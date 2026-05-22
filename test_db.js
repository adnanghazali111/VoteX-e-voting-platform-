const db = require('./config/db');

async function test() {
    const room_id = 1; // Assuming room 1 exists, we'll try to find a room first.
    const [[room]] = await db.query('SELECT id FROM rooms LIMIT 1');
    if (!room) {
        console.log("No rooms found");
        process.exit(1);
    }
    console.log("Using room_id:", room.id);
    
    let position_id;
    if (!position_id) {
        const [positions] = await db.query('SELECT id FROM positions WHERE room_id = ? LIMIT 1', [room.id]);
        console.log("Positions array:", positions);
        if (positions.length > 0) {
            position_id = positions[0].id;
            console.log("Assigned position_id:", position_id);
        } else {
            console.log("No positions found for this room");
        }
    }
    
    console.log("Final position_id before insert:", position_id);
    process.exit(0);
}

test().catch(console.error);
