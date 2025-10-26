const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { pool } = require('./database');
const { protect } = require('./authMiddleware');

const router = express.Router();

const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { error } = loginSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  const { username, password } = req.body;

  try {
    const [rows] = await pool.execute(
      'SELECT id, password_hash FROM admins WHERE username = ?',
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isValidPassword = await bcrypt.compare(password, rows[0].password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ id: rows[0].id }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    res.json({ success: true, message: 'Login successful', token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/admins - Get all admins
router.get('/admins', protect, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, created_at FROM admins ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Get admins error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const adminSchema = Joi.object({
  username: Joi.string().min(3).max(30).required(),
  password: Joi.string().min(6).required(),
});

// POST /api/auth/admins - Add new admin
router.post('/admins', protect, async (req, res) => {
  const { error } = adminSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  const { username, password } = req.body;

  try {
    // Check if username already exists
    const [existing] = await pool.execute(
      'SELECT id FROM admins WHERE username = ?',
      [username]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert new admin
    const [result] = await pool.execute(
      'INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, NOW())',
      [username, passwordHash]
    );

    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      id: result.insertId
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const updateAdminSchema = Joi.object({
  password: Joi.string().min(6).required(),
});

// PUT /api/auth/admins/:id - Update admin password
router.put('/admins/:id', protect, async (req, res) => {
  const { error } = updateAdminSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  const { id } = req.params;
  const { password } = req.body;

  try {
    // Check if admin exists
    const [existing] = await pool.execute(
      'SELECT id FROM admins WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // Hash new password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Update password
    await pool.execute(
      'UPDATE admins SET password_hash = ? WHERE id = ?',
      [passwordHash, id]
    );

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Update admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/auth/admins/:id - Delete admin
router.delete('/admins/:id', protect, async (req, res) => {
  const { id } = req.params;

  try {
    // Check if admin exists
    const [existing] = await pool.execute(
      'SELECT id FROM admins WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // Don't allow deleting the last admin
    const [count] = await pool.execute('SELECT COUNT(*) as count FROM admins');
    if (count[0].count <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last admin account' });
    }

    // Delete admin
    await pool.execute('DELETE FROM admins WHERE id = ?', [id]);

    res.json({ success: true, message: 'Admin deleted successfully' });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
