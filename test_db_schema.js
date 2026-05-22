const db = require('./config/db');

async function test() {
    try {
        const [schema] = await db.query('DESCRIBE positions');
        console.log(schema);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

test().catch(console.error);
