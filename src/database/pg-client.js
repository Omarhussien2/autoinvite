require('dotenv').config();
const { Pool } = require('pg');

// C-05: Support both DATABASE_URL (Replit/Heroku) and individual env vars (VPS)
const pool = new Pool(
    process.env.DATABASE_URL
        ? {
              connectionString: process.env.DATABASE_URL,
              ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false
          }
        : {
              user: process.env.PGUSER || process.env.DB_USER || 'postgres',
              host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
              database: process.env.PGDATABASE || process.env.DB_NAME || 'autoinvite_saas',
              password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'postgres',
              port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5432')
          }
);

// C-05: Never call process.exit on pool errors — log only and let the app recover
pool.on('error', (err) => {
    console.error('[pg-client] Unexpected error on idle PostgreSQL client:', err.message);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};
