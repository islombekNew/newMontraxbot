// Neon PostgreSQL ulanish havzasi (connection pool)
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    console.error('❌ .env faylida DATABASE_URL bo‘lishi shart! (Neon Postgres ulanish havolasi)');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
    console.error('❌ Postgres pool xato:', err.message);
});

const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
