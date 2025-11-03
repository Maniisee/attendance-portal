// In-memory storage fallback for when database is unavailable
class MemoryStorage {
  constructor() {
    this.students = [];
    this.attendance = [];
    this.admins = [
      {
        id: 1,
        username: 'admin',
        password_hash: 'admin123',
        email: 'admin@attendance.portal',
        created_at: new Date()
      }
    ];
    this.nextStudentId = 1;
    this.nextAttendanceId = 1;
    
    console.log('📁 In-memory storage initialized with default admin (admin/admin123)');
  }
  
  // Student operations
  async getStudents(limit = 20, offset = 0) {
    return {
      rows: this.students.slice(offset, offset + limit).map(s => ({
        ...s,
        qr_img_url: `/qrcodes/${s.student_id}.png`
      })),
      total: this.students.length
    };
  }
  
  async addStudent(student) {
    // Check for duplicates
    const existingById = this.students.find(s => s.student_id === student.student_id);
    if (existingById) {
      throw { constraint: 'students_student_id_key' };
    }
    
    const existingByEmail = this.students.find(s => s.email === student.email);
    if (existingByEmail) {
      throw { constraint: 'students_email_key' };
    }
    
    const newStudent = {
      id: this.nextStudentId++,
      ...student,
      created_at: new Date()
    };
    
    this.students.push(newStudent);
    return { rows: [newStudent] };
  }
  
  async getStudentById(studentId) {
    const student = this.students.find(s => s.student_id === studentId);
    return { rows: student ? [student] : [] };
  }
  
  // Attendance operations
  async addAttendance(studentId, date, time) {
    // Check if already exists
    const existing = this.attendance.find(a => 
      a.student_id === studentId && a.date === date
    );
    
    if (existing) {
      return { rows: [] }; // Duplicate
    }
    
    const newAttendance = {
      id: this.nextAttendanceId++,
      student_id: studentId,
      date,
      time,
      status: 'present',
      created_at: new Date()
    };
    
    this.attendance.push(newAttendance);
    return { rows: [newAttendance] };
  }
  
  async getAttendance(filters = {}) {
    let results = this.attendance;
    
    if (filters.date) {
      results = results.filter(a => a.date === filters.date);
    }
    
    if (filters.student_id) {
      results = results.filter(a => a.student_id === filters.student_id);
    }
    
    // Join with student data
    const attendanceWithStudents = results.map(a => {
      const student = this.students.find(s => s.student_id === a.student_id);
      return {
        ...a,
        name: student ? student.name : 'Unknown',
        email: student ? student.email : 'unknown@example.com'
      };
    });
    
    return { rows: attendanceWithStudents };
  }
  
  // Admin operations
  async getAdmin(username) {
    const admin = this.admins.find(a => a.username === username);
    return { rows: admin ? [admin] : [] };
  }
  
  // Utility methods
  getStats() {
    return {
      students: this.students.length,
      attendance_records: this.attendance.length,
      storage_type: 'memory'
    };
  }
}

module.exports = MemoryStorage;