# 📚 Student Attendance Portal

A modern, secure web-based attendance management system with QR code scanning capabilities.

## 🚀 Live Demo
**[View Live Application](https://attendance-web-production-23d0.up.railway.app)** 

### 📊 System Status
- **Health Check**: [/health](https://attendance-web-production-23d0.up.railway.app/health)
- **Detailed Status**: [/status](https://attendance-web-production-23d0.up.railway.app/status)
- **Current Status**: ✅ Running with resilient architecture

> 🔧 **Note**: Application features graceful fallback handling for database connectivity issues. 

## ✨ Features

### 🎯 Core Functionality
- **QR Code Attendance**: Quick scan-based attendance marking
- **Student Management**: Comprehensive student registration and profiles  
- **Real-time Dashboard**: Live attendance statistics and reports
- **Secure Authentication**: JWT-based login system with role management

### 📱 User Experience
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Intuitive Interface**: Clean, modern UI with easy navigation
- **Real-time Updates**: Live attendance tracking and notifications
- **Mobile QR Scanner**: Built-in camera integration for attendance marking

### 🔒 Security Features
- **JWT Authentication**: Secure token-based authentication
- **Role-based Access**: Different access levels for students and administrators
- **Rate Limiting**: API protection against abuse
- **Data Validation**: Comprehensive input validation and sanitization

## ��️ Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript, QR Code Scanner
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL on Railway
- **Authentication**: JWT (JSON Web Tokens)
- **Deployment**: Railway Platform
- **QR Processing**: html5-qrcode library

## 🚀 Deployment Status

✅ **GitHub Repository**: https://github.com/Maniisee/attendance-portal
✅ **Live Application**: https://attendance-web-production-23d0.up.railway.app
✅ **PostgreSQL Database**: Configured and connected
✅ **Environment Variables**: Set up for production

## 📊 Features Overview

### For Students
- **Quick Login**: Secure authentication system
- **QR Attendance**: Scan QR codes to mark attendance
- **Personal Dashboard**: View attendance history and statistics  
- **Mobile Friendly**: Optimized for smartphone usage

### For Administrators
- **Student Management**: Add, edit, and manage student records
- **Attendance Reports**: Generate detailed attendance reports
- **QR Code Generation**: Create unique QR codes for different sessions
- **Real-time Monitoring**: Live attendance tracking and statistics

## �� Environment Variables

The following environment variables are configured on Railway:

```env
DATABASE_URL=postgresql://postgres:password@postgres.railway.internal:5432/railway
PORT=8080
NODE_ENV=production
JWT_SECRET=auto-generated-secret
SESSION_SECRET=auto-generated-secret
```

## 📁 Project Structure

```
attendance-portal/
├── server.js              # Main application server
├── attendance-server.js   # Attendance-specific routes
├── package.json           # Dependencies and scripts
├── railway.json          # Railway deployment config
├── login.html            # Login page
├── home.html             # Dashboard
├── students.html         # Student management
├── attendance.html       # Attendance marking
├── scan.html             # QR code scanner
└── qrcodes/              # Generated QR codes
```

## 👥 Authors

- **Manikandan K** - *Initial work* - [Maniisee](https://github.com/Maniisee)

## 🙏 Acknowledgments

- HTML5-QRCode library for QR scanning functionality
- Express.js community for excellent documentation
- Railway platform for seamless deployment
