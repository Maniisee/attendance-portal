const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function checkDatabase() {
    try {
        console.log('Checking existing database structure...');
        
        // Check if tables exist
        const tables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log('Existing tables:', tables.rows);

        // Check students table structure if it exists
        if (tables.rows.some(row => row.table_name === 'students')) {
            const columns = await pool.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'students'
            `);
            console.log('Students table columns:', columns.rows);
        }

        // Check attendance table structure if it exists
        if (tables.rows.some(row => row.table_name === 'attendance')) {
            const columns = await pool.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'attendance'
            `);
            console.log('Attendance table columns:', columns.rows);
        }
        
    } catch (error) {
        console.error('Error checking database:', error);
    } finally {
        await pool.end();
    }
}

checkDatabase();