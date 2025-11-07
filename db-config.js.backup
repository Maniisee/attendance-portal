const path = require('path');
require('dotenv').config();

let db, query, transaction;

if (process.env.POSTGRES_URL) {
  // Vercel PostgreSQL (Neon) - preferred
  const { Pool } = require('pg');
  
  const dbConfig = {
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
  
  const pool = new Pool(dbConfig);
  console.log('🚀 Using Vercel PostgreSQL (Neon)');
  
  query = async (text, params) => {
    let client;
    try {
      client = await pool.connect();
      const result = await client.query(text, params);
      return result;
    } catch (error) {
      console.error('Database query error:', error.message);
      throw error;
    } finally {
      if (client) client.release();
    }
  };
  
  transaction = async (callback) => {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      if (client) await client.query('ROLLBACK');
      throw error;
    } finally {
      if (client) client.release();
    }
  };
  
  db = { pool, query, transaction };
  
} else {
  // SQLite fallback - works instantly without any setup
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, 'attendance.db');
  
  db = new Database(dbPath);
  console.log('� Using SQLite database (fallback)');
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  query = async (text, params = []) => {
    try {
      // Convert PostgreSQL syntax to SQLite
      let sqliteQuery = text
        .replace(/\$(\d+)/g, '?')  // Replace $1, $2, etc. with ?
        .replace(/SERIAL/gi, 'INTEGER')
        .replace(/VARCHAR\(\d+\)/gi, 'TEXT')
        .replace(/TIMESTAMP/gi, 'DATETIME')
        .replace(/CURRENT_TIMESTAMP/gi, "datetime('now')")
        .replace(/ON CONFLICT.*DO NOTHING/gi, 'OR IGNORE');
      
      if (sqliteQuery.toLowerCase().includes('select') || sqliteQuery.toLowerCase().includes('returning')) {
        const stmt = db.prepare(sqliteQuery.replace(/RETURNING.*$/i, ''));
        if (sqliteQuery.toLowerCase().includes('returning')) {
          // For INSERT/UPDATE with RETURNING, do the operation then SELECT
          const result = stmt.run(...params);
          if (result.lastInsertRowid) {
            const selectStmt = db.prepare('SELECT * FROM students WHERE id = ?');
            const row = selectStmt.get(result.lastInsertRowid);
            return { rows: [row] };
          }
          return { rows: [] };
        } else {
          const rows = stmt.all(...params);
          return { rows };
        }
      } else {
        const stmt = db.prepare(sqliteQuery);
        const result = stmt.run(...params);
        return { rows: [], changes: result.changes };
      }
    } catch (error) {
      console.error('SQLite query error:', error.message);
      throw error;
    }
  };
  
  transaction = async (callback) => {
    const transaction = db.transaction(() => {
      return callback({
        query: async (text, params) => {
          const result = await query(text, params);
          return result;
        }
      });
    });
    return transaction();
  };
}

module.exports = {
  pool,
  query,
  transaction
};