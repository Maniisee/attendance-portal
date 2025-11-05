const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const { students, attendanceRecords } = require('./temp-data');
const path = require('path');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');

const app = express();
const port = process.env.PORT || 3000;

// Load environment variables
require('dotenv').config();

console.log('🚀 Server starting with temporary data storage - CLEAN VERSION');
console.log('📊 Total students loaded:', students.length);
console.log('📝 Total attendance records loaded:', attendanceRecords.length);

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

// Admin/Student credentials
const adminCredentials = {
  username: 'admin',
  password: bcrypt.hashSync('admin123', 10)
};

// Student login (they can use their student ID)
const studentPasswords = {
  'MCA001': bcrypt.hashSync('password123', 10),
  'MCA002': bcrypt.hashSync('password123', 10),
  'MCA003': bcrypt.hashSync('password123', 10)
};

// Login route with dual response handling
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('📋 Login attempt:', { username, timestamp: new Date().toISOString() });

  const isJsonRequest = req.headers['content-type']?.includes('application/json') ||
                       req.headers['accept']?.includes('application/json');

  try {
    let isValid = false;
    let userType = '';

    // Check admin credentials
    if (username === adminCredentials.username) {
      isValid = await bcrypt.compare(password, adminCredentials.password);
      userType = 'admin';
    }
    // Check student credentials
    else if (studentPasswords[username]) {
      isValid = await bcrypt.compare(password, studentPasswords[username]);
      userType = 'student';
    }
    // Check if username matches any student ID from temp data
    else {
      const student = students.find(s => s.studentId === username);
      if (student && password === 'password123') {
        isValid = true;
        userType = 'student';
      }
    }

    if (isValid) {
      console.log('✅ Login successful:', { username, userType });
      
      if (isJsonRequest) {
        return res.json({ 
          success: true, 
          message: 'Login successful',
          redirectUrl: '/home',
          userType: userType
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

// Get students API
app.get('/api/students', (req, res) => {
  try {
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
      success: false,
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
      return res.status(400).json({
        success: false,
        error: 'Student ID already exists'
      });
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
    
    console.log('✅ Student added successfully:', newStudent);

    // Generate QR code
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

    // Return JSON response for successful registration
    const qrImgUrl = `/qrcodes/${finalStudentId}.png`;
    res.json({
      success: true,
      message: 'Student registered successfully!',
      student: {
        studentId: finalStudentId,
        name: fullName,
        class: studentClass || 'N/A',
        division: division || 'N/A',
        phone: phoneNumber || 'N/A',
        dateOfBirth: dob || 'N/A',
        gender: gender || 'N/A',
        qrCodeUrl: qrImgUrl
      }
    });
  } catch (err) {
    console.error('❌ Error adding student:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to add student. Please try again.'
    });
  }
});

// Mark attendance
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
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Students available: ${students.length}`);
  console.log(`📝 Attendance records: ${attendanceRecords.length}`);
});