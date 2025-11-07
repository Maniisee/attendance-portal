const { query } = require('./db-config');

// Database initialization script for both PostgreSQL and SQLite
async function initializeDatabase() {
  console.log('🚀 Initializing database...');

  try {
    // Create students table (compatible with both PostgreSQL and SQLite)
    await query(`
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY,
        student_id VARCHAR(50) UNIQUE NOT NULL,
        first_name VARCHAR(50),
        last_name VARCHAR(50),
        email VARCHAR(100),
        phone VARCHAR(20),
        parent_mobile VARCHAR(20),
        class VARCHAR(50),
        division VARCHAR(10),
        dob DATE,
        gender VARCHAR(10),
        address1 TEXT,
        address2 TEXT,
        city VARCHAR(50),
        state VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Students table created');

    // Create admin_users table
    await query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Admin users table created');

    // Create attendance_records table
    await query(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id INTEGER PRIMARY KEY,
        student_id VARCHAR(50) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'present'
      )
    `);
    console.log('✅ Attendance records table created');

    // Insert default admin user (admin/admin123)
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    try {
      await query(`
        INSERT INTO admin_users (username, password, email) 
        VALUES (?, ?, ?)
      `, ['admin', hashedPassword, 'admin@attendance.com']);
      console.log('✅ Default admin user created (admin/admin123)');
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed') || error.message.includes('duplicate key')) {
        console.log('ℹ️ Admin user already exists');
      } else {
        throw error;
      }
    }

    // Insert sample students
    const sampleStudents = [
      ['MCA001', 'John', 'Doe', 'john.doe@college.edu', '9876543210', '9876543211', 'MCA', 'A', '2000-01-15', 'Male'],
      ['MCA002', 'Jane', 'Smith', 'jane.smith@college.edu', '9876543212', '9876543213', 'MCA', 'A', '2000-02-20', 'Female'],
      ['MCA003', 'Bob', 'Johnson', 'bob.johnson@college.edu', '9876543214', '9876543215', 'MCA', 'B', '2000-03-10', 'Male'],
      ['MCA004', 'Alice', 'Brown', 'alice.brown@college.edu', '9876543216', '9876543217', 'MCA', 'B', '2000-04-05', 'Female'],
      ['MCA005', 'Charlie', 'Wilson', 'charlie.wilson@college.edu', '9876543218', '9876543219', 'MCA', 'A', '2000-05-12', 'Male']
    ];

    for (const student of sampleStudents) {
      try {
        await query(`
          INSERT INTO students (student_id, first_name, last_name, email, phone, parent_mobile, class, division, dob, gender, address1, city, state) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [...student, 'Sample Address', 'Sample City', 'Sample State']);
      } catch (error) {
        if (error.message.includes('UNIQUE constraint failed') || error.message.includes('duplicate key')) {
          // Student already exists, skip
          continue;
        } else {
          throw error;
        }
      }
    }
    console.log('✅ Sample students added');

    console.log('🎉 Database initialization completed successfully!');
    console.log('📊 Default login: admin / admin123');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

// Run initialization if called directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('Database ready!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Initialization failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };