-- VoteX Database Schema (Room-Based Architecture)
-- Note: Cloud databases manage their own schemas (e.g., 'defaultdb'). 
-- Do not include CREATE DATABASE statements here.


-- Users table (Voters - Global Identity)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    voter_id VARCHAR(50) UNIQUE NOT NULL, -- Government ID, Student ID, etc.
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL, -- hashed voting PIN; College ID remains the unique identity
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admins / Organizers table
CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL, -- organizer College ID
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) DEFAULT NULL, -- legacy column; organizer login uses College ID only
    role ENUM('superadmin', 'organizer') DEFAULT 'organizer',
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rooms table (Elections)
CREATE TABLE IF NOT EXISTS rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    room_code VARCHAR(20) UNIQUE NOT NULL,
    voter_pin VARCHAR(20) DEFAULT NULL,
    voter_strength INT DEFAULT NULL,
    status ENUM('active', 'closed', 'published') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

-- Positions table (Linked to Rooms)
CREATE TABLE IF NOT EXISTS positions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    title VARCHAR(100) NOT NULL,
    max_winners INT DEFAULT 1,
    priority INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    UNIQUE KEY unique_position_per_room (room_id)
);

-- Candidates table (Linked to Positions/Rooms)
CREATE TABLE IF NOT EXISTS candidates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    position_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    party VARCHAR(100),
    manifesto TEXT,
    photo_url VARCHAR(255) DEFAULT '/images/default-avatar.png',
    party_symbol_url VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE
);

-- Votes table (Linked to Rooms to enforce one vote per College ID per position)
CREATE TABLE IF NOT EXISTS votes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    room_id INT NOT NULL,
    position_id INT NOT NULL,
    candidate_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
    UNIQUE KEY unique_vote_per_position (user_id, room_id, position_id)
);

-- Reports table (Ballot issue reports from voters)
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
);

-- Default Super Admin
INSERT IGNORE INTO admins (username, email, password, role) VALUES 
('superadmin', 'admin@votex.com', NULL, 'superadmin');

-- Default Test Voter
-- College ID: COL12345, Voting PIN: 1234
INSERT IGNORE INTO users (voter_id, name, email, password, status) VALUES
('COL12345', 'Test Voter', 'voter@votex.com', '$2a$10$3V8T2KD1tvuQH/fuEFD9bOW83rUN6oZ1Pss5eiKbB/PgkS.8FQR5S', 'approved');
