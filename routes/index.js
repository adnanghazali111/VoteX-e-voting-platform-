const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const db = require('../config/db');

const buildGoogleRedirectUri = (req) => `${req.protocol}://${req.get('host')}/auth/google/callback`;

// Landing Page
router.get('/', (req, res) => {
    res.render('index', { title: 'VoteX - Secure Online Voting System' });
});

// Voter Join Room View
router.get('/join', async (req, res) => {
    const code = req.query.code || '';
    if (req.session.user && req.session.current_room) return res.redirect('/voter/dashboard');

    if (code) {
        try {
            const [columns] = await db.query('SHOW COLUMNS FROM rooms LIKE "voter_pin"');
            if (columns.length === 0) {
                await db.query('ALTER TABLE rooms ADD COLUMN voter_pin VARCHAR(20) DEFAULT NULL');
            }
        } catch (err) {
            console.error(err);
        }
    }

    res.render('voter/login', {
        title: 'Join Election Room',
        code,
        googleUser: req.session.googleUser || null,
        googleAuthEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    });
});

// Optional Google sign-in for voters who want their name/email saved.
router.get('/auth/google', (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        req.flash('error_msg', 'Google sign-in is not configured yet.');
        return res.redirect(`/join?code=${req.query.code || ''}`);
    }

    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    req.session.googleAuthState = state;
    req.session.googleAuthCode = req.query.code || '';

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
    const returnCode = req.session.googleAuthCode || '';

    if (!req.query.code || req.query.state !== req.session.googleAuthState) {
        req.flash('error_msg', 'Google sign-in could not be verified.');
        return res.redirect(`/join?code=${returnCode}`);
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
        req.session.googleUser = {
            id: profile.sub,
            name: profile.name || '',
            email: profile.email || '',
            picture: profile.picture || ''
        };

        delete req.session.googleAuthState;
        delete req.session.googleAuthCode;
        res.redirect(`/join?code=${returnCode}`);
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Google sign-in failed. You can still join without it.');
        res.redirect(`/join?code=${returnCode}`);
    }
});

router.get('/auth/google/logout', (req, res) => {
    const code = req.query.code || '';
    delete req.session.googleUser;
    res.redirect(`/join?code=${code}`);
});

// Public Results Page
router.get('/results/:room_code', publicController.getPublicResults);

// Admin Login View
router.get('/admin/login', (req, res) => {
    if (req.session.admin) return res.redirect('/admin/dashboard');
    res.render('admin/login', { title: 'Organizer Login' });
});

module.exports = router;
