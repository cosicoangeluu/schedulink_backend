const { pool } = require('./database');

async function migrateReportsTable() {
  try {
    console.log('Starting migration: Adding public_id column to reports table...');

    // Check if public_id column already exists
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'reports'
      AND COLUMN_NAME = 'public_id'
    `);

    if (columns.length > 0) {
      console.log('public_id column already exists. Skipping migration.');
      return;
    }

    // Add public_id column
    await pool.execute(`
      ALTER TABLE reports
      ADD COLUMN public_id VARCHAR(255) NULL AFTER filePath
    `);

    console.log('Migration completed: public_id column added to reports table.');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateReportsTable()
    .then(() => {
      console.log('Migration script completed successfully.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateReportsTable };
