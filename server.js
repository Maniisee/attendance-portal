const express = require('express');
const axios = require('axios');
const fs = require('fs');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// Load environment variables first
require('dotenv').config();

// Twilio setup - only initialize if credentials are provided
let twilioClient = null;
let TWILIO_PHONE = null;

if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && 
    process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
  const twilio = require('twilio');
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;
  console.log('✅ Twilio SMS service initialized');
} else {
  console.log('⚠️  Twilio credentials not configured - SMS notifications disabled');
}

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'attendance_portal',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432,
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error('Please check your database configuration in .env file');
    console.error('Make sure PostgreSQL is running and the database exists');
  } else {
    console.log('✅ Connected to PostgreSQL database successfully');
    release();
  }
});

// Security middleware
if (process.env.NODE_ENV === 'production') {
  app.use(helmet());
} else {
  // Development: Use helmet but allow inline scripts for forms
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts in development
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
        upgradeInsecureRequests: null, // Disable HTTPS upgrade in development
      },
    },
    hsts: false, // Disable HTTPS enforcement
  }));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);
app.use('/mark-attendance', limiter);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // Add JSON support for browser forms

// Add logging middleware for debugging
app.use('/add-student', (req, res, next) => {
  console.log('=== INCOMING REQUEST TO /add-student ===');
  console.log('Method:', req.method);
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Body received:', req.body);
  next();
});

app.use(express.static(__dirname));
// Serve QR code images from /qrcodes
app.use('/qrcodes', express.static(path.join(__dirname, 'qrcodes')));

// Root route - serve login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Serve home and students pages
app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'home.html'));
});

app.get('/students', (req, res) => {
  res.sendFile(path.join(__dirname, 'students.html'));
});

// Serve attendance and scan pages
app.get('/attendance.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'attendance.html'));
});
app.get('/scan.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'scan.html'));
});

// Dashboard route - redirect to students page (main dashboard)
app.get('/dashboard', (req, res) => {
  res.redirect('/students');
});

// API to get students with pagination and QR code URL
app.get('/api/students', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = 20;
  const offset = (page - 1) * pageSize;
  try {
    const result = await pool.query(
      'SELECT * FROM students ORDER BY id LIMIT $1 OFFSET $2',
      [pageSize, offset]
    );
    // Get total count for pagination
    const countResult = await pool.query('SELECT COUNT(*) FROM students');
    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / pageSize);

    // Add QR code image URL for each student
    const studentsWithQR = result.rows.map(s => ({
      ...s,
      qr_img_url: `/qrcodes/${s.student_id}.png`
    }));

    res.json({
      students: studentsWithQR,
      total,
      page,
      pageSize,
      totalPages
    });
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Handle login page
app.post('/dashboard', async (req, res) => {
  const { username, password } = req.body;

  // Input validation
  if (!username || !password) {
    return res.status(400).send('<h2>Username and password are required</h2><a href="/login.html">Try again</a>');
  }

  try {
    // Get the user by username
    const result = await pool.query(
      'SELECT * FROM admins WHERE username = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      console.log(`Login attempt failed for username: ${username} - user not found`);
      return res.status(401).send('<h2>Invalid username or password</h2><a href="/login.html">Try again</a>');
    }
    
    const user = result.rows[0];
    
    // Check password - handle both hashed and plain text for migration period
    let passwordMatches = false;
    
    if (user.password_hash.startsWith('$2b$')) {
      // Bcrypt hashed password
      passwordMatches = await bcrypt.compare(password, user.password_hash);
    } else {
      // Plain text password (for migration) - not recommended for production
      passwordMatches = user.password_hash === password;
      
      // If plain text password matches, hash it for future use
      if (passwordMatches) {
        const hashedPassword = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 10);
        await pool.query(
          'UPDATE admins SET password_hash = $1 WHERE id = $2',
          [hashedPassword, user.id]
        );
        console.log(`Password upgraded to hash for user: ${username}`);
      }
    }

    if (passwordMatches) {
      console.log(`Successful login for user: ${username}`);
      res.redirect('/students'); // Redirect to students registration page
    } else {
      console.log(`Login attempt failed for username: ${username} - incorrect password`);
      res.status(401).send('<h2>Invalid username or password</h2><a href="/login.html">Try again</a>');
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).send('<h2>Internal server error</h2><a href="/login.html">Try again</a>');
  }
});

// Handle student form submission
app.post('/add-student', async (req, res) => {
  console.log('📝 Student registration request received');
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Request body:', req.body);
  
  const {
    studentId,
    firstName,
    lastName,
    name,
    phone,
    email,
    parent_mobile,
    class: studentClass,
    division,
    dob,
    gender,
    address1,
    address2,
    city,
    state
  } = req.body;
  
  // Comprehensive validation
  if (!firstName || !lastName || !studentClass || !division || !parent_mobile) {
    console.log('❌ Validation failed - missing required fields');
    console.log('Required fields received:', { firstName, lastName, studentClass, division, parent_mobile });
    return res.status(400).json({ 
      error: 'Missing required fields: firstName, lastName, class, division, and parent_mobile are required' 
    });
  }
  
  // Build full name
  const fullName = name || `${firstName} ${lastName}`.trim();
  
  // Use parent_mobile as phone if phone is not provided
  const phoneNumber = phone || parent_mobile;
  
  try {
    // Auto-generate student ID if not provided
    let finalStudentId = studentId;
    if (!finalStudentId) {
      const countResult = await pool.query('SELECT COUNT(*) FROM students');
      const count = parseInt(countResult.rows[0].count) + 1;
      finalStudentId = `STU${count.toString().padStart(4, '0')}`;
    }
    
    // Check if student ID already exists
    const existingStudent = await pool.query(
      'SELECT student_id FROM students WHERE student_id = $1',
      [finalStudentId]
    );
    
    if (existingStudent.rows.length > 0) {
      return res.status(400).send('<h2>Student ID already exists</h2><a href="/students">Back to Students</a>');
    }
    
    const result = await pool.query(
      `INSERT INTO students (student_id, name, first_name, last_name, phone, email, parent_mobile, class, division, dob, gender, address1, address2, city, state) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [finalStudentId, fullName, firstName, lastName, phoneNumber, email, parent_mobile, studentClass, division, dob, gender, address1, address2, city, state]
    );
    console.log('Student inserted successfully:', result.rows[0]);
    const newStudent = result.rows[0];

    // Generate QR code using Python service
    try {
      console.log('Requesting QR code for:', finalStudentId);
      const qrData = `ID: ${finalStudentId}\nName: ${fullName}\nPhone: ${phoneNumber}\nEmail: ${email}`;
      const qrRes = await axios.post('http://localhost:5050/generate-qr', {
        data: qrData
      }, { responseType: 'arraybuffer' });

      console.log('QR code response status:', qrRes.status);
      console.log('QR code response headers:', qrRes.headers);
      // Ensure qrcodes directory exists
      const qrDir = path.join(__dirname, 'qrcodes');
      if (!fs.existsSync(qrDir)) {
        fs.mkdirSync(qrDir);
        console.log('Created qrcodes directory:', qrDir);
      }
      // Save QR code image to disk
      const qrPath = path.join(qrDir, `${finalStudentId}.png`);
      fs.writeFileSync(qrPath, qrRes.data);
      console.log('QR code saved:', qrPath);
    } catch (err) {
      console.error('QR code generation failed:', err);
    }

    // Fetch and log all students after insert
    try {
      const allStudents = await pool.query('SELECT * FROM students ORDER BY created_at DESC LIMIT 5');
      console.log('Recent students:', allStudents.rows);
    } catch (fetchErr) {
      console.error('Error fetching students:', fetchErr);
    }
    // Display QR code image on success page
    const qrImgUrl = `/qrcodes/${finalStudentId}.png`;
    res.send(`
      <div style="font-family: 'Roboto', Arial, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #185a9d;">Student Registered Successfully!</h2>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Student ID:</strong> ${finalStudentId}</p>
          <p><strong>Name:</strong> ${fullName}</p>
          <p><strong>Class:</strong> ${studentClass || 'N/A'}</p>
          <p><strong>Division:</strong> ${division || 'N/A'}</p>
          <p><strong>Phone:</strong> ${phoneNumber || 'N/A'}</p>
          <p><strong>Date of Birth:</strong> ${dob || 'N/A'}</p>
          <p><strong>Gender:</strong> ${gender || 'N/A'}</p>
        </div>
        <div style="margin:24px 0; text-align: center;">
          <h3>Student QR Code:</h3>
          <img src="${qrImgUrl}" alt="Student QR Code" style="max-width:200px;box-shadow:0 2px 8px #ccc;border-radius:8px;" />
          <p style="font-size: 0.9em; color: #666;">Scan this QR code to mark attendance</p>
        </div>
        <div style="text-align: center; margin-top: 30px;">
          <a href="/students" style="background: linear-gradient(90deg, #6a11cb 0%, #2575fc 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Back to Students</a>
        </div>
      </div>
    `);
  } catch (err) {
    console.error('Error inserting student:', err);
    res.status(500).send(`
      <div style="font-family: 'Roboto', Arial, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; text-align: center;">
        <h2 style="color: #dc3545;">Error Adding Student</h2>
        <p>Failed to add student. Please check the console for details.</p>
        <a href="/students" style="background: #6c757d; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Back to Students</a>
      </div>
    `);
  }
});

// Mark attendance and send SMS notification
app.post('/mark-attendance', async (req, res) => {
  const studentId = req.body.studentId || req.body.id || req.body.qr || null;
  if (!studentId) {
    return res.status(400).json({ success: false, message: 'Student ID is required in request body.' });
  }
  
  try {
    // Check if student exists
    const studentCheck = await pool.query(
      'SELECT * FROM students WHERE student_id = $1',
      [studentId]
    );
    
    if (studentCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }
    
    const student = studentCheck.rows[0];
    
    // Check if attendance already marked today
    const today = new Date().toISOString().split('T')[0];
    const existingAttendance = await pool.query(
      'SELECT * FROM attendance WHERE student_id = $1 AND DATE(timestamp) = $2',
      [studentId, today]
    );
    
    if (existingAttendance.rows.length > 0) {
      return res.json({ 
        success: false, 
        message: `Attendance already marked for ${student.name} today.` 
      });
    }
    
    // Mark attendance
    await pool.query('INSERT INTO attendance (student_id) VALUES ($1)', [studentId]);

    // Send SMS notification (only if Twilio is configured)
    if (student.parent_mobile && twilioClient && TWILIO_PHONE) {
      try {
        const message = `Dear Parent, your child ${student.name} has marked attendance at ${new Date().toLocaleString()}.`;
        await twilioClient.messages.create({
          body: message,
          from: TWILIO_PHONE,
          to: student.parent_mobile
        });
        console.log(`SMS sent to ${student.parent_mobile}`);
      } catch (smsError) {
        console.error('SMS sending failed:', smsError.message);
      }
    }

    res.json({ 
      success: true, 
      message: `Attendance marked successfully for ${student.name} (ID: ${studentId})` 
    });
  } catch (err) {
    console.error('Error marking attendance:', err);
    res.status(500).json({ success: false, message: 'Failed to mark attendance.' });
  }
});

// Get attendance records for UI
app.get('/api/attendance', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.student_id, s.name, s.first_name, s.last_name, a.timestamp, a.status
       FROM attendance a
       JOIN students s ON a.student_id = s.student_id
       ORDER BY a.timestamp DESC
       LIMIT 100`
    );
    res.json({ records: result.rows });
  } catch (err) {
    console.error('Error fetching attendance:', err);
    res.status(500).json({ error: 'Failed to fetch attendance records.' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 QR Service should be running on http://localhost:${process.env.QR_SERVICE_PORT || 5050}`);
});