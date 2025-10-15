const express = require('express');
const { pool } = require('./database');

const router = express.Router();

// GET /api/tasks?date=YYYY-MM-DD (optional, defaults to today)
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    let query = 'SELECT * FROM tasks';
    let params = [];

    if (date) {
      // Filter by date (start of day to end of day)
      query += ' WHERE DATE(due_date) = ?';
      params.push(date);
    } else {
      // Default to today's tasks
      query += ' WHERE DATE(due_date) = CURDATE()';
    }

    query += ' ORDER BY due_date ASC, created_at DESC';

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// POST /api/tasks
router.post('/', async (req, res) => {
  try {
    const { title, note, date, time } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    let dueDate = null;

    if (date && time) {
      // Both date and time provided
      dueDate = `${date} ${time}`;
    } else if (date && !time) {
      // Only date, set default time 08:00 AM
      dueDate = `${date} 08:00:00`;
    } else if (!date && time) {
      // Only time, use today's date
      const today = new Date().toISOString().split('T')[0];
      dueDate = `${today} ${time}`;
    }
    // If neither, dueDate remains null

    const [result] = await pool.execute(
      'INSERT INTO tasks (title, note, due_date) VALUES (?, ?, ?)',
      [title, note || '', dueDate]
    );

    res.status(201).json({
      id: result.insertId,
      title,
      note: note || '',
      due_date: dueDate,
      completed: false,
      created_at: new Date()
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PUT /api/tasks/:id (for updating completion status)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { completed, title, note, date, time } = req.body;

    let updateFields = [];
    let params = [];

    if (typeof completed === 'boolean') {
      updateFields.push('completed = ?');
      params.push(completed);
    }

    if (title !== undefined) {
      updateFields.push('title = ?');
      params.push(title);
    }

    if (note !== undefined) {
      updateFields.push('note = ?');
      params.push(note);
    }

    // Handle date/time update similar to POST
    if (date !== undefined || time !== undefined) {
      let dueDate = null;

      if (date && time) {
        dueDate = `${date} ${time}`;
      } else if (date && !time) {
        dueDate = `${date} 08:00:00`;
      } else if (!date && time) {
        const today = new Date().toISOString().split('T')[0];
        dueDate = `${today} ${time}`;
      }

      updateFields.push('due_date = ?');
      params.push(dueDate);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);

    const [result] = await pool.execute(
      `UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ message: 'Task updated successfully' });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute('DELETE FROM tasks WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
