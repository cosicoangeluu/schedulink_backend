const express = require('express');
const { pool } = require('./database');

const router = express.Router();

// GET /api/venues - Get all venues
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM venues ORDER BY name');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/venues/:id - Get venue by ID
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM venues WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Venue not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/venues - Create new venue
router.post('/', async (req, res) => {
  const { name, description, category, availability } = req.body;
  try {
    const [result] = await pool.execute(
      'INSERT INTO venues (name, description, category, availability) VALUES (?, ?, ?, ?)',
      [name, description, category || 'Venue', availability !== undefined ? availability : true]
    );
    res.status(201).json({ id: result.insertId, name, description, category: category || 'Venue', availability: availability !== undefined ? availability : true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/venues/:id - Update venue
router.put('/:id', async (req, res) => {
  const { name, description, category, availability } = req.body;
  try {
    const [result] = await pool.execute(
      'UPDATE venues SET name = ?, description = ?, category = ?, availability = ? WHERE id = ?',
      [name, description, category, availability, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Venue not found' });
    }
    res.json({ id: req.params.id, name, description, category, availability });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/venues/:id - Delete venue
router.delete('/:id', async (req, res) => {
  try {
    // Delete related notifications
    await pool.execute('DELETE FROM notifications WHERE resourceId = ?', [req.params.id]);

    // Delete the venue
    const [result] = await pool.execute('DELETE FROM venues WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Venue not found' });
    }
    res.json({ message: 'Venue and related notifications deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
