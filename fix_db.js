const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function fixDatabase() {
    try {
        console.log('Fixing database structure...');
        
        // Add password column to students table if it doesn't exist
        await pool.query(`
            ALTER TABLE students 
            ADD COLUMN IF NOT EXISTS password VARCHAR(255)
        `);
        console.log('Password column added to students table');

        // Insert sample students with passwords
        const sampleStudents = [
            ['MCA001', 'password123', 'John Doe', 'john@example.com'],
            ['MCA002', 'password123', 'Jane Smith', 'jane@example.com'],
            ['MCA003', 'password123', 'Mike Johnson', 'mike@example.com'],
            ['MCA004', 'password123', 'Sarah Wilson', 'sarah@example.com'],
            ['MCA005', 'password123', 'David Brown', 'david@example.com']
        ];

        for (const [studentId, password, name, email] of sampleStudents) {
            try {
                await pool.query(`
                    INSERT INTO students (student_id, password, name, email) 
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (student_id) 
                    DO UPDATE SET password = $2, name = $3, email = $4
                `, [studentId, password, name, email]);
                console.log(`Student ${studentId} added/updated successfully`);
            } catch (err) {
                console.log(`Student ${studentId} might already exist or there's an issue:`, err.message);
            }
        }

        console.log('Database fixed successfully!');
        
        // Test login with one of the students
        const testResult = await pool.query(
            'SELECT student_id, name FROM students WHERE student_id = $1 AND password = $2',
            ['MCA001', 'password123']
        );
        
        if (testResult.rows.length > 0) {
            console.log('✅ Login test successful:', testResult.rows[0]);
        } else {
            console.log('❌ Login test failed');
        }
        
    } catch (error) {
        console.error('Error fixing database:', error);
    } finally {
        await pool.end();
    }
}

fixDatabase();