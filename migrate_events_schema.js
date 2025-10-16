const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrateEventsSchema() {
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

    // Check if columns exist and add them if they don't
    const columnsToAdd = [
      'setup_start_time TIME NULL',
      'setup_end_time TIME NULL',
      'event_start_time TIME NULL',
      'event_end_time TIME NULL',
      'cleanup_start_time TIME NULL',
      'cleanup_end_time TIME NULL'
    ];

    for (const columnDef of columnsToAdd) {
      const columnName = columnDef.split(' ')[0];
      try {
        // Check if column exists
        const [rows] = await connection.execute(
          'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
          [process.env.DB_NAME || 'u579076463_schedulink_db', 'events', columnName]
        );

        if (rows.length === 0) {
          // Column doesn't exist, add it
          await connection.execute(`ALTER TABLE events ADD COLUMN ${columnDef}`);
          console.log(`Added column: ${columnName}`);
        } else {
          console.log(`Column ${columnName} already exists`);
        }
      } catch (error) {
        console.error(`Error checking/adding column ${columnName}:`, error.message);
      }
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
migrateEventsSchema().catch(console.error);
