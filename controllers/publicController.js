const db = require('../config/db');

exports.getPublicResults = async (req, res) => {
    const { room_code } = req.params;

    try {
        // 1. Fetch Room and Ensure it is 'published'
        const [rooms] = await db.query('SELECT * FROM rooms WHERE room_code = ?', [room_code]);
        
        if (rooms.length === 0) {
            return res.status(404).send('Room not found');
        }

        const room = rooms[0];

        if (room.status !== 'published') {
            return res.render('public/pending', { title: 'Results Pending', room });
        }

        // 2. Fetch Results Data
        const [results] = await db.query(`
            SELECT 
                p.id as position_id, 
                p.title as position_title, 
                c.id as candidate_id, 
                c.name as candidate_name, 
                c.party,
                c.photo_url,
                c.party_symbol_url,
                COUNT(v.id) as vote_count
            FROM positions p
            LEFT JOIN candidates c ON p.id = c.position_id
            LEFT JOIN votes v ON c.id = v.candidate_id
            WHERE p.room_id = ?
            GROUP BY p.id, c.id
            ORDER BY p.priority ASC, vote_count DESC
        `, [room.id]);

        // Group results by position
        const positionsData = {};
        results.forEach(row => {
            if(!positionsData[row.position_title]) {
                positionsData[row.position_title] = [];
            }
            if(row.candidate_name) {
                positionsData[row.position_title].push(row);
            }
        });

        res.render('public/results', {
            title: `Election Results: ${room.title}`,
            room,
            positionsData
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error loading results.');
    }
};
