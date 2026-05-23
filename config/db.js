const mysql = require('mysql2');
require('dotenv').config();

const buildDatabaseConfig = () => {
    const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;

    if (databaseUrl) {
        const url = new URL(databaseUrl);
        const sslRequired = url.searchParams.get('ssl-mode') === 'REQUIRED' ||
            url.searchParams.get('ssl') === 'true';

        return {
            host: url.hostname,
            user: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
            database: url.pathname.replace(/^\//, '') || 'defaultdb',
            port: Number(url.port) || 3306,
            ssl: sslRequired || url.hostname !== 'localhost' ? { rejectUnauthorized: false } : undefined
        };
    }

    const host = process.env.DB_HOST || 'localhost';

    return {
        host,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'votex',
        port: Number(process.env.DB_PORT) || 3306,
        ssl: process.env.DB_SSL === 'true' || host !== 'localhost' ? { rejectUnauthorized: false } : undefined
    };
};

const pool = mysql.createPool({
    ...buildDatabaseConfig(),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const promisePool = pool.promise();

module.exports = promisePool;
