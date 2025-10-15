const express = require('express');
const { pool } = require('./database');
const { broadcast } = require('./sse');

const router = express.Router();

// GET /api/notifications - Get all event approval notifications with joins
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT n.*, e.name as eventName, r.name as resourceName
      FROM notifications n
      LEFT JOIN events e ON n.eventId = e.id
      LEFT JOIN resources r ON n.resourceId = r.id
      WHERE n.type = 'event_approval'
      ORDER BY n.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/notifications/:id/approve - Approve notification
router.put('/:id/approve', async (req, res) => {
  try {
    // Get notification details
    const [notifications] = await pool.execute('SELECT * FROM notifications WHERE id = ?', [req.params.id]);
    if (notifications.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    const notification = notifications[0];

    // Update notification status
    await pool.execute('UPDATE notifications SET status = ? WHERE id = ?', ['approved', req.params.id]);

    // Update related entity status
    if (notification.eventId) {
      await pool.execute('UPDATE events SET status = ? WHERE id = ?', ['approved', notification.eventId]);

      // Create notification for students/other-admins about approved event
      await pool.execute(
        'INSERT INTO notifications (type, message, eventId, status) VALUES (?, ?, ?, ?)',
        ['event_approved', 'New event added! Check the calendar for new events.', notification.eventId, 'unread']
      );

      // Broadcast to SSE clients
      broadcast({
        type: 'event_approved',
        message: 'New event added! Check the calendar for new events.',
        eventId: notification.eventId
      });
    } else if (notification.resourceId && notification.bookingId) {
      // For resource bookings, update availability or booking status
      await pool.execute('UPDATE resources SET availability = ? WHERE id = ?', [false, notification.resourceId]);
    }

    res.json({ message: 'Notification approved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/notifications/:id/decline - Decline notification
router.put('/:id/decline', async (req, res) => {
  try {
    // Get notification details
    const [notifications] = await pool.execute('SELECT * FROM notifications WHERE id = ?', [req.params.id]);
    if (notifications.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    const notification = notifications[0];

    // Update notification status
    await pool.execute('UPDATE notifications SET status = ? WHERE id = ?', ['declined', req.params.id]);

    // Update related entity status
    if (notification.eventId) {
      await pool.execute('UPDATE events SET status = ? WHERE id = ?', ['declined', notification.eventId]);
    } else if (notification.resourceId && notification.bookingId) {
      // For resource bookings, keep availability true or handle decline
      // Assuming decline means booking not approved, so availability remains true
    }

    res.json({ message: 'Notification declined successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
