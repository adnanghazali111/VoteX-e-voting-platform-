const db = require('./config/db');

async function createReportsTable() {
    const createTableQuery = `
    CREATE TABLE IF NOT EXISTS reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        voter_id INT NOT NULL,
        room_id INT NOT NULL,
        issue_type VARCHAR(255),
        message TEXT,
        status ENUM('open', 'resolved') DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (voter_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );`;

    try {
        await db.query(createTableQuery);
        console.log("Reports table created successfully.");
    } catch (err) {
        console.error("Error creating reports table:", err);
    }
    process.exit(0);
}

createReportsTable();
