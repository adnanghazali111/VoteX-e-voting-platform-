const db = require('../config/db');
const qrcode = require('qrcode');
const crypto = require('crypto');
const { TERMINATION_MESSAGE, terminateRoomIfVoteCountExceedsStrength } = require('./electionGuard');

const ensureRoomVoterPinColumn = async () => {
    const [columns] = await db.query('SHOW COLUMNS FROM rooms LIKE ?', ['voter_pin']);
    if (columns.length === 0) {
        await db.query('ALTER TABLE rooms ADD COLUMN voter_pin VARCHAR(20) DEFAULT NULL');
    }
};

// Get all rooms for an admin
exports.getDashboard = async (req, res) => {
    try {
        const adminId = req.session.admin.id;
        const [rooms] = await db.query('SELECT * FROM rooms WHERE admin_id = ? ORDER BY created_at DESC', [adminId]);
        
        // Let's get global stats
        const [[{ totalVoters }]] = await db.query('SELECT COUNT(*) as totalVoters FROM users');
        
        res.render('admin/dashboard', { 
            title: 'Admin Dashboard',
            admin: req.session.admin,
            rooms,
            stats: { totalVoters }
        });
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Failed to load dashboard');
        res.redirect('/admin/login');
    }
};

// Create a new room
exports.createRoom = async (req, res) => {
    const adminId = req.session.admin.id;
    const { title, description } = req.body;
    
    // Generate a unique 6-character room code
    const roomCode = crypto.randomBytes(3).toString('hex').toUpperCase();

    try {
        await db.query('INSERT INTO rooms (admin_id, title, description, room_code) VALUES (?, ?, ?, ?)', 
            [adminId, title, description, roomCode]);
        req.flash('success_msg', 'Election Room created successfully!');
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error creating room');
        res.redirect('/admin/dashboard');
    }
};

// Manage a specific room
exports.manageRoom = async (req, res) => {
    const roomId = req.params.id;
    try {
        await ensureRoomVoterPinColumn();
        const [rooms] = await db.query('SELECT * FROM rooms WHERE id = ? AND admin_id = ?', [roomId, req.session.admin.id]);
        if (rooms.length === 0) return res.status(404).send('Room not found');
        const room = rooms[0];

        // Generate QR code for joining
        const joinUrl = `${req.protocol}://${req.get('host')}/join?code=${room.room_code}`;
        const qrCodeDataUrl = await qrcode.toDataURL(joinUrl);

        // Fetch Positions and Candidates
        const [positions] = await db.query('SELECT * FROM positions WHERE room_id = ? ORDER BY priority ASC', [roomId]);
        const [candidates] = await db.query(`
            SELECT c.*, p.title as position_title 
            FROM candidates c 
            JOIN positions p ON c.position_id = p.id 
            WHERE p.room_id = ?
        `, [roomId]);
        const [reports] = await db.query(`
            SELECT r.*, u.name as voter_name, u.voter_id as college_id 
            FROM reports r
            JOIN users u ON r.voter_id = u.id
            WHERE r.room_id = ? AND r.status = 'open'
            ORDER BY r.created_at DESC
        `, [roomId]);

        const voterStats = await terminateRoomIfVoteCountExceedsStrength(roomId);
        if (voterStats.isTerminated) {
            room.status = 'closed';
        }
        const terminationMessage = voterStats.isTerminated ? TERMINATION_MESSAGE : null;

        res.render('admin/room_manage', { 
            title: `Manage: ${room.title}`,
            admin: req.session.admin,
            room,
            qrCodeDataUrl,
            joinUrl,
            positions,
            candidates,
            voterStats,
            terminationMessage,
            reports
        });

    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error loading room details');
        res.redirect('/admin/dashboard');
    }
};

// Show voters who have participated in a specific room
exports.getParticipatingVoters = async (req, res) => {
    const roomId = req.params.id;

    try {
        const [rooms] = await db.query('SELECT * FROM rooms WHERE id = ? AND admin_id = ?', [roomId, req.session.admin.id]);
        if (rooms.length === 0) return res.status(404).send('Room not found');

        const [participatingVoters] = await db.query(`
            SELECT
                u.name,
                u.voter_id,
                u.email,
                COUNT(v.id) AS votes_cast,
                MAX(v.created_at) AS last_voted_at
            FROM users u
            JOIN votes v ON u.id = v.user_id
            WHERE v.room_id = ?
            GROUP BY u.id, u.name, u.voter_id, u.email
            ORDER BY last_voted_at DESC, u.name ASC
        `, [roomId]);

        res.render('admin/participating_voters', {
            title: `Participating Voters: ${rooms[0].title}`,
            admin: req.session.admin,
            room: rooms[0],
            participatingVoters
        });
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error loading participating voters');
        res.redirect(`/admin/rooms/${roomId}`);
    }
};

// Add position to a room
exports.addPosition = async (req, res) => {
    const { room_id, title, max_winners, priority } = req.body;
    try {
        const [rooms] = await db.query('SELECT id FROM rooms WHERE id = ? AND admin_id = ?', [room_id, req.session.admin.id]);
        if (rooms.length === 0) return res.status(403).send('Unauthorized');

        const [existingPositions] = await db.query('SELECT id FROM positions WHERE room_id = ? LIMIT 1', [room_id]);
        if (existingPositions.length > 0) {
            req.flash('error_msg', 'Only one position is allowed in each election room.');
            return res.redirect(`/admin/rooms/${room_id}`);
        }

        await db.query('INSERT INTO positions (room_id, title, max_winners, priority) VALUES (?, ?, ?, ?)', 
            [room_id, title, max_winners || 1, priority || 0]);
        req.flash('success_msg', 'Position added');
        res.redirect(`/admin/rooms/${room_id}`);
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error adding position');
        res.redirect(`/admin/rooms/${room_id}`);
    }
};

// Update expected voter strength for a room
exports.updateVoterStrength = async (req, res) => {
    const roomId = req.params.id;
    const voterStrength = Number(req.body.voter_strength);

    if (!Number.isInteger(voterStrength) || voterStrength < 0) {
        req.flash('error_msg', 'Voter strength must be a whole number.');
        return res.redirect(`/admin/rooms/${roomId}`);
    }

    try {
        await db.query('UPDATE rooms SET voter_strength = ? WHERE id = ? AND admin_id = ?', [voterStrength, roomId, req.session.admin.id]);
        
        const stats = await terminateRoomIfVoteCountExceedsStrength(roomId);
        
        req.flash('success_msg', stats.isTerminated ? 'Expected strength saved. Note: Expected strength was lower than active votes, so the election has been TERMINATED.' : 'Expected voter strength updated.');
        res.redirect(`/admin/rooms/${roomId}`);
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error updating voter strength');
        res.redirect(`/admin/rooms/${roomId}`);
    }
};

// Update the open voter PIN shown on the join page
exports.updateVoterPin = async (req, res) => {
    const roomId = req.params.id;
    const voterPin = (req.body.voter_pin || '').trim();

    if (voterPin.length < 4 || voterPin.length > 20) {
        req.flash('error_msg', 'Voter PIN must be 4 to 20 characters.');
        return res.redirect(`/admin/rooms/${roomId}`);
    }

    try {
        await ensureRoomVoterPinColumn();
        await db.query('UPDATE rooms SET voter_pin = ? WHERE id = ? AND admin_id = ?', [voterPin, roomId, req.session.admin.id]);
        req.flash('success_msg', 'Open voter PIN updated and visible on the join page.');
        res.redirect(`/admin/rooms/${roomId}`);
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error updating voter PIN');
        res.redirect(`/admin/rooms/${roomId}`);
    }
};

// Update room code / PIN
exports.updateRoomCode = async (req, res) => {
    const roomId = req.params.id;
    const newRoomCode = req.body.room_code;
    
    if (!newRoomCode || newRoomCode.trim().length === 0) {
        req.flash('error_msg', 'Room PIN/Code cannot be empty.');
        return res.redirect(`/admin/rooms/${roomId}`);
    }

    try {
        const [existing] = await db.query('SELECT id FROM rooms WHERE room_code = ? AND id != ?', [newRoomCode, roomId]);
        if (existing.length > 0) {
            req.flash('error_msg', 'This Room PIN is already in use by another election. Please choose a different one.');
            return res.redirect(`/admin/rooms/${roomId}`);
        }

        await db.query('UPDATE rooms SET room_code = ? WHERE id = ? AND admin_id = ?', [newRoomCode.trim(), roomId, req.session.admin.id]);
        req.flash('success_msg', 'Room PIN updated successfully.');
        res.redirect(`/admin/rooms/${roomId}`);
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error updating Room PIN. It might already be in use.');
        res.redirect(`/admin/rooms/${roomId}`);
    }
};

// Add candidate to a room (handling multipart)
exports.addCandidate = async (req, res) => {
    let { room_id, position_id, name, party, manifesto } = req.body;
    
    if (!position_id) {
        const [rooms] = await db.query('SELECT id FROM rooms WHERE id = ? AND admin_id = ?', [room_id, req.session.admin.id]);
        if (rooms.length === 0) return res.status(403).send('Unauthorized');

        const [positions] = await db.query('SELECT id FROM positions WHERE room_id = ? LIMIT 1', [room_id]);
        if (positions.length > 0) {
            position_id = positions[0].id;
        } else {
            req.flash('error_msg', 'Please add a position to the room before adding candidates.');
            return res.redirect(`/admin/rooms/${room_id}`);
        }
    }
    
    // Default values
    let photoUrl = '/images/default-avatar.png';
    let partySymbolUrl = null;

    if (req.files) {
        if (req.files.photo) photoUrl = '/uploads/' + req.files.photo[0].filename;
        if (req.files.party_symbol) partySymbolUrl = '/uploads/' + req.files.party_symbol[0].filename;
    }

    try {
        await db.query('INSERT INTO candidates (position_id, name, party, manifesto, photo_url, party_symbol_url) VALUES (?, ?, ?, ?, ?, ?)', 
            [position_id, name, party, manifesto, photoUrl, partySymbolUrl]);
        req.flash('success_msg', 'Candidate added successfully');
        res.redirect(`/admin/rooms/${room_id}`);
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error adding candidate');
        res.redirect(`/admin/rooms/${room_id}`);
    }
};

// Publish Results
exports.publishResults = async (req, res) => {
    const roomId = req.params.id;
    try {
        await db.query('UPDATE rooms SET status = ? WHERE id = ? AND admin_id = ?', ['published', roomId, req.session.admin.id]);
        req.flash('success_msg', 'Results published! Everyone can now see the results.');
        res.redirect(`/admin/rooms/${roomId}`);
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error publishing results');
        res.redirect(`/admin/rooms/${roomId}`);
    }
};

// Terminate an active election room
exports.terminateRoom = async (req, res) => {
    const roomId = req.params.id;
    try {
        const [result] = await db.query('UPDATE rooms SET status = ? WHERE id = ? AND admin_id = ? AND status = ?',
            ['closed', roomId, req.session.admin.id, 'active']);

        if (result.affectedRows === 0) {
            req.flash('error_msg', 'Only active election rooms can be terminated.');
        } else {
            req.flash('success_msg', 'Election terminated.');
        }

        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error terminating election');
        res.redirect('/admin/dashboard');
    }
};

// Delete a completed election room
exports.deleteRoom = async (req, res) => {
    const roomId = req.params.id;
    try {
        const [result] = await db.query('DELETE FROM rooms WHERE id = ? AND admin_id = ? AND status IN (\'published\', \'closed\')', 
            [roomId, req.session.admin.id]);

        if (result.affectedRows === 0) {
            req.flash('error_msg', 'Only completed or terminated election rooms can be deleted.');
        } else {
            req.flash('success_msg', 'Election room deleted.');
        }

        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error deleting election room');
        res.redirect('/admin/dashboard');
    }
};
