const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function initializeDatabase() {
    try {
        console.log('Connecting to database...');
        
        // Create students table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS students (
                id SERIAL PRIMARY KEY,
                student_id VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Students table created successfully');

        // Create attendance table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS attendance (
                id SERIAL PRIMARY KEY,
                student_id VARCHAR(50) NOT NULL,
                date DATE NOT NULL,
                time TIME NOT NULL,
                status VARCHAR(20) DEFAULT 'present',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES students(student_id)
            )
        `);
        console.log('Attendance table created successfully');

        // Insert sample students
        await pool.query(`
            INSERT INTO students (student_id, password, name, email) VALUES 
            ('MCA001', 'password123', 'John Doe', 'john@example.com'),
            ('MCA002', 'password123', 'Jane Smith', 'jane@example.com'),
            ('MCA003', 'password123', 'Mike Johnson', 'mike@example.com'),
            ('MCA004', 'password123', 'Sarah Wilson', 'sarah@example.com'),
            ('MCA005', 'password123', 'David Brown', 'david@example.com')
            ON CONFLICT (student_id) DO NOTHING
        `);
        console.log('Sample students inserted successfully');

        console.log('Database initialized successfully!');
        
        // Test a query
        const result = await pool.query('SELECT COUNT(*) FROM students');
        console.log(`Total students in database: ${result.rows[0].count}`);
        
    } catch (error) {
        console.error('Error initializing database:', error);
    } finally {
        await pool.end();
    }
}

initializeDatabase();