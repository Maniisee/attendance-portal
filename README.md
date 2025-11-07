# Student Attendance Portal

A comprehensive web-based attendance management system with QR code scanning capabilities.

## Features

- 👤 **Admin Authentication** - Secure login with bcrypt password hashing
- 📝 **Student Registration** - Complete student profile management
- 📱 **QR Code Generation** - Unique QR codes for each student
- 📊 **QR Code Scanning** - Real-time attendance marking via QR scan
- 📋 **Attendance Records** - View and manage attendance history
- 💬 **SMS Notifications** - Optional Twilio integration for parent notifications
- 🔒 **Security Features** - Rate limiting, input validation, and secure headers

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
- **QR Service**: Python Flask
- **SMS**: Twilio (optional)
- **Security**: Helmet, bcrypt, express-rate-limit

## Quick Start

### Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- Python 3.x (for QR service)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd attendance-portal
   ```

2. **Install Node.js dependencies**
   ```bash
   npm install
   ```

3. **Install Python dependencies**
   ```bash
   pip install flask qrcode[pil]
   ```

4. **Configure environment variables**
   - Copy and edit the `.env` file
   - Update database credentials
   - (Optional) Add Twilio credentials for SMS

5. **Set up the database**
   ```bash
   npm run setup-db
   ```

6. **Start the services**
   
   **Terminal 1 - QR Service:**
   ```bash
   npm run qr-service
   # OR
   python qr_service.py
   ```
   
   **Terminal 2 - Main Server:**
   ```bash
   npm start
   # OR for development
   npm run dev
   ```

7. **Access the application**
   - Open http://localhost:3000
   - Default admin credentials:
     - Username: `admin`
     - Password: `admin123`
   - ⚠️ **Change the default password immediately!**

## Configuration

### Database Configuration

Update the `.env` file with your PostgreSQL credentials:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=attendance_portal
DB_USER=your_username
DB_PASSWORD=your_password
```

### Twilio SMS Configuration (Optional)

For SMS notifications to parents:

```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone
```

## Usage

### Admin Dashboard

1. **Login** - Use admin credentials to access the system
2. **Register Students** - Add new students with complete profiles
3. **View Students** - Browse all registered students and their QR codes
4. **Scan Attendance** - Use the QR scanner to mark attendance
5. **View Records** - Check attendance history and reports

### Student Registration

- Fill out the complete student form
- System auto-generates unique student IDs
- QR codes are automatically created for each student
- Download/print QR codes for student ID cards

### Attendance Marking

- Navigate to the "Scan" page
- Allow camera access when prompted
- Scan student QR codes
- System prevents duplicate attendance for the same day
- Optional SMS notification sent to parents

## API Endpoints

- `POST /dashboard` - Admin login
- `POST /add-student` - Register new student
- `GET /api/students` - Get students list
- `POST /mark-attendance` - Mark student attendance
- `GET /api/attendance` - Get attendance records

## Database Schema

### Students Table
- `student_id` (unique identifier)
- `name`, `first_name`, `last_name`
- `phone`, `email`, `parent_mobile`
- `class`, `division`, `dob`, `gender`
- `address1`, `address2`, `city`, `state`

### Admins Table
- `username` (unique)
- `password_hash` (bcrypt)
- `email`, `full_name`

### Attendance Table
- `student_id` (foreign key)
- `timestamp`
- `status`

## Security Features

- **Password Hashing**: Bcrypt with configurable rounds
- **Rate Limiting**: Prevents brute force attacks
- **Input Validation**: Server-side validation for all inputs
- **Security Headers**: Helmet.js for security headers
- **SQL Injection Protection**: Parameterized queries
- **CORS Configuration**: Controlled cross-origin requests

## Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Ensure PostgreSQL is running
   - Check credentials in `.env` file
   - Verify database exists

2. **QR Codes Not Generating**
   - Make sure Python QR service is running on port 5050
   - Check if `qrcodes/` directory exists and is writable

3. **SMS Not Working**
   - Verify Twilio credentials in `.env`
   - Check Twilio account balance and phone number verification

4. **Login Issues**
   - Run database setup again: `npm run setup-db`
   - Check browser console for errors
   - Verify admin user exists in database

### Development Mode

For development with auto-restart:

```bash
npm install -g nodemon
npm run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the ISC License.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the console logs
3. Ensure all prerequisites are installed
4. Verify configuration files

---

**Note**: This is an educational project. For production use, consider additional security measures, proper logging, monitoring, and backup strategies.
# Updated Fri Nov  7 08:14:03 +08 2025
