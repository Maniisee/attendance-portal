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
    if (existingByEmail && student.email) {
      throw { constraint: 'students_email_key' };
    }
    
    const newStudent = {
      id: this.nextStudentId++,
      student_id: student.student_id,
      name: student.name,
      first_name: student.first_name,
      last_name: student.last_name,
      phone: student.phone,
      email: student.email,
      parent_mobile: student.parent_mobile,
      class: student.class,
      division: student.division,
      dob: student.dob,
      gender: student.gender,
      address1: student.address1,
      address2: student.address2,
      city: student.city,
      state: student.state,
      created_at: new Date()
    };
    
    this.students.push(newStudent);
    console.log(`📝 Student added to memory storage: ${newStudent.name} (${newStudent.student_id})`);
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
      storage_type: 'memory',
      sample_students: this.students.slice(0, 3).map(s => ({
        id: s.student_id,
        name: s.name,
        class: s.class
      }))
    };
  }
  
  // Get all data (for debugging)
  getAllData() {
    return {
      students: this.students,
      attendance: this.attendance,
      admins: this.admins
    };
  }
}

module.exports = MemoryStorage;