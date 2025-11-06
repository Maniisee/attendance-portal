// Temporary in-memory storage for testing
const students = [
    { 
        studentId: 'MCA001',
        student_id: 'MCA001', 
        password: 'password123', 
        name: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@college.edu',
        phoneNumber: '9876543210',
        phone: '9876543210',
        parentContact: '9876543211',
        parent_mobile: '9876543211',
        class: 'MCA',
        division: 'A',
        dateOfBirth: '2000-01-15',
        gender: 'Male',
        address: '123 Main St, Mumbai',
        city: 'Mumbai',
        state: 'Maharashtra',
        joinDate: '2024-08-15',
        qr_img_url: '/qrcodes/MCA001.png'
    },
    { 
        studentId: 'MCA002',
        student_id: 'MCA002', 
        password: 'password123', 
        name: 'Jane Smith',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@college.edu',
        phoneNumber: '9876543220',
        phone: '9876543220',
        parentContact: '9876543221',
        parent_mobile: '9876543221',
        class: 'MCA',
        division: 'A',
        dateOfBirth: '2000-02-20',
        gender: 'Female',
        address: '456 Oak Ave, Delhi',
        city: 'Delhi',
        state: 'Delhi',
        joinDate: '2024-08-15',
        qr_img_url: '/qrcodes/MCA002.png'
    },
    { 
        studentId: 'MCA003',
        student_id: 'MCA003', 
        password: 'password123', 
        name: 'Mike Johnson',
        firstName: 'Mike',
        lastName: 'Johnson',
        email: 'mike.johnson@college.edu',
        phoneNumber: '9876543230',
        phone: '9876543230',
        parentContact: '9876543231',
        parent_mobile: '9876543231',
        class: 'MCA',
        division: 'B',
        dateOfBirth: '1999-12-10',
        gender: 'Male',
        address: '789 Pine Rd, Bangalore',
        city: 'Bangalore',
        state: 'Karnataka',
        joinDate: '2024-08-15',
        qr_img_url: '/qrcodes/MCA003.png'
    }
];

// Sample attendance records
const attendanceRecords = [
    {
        id: 1,
        studentId: 'MCA001',
        name: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        date: '2024-11-05',
        timestamp: '2024-11-05T09:00:00.000Z',
        status: 'present'
    },
    {
        id: 2,
        studentId: 'MCA002',
        name: 'Jane Smith',
        firstName: 'Jane',
        lastName: 'Smith',
        date: '2024-11-05',
        timestamp: '2024-11-05T09:15:00.000Z',
        status: 'present'
    },
    {
        id: 3,
        studentId: 'MCA001',
        name: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        date: '2024-11-04',
        timestamp: '2024-11-04T09:00:00.000Z',
        status: 'present'
    },
    {
        id: 4,
        studentId: 'MCA003',
        name: 'Mike Johnson',
        firstName: 'Mike',
        lastName: 'Johnson',
        date: '2024-11-04',
        timestamp: '2024-11-04T09:30:00.000Z',
        status: 'present'
    },
    {
        id: 5,
        studentId: 'MCA002',
        name: 'Jane Smith',
        firstName: 'Jane',
        lastName: 'Smith',
        date: '2024-11-03',
        timestamp: '2024-11-03T09:10:00.000Z',
        status: 'present'
    },
    {
        id: 6,
        studentId: 'MCA001',
        name: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        date: '2024-11-03',
        timestamp: '2024-11-03T09:05:00.000Z',
        status: 'present'
    },
    {
        id: 7,
        studentId: 'MCA003',
        name: 'Mike Johnson',
        firstName: 'Mike',
        lastName: 'Johnson',
        date: '2024-11-03',
        timestamp: '2024-11-03T09:25:00.000Z',
        status: 'present'
    },
    {
        id: 8,
        studentId: 'MCA002',
        name: 'Jane Smith',
        firstName: 'Jane',
        lastName: 'Smith',
        date: '2024-11-02',
        timestamp: '2024-11-02T09:20:00.000Z',
        status: 'present'
    }
];

module.exports = {
    students,
    attendanceRecords
};