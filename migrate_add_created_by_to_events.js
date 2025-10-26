const { pool } = require('./database');

const addCreatedByToEvents = async () => {
  try {
    await pool.execute(`
      ALTER TABLE events
      ADD COLUMN created_by INT,
      ADD FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    `);

    console.log('Added created_by to events table successfully');
  } catch (error) {
    console.error('Error adding created_by to events table:', error);
  }
};

addCreatedByToEvents();
