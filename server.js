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

// Express Session Middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'supersecretvotexsessionkey',
    resave: false,
    saveUninitialized: true
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

const server = app.listen(PORT, HOST, () => {
    console.log(`Server started at http://${HOST}:${PORT}`);
});

server.on('error', (err) => {
    console.error(`Failed to start server: ${err.message}`);
    process.exit(1);
});
