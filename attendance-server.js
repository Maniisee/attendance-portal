const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static('.'));

// Store attendance data in memory (you can use a database in production)
let attendanceRecords = [];

// Load existing attendance data if file exists
const attendanceFile = 'attendance-data.json';
if (fs.existsSync(attendanceFile)) {
  try {
    const data = fs.readFileSync(attendanceFile, 'utf8');
    attendanceRecords = JSON.parse(data);
    console.log(`Loaded ${attendanceRecords.length} attendance records`);
  } catch (error) {
    console.error('Error loading attendance data:', error);
  }
}

// Save attendance data to file
function saveAttendanceData() {
  try {
    fs.writeFileSync(attendanceFile, JSON.stringify(attendanceRecords, null, 2));
  } catch (error) {
    console.error('Error saving attendance data:', error);
  }
}

// Mark attendance endpoint
app.post('/mark-attendance', (req, res) => {
  try {
    const { studentId } = req.body;
    
    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: 'Student ID is required'
      });
    }

    // Check if student already marked attendance today
    const today = new Date().toDateString();
    const existingRecord = attendanceRecords.find(
      record => record.studentId === studentId && 
      new Date(record.timestamp).toDateString() === today
    );

    if (existingRecord) {
      return res.json({
        success: false,
        message: `Attendance already marked for ${studentId} today at ${new Date(existingRecord.timestamp).toLocaleTimeString()}`
      });
    }

    // Create new attendance record
    const attendanceRecord = {
      studentId: studentId,
      timestamp: new Date().toISOString(),
      date: today,
      method: 'QR_SCAN'
    };

    attendanceRecords.push(attendanceRecord);
    saveAttendanceData();

    console.log(`✅ Attendance marked: ${studentId} at ${new Date().toLocaleTimeString()}`);

    res.json({
      success: true,
      message: `Attendance marked successfully for ${studentId}`,
      record: attendanceRecord
    });

  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get attendance records endpoint
app.get('/attendance', (req, res) => {
  res.json({
    success: true,
    records: attendanceRecords,
    totalRecords: attendanceRecords.length
  });
});

// Get attendance for today
app.get('/attendance/today', (req, res) => {
  const today = new Date().toDateString();
  const todayRecords = attendanceRecords.filter(
    record => new Date(record.timestamp).toDateString() === today
  );
  
  res.json({
    success: true,
    date: today,
    records: todayRecords,
    totalPresent: todayRecords.length
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Attendance server is running',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Attendance server running on http://localhost:${PORT}`);
  console.log(`📊 Total attendance records: ${attendanceRecords.length}`);
  console.log(`💾 Data saved to: ${attendanceFile}`);
  console.log('\n📱 QR Scanner available at: http://localhost:8080/scan.html');
  console.log('🔧 Test with: http://localhost:8080/qr-test-generator.html\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n💾 Saving attendance data before shutdown...');
  saveAttendanceData();
  console.log('✅ Data saved. Server shutting down.');
  process.exit(0);
});