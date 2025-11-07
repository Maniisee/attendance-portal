// Simplified student registration endpoint for Railway
app.post('/add-student', async (req, res) => {
  console.log('=== STUDENT REGISTRATION ===');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { firstName, lastName, class: studentClass, division, parent_mobile, email, gender, dob, address1, address2, city, state } = req.body;
    
    // Simple validation
    if (!firstName || !lastName || !studentClass || !division || !parent_mobile) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    // Auto-generate student ID
    const countResult = await query('SELECT COUNT(*) FROM students');
    const count = parseInt(countResult.rows[0].count) + 1;
    const studentId = `STU${count.toString().padStart(4, '0')}`;
    const fullName = `${firstName} ${lastName}`;
    
    console.log('Generated student ID:', studentId);
    
    // Simple insert - matching the working direct query
    const result = await query(
      `INSERT INTO students (student_id, name, first_name, last_name, email, phone, parent_mobile, class, division, dob, gender, address1, address2, city, state) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [
        studentId,
        fullName,
        firstName,
        lastName,
        email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@student.edu`,
        parent_mobile, // Use parent_mobile as phone
        parent_mobile,
        studentClass,
        division,
        dob || '2000-01-01',
        gender || 'N/A',
        address1 || '',
        address2 || '',
        city || '',
        state || ''
      ]
    );
    
    console.log('Insert successful:', result.rows[0]);
    
    res.json({
      success: true,
      message: 'Student registered successfully!',
      student: {
        studentId: studentId,
        name: fullName,
        class: studentClass,
        division: division
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});