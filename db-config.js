const { Pool } = require('pg');
require('dotenv').config();

// Database configuration - use Railway DATABASE_URL if available
let dbConfig;

if (process.env.DATABASE_URL) {
  // Use connection string (Railway or other cloud providers)
  dbConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10, // Reduced pool size for Railway
    idleTimeoutMillis: 20000, // Reduced idle timeout
    connectionTimeoutMillis: 5000, // Increased connection timeout
    acquireTimeoutMillis: 60000, // Add acquire timeout
    createTimeoutMillis: 30000, // Add create timeout
    destroyTimeoutMillis: 5000, // Add destroy timeout
    reapIntervalMillis: 1000, // Add reap interval
    createRetryIntervalMillis: 200, // Add retry interval
  };
} else {
  // Use individual parameters (local development)
  dbConfig = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'attendance_portal',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
}

// Create connection pool
const pool = new Pool(dbConfig);

// Test connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

// Query helper function with better error handling
const query = async (text, params) => {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(text, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
};

// Transaction helper function with better error handling
const transaction = async (callback) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
};

module.exports = {
  pool,
  query,
  transaction
};