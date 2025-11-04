-- Create database
CREATE DATABASE IF NOT EXISTS u579076463_schedulink_db;
USE u579076463_schedulink_db;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student', 'admin') NOT NULL DEFAULT 'student',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  start_date DATETIME NOT NULL,
  end_date DATETIME,
  venues JSON DEFAULT NULL,
  equipment JSON DEFAULT NULL,
  application_date DATE,
  rental_date DATE,
  behalf_of VARCHAR(255),
  contact_info VARCHAR(255),
  nature_of_event TEXT,
  requires_equipment BOOLEAN DEFAULT FALSE,
  chairs_qty INT DEFAULT 0,
  tables_qty INT DEFAULT 0,
  projector BOOLEAN DEFAULT FALSE,
  other_equipment TEXT,
  setup_days INT DEFAULT 0,
  setup_hours INT DEFAULT 0,
  cleanup_hours INT DEFAULT 0,
  total_hours INT DEFAULT 0,
  multi_day_schedule VARCHAR(255),
  status ENUM('pending', 'approved', 'declined') DEFAULT 'pending',
  created_by INT,
  setup_start_time TIME NULL,
  setup_end_time TIME NULL,
  event_start_time TIME NULL,
  event_end_time TIME NULL,
  cleanup_start_time TIME NULL,
  cleanup_end_time TIME NULL,
  event_hours DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Personal Information Requirements Documents
  valid_id_path VARCHAR(255),
  birth_certificate_path VARCHAR(255),
  tin_path VARCHAR(255),
  marriage_certificate_path VARCHAR(255),
  proof_of_address_path VARCHAR(255),
  proof_of_income_path VARCHAR(255),
  dti_path VARCHAR(255),
  business_permit_path VARCHAR(255),
  books_of_accounts_path VARCHAR(255),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Venues table
CREATE TABLE IF NOT EXISTS venues (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) DEFAULT 'Venue',
  availability BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Resources table (for equipment/materials)
CREATE TABLE IF NOT EXISTS resources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  total INT NOT NULL,
  available INT NOT NULL,
  location VARCHAR(255),
  status VARCHAR(50) DEFAULT 'available',
  `condition` VARCHAR(50) DEFAULT 'good',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  eventId INT NOT NULL,
  filePath VARCHAR(255) NOT NULL,
  uploadedBy VARCHAR(50) NOT NULL,
  uploadedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Join tables
CREATE TABLE IF NOT EXISTS event_venues (
  event_id INT NOT NULL,
  venue_id INT NOT NULL,
  PRIMARY KEY (event_id, venue_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_equipment (
  event_id INT NOT NULL,
  equipment_id INT NOT NULL,
  quantity INT NOT NULL,
  PRIMARY KEY (event_id, equipment_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (equipment_id) REFERENCES resources(id) ON DELETE CASCADE
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  message TEXT,
  eventId INT,
  resourceId INT,
  bookingId INT,
  status ENUM('pending', 'approved', 'declined') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (eventId) REFERENCES events(id),
  FOREIGN KEY (resourceId) REFERENCES resources(id),
  FOREIGN KEY (bookingId) REFERENCES resources(id)
);

-- Tasks table for To-Do List
CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  note TEXT,
  due_date DATETIME NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admins table for authentication
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
