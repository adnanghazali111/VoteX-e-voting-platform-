const db = require('../config/db');

const TERMINATION_MESSAGE = 'This session is terminated due to unethical behaviour.';

async function getRoomVoteStats(roomId) {
    const [[{ approvedVoters }]] = await db.query('SELECT COUNT(*) as approvedVoters FROM users WHERE status = "approved"');
    const [rooms] = await db.query('SELECT voter_strength FROM rooms WHERE id = ?', [roomId]);
    const [[{ totalVotes }]] = await db.query('SELECT COUNT(*) as totalVotes FROM votes WHERE room_id = ?', [roomId]);
    const [[{ votedVoters }]] = await db.query('SELECT COUNT(DISTINCT user_id) as votedVoters FROM votes WHERE room_id = ?', [roomId]);
    const configuredStrength = rooms[0] && rooms[0].voter_strength !== null ? Number(rooms[0].voter_strength) : null;
    const totalVoters = configuredStrength !== null ? configuredStrength : approvedVoters;

    return {
        approvedVoters,
        configuredStrength,
        totalVoters,
        totalVotes,
        votedVoters,
        remainingVoters: Math.max(totalVoters - votedVoters, 0),
        isTerminated: totalVotes > totalVoters
    };
}

async function terminateRoomIfVoteCountExceedsStrength(roomId) {
    const stats = await getRoomVoteStats(roomId);

    if (stats.isTerminated) {
        await db.query('UPDATE rooms SET status = "closed" WHERE id = ? AND status != "published"', [roomId]);
    }

    return stats;
}

module.exports = {
    TERMINATION_MESSAGE,
    getRoomVoteStats,
    terminateRoomIfVoteCountExceedsStrength
};
