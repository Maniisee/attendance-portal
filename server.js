const express = require('express');
const axios = require('axios');
const fs = require('fs');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const MemoryStorage = require('./memory-storage');

const app = express();
const port = process.env.PORT || 8080;

// Configure trust proxy for Railway
app.set('trust proxy', 1);

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
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { 
    rejectUnauthorized: false,
    sslmode: 'require'
  } : false,
  // Add connection timeout and retry settings
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10,
  min: 2
});

// Test database connection and initialize tables
let dbConnected = false;
let memoryStorage = null;

async function initializeDatabase() {
  let retryCount = 0;
  const maxRetries = 5; // Increased retries
  
  while (retryCount < maxRetries && !dbConnected) {
    try {
      console.log(`🔄 Attempting database connection (${retryCount + 1}/${maxRetries})...`);
      
      // Test connection with timeout
      const client = await Promise.race([
        pool.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 15000)
        )
      ]);
      
      console.log('✅ Connected to PostgreSQL database successfully');
      
      // Test a simple query
      await client.query('SELECT NOW()');
      console.log('✅ Database query test successful');
      
      // Create tables if they don't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS students (
          id SERIAL PRIMARY KEY,
          student_id VARCHAR(50) UNIQUE NOT NULL,
          name VARCHAR(100) NOT NULL,
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
        );
      `);

      // Add missing columns if they don't exist (for existing tables)
      const addColumnIfNotExists = async (columnName, columnDef) => {
        try {
          await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS ${columnName} ${columnDef};`);
        } catch (err) {
          // Column might already exist, ignore error
          console.log(`Column ${columnName} already exists or error adding:`, err.message);
        }
      };

      // Check if we need to add missing columns
      const tableInfo = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'students' AND table_schema = 'public'
      `);
      
      const existingColumns = tableInfo.rows.map(row => row.column_name);
      console.log('Existing columns:', existingColumns);
      
      // If we're missing key columns, recreate the table
      const requiredColumns = ['first_name', 'last_name', 'parent_mobile', 'class', 'division'];
      const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
      
      if (missingColumns.length > 0) {
        console.log('🔄 Missing columns detected, recreating table with full schema...');
        
        // Drop and recreate with full schema
        await client.query('DROP TABLE IF EXISTS students CASCADE;');
        await client.query('DROP TABLE IF EXISTS attendance CASCADE;');
        
        await client.query(`
          CREATE TABLE students (
            id SERIAL PRIMARY KEY,
            student_id VARCHAR(50) UNIQUE NOT NULL,
            name VARCHAR(100) NOT NULL,
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
          );
        `);
        
        console.log('✅ Students table recreated with full schema');
      } else {
        // Just add any missing columns
        await addColumnIfNotExists('first_name', 'VARCHAR(50)');
        await addColumnIfNotExists('last_name', 'VARCHAR(50)');
        await addColumnIfNotExists('parent_mobile', 'VARCHAR(20)');
        await addColumnIfNotExists('class', 'VARCHAR(50)');
        await addColumnIfNotExists('division', 'VARCHAR(10)');
        await addColumnIfNotExists('dob', 'DATE');
        await addColumnIfNotExists('gender', 'VARCHAR(10)');
        await addColumnIfNotExists('address1', 'TEXT');
        await addColumnIfNotExists('address2', 'TEXT');
        await addColumnIfNotExists('city', 'VARCHAR(50)');
        await addColumnIfNotExists('state', 'VARCHAR(50)');
      }
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS attendance (
          id SERIAL PRIMARY KEY,
          student_id VARCHAR(50) NOT NULL,
          date DATE NOT NULL,
          time TIME NOT NULL,
          status VARCHAR(20) DEFAULT 'present',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS admins (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          email VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // Insert default admin if not exists
      await client.query(`
        INSERT INTO admins (username, password_hash, email) 
        VALUES ('admin', 'admin123', 'admin@attendance.portal') 
        ON CONFLICT (username) DO NOTHING
      `);
      
      console.log('✅ Database tables initialized successfully');
      client.release();
      dbConnected = true;
      return;
    } catch (err) {
      retryCount++;
      console.error(`❌ Database connection attempt ${retryCount} failed:`, err.message);
      if (retryCount < maxRetries) {
        console.log(`⏳ Retrying in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
  
  if (!dbConnected) {
    console.error('❌ All database connection attempts failed. Initializing memory storage...');
    memoryStorage = new MemoryStorage();
    console.log('✅ Memory storage ready - application can accept data temporarily');
  }
}

// Helper function to check database connection
function isDbConnected() {
  return dbConnected;
}

// Helper function to get storage (database or memory)
function getStorage() {
  return dbConnected ? pool : memoryStorage;
}

// Initialize database on startup
initializeDatabase();

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

// Add middleware to handle database connection status
app.use((req, res, next) => {
  req.dbConnected = isDbConnected();
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  let stats = null;
  if (!req.dbConnected && memoryStorage) {
    stats = memoryStorage.getStats();
  }
  
  res.json({
    status: 'running',
    database: req.dbConnected ? 'connected' : 'disconnected',
    storage: req.dbConnected ? 'postgresql' : 'memory',
    timestamp: new Date().toISOString(),
    memory_storage_ready: !!memoryStorage,
    memory_stats: stats
  });
});

// Debug endpoint for memory storage
app.get('/debug/memory', (req, res) => {
  if (req.dbConnected) {
    return res.json({ message: 'Using database storage, no memory data available' });
  }
  
  if (!memoryStorage) {
    return res.json({ message: 'Memory storage not initialized' });
  }
  
  res.json({
    initialized: true,
    data: memoryStorage.getAllData(),
    stats: memoryStorage.getStats()
  });
});

// Test endpoint to add a sample student
app.get('/test/add-sample-student', async (req, res) => {
  if (req.dbConnected) {
    return res.json({ message: 'Using database, test not applicable' });
  }
  
  if (!memoryStorage) {
    return res.json({ error: 'Memory storage not initialized' });
  }
  
  try {
    const sampleStudent = {
      student_id: 'TEST001',
      name: 'Test Student',
      first_name: 'Test',
      last_name: 'Student',
      phone: '1234567890',
      email: 'test@example.com',
      parent_mobile: '0987654321',
      class: '10',
      division: 'A',
      dob: '2005-01-01',
      gender: 'Male',
      address1: '123 Test St',
      city: 'Test City',
      state: 'Test State'
    };
    
    const result = await memoryStorage.addStudent(sampleStudent);
    const stats = memoryStorage.getStats();
    
    res.json({
      success: true,
      student_added: result.rows[0],
      stats: stats
    });
  } catch (error) {
    res.json({
      error: error.message,
      details: error
    });
  }
});

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

// Test form for debugging registration
app.get('/test-form', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-form.html'));
});

// Debug form for step-by-step testing
app.get('/debug-form', (req, res) => {
  res.sendFile(path.join(__dirname, 'debug-form.html'));
});

// Database reset endpoint for fixing schema issues
app.get('/admin/reset-database', async (req, res) => {
  if (!dbConnected) {
    return res.status(500).json({ error: 'Database not connected' });
  }
  
  try {
    const client = await pool.connect();
    
    // Drop and recreate students table with all columns
    await client.query('DROP TABLE IF EXISTS students CASCADE;');
    await client.query('DROP TABLE IF EXISTS attendance CASCADE;');
    
    // Create students table with full schema
    await client.query(`
      CREATE TABLE students (
        id SERIAL PRIMARY KEY,
        student_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
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
      );
    `);
    
    // Create attendance table
    await client.query(`
      CREATE TABLE attendance (
        id SERIAL PRIMARY KEY,
        student_id VARCHAR(50) NOT NULL,
        date DATE NOT NULL,
        time TIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(student_id)
      );
    `);
    
    client.release();
    
    res.json({ 
      success: true, 
      message: 'Database schema recreated successfully with all columns' 
    });
    
  } catch (error) {
    console.error('Database reset error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Simple, bulletproof registration form
app.get('/simple-registration', (req, res) => {
  res.sendFile(path.join(__dirname, 'simple-registration.html'));
});

// Redirect root to simple registration for testing
app.get('/', (req, res) => {
  res.redirect('/simple-registration');
});

// Status page for monitoring database connection
app.get('/status', (req, res) => {
  res.sendFile(path.join(__dirname, 'status.html'));
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
    let result, total;
    
    if (req.dbConnected) {
      result = await pool.query(
        'SELECT * FROM students ORDER BY id LIMIT $1 OFFSET $2',
        [pageSize, offset]
      );
      const countResult = await pool.query('SELECT COUNT(*) FROM students');
      total = parseInt(countResult.rows[0].count);
    } else {
      const memResult = await memoryStorage.getStudents(pageSize, offset);
      result = { rows: memResult.rows };
      total = memResult.total;
    }
    
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
      totalPages,
      storage: req.dbConnected ? 'database' : 'memory'
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
    let result;
    
    if (req.dbConnected) {
      // Get the user by username from database
      result = await pool.query(
        'SELECT * FROM admins WHERE username = $1',
        [username]
      );
    } else {
      // Get the user from memory storage
      result = await memoryStorage.getAdmin(username);
    }
    
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
      // Plain text password (for migration/memory storage)
      passwordMatches = user.password_hash === password;
      
      // If using database and plain text password matches, hash it for future use
      if (passwordMatches && req.dbConnected) {
        const hashedPassword = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 10);
        await pool.query(
          'UPDATE admins SET password_hash = $1 WHERE id = $2',
          [hashedPassword, user.id]
        );
        console.log(`Password upgraded to hash for user: ${username}`);
      }
    }

    if (passwordMatches) {
      console.log(`✅ Successful login for user: ${username} (${req.dbConnected ? 'database' : 'memory'} storage)`);
      res.redirect('/students'); // Redirect to students registration page
    } else {
      console.log(`❌ Login attempt failed for username: ${username} - incorrect password`);
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
  console.log('📊 Storage type:', req.dbConnected ? 'database' : 'memory');
  console.log('🔍 Memory storage initialized:', !!memoryStorage);
  
  if (!req.dbConnected && !memoryStorage) {
    console.error('❌ Neither database nor memory storage available!');
    return res.status(500).json({ 
      error: 'Storage not available',
      message: 'Neither database nor memory storage is ready'
    });
  }
  
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
      if (req.dbConnected) {
        const countResult = await pool.query('SELECT COUNT(*) FROM students');
        const count = parseInt(countResult.rows[0].count) + 1;
        finalStudentId = `STU${count.toString().padStart(4, '0')}`;
      } else {
        const students = await memoryStorage.getStudents();
        const count = students.total + 1;
        finalStudentId = `STU${count.toString().padStart(4, '0')}`;
      }
    }
    
    // Check if student ID already exists and insert student
    if (req.dbConnected) {
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
      console.log('✅ Student inserted to database:', result.rows[0]);
      var newStudent = result.rows[0];
    } else {
      // Use memory storage
      const studentData = {
        student_id: finalStudentId,
        name: fullName,
        first_name: firstName,
        last_name: lastName,
        phone: phoneNumber,
        email: email,
        parent_mobile: parent_mobile,
        class: studentClass,
        division: division,
        dob: dob,
        gender: gender,
        address1: address1,
        address2: address2,
        city: city,
        state: state
      };
      
      const result = await memoryStorage.addStudent(studentData);
      console.log('✅ Student added to memory storage:', result.rows[0]);
      var newStudent = result.rows[0];
    }

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
          <p><strong>Storage:</strong> <span style="color: ${req.dbConnected ? '#28a745' : '#ffc107'};">${req.dbConnected ? 'Database' : 'Memory (Temporary)'}</span></p>
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