const roomController = require('./controllers/roomController');
const db = require('./config/db');

async function test() {
    const req = {
        body: {
            room_id: '4',
            position_id: '',
            name: 'halo',
            party: '',
            manifesto: ''
        },
        files: {},
        flash: (key, val) => console.log('FLASH:', key, val)
    };
    
    const res = { redirect: (url) => console.log('REDIRECT:', url) };

    const originalQuery = db.query;
    db.query = async function() {
        console.log('QUERY:', arguments[0], arguments[1]);
        if (arguments[0].startsWith('INSERT INTO candidates')) return [{ insertId: 1 }];
        return originalQuery.apply(this, arguments);
    };

    await roomController.addCandidate(req, res);
    process.exit(0);
}
test().catch(console.error);
