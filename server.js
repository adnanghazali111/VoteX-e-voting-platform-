const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();

// Database connection
const db = require('./config/db');

// Auto-initialize reports table if it doesn't exist
const ensureSchemaExists = async () => {
    try {
        await db.query(`
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
            )
        `);
        console.log("Database schema check: reports table is ready.");
    } catch (err) {
        console.error("Database schema verification failed:", err);
    }
};
ensureSchemaExists();

// EJS Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body Parser Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Static Folder
app.use(express.static(path.join(__dirname, 'public')));
// To ensure uploaded files are served correctly
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Express Session Middleware with MySQL Store for Vercel
const MySQLStore = require('express-mysql-session')(session);
const sessionStore = new MySQLStore({}, db);

app.use(session({
    key: 'votex_session',
    secret: process.env.SESSION_SECRET || 'supersecretvotexsessionkey',
    store: sessionStore,
    resave: false,
    saveUninitialized: false
}));
// Connect Flash Middleware
app.use(flash());

// Global Variables for Flash Messages & User Session
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    res.locals.admin = req.session.admin || null;
    res.locals.user = req.session.user || null;
    res.locals.current_room = req.session.current_room || null; // needed for room-based architecture
    next();
});

// Routes
app.use('/', require('./routes/index'));
app.use('/admin', require('./routes/admin'));
app.use('/voter', require('./routes/voter'));

// 404 Handler
app.use((req, res) => {
    res.status(404).send('Page not found');
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

if (require.main === module) {
    const server = app.listen(PORT, HOST, () => {
        console.log(`Server started at http://${HOST}:${PORT}`);
    });

    server.on('error', (err) => {
        console.error(`Failed to start server: ${err.message}`);
        process.exit(1);
    });
}

module.exports = app;
