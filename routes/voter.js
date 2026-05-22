const express = require('express');
const router = express.Router();
const voterController = require('../controllers/voterController');

// Middleware to check if voter is logged in and joined a room
const isVoter = (req, res, next) => {
    if (req.session.user && req.session.current_room) {
        return next();
    }
    req.flash('error_msg', 'Please join an election room to vote');
    res.redirect('/join');
};

// Join Room handler
router.post('/join', voterController.joinRoom);

// Voter Dashboard (Ballot)
router.get('/dashboard', isVoter, voterController.getDashboard);

// Submit Vote
router.post('/vote', isVoter, voterController.submitVote);

// Submit Report
router.post('/report', isVoter, voterController.submitReport);

// Voter Profile
router.get('/profile', isVoter, voterController.getProfile);
router.post('/profile/password', isVoter, voterController.updatePassword);

// Voter Logout (Leaves room)
router.get('/logout', (req, res) => {
    req.session.current_room = null; // Can leave room without fully logging out, but here we just destroy session.
    req.session.destroy();
    res.redirect('/');
});

module.exports = router;
