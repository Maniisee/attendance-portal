const express = require('express');
const axios = require('axios');
const fs = require('fs');
const bodyParser = require('body-parser');
const { createDatabasePool } = require('./db-config');
const { students, attendanceRecords } = require('./temp-data');
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

// Create database pool using the new configuration
const pool = createDatabasePool();

// Test database connection with better error handling
async function testDatabaseConnection() {
  try {
    console.log('🔄 Testing database connection...');
    console.log('📍 Environment:', process.env.NODE_ENV);
    console.log('🌐 DATABASE_URL exists:', !!process.env.DATABASE_URL);
    
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL database successfully');
    
    // Test a simple query
    const result = await client.query('SELECT NOW()');
    console.log('⏰ Database time:', result.rows[0].now);
    
    client.release();
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error('🔍 Error details:', {
      code: err.code,
      errno: err.errno,
      syscall: err.syscall,
      hostname: err.hostname,
      port: err.port
    });
    console.error('Please check your database configuration');
    console.error('Make sure PostgreSQL is running and accessible');
  }
}

// Call the test function
testDatabaseConnection();

// Security middleware
if (process.env.NODE_ENV === 'production') {
  app.use(helmet());
} else {
  // Development: Completely disable HTTPS enforcement and upgrades
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts in development
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
        upgradeInsecureRequests: null, // Completely disable HTTPS upgrade
      },
    },
    hsts: false, // Disable HTTPS enforcement
    noSniff: false, // Allow content type sniffing in development
    frameguard: false, // Disable X-Frame-Options in development
  }));
  
  // Add custom header to explicitly tell browser not to upgrade requests  
  app.use((req, res, next) => {
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https:;");
    next();
  });
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

// Add middleware logging (after body parser)
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  if (req.method === 'POST') {
    console.log('📋 POST Body:', req.body);
  }
  next();
});

// Add comprehensive request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`🌐 ${timestamp} - ${req.method} ${req.path}`);
  console.log(`📋 Headers:`, req.headers);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`📦 Body:`, req.body);
  }
  next();
});

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
app.get('/home.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'home.html'));
});

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

// Dashboard route - redirect to home page (main dashboard)
app.get('/dashboard', (req, res) => {
  res.redirect('/home.html');
});

// Logout route
app.post('/logout', (req, res) => {
  // Since we're not using sessions, just redirect to login
  res.json({ success: true, redirect: '/' });
});

app.get('/logout', (req, res) => {
  res.redirect('/');
});

// API to get students with pagination and QR code URL
app.get('/api/students', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = 20;
  const offset = (page - 1) * pageSize;
  
  try {
    // Use temporary data instead of database
    const studentsArray = Array.from(students.values());
    
    // Add QR code image URL for each student
    const studentsWithQR = studentsArray.map(s => ({
      ...s,
      qr_img_url: `/qrcodes/${s.student_id}.png`
    }));

    // Paginate the results
    const paginatedStudents = studentsWithQR.slice(offset, offset + pageSize);
    const total = studentsArray.length;
    const totalPages = Math.ceil(total / pageSize);

    console.log(`📊 Returning ${paginatedStudents.length} students (page ${page}/${totalPages})`);

    res.json({
      students: paginatedStudents,
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
  console.log('🔐 LOGIN ATTEMPT RECEIVED');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  
  const { username, password } = req.body;

  // Input validation
  if (!username || !password) {
    console.log('❌ Missing username or password');
    return res.status(400).json({ success: false, error: 'Username and password are required' });
  }

  console.log(`🔍 Attempting login for username: ${username}`);

  try {
    // First check if it's a student login (format MCA###)
    if (/^MCA\d{3}$/.test(username)) {
      console.log('�‍🎓 Student login detected');
      
      // Use temporary data for now (since database is not working)
      const student = students.get(username);
      
      if (student && student.password === password) {
        console.log(`✅ Student login successful for: ${username}`);
        
        // Check if request expects JSON (AJAX) or HTML (form submission)
        const acceptsJson = req.headers.accept && req.headers.accept.includes('application/json');
        const isAjax = req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest';
        
        if (acceptsJson || isAjax) {
          return res.status(200).json({
            success: true,
            redirect: '/home.html',
            user: {
              id: student.student_id,
              name: student.name,
              type: 'student'
            }
          });
        } else {
          // Traditional form submission - redirect directly
          return res.redirect('/home.html');
        }
      } else {
        console.log(`❌ Student login failed for: ${username}`);
        
        const acceptsJson = req.headers.accept && req.headers.accept.includes('application/json');
        const isAjax = req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest';
        
        if (acceptsJson || isAjax) {
          return res.status(401).json({
            success: false,
            error: 'Invalid student ID or password'
          });
        } else {
          return res.redirect('/login.html?error=invalid');
        }
      }
    }
    
    // Admin login - use hardcoded admin for testing (since database is not working)
    console.log('👨‍💼 Admin login detected');
    
    if (username === 'admin' && password === 'admin123') {
      console.log('✅ Admin login successful (hardcoded)');
      
      const acceptsJson = req.headers.accept && req.headers.accept.includes('application/json');
      const isAjax = req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest';
      
      if (acceptsJson || isAjax) {
        return res.status(200).json({
          success: true,
          redirect: '/home.html',
          user: {
            username: 'admin',
            name: 'Administrator',
            type: 'admin'
          }
        });
      } else {
        return res.redirect('/home.html');
      }
    }
    
    console.log(`❌ Admin login failed for username: ${username}`);
    
    const acceptsJson = req.headers.accept && req.headers.accept.includes('application/json');
    const isAjax = req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest';
    
    if (acceptsJson || isAjax) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password'
      });
    } else {
      return res.redirect('/login.html?error=invalid');
    }
    
  } catch (error) {
    console.error('❌ Login error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Server error during login'
    });
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
      const count = students.length + 1;
      finalStudentId = `STU${count.toString().padStart(4, '0')}`;
    }
    
    // Check if student ID already exists
    const existingStudent = students.find(s => s.studentId === finalStudentId);
    
    if (existingStudent) {
      return res.status(400).send('<h2>Student ID already exists</h2><a href="/students">Back to Students</a>');
    }

    // Create new student object
    const newStudent = {
      studentId: finalStudentId,
      name: fullName,
      firstName: firstName,
      lastName: lastName,
      phoneNumber: phoneNumber,
      email: email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@student.edu`,
      parentContact: parent_mobile,
      class: studentClass,
      division: division,
      dateOfBirth: dob || 'N/A',
      gender: gender || 'N/A',
      address: `${address1 || ''} ${address2 || ''}`.trim() || 'N/A',
      city: city || 'N/A',
      state: state || 'N/A',
      joinDate: new Date().toISOString().split('T')[0]
    };

    // Add to students array
    students.push(newStudent);
    
    console.log('Student inserted successfully:', newStudent);

    // Generate QR code using built-in QRCode library
    try {
      console.log('Generating QR code for:', finalStudentId);
      const qrData = `ID: ${finalStudentId}\nName: ${fullName}\nPhone: ${phoneNumber}\nEmail: ${newStudent.email}`;
      const qrDataURL = await QRCode.toDataURL(qrData);

      // Ensure qrcodes directory exists
      const qrDir = path.join(__dirname, 'qrcodes');
      if (!fs.existsSync(qrDir)) {
        fs.mkdirSync(qrDir);
        console.log('Created qrcodes directory:', qrDir);
      }
      
      // Save QR code image to disk
      const qrPath = path.join(qrDir, `${finalStudentId}.png`);
      const base64Data = qrDataURL.replace(/^data:image\/png;base64,/, "");
      fs.writeFileSync(qrPath, base64Data, 'base64');
      console.log('QR code saved:', qrPath);
    } catch (err) {
      console.error('QR code generation failed:', err);
    }

    // Log recent students
    console.log('Recent students:', students.slice(-5));
    
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
    console.error('Error adding student:', err);
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
    const student = students.find(s => s.studentId === studentId);
    
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }
    
    // Check if attendance already marked today
    const today = new Date().toISOString().split('T')[0];
    const existingAttendance = attendanceRecords.find(record => 
      record.studentId === studentId && 
      record.date === today
    );
    
    if (existingAttendance) {
      return res.json({ 
        success: false, 
        message: `Attendance already marked for ${student.name} today.` 
      });
    }
    
    // Mark attendance
    const newAttendanceRecord = {
      id: attendanceRecords.length + 1,
      studentId: studentId,
      name: student.name,
      firstName: student.firstName || student.name.split(' ')[0],
      lastName: student.lastName || student.name.split(' ')[1] || '',
      date: today,
      timestamp: new Date().toISOString(),
      status: 'present'
    };
    
    attendanceRecords.push(newAttendanceRecord);

    // Send SMS notification (only if Twilio is configured and parent contact exists)
    if (student.parentContact && twilioClient && TWILIO_PHONE) {
      try {
        const message = `Dear Parent, your child ${student.name} has marked attendance at ${new Date().toLocaleString()}.`;
        await twilioClient.messages.create({
          body: message,
          from: TWILIO_PHONE,
          to: student.parentContact
        });
        console.log(`SMS sent to ${student.parentContact}`);
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
    // Return attendance records sorted by timestamp (newest first)
    const sortedRecords = attendanceRecords
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 100); // Limit to 100 most recent records
    
    res.json({ records: sortedRecords });
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