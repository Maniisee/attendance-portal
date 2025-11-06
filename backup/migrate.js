const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Import database configuration
const { Pool } = require('pg');

// Database configuration using Railway credentials
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Import temp data
const { students, attendanceRecords } = require('./temp-data');

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting database migration...');
    
    // Read and execute schema
    console.log('📋 Creating database schema...');
    const schemaSQL = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8');
    await client.query(schemaSQL);
    console.log('✅ Schema created successfully');

    // Insert admin users
    console.log('👤 Creating admin users...');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await client.query(`
      INSERT INTO admin_users (username, password, full_name, email, role) 
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (username) DO UPDATE SET 
        password = EXCLUDED.password,
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email
    `, ['admin', hashedPassword, 'System Administrator', 'admin@college.edu', 'admin']);
    console.log('✅ Admin user created');

    // Migrate students
    console.log('🎓 Migrating students...');
    for (const student of students) {
      // Hash the password
      const hashedPassword = await bcrypt.hash(student.password, 10);
      
      // Insert student
      await client.query(`
        INSERT INTO students (
          student_id, password, first_name, last_name, email, 
          phone_number, parent_mobile, class, division, 
          date_of_birth, gender, address, city, state, 
          postal_code, qr_image_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (student_id) DO UPDATE SET
          password = EXCLUDED.password,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          email = EXCLUDED.email,
          phone_number = EXCLUDED.phone_number,
          parent_mobile = EXCLUDED.parent_mobile,
          class = EXCLUDED.class,
          division = EXCLUDED.division,
          date_of_birth = EXCLUDED.date_of_birth,
          gender = EXCLUDED.gender,
          address = EXCLUDED.address,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          postal_code = EXCLUDED.postal_code,
          qr_image_url = EXCLUDED.qr_image_url
      `, [
        student.studentId || student.student_id,
        hashedPassword,
        student.firstName || student.first_name || student.name?.split(' ')[0] || 'Unknown',
        student.lastName || student.last_name || student.name?.split(' ')[1] || 'User',
        student.email,
        student.phoneNumber || student.phone_number || student.phone,
        student.parentContact || student.parent_mobile || student.parentMobile,
        student.class,
        student.division,
        student.dateOfBirth || student.date_of_birth || '2000-01-01',
        student.gender,
        student.address,
        student.city,
        student.state,
        student.postalCode || student.postal_code || '000000',
        `/qrcodes/${student.studentId || student.student_id}.png`
      ]);
      
      console.log(`   ✅ Migrated student: ${student.studentId || student.student_id} - ${student.name || student.firstName + ' ' + student.lastName}`);
    }

    // Migrate attendance records
    console.log('📅 Migrating attendance records...');
    for (const record of attendanceRecords) {
      await client.query(`
        INSERT INTO attendance_records (
          student_id, date, time_in, time_out, status, location, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (student_id, date) DO UPDATE SET
          time_in = EXCLUDED.time_in,
          time_out = EXCLUDED.time_out,
          status = EXCLUDED.status,
          location = EXCLUDED.location,
          notes = EXCLUDED.notes
      `, [
        record.studentId || record.student_id,
        record.date,
        record.timeIn || record.time_in || null,
        record.timeOut || record.time_out || null,
        record.status || 'present',
        record.location || 'College Campus',
        record.notes || null
      ]);
      
      console.log(`   ✅ Migrated attendance: ${record.studentId || record.student_id} - ${record.date}`);
    }

    // Verify migration
    console.log('\n📊 Migration Summary:');
    const studentCount = await client.query('SELECT COUNT(*) FROM students');
    const attendanceCount = await client.query('SELECT COUNT(*) FROM attendance_records');
    const adminCount = await client.query('SELECT COUNT(*) FROM admin_users');
    
    console.log(`   Students: ${studentCount.rows[0].count}`);
    console.log(`   Attendance Records: ${attendanceCount.rows[0].count}`);
    console.log(`   Admin Users: ${adminCount.rows[0].count}`);
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Update server.js to use database instead of temp-data.js');
    console.log('   2. Test the application with database connectivity');
    console.log('   3. Deploy to Railway with the new database structure');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration if called directly
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };