const express = require('express');
const router = express.Router();
const db = require('../config/db');
const roomController = require('../controllers/roomController');
const adminController = require('../controllers/adminController'); // keep for voters/admins
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../public/uploads');
fs.mkdirSync(uploadDir, { recursive: true });

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: uploadDir,
    filename: function(req, file, cb){
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

const buildGoogleRedirectUri = (req) => `${req.protocol}://${req.get('host')}/admin/auth/google/callback`;

// Middleware to check if admin is logged in
const isAdmin = (req, res, next) => {
    if (req.session.admin) {
        return next();
    }
    req.flash('error_msg', 'Please log in to view that resource');
    res.redirect('/admin/login');
};

// Admin Login Handler
router.post('/login', async (req, res) => {
    const organizerName = (req.body.organizer_name || req.body.college_id || '').trim();
    const safeName = organizerName.replace(/\s+/g, ' ');

    if (!safeName) {
        req.flash('error_msg', 'Please enter your organizer name');
        return res.redirect('/admin/login');
    }

    try {
        let [admins] = await db.query('SELECT * FROM admins WHERE username = ? AND status = \'active\'', [safeName]);

        if (admins.length === 0) {
            const emailName = safeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'organizer';
            const email = `${emailName}-${Date.now()}@votex.local`;
            await db.query(
                'INSERT INTO admins (username, email, password, role, status) VALUES (?, ?, \'\', \'organizer\', \'active\')',
                [safeName, email]
            );
            [admins] = await db.query('SELECT * FROM admins WHERE username = ? AND status = \'active\'', [safeName]);
        }

        const admin = admins[0];
        req.session.admin = { id: admin.id, username: admin.username, email: admin.email, role: admin.role };
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'DB Error: ' + (err.message || 'Unknown error'));
        res.redirect('/admin/login');
    }
});

// Optional Google sign-in for organizers who want their identity saved.
router.get('/auth/google', (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        req.flash('error_msg', 'Google sign-in is not configured yet.');
        return res.redirect('/admin/login');
    }

    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    req.session.adminGoogleAuthState = state;

    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: buildGoogleRedirectUri(req),
        response_type: 'code',
        scope: 'openid email profile',
        state,
        prompt: 'select_account'
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get('/auth/google/callback', async (req, res) => {
    if (!req.query.code || req.query.state !== req.session.adminGoogleAuthState) {
        req.flash('error_msg', 'Google sign-in could not be verified.');
        return res.redirect('/admin/login');
    }

    try {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code: req.query.code,
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: buildGoogleRedirectUri(req),
                grant_type: 'authorization_code'
            })
        });

        if (!tokenResponse.ok) {
            throw new Error('Google token exchange failed');
        }

        const tokens = await tokenResponse.json();
        const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });

        if (!profileResponse.ok) {
            throw new Error('Google profile fetch failed');
        }

        const profile = await profileResponse.json();
        const organizerName = (profile.name || profile.email || 'Organizer').trim();
        const organizerEmail = profile.email || `${Date.now()}@votex.local`;
        let [admins] = await db.query('SELECT * FROM admins WHERE email = ? OR username = ? LIMIT 1', [organizerEmail, organizerName]);

        if (admins.length === 0) {
            await db.query(
                'INSERT INTO admins (username, email, password, role, status) VALUES (?, ?, \'\', \'organizer\', \'active\')',
                [organizerName, organizerEmail]
            );
            [admins] = await db.query('SELECT * FROM admins WHERE email = ? LIMIT 1', [organizerEmail]);
        } else {
            await db.query('UPDATE admins SET username = ?, email = ?, status = \'active\' WHERE id = ?', [organizerName, organizerEmail, admins[0].id]);
            [admins] = await db.query('SELECT * FROM admins WHERE id = ? LIMIT 1', [admins[0].id]);
        }

        const admin = admins[0];
        req.session.admin = { id: admin.id, username: admin.username, email: admin.email, role: admin.role };
        delete req.session.adminGoogleAuthState;
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Google sign-in failed. You can still log in with your name.');
        res.redirect('/admin/login');
    }
});

// Admin Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

// --- DASHBOARD (ROOMS LIST) ---
router.get('/dashboard', isAdmin, roomController.getDashboard);
router.post('/rooms', isAdmin, roomController.createRoom);
router.post('/rooms/:id/voter-strength', isAdmin, roomController.updateVoterStrength);
router.get('/rooms/:id/participating-voters', isAdmin, roomController.getParticipatingVoters);
router.post('/rooms/:id/voter-pin', isAdmin, roomController.updateVoterPin);
router.get('/rooms/:id', isAdmin, roomController.manageRoom);
router.post('/rooms/:id/publish', isAdmin, roomController.publishResults);
router.post('/rooms/:id/terminate', isAdmin, roomController.terminateRoom);
router.post('/rooms/:id/update-code', isAdmin, roomController.updateRoomCode);
router.post('/rooms/:id/delete', isAdmin, roomController.deleteRoom);

// --- POSITIONS & CANDIDATES ---
router.post('/positions', isAdmin, roomController.addPosition);

const cpUpload = upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'party_symbol', maxCount: 1 }]);
router.post('/candidates', isAdmin, cpUpload, roomController.addCandidate);

// --- VOTERS ---
router.get('/voters', isAdmin, adminController.getVoters);
router.post('/voters', isAdmin, adminController.addVoter);
router.post('/voters/approve/:id', isAdmin, adminController.approveVoter);
router.post('/voters/delete/:id', isAdmin, adminController.deleteVoter);

// --- REPORTS ---
router.post('/reports/:id/resolve', isAdmin, adminController.resolveReport);
router.post('/reports/:id/reset-vote', isAdmin, adminController.resetVote);

module.exports = router;
