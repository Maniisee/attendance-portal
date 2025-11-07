const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const { query, pool } = require('./db-config');
const { initializeDatabase } = require('./init-db');
const path = require('path');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');

const app = express();
const port = process.env.PORT || 3000;

// Load environment variables
require('dotenv').config();

console.log('🚀 Server starting with PostgreSQL database connection');

// Initialize database on startup
initializeDatabase().catch(console.error);

// Security middleware
if (process.env.NODE_ENV === 'production') {
  app.use(helmet());
} else {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    hsts: false,
    referrerPolicy: false,
  }));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api', limiter);
app.use('/login', limiter);
app.use('/add-student', limiter);
app.use('/mark-attendance', limiter);

// Body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, '.')));
app.use('/qrcodes', express.static(path.join(__dirname, 'qrcodes')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'home.html'));
});

app.get('/students', (req, res) => {
  res.sendFile(path.join(__dirname, 'students.html'));
});

app.get('/attendance', (req, res) => {
  res.sendFile(path.join(__dirname, 'attendance.html'));
});

app.get('/scan', (req, res) => {
  res.sendFile(path.join(__dirname, 'scan.html'));
});

// Login route with dual response handling
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('📋 Login attempt:', { username, timestamp: new Date().toISOString() });

  const isJsonRequest = req.headers['content-type']?.includes('application/json') ||
                       req.headers['accept']?.includes('application/json');

  try {
    let isValid = false;
    let userType = '';
    let user = null;

    // Check admin credentials first
    try {
      const adminResult = await query('SELECT * FROM admin_users WHERE username = $1', [username]);
      if (adminResult.rows.length > 0) {
        const admin = adminResult.rows[0];
        isValid = await bcrypt.compare(password, admin.password);
        if (isValid) {
          userType = 'admin';
          user = admin;
        }
      }
    } catch (error) {
      console.error('Admin login query error:', error);
    }

    // If not admin, check student credentials
    if (!isValid) {
      try {
        const studentResult = await query('SELECT * FROM students WHERE student_id = $1', [username]);
        if (studentResult.rows.length > 0) {
          const student = studentResult.rows[0];
          isValid = await bcrypt.compare(password, student.password);
          if (isValid) {
            userType = 'student';
            user = student;
          }
        }
      } catch (error) {
        console.error('Student login query error:', error);
      }
    }

    if (isValid && user) {
      console.log('✅ Login successful:', { username, userType });
      
      if (isJsonRequest) {
        return res.json({ 
          success: true, 
          message: 'Login successful',
          redirectUrl: '/home',
          userType: userType,
          user: {
            id: user.id,
            username: user.username || user.student_id,
            name: user.full_name || `${user.first_name} ${user.last_name}`
          }
        });
      } else {
        return res.redirect('/home');
      }
    } else {
      console.log('❌ Login failed:', { username });
      
      if (isJsonRequest) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      } else {
        return res.status(401).send(`
          <div style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h2 style="color: #dc3545;">Login Failed</h2>
            <p>Invalid username or password.</p>
            <a href="/login" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Try Again</a>
          </div>
        `);
      }
    }
  } catch (error) {
    console.error('Login error:', error);
    
    if (isJsonRequest) {
      return res.status(500).json({ 
        success: false, 
        message: 'Server error' 
      });
    } else {
      return res.status(500).send(`
        <div style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h2 style="color: #dc3545;">Server Error</h2>
          <p>Please try again later.</p>
          <a href="/login" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Back to Login</a>
        </div>
      `);
    }
  }
});

// Dashboard route (POST) - alternative login endpoint
app.post('/dashboard', async (req, res) => {
  const { username, password } = req.body;
  console.log('📋 Dashboard login attempt:', { username, timestamp: new Date().toISOString() });

  try {
    let isValid = false;
    let userType = '';
    let user = null;

    // Check admin credentials first
    try {
      const adminResult = await query('SELECT * FROM admin_users WHERE username = $1', [username]);
      if (adminResult.rows.length > 0) {
        const admin = adminResult.rows[0];
        isValid = await bcrypt.compare(password, admin.password);
        if (isValid) {
          userType = 'admin';
          user = admin;
        }
      }
    } catch (error) {
      console.error('Admin login query error:', error);
    }

    // If not admin, check student credentials
    if (!isValid) {
      try {
        const studentResult = await query('SELECT * FROM students WHERE student_id = $1', [username]);
        if (studentResult.rows.length > 0) {
          const student = studentResult.rows[0];
          isValid = await bcrypt.compare(password, student.password);
          if (isValid) {
            userType = 'student';
            user = student;
          }
        }
      } catch (error) {
        console.error('Student login query error:', error);
      }
    }

    if (isValid && user) {
      console.log('✅ Dashboard login successful:', { username, userType });
      return res.redirect('/home');
    } else {
      console.log('❌ Dashboard login failed:', { username });
      return res.status(401).send(`
        <div style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h2 style="color: #dc3545;">Login Failed</h2>
          <p>Invalid username or password.</p>
          <a href="/login" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Try Again</a>
        </div>
      `);
    }
  } catch (error) {
    console.error('Dashboard login error:', error);
    return res.status(500).send(`
      <div style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
        <h2 style="color: #dc3545;">Server Error</h2>
        <p>Please try again later.</p>
        <a href="/login" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Back to Login</a>
      </div>
    `);
  }
});

// Get students API
app.get('/api/students', async (req, res) => {
  try {
    const result = await query('SELECT * FROM students ORDER BY student_id');
    const students = result.rows.map(student => ({
      // Provide both field formats for compatibility
      studentId: student.student_id,
      student_id: student.student_id,
      name: `${student.first_name} ${student.last_name}`,
      firstName: student.first_name,
      lastName: student.last_name,
      email: student.email,
      phoneNumber: student.phone_number,
      phone: student.phone_number,
      parentContact: student.parent_mobile,
      parent_mobile: student.parent_mobile,
      class: student.class,
      division: student.division,
      dateOfBirth: student.date_of_birth,
      gender: student.gender,
      address: student.address,
      city: student.city,
      state: student.state,
      postalCode: student.postal_code,
      qrImageUrl: student.qr_image_url,
      qr_img_url: student.qr_image_url
    }));
    
    res.json({
      success: true,
      students: students,
      total: students.length
    });
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ error: 'Failed to fetch students.' });
  }
});

// Add student
// Debug endpoint to check table structure
app.get('/debug/table-info', async (req, res) => {
  try {
    const result = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'students' 
      ORDER BY ordinal_position
    `);
    res.json({ success: true, columns: result.rows });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/add-student', async (req, res) => {
  try {
    const { firstName, lastName, class: studentClass, division, parent_mobile, email, gender, dob, address1, address2, city, state } = req.body;
    
    if (!firstName || !lastName || !studentClass || !division || !parent_mobile) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    const countResult = await query('SELECT COUNT(*) FROM students');
    const count = parseInt(countResult.rows[0].count || countResult.rows[0]['COUNT(*)']) + 1;
    const studentId = `STU${count.toString().padStart(4, '0')}`;
    
    // Insert with compatible parameter syntax (works for both PostgreSQL and SQLite)
    const result = await query(`
      INSERT INTO students (
        student_id, first_name, last_name, email, phone, parent_mobile, 
        class, division, dob, gender, address1, address2, city, state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
      RETURNING *
    `, [
      studentId,
      firstName,
      lastName,
      email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@student.edu`,
      parent_mobile,
      parent_mobile,
      studentClass,
      division,
      dob || '2000-01-01',
      gender || 'N/A',
      address1 || '',
      address2 || '',
      city || '',
      state || ''
    ]);
    
    const newStudent = result.rows[0];
    console.log('✅ Student registered successfully:', newStudent);
    
    res.json({
      success: true,
      message: 'Student registered successfully!',
      student: {
        studentId: newStudent.student_id,
        name: `${newStudent.first_name} ${newStudent.last_name}`,
        class: newStudent.class,
        division: newStudent.division,
        email: newStudent.email,
        phone: newStudent.phone
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark attendance
app.post('/mark-attendance', async (req, res) => {
  const studentId = req.body.studentId || req.body.id || req.body.qr || null;
  if (!studentId) {
    return res.status(400).json({ success: false, message: 'Student ID is required in request body.' });
  }
  
  try {
    // Check if student exists in database
    const studentResult = await query('SELECT * FROM students WHERE student_id = $1', [studentId]);
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const student = studentResult.rows[0];
    
    // Check if attendance already marked today
    const today = new Date().toISOString().split('T')[0];
    const existingResult = await query(
      'SELECT * FROM attendance_records WHERE student_id = $1 AND date = $2', 
      [studentId, today]
    );
    
    if (existingResult.rows.length > 0) {
      return res.json({ 
        success: false, 
        message: `Attendance already marked for ${student.first_name} ${student.last_name} today.` 
      });
    }
    
    // Mark attendance
    const now = new Date();
    const timeIn = now.toTimeString().split(' ')[0]; // HH:MM:SS format
    
    await query(`
      INSERT INTO attendance_records (student_id, date, time_in, status, location)
      VALUES ($1, $2, $3, $4, $5)
    `, [studentId, today, timeIn, 'present', 'College Campus']);

    res.json({ 
      success: true, 
      message: `Attendance marked successfully for ${student.first_name} ${student.last_name} (ID: ${studentId})` 
    });
  } catch (err) {
    console.error('Error marking attendance:', err);
    res.status(500).json({ success: false, message: 'Failed to mark attendance.' });
  }
});

// Get attendance records for UI
app.get('/api/attendance', async (req, res) => {
  try {
    // Get attendance records from database with student details
    const result = await query(`
      SELECT 
        ar.*,
        s.first_name,
        s.last_name,
        s.class,
        s.division
      FROM attendance_records ar
      JOIN students s ON ar.student_id = s.student_id
      ORDER BY ar.date DESC, ar.time_in DESC
      LIMIT 100
    `);
    
    // Format records for frontend compatibility
    const records = result.rows.map(record => ({
      id: record.id,
      studentId: record.student_id,
      name: `${record.first_name} ${record.last_name}`,
      firstName: record.first_name,
      lastName: record.last_name,
      class: record.class,
      division: record.division,
      date: record.date,
      timestamp: record.created_at,
      timeIn: record.time_in,
      timeOut: record.time_out,
      status: record.status,
      location: record.location,
      notes: record.notes
    }));
    
    res.json({ records });
  } catch (err) {
    console.error('Error fetching attendance:', err);
    res.status(500).json({ error: 'Failed to fetch attendance records.' });
  }
});

app.listen(port, async () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Database: PostgreSQL configured`);
  
  // Get counts from database with timeout handling
  try {
    console.log('🔍 Checking database connectivity...');
    const studentCount = await query('SELECT COUNT(*) FROM students');
    const attendanceCount = await query('SELECT COUNT(*) FROM attendance_records');
    console.log(`📊 Students in database: ${studentCount.rows[0].count}`);
    console.log(`📝 Attendance records: ${attendanceCount.rows[0].count}`);
    console.log('✅ Database connection verified');
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    console.log('⚠️  Server will continue running, but database operations may fail');
    console.log('💡 Tip: Check your Railway database connection or restart the server');
  }
});// Force redeploy Fri Nov  7 08:19:25 +08 2025
// Redeploy after Vercel DB creation
