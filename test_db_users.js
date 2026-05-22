const db = require('./config/db');

async function test() {
    try {
        const [schema] = await db.query('DESCRIBE users');
        console.log("Users table schema:", schema);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

test().catch(console.error);
