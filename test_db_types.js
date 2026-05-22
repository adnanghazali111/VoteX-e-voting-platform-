const db = require('./config/db');

async function test() {
    try {
        // We will just do a mock query or insert that will fail
        await db.query('INSERT INTO candidates (position_id, name) VALUES (?, ?)', ["null", "test"]);
    } catch (e) {
        console.log("Error string null:", e.sql);
        console.log("Message:", e.sqlMessage);
    }
    
    try {
        await db.query('INSERT INTO candidates (position_id, name) VALUES (?, ?)', [null, "test"]);
    } catch (e) {
        console.log("Error actual null:", e.sql);
        console.log("Message:", e.sqlMessage);
    }
    
    try {
        await db.query('INSERT INTO candidates (position_id, name) VALUES (?, ?)', ["undefined", "test"]);
    } catch (e) {
        console.log("Error string undefined:", e.sql);
        console.log("Message:", e.sqlMessage);
    }
    
    try {
        await db.query('INSERT INTO candidates (position_id, name) VALUES (?, ?)', [undefined, "test"]);
    } catch (e) {
        console.log("Error actual undefined:", e.sql);
        console.log("Message:", e.sqlMessage);
    }

    process.exit(0);
}

test().catch(console.error);
