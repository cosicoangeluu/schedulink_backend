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
  const { name, description, start_date, end_date, venues, equipment, application_date, rental_date, behalf_of, contact_info, nature_of_event, requires_equipment, chairs_qty, tables_qty, projector, other_equipment, setup_days, setup_hours, cleanup_hours, total_hours, multi_day_schedule } = req.body;
  try {
    const [result] = await pool.execute(
      'INSERT INTO events (name, description, start_date, end_date, venues, equipment, application_date, rental_date, behalf_of, contact_info, nature_of_event, requires_equipment, chairs_qty, tables_qty, projector, other_equipment, setup_days, setup_hours, cleanup_hours, total_hours, multi_day_schedule, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, description, start_date, end_date || null, JSON.stringify(venues || []), JSON.stringify(equipment || []), application_date, rental_date, behalf_of, contact_info, nature_of_event, requires_equipment || false, chairs_qty || 0, tables_qty || 0, projector || false, other_equipment || '', setup_days || 0, setup_hours || 0, cleanup_hours || 0, total_hours || 0, multi_day_schedule || null, 'pending']
    );
    const eventId = result.insertId;

    // Create notification
    await pool.execute(
      'INSERT INTO notifications (type, message, eventId, status) VALUES (?, ?, ?, ?)',
      ['event_approval', `New event "${name}" requires approval`, eventId, 'pending']
    );

    res.status(201).json({ id: eventId, name, description, start_date, end_date, venues, equipment, application_date, rental_date, behalf_of, contact_info, nature_of_event, requires_equipment, chairs_qty, tables_qty, projector, other_equipment, setup_days, setup_hours, cleanup_hours, total_hours, multi_day_schedule, status: 'pending' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/events/:id - Update event details
router.put('/:id', async (req, res) => {
  const { name, description, start_date, end_date, venues, equipment, application_date, rental_date, behalf_of, contact_info, nature_of_event, requires_equipment, chairs_qty, tables_qty, projector, other_equipment, setup_days, setup_hours, cleanup_hours, total_hours, multi_day_schedule } = req.body;
  try {
    const [result] = await pool.execute(
      'UPDATE events SET name = ?, description = ?, start_date = ?, end_date = ?, venues = ?, equipment = ?, application_date = ?, rental_date = ?, behalf_of = ?, contact_info = ?, nature_of_event = ?, requires_equipment = ?, chairs_qty = ?, tables_qty = ?, projector = ?, other_equipment = ?, setup_days = ?, setup_hours = ?, cleanup_hours = ?, total_hours = ?, multi_day_schedule = ? WHERE id = ?',
      [name, description, start_date, end_date || null, JSON.stringify(venues || []), JSON.stringify(equipment || []), application_date, rental_date, behalf_of, contact_info, nature_of_event, requires_equipment || false, chairs_qty || 0, tables_qty || 0, projector || false, other_equipment || '', setup_days || 0, setup_hours || 0, cleanup_hours || 0, total_hours || 0, multi_day_schedule || null, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json({ id: req.params.id, name, description, start_date, end_date, venues, equipment, application_date, rental_date, behalf_of, contact_info, nature_of_event, requires_equipment, chairs_qty, tables_qty, projector, other_equipment, setup_days, setup_hours, cleanup_hours, total_hours, multi_day_schedule });
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
