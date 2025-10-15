require('dotenv').config();

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function initializeDatabase() {
  try {
    // Create database if not exists
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    });
    await connection.execute('CREATE DATABASE IF NOT EXISTS u579076463_schedulink_db');
    await connection.end();

    // Create tables
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        start_date DATETIME NOT NULL,
        end_date DATETIME,
        status ENUM('pending', 'approved', 'declined') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.execute(`
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
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS resources (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        availability BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);



    await pool.execute(`
      CREATE TABLE IF NOT EXISTS reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        eventId INT NOT NULL,
        filePath VARCHAR(255) NOT NULL,
        uploadedBy VARCHAR(50) NOT NULL,
        uploadedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (eventId) REFERENCES events(id)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        note TEXT,
        due_date DATETIME NULL,
        completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default admin user if not exists
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await pool.execute(`
      INSERT IGNORE INTO admins (username, password_hash) VALUES (?, ?)
    `, ['admin', hashedPassword]);

    console.log('Database initialized successfully');
    
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

module.exports = { pool, initializeDatabase };
