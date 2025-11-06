-- Insert initial admin user
INSERT INTO admin_users (username, password, full_name, email, role) VALUES
('admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'System Administrator', 'admin@college.edu', 'admin');
-- Note: The password above is 'password' hashed with bcrypt

-- Insert sample data can be added here if needed
-- This file is for any initial data that should be present in the database