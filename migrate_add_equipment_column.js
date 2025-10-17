const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrateAddEquipmentColumn() {
  let connection;

  try {
    // Create connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'u579076463_schedulink_db',
      multipleStatements: true
    });

    console.log('Connected to database');

    // Check if equipment column exists and add it if it doesn't
    try {
      // Check if column exists
      const [rows] = await connection.execute(
        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [process.env.DB_NAME || 'u579076463_schedulink_db', 'events', 'equipment']
      );

      if (rows.length === 0) {
        // Column doesn't exist, add it
        await connection.execute('ALTER TABLE events ADD COLUMN equipment JSON DEFAULT NULL');
        console.log('Added column: equipment');
      } else {
        console.log('Column equipment already exists');
      }
    } catch (error) {
      console.error('Error checking/adding equipment column:', error.message);
    }

    console.log('Migration completed successfully');

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
}

// Run migration
migrateAddEquipmentColumn().catch(console.error);
