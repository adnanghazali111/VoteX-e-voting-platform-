const roomController = require('./controllers/roomController');
const db = require('./config/db');

async function test() {
    // create a fake req, res
    const req = {
        body: {
            room_id: '4', // same as our previous successful test
            name: 'halo',
            party: '',
            manifesto: ''
        },
        files: {
            photo: [ { filename: 'photo-1779264568432.jpg' } ]
        },
        flash: (key, val) => console.log('FLASH:', key, val)
    };
    
    const res = {
        redirect: (url) => console.log('REDIRECT:', url)
    };

    // Override db.query just for the insert to see what it gets
    const originalQuery = db.query;
    db.query = async function() {
        console.log('QUERY:', arguments[0], arguments[1]);
        if (arguments[0].startsWith('INSERT INTO candidates')) {
            return [{ insertId: 1 }];
        }
        return originalQuery.apply(this, arguments);
    };

    await roomController.addCandidate(req, res);
    
    process.exit(0);
}

test().catch(console.error);
