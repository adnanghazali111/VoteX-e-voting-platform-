const db = require('../config/db');
const bcrypt = require('bcryptjs');

// Get all voters
exports.getVoters = async (req, res) => {
    try {
        const [voters] = await db.query('SELECT * FROM users ORDER BY created_at DESC');
        res.render('admin/voters', {
            title: 'Manage Voters',
            admin: req.session.admin,
            voters
        });
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error fetching voters');
        res.redirect('/admin/dashboard');
    }
};

// Add a new voter manually
exports.addVoter = async (req, res) => {
    const { voter_id, name, email, voting_pin } = req.body;
    try {
        const hashedPin = await bcrypt.hash(voting_pin, 10);

        await db.query('INSERT INTO users (voter_id, name, email, password, status) VALUES (?, ?, ?, ?, \'approved\')', 
            [voter_id, name, email, hashedPin]);
        
        req.flash('success_msg', 'Voter added successfully');
        res.redirect('/admin/voters');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error adding voter');
        res.redirect('/admin/voters');
    }
};

// Approve a voter
exports.approveVoter = async (req, res) => {
    const userId = req.params.id;
    try {
        await db.query('UPDATE users SET status = \'approved\' WHERE id = ?', [userId]);
        req.flash('success_msg', 'Voter approved');
        res.redirect('/admin/voters');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error approving voter');
        res.redirect('/admin/voters');
    }
};

// Delete a voter
exports.deleteVoter = async (req, res) => {
    const userId = req.params.id;
    try {
        await db.query('DELETE FROM users WHERE id = ?', [userId]);
        req.flash('success_msg', 'Voter deleted');
        res.redirect('/admin/voters');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error deleting voter');
        res.redirect('/admin/voters');
    }
};

// Resolve a report
exports.resolveReport = async (req, res) => {
    const reportId = req.params.id;
    const roomId = req.body.room_id; // From hidden input
    try {
        const [rooms] = await db.query('SELECT r.id FROM rooms r JOIN reports rep ON r.id = rep.room_id WHERE rep.id = ? AND r.admin_id = ?', [reportId, req.session.admin.id]);
        if (rooms.length === 0) return res.status(403).send('Unauthorized');

        await db.query('UPDATE reports SET status = "resolved" WHERE id = ?', [reportId]);
        req.flash('success_msg', 'Report marked as resolved');
        
        if (roomId) {
            res.redirect(`/admin/rooms/${roomId}`);
        } else {
            res.redirect('/admin/dashboard');
        }
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error resolving report');
        res.redirect('/admin/dashboard');
    }
};

// Reset a voter's vote and resolve the report
exports.resetVote = async (req, res) => {
    const reportId = req.params.id;
    const roomId = req.body.room_id;
    const voterId = req.body.voter_id;

    try {
        const [rooms] = await db.query('SELECT r.id FROM rooms r JOIN reports rep ON r.id = rep.room_id WHERE rep.id = ? AND r.admin_id = ?', [reportId, req.session.admin.id]);
        if (rooms.length === 0) return res.status(403).send('Unauthorized');

        // Delete votes for this user in this room
        await db.query('DELETE FROM votes WHERE user_id = ? AND room_id = ?', [voterId, roomId]);
        
        // Mark report as resolved
        await db.query('UPDATE reports SET status = "resolved" WHERE id = ?', [reportId]);
        
        req.flash('success_msg', 'Voter\'s votes have been deleted and report resolved. They can now vote again.');
        
        if (roomId) {
            res.redirect(`/admin/rooms/${roomId}`);
        } else {
            res.redirect('/admin/dashboard');
        }
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error resetting vote');
        if (roomId) {
            res.redirect(`/admin/rooms/${roomId}`);
        } else {
            res.redirect('/admin/dashboard');
        }
    }
};
