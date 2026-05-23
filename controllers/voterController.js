const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { TERMINATION_MESSAGE, terminateRoomIfVoteCountExceedsStrength } = require('./electionGuard');

const ensureRoomVoterPinColumn = async () => {
    const [columns] = await db.query('SHOW COLUMNS FROM rooms LIKE ?', ['voter_pin']);
    if (columns.length === 0) {
        await db.query('ALTER TABLE rooms ADD COLUMN voter_pin VARCHAR(20) DEFAULT NULL');
    }
};

const buildOpenVoterId = (roomId, voterName) => {
    const slug = voterName
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'VOTER';

    return `ROOM${roomId}-${slug}`;
};

const buildGoogleVoterId = (googleId) => `GOOGLE-${googleId}`.slice(0, 50);

// Join Room Logic
exports.joinRoom = async (req, res) => {
    const { room_code, voting_pin, voter_name } = req.body;
    const openVoterName = voter_name && voter_name.trim();

    try {
        if (!openVoterName) {
            req.flash('error_msg', 'Please enter your name');
            return res.redirect(`/join?code=${room_code || ''}`);
        }

        await ensureRoomVoterPinColumn();
        // 1. Check Room
        const [rooms] = await db.query('SELECT * FROM rooms WHERE room_code = ?', [room_code]);
        if (rooms.length === 0) {
            req.flash('error_msg', 'Invalid Room Code');
            return res.redirect(`/join?code=${room_code}`);
        }
        const room = rooms[0];

        if (room.status === 'closed') {
            req.flash('error_msg', TERMINATION_MESSAGE);
            return res.redirect(`/join?code=${room_code}`);
        }

        if (room.status !== 'active' && room.status !== 'published') {
            req.flash('error_msg', 'This election is no longer active.');
            return res.redirect(`/join?code=${room_code}`);
        }

        const initialStats = await terminateRoomIfVoteCountExceedsStrength(room.id);
        if (initialStats.isTerminated) {
            req.flash('error_msg', TERMINATION_MESSAGE);
            return res.redirect(`/join?code=${room_code}`);
        }

        if (!room.voter_pin) {
            req.flash('error_msg', 'Voting PIN is not set for this election. Ask the organizer.');
            return res.redirect(`/join?code=${room_code}`);
        }

        if (voting_pin !== room.voter_pin) {
            req.flash('error_msg', 'Invalid voting PIN');
            return res.redirect(`/join?code=${room_code}`);
        }

        // 2. Open-platform voters can optionally save identity through Google.
        const googleUser = req.session.googleUser || null;
        const openVoterId = googleUser && googleUser.id ? buildGoogleVoterId(googleUser.id) : buildOpenVoterId(room.id, openVoterName);
        let [users] = googleUser && googleUser.email
            ? await db.query('SELECT * FROM users WHERE (voter_id = ? OR email = ?) AND status = ? LIMIT 1', [openVoterId, googleUser.email, 'approved'])
            : await db.query('SELECT * FROM users WHERE voter_id = ? AND status = ? LIMIT 1', [openVoterId, 'approved']);

        if (users.length === 0) {
            const hashedPin = await bcrypt.hash(voting_pin, 10);
            const email = googleUser && googleUser.email ? googleUser.email : `${openVoterId.toLowerCase()}@votex.local`;

            await db.query(
                'INSERT INTO users (voter_id, name, email, password, status) VALUES (?, ?, ?, ?, ?)',
                [openVoterId, openVoterName, email, hashedPin, 'approved']
            );

            [users] = await db.query('SELECT * FROM users WHERE voter_id = ? AND status = ?', [openVoterId, 'approved']);
        } else if (googleUser && googleUser.email) {
            await db.query('UPDATE users SET name = ?, email = ? WHERE id = ?', [openVoterName, googleUser.email, users[0].id]);
            [users] = await db.query('SELECT * FROM users WHERE id = ?', [users[0].id]);
        }

        const user = users[0];

        // 3. Set Session
        req.session.user = {
            id: user.id,
            voter_id: user.voter_id,
            name: openVoterName,
            email: user.email
        };
        req.session.current_room = { id: room.id, title: room.title, code: room.room_code };
        
        res.redirect('/voter/dashboard');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'An error occurred during join');
        res.redirect('/join');
    }
};

exports.getDashboard = async (req, res) => {
    try {
        const user_id = req.session.user.id;
        const room_id = req.session.current_room.id;
        const room_code = req.session.current_room.code;

        // Fetch room status
        const [rooms] = await db.query('SELECT status FROM rooms WHERE id = ?', [room_id]);
        // Do not redirect here anymore, we will just pass the status to the view.

        const stats = await terminateRoomIfVoteCountExceedsStrength(room_id);
        if (stats.isTerminated) {
            req.flash('error_msg', TERMINATION_MESSAGE);
            return res.redirect(`/join?code=${room_code}`);
        }
        
        // Fetch positions for THIS room
        const [positions] = await db.query('SELECT * FROM positions WHERE room_id = ? ORDER BY priority ASC', [room_id]);
        
        // Fetch candidates for THIS room's positions
        const [candidates] = await db.query(`
            SELECT c.* 
            FROM candidates c 
            JOIN positions p ON c.position_id = p.id 
            WHERE p.room_id = ?
            ORDER BY c.name ASC
        `, [room_id]);
        
        // Fetch user's votes for THIS room
        const [votes] = await db.query('SELECT position_id, candidate_id FROM votes WHERE user_id = ? AND room_id = ?', [user_id, room_id]);
        const votedPositions = votes.map(v => v.position_id);
        const votedCandidateByPosition = {};
        votes.forEach(v => {
            votedCandidateByPosition[v.position_id] = v.candidate_id;
        });

        const roomWithStatus = { ...req.session.current_room, status: rooms[0].status };

        res.render('voter/dashboard', { 
            title: `Election: ${req.session.current_room.title}`,
            user: req.session.user,
            room: roomWithStatus,
            positions,
            candidates,
            votedPositions,
            votedCandidateByPosition
        });
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error loading election ballot');
        res.redirect('/join');
    }
};

exports.submitVote = async (req, res) => {
    const user_id = req.session.user.id;
    const room_id = req.session.current_room.id;
    const { position_id, candidate_id } = req.body;

    try {
        // Enforce 1 vote per College ID for this position in this room.
        const [existing] = await db.query('SELECT id FROM votes WHERE user_id = ? AND room_id = ? AND position_id = ?', [user_id, room_id, position_id]);
        if (existing.length > 0) {
            req.flash('error_msg', 'You have already voted for this position.');
            return res.redirect('/voter/dashboard');
        }

        // Ensure room is still active
        const [rooms] = await db.query('SELECT status FROM rooms WHERE id = ?', [room_id]);
        if (rooms.length === 0 || rooms[0].status !== 'active') {
            req.flash('error_msg', rooms[0] && rooms[0].status === 'closed' ? TERMINATION_MESSAGE : 'This election is no longer active.');
            return res.redirect('/voter/dashboard');
        }

        const [candidates] = await db.query(`
            SELECT c.id
            FROM candidates c
            JOIN positions p ON c.position_id = p.id
            WHERE c.id = ? AND p.id = ? AND p.room_id = ?
        `, [candidate_id, position_id, room_id]);

        if (candidates.length === 0) {
            req.flash('error_msg', 'Invalid candidate selection.');
            return res.redirect('/voter/dashboard');
        }

        // Insert vote
        await db.query('INSERT INTO votes (user_id, room_id, position_id, candidate_id) VALUES (?, ?, ?, ?)', 
            [user_id, room_id, position_id, candidate_id]);

        const updatedStats = await terminateRoomIfVoteCountExceedsStrength(room_id);
        if (updatedStats.isTerminated) {
            req.flash('error_msg', TERMINATION_MESSAGE);
            return res.redirect(`/join?code=${req.session.current_room.code}`);
        }
        
        req.flash('success_msg', 'Your vote has been cast securely!');
        res.redirect('/voter/dashboard');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error casting vote. Please try again.');
        res.redirect('/voter/dashboard');
    }
};

exports.submitReport = async (req, res) => {
    const user_id = req.session.user.id;
    const room_id = req.session.current_room.id;
    const { issue_type, message } = req.body;

    try {
        await db.query('INSERT INTO reports (voter_id, room_id, issue_type, message) VALUES (?, ?, ?, ?)', 
            [user_id, room_id, issue_type, message]);
        
        req.flash('success_msg', 'Your report has been submitted successfully. An admin will review it shortly.');
        res.redirect('/voter/dashboard');
    } catch (err) {
        console.error('Error submitting report:', err);
        req.flash('error_msg', 'There was an error submitting your report. Please try again.');
        res.redirect('/voter/dashboard');
    }
};

// Voter Profile methods remain similar
exports.getProfile = (req, res) => {
    res.render('voter/profile', { 
        title: 'My Profile',
        user: req.session.user 
    });
};

exports.updatePassword = async (req, res) => {
    req.flash('error_msg', 'Voting PIN changes must be handled by the organizer.');
    res.redirect('/voter/profile');
};
