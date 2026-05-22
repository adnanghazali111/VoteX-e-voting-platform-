# VoteX - Secure E-Voting Platform 🗳️

VoteX is a modern, secure, and intuitive online voting system designed to bridge the gap between complex cryptographic voting environments and user-friendly web design. Built for the modern democratic imperative, VoteX handles elections of all sizes—from university student councils to corporate boards.

## ✨ Features

- **Dynamic Election Rooms:** Organizers can create highly customized election environments.
- **Secure Access Control:** Rooms are protected by unique PINs and robust session management.
- **Enterprise-Grade Security:** Fortified against SQL injection with parameterized queries and strict organizer-level authorization.
- **Automated Tallying:** Results are calculated instantly upon election closure once voting strength is reached.
- **Dynamic Roles & Portfolios:** Easily add custom leadership positions, candidates, and party symbols.
- **Google OAuth Integration:** Voters and organizers can optionally authenticate via Google for seamless login.
- **Cinematic Responsive UI:** A premium dark-mode interface built with Tailwind CSS and Bootstrap.

## 🛠 Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** MySQL
- **Frontend:** HTML, EJS (Embedded JavaScript), Tailwind CSS, Bootstrap 5
- **Authentication:** Custom Session-based Auth & Google OAuth 2.0
- **Security:** bcrypt.js for password hashing

## 🚀 Getting Started

### Prerequisites
- Node.js (v16+)
- MySQL Server

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/adnanghazali111/VoteX-e-voting-platform-.git
   cd VoteX
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up the Database**
   - Create a MySQL database (e.g., `votex`).
   - Run the SQL queries found in `schema.sql` to generate the necessary tables (`users`, `rooms`, `positions`, `candidates`, `votes`, `reports`).

4. **Environment Variables**
   Create a `.env` file in the root directory and add the following:
   ```env
   PORT=3000
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=votex
   SESSION_SECRET=your_super_secret_key
   
   # Optional: For Google Sign-In
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```

5. **Run the Application**
   ```bash
   npm start
   ```
   The application will be running at `http://localhost:3000`.

## 🔒 Security Practices
- Session IDs are strictly validated to prevent spoofing.
- Reports and vote deletions verify the authorized `admin_id`.
- All database interactions use `mysql2` parameterized inputs.

## 📄 License
© 2026 VoteX Imperative. All rights reserved.
