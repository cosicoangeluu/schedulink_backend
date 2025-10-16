const express = require('express');
const { pool } = require('./database');

const router = express.Router();

// GET /api/events - Get all events or filter by status
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM events';
    let params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY start_date DESC';

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/events/:id - Get event by ID
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM events WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/events - Create new event with status pending and create notification
router.post('/', async (req, res) => {
  const { name, description, start_date, end_date, venues, equipment, application_date, rental_date, behalf_of, contact_info, nature_of_event } = req.body;
  try {
    const [result] = await pool.execute(
      'INSERT INTO events (name, description, start_date, end_date, venues, equipment, application_date, rental_date, behalf_of, contact_info, nature_of_event, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, description, start_date, end_date || null, JSON.stringify(venues || []), JSON.stringify(equipment || []), application_date, rental_date, behalf_of, contact_info, nature_of_event, 'pending']
    );
    const eventId = result.insertId;

    // Create notification
    await pool.execute(
      'INSERT INTO notifications (type, message, eventId, status) VALUES (?, ?, ?, ?)',
      ['event_approval', `New event "${name}" requires approval`, eventId, 'pending']
    );

    res.status(201).json({ id: eventId, name, description, start_date, end_date, venues, equipment, application_date, rental_date, behalf_of, contact_info, nature_of_event, status: 'pending' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/events/:id - Update event details
router.put('/:id', async (req, res) => {
  const { name, description, start_date, end_date, venues, equipment, application_date, rental_date, behalf_of, contact_info, nature_of_event } = req.body;
  try {
    const [result] = await pool.execute(
      'UPDATE events SET name = ?, description = ?, start_date = ?, end_date = ?, venues = ?, equipment = ?, application_date = ?, rental_date = ?, behalf_of = ?, contact_info = ?, nature_of_event = ? WHERE id = ?',
      [name, description, start_date, end_date || null, JSON.stringify(venues || []), JSON.stringify(equipment || []), application_date, rental_date, behalf_of, contact_info, nature_of_event, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json({ id: req.params.id, name, description, start_date, end_date, venues, equipment, application_date, rental_date, behalf_of, contact_info, nature_of_event });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/events/:id - Delete event and related records
router.delete('/:id', async (req, res) => {
  try {


    // Delete related reports
    await pool.execute('DELETE FROM reports WHERE eventId = ?', [req.params.id]);

    // Delete related notifications
    await pool.execute('DELETE FROM notifications WHERE eventId = ?', [req.params.id]);

    // Delete the event
    const [result] = await pool.execute('DELETE FROM events WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json({ message: 'Event and related records deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
