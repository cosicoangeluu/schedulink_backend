-- Create database
CREATE DATABASE IF NOT EXISTS u579076463_schedulink_db;
USE u579076463_schedulink_db;

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  start_date DATETIME NOT NULL,
  end_date DATETIME,
  gymnasium BOOLEAN DEFAULT FALSE,
  sports_area BOOLEAN DEFAULT FALSE,
  application_date DATE,
  rental_date DATE,
  behalf_of VARCHAR(255),
  contact_info VARCHAR(255),
  nature_of_event TEXT,
  status ENUM('pending', 'approved', 'declined') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Resources table
CREATE TABLE IF NOT EXISTS resources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  availability BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  eventId INT NOT NULL,
  filePath VARCHAR(255) NOT NULL,
  uploadedBy VARCHAR(50) NOT NULL,
  uploadedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (eventId) REFERENCES events(id)
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
