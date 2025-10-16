const express = require('express');
const { pool } = require('./database');

const router = express.Router();

// GET /api/resources - Get all resources
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT *, created_at FROM resources ORDER BY name');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/resources/:id - Get resource by ID
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM resources WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/resources - Create new resource
router.post('/', async (req, res) => {
  const { name, description, category, total, available, location, status, condition } = req.body;
  try {
    const [result] = await pool.execute(
      'INSERT INTO resources (name, description, category, total, available, location, status, `condition`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, description, category, total, available, location, status || 'available', condition || 'good']
    );
    res.status(201).json({ id: result.insertId, name, description, category, total, available, location, status: status || 'available', condition: condition || 'good' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/resources/:id - Update resource
router.put('/:id', async (req, res) => {
  const { name, description, category, total, available, location, status, condition } = req.body;
  try {
    const [result] = await pool.execute(
      'UPDATE resources SET name = ?, description = ?, category = ?, total = ?, available = ?, location = ?, status = ?, `condition` = ? WHERE id = ?',
      [name, description, category, total, available, location, status, condition, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    res.json({ id: req.params.id, name, description, category, total, available, location, status, condition });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/resources/:id/book - Book resource and create notification
router.post('/:id/book', async (req, res) => {
  const { userId } = req.body;
  try {
    // Check if resource is available
    const [resources] = await pool.execute('SELECT * FROM resources WHERE id = ? AND availability = ?', [req.params.id, true]);
    if (resources.length === 0) {
      return res.status(400).json({ error: 'Resource not available' });
    }

    // Create booking notification
    await pool.execute(
      'INSERT INTO notifications (type, message, resourceId, bookingId, status) VALUES (?, ?, ?, ?, ?)',
      ['resource_booking', `Resource "${resources[0].name}" booking request`, req.params.id, req.params.id, 'pending']
    );

    res.json({ message: 'Booking request submitted for approval' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/resources/:id - Delete resource and related notifications
router.delete('/:id', async (req, res) => {
  try {
    // Delete related notifications (both resourceId and bookingId reference resources)
    await pool.execute('DELETE FROM notifications WHERE resourceId = ? OR bookingId = ?', [req.params.id, req.params.id]);

    // Delete the resource
    const [result] = await pool.execute('DELETE FROM resources WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    res.json({ message: 'Resource and related notifications deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
