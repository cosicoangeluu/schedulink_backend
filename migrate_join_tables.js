const { pool } = require('./database');

const createJoinTables = async () => {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS event_venues (
        event_id INT NOT NULL,
        venue_id INT NOT NULL,
        PRIMARY KEY (event_id, venue_id),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
      );
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS event_equipment (
        event_id INT NOT NULL,
        equipment_id INT NOT NULL,
        quantity INT NOT NULL,
        PRIMARY KEY (event_id, equipment_id),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (equipment_id) REFERENCES resources(id) ON DELETE CASCADE
      );
    `);

    console.log('Join tables created successfully');
  } catch (error) {
    console.error('Error creating join tables:', error);
  }
};

createJoinTables();
