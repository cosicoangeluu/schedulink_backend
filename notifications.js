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
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      error: 'Failed to fetch notifications',
      details: error.message
    });
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

    // Update related entity status
    if (notification.eventId) {
      // Get the event details to check for conflicts
      const [events] = await pool.execute('SELECT * FROM events WHERE id = ?', [notification.eventId]);
      if (events.length === 0) {
        return res.status(404).json({ error: 'Event not found' });
      }
      const event = events[0];

      // Parse venues
      let venueIds = [];
      try {
        venueIds = event.venues ? JSON.parse(event.venues) : [];
      } catch (e) {
        venueIds = [];
      }

      // Check for conflicts with already approved events
      if (venueIds.length > 0 && event.event_start_time && event.event_end_time) {
        const eventStartTime = event.setup_start_time || event.event_start_time;
        const eventEndTime = event.cleanup_end_time || event.event_end_time;

        // Find conflicting approved events
        const [conflictingEvents] = await pool.execute(`
          SELECT e.*, e.id as event_id, e.name as event_name, e.venues as event_venues
          FROM events e
          WHERE e.status = 'approved'
            AND e.id != ?
            AND (
              (DATE(e.start_date) = DATE(?)) OR
              (e.end_date IS NOT NULL AND DATE(?) BETWEEN DATE(e.start_date) AND DATE(e.end_date)) OR
              (e.end_date IS NOT NULL AND ? IS NOT NULL AND DATE(e.start_date) BETWEEN DATE(?) AND DATE(?))
            )
        `, [notification.eventId, event.start_date, event.start_date, event.end_date, event.start_date, event.end_date]);

        // Check for venue and time conflicts
        let hasConflict = false;
        let conflictDetails = null;

        for (const existingEvent of conflictingEvents) {
          let existingVenues = [];
          try {
            existingVenues = existingEvent.event_venues ? JSON.parse(existingEvent.event_venues) : [];
          } catch (e) {
            existingVenues = [];
          }

          const commonVenues = venueIds.filter(v => existingVenues.includes(v));
          if (commonVenues.length === 0) continue;

          const existingStartTime = existingEvent.setup_start_time || existingEvent.event_start_time;
          const existingEndTime = existingEvent.cleanup_end_time || existingEvent.event_end_time;

          if (existingStartTime && existingEndTime) {
            // Convert times to minutes for comparison
            const timeToMinutes = (timeStr) => {
              const [hours, minutes] = timeStr.split(':').map(Number);
              return hours * 60 + minutes;
            };

            const eventStartMinutes = timeToMinutes(eventStartTime);
            const eventEndMinutes = timeToMinutes(eventEndTime);
            const existingStartMinutes = timeToMinutes(existingStartTime);
            const existingEndMinutes = timeToMinutes(existingEndTime);

            // Check if times overlap
            if (eventStartMinutes < existingEndMinutes && eventEndMinutes > existingStartMinutes) {
              hasConflict = true;
              const [venueRows] = await pool.execute(
                `SELECT id, name FROM venues WHERE id IN (${commonVenues.join(',')})`,
                []
              );
              conflictDetails = {
                eventName: existingEvent.event_name,
                date: existingEvent.start_date,
                startTime: existingStartTime,
                endTime: existingEndTime,
                venues: venueRows.map(v => v.name).join(', ')
              };
              break;
            }
          }
        }

        if (hasConflict) {
          return res.status(409).json({
            error: 'Cannot approve event due to conflict',
            message: `This event conflicts with "${conflictDetails.eventName}" on ${new Date(conflictDetails.date).toLocaleDateString()} from ${conflictDetails.startTime} to ${conflictDetails.endTime} at ${conflictDetails.venues}`,
            conflict: conflictDetails
          });
        }

        // Check for other pending events with the same date/time/venue and notify their creators
        const [pendingEvents] = await pool.execute(`
          SELECT e.*, e.id as event_id, e.name as event_name, e.venues as event_venues
          FROM events e
          WHERE e.status = 'pending'
            AND e.id != ?
            AND (
              (DATE(e.start_date) = DATE(?)) OR
              (e.end_date IS NOT NULL AND DATE(?) BETWEEN DATE(e.start_date) AND DATE(e.end_date)) OR
              (e.end_date IS NOT NULL AND ? IS NOT NULL AND DATE(e.start_date) BETWEEN DATE(?) AND DATE(?))
            )
        `, [notification.eventId, event.start_date, event.start_date, event.end_date, event.start_date, event.end_date]);

        // Notify users with conflicting pending events
        for (const pendingEvent of pendingEvents) {
          let pendingVenues = [];
          try {
            pendingVenues = pendingEvent.event_venues ? JSON.parse(pendingEvent.event_venues) : [];
          } catch (e) {
            pendingVenues = [];
          }

          const commonVenues = venueIds.filter(v => pendingVenues.includes(v));
          if (commonVenues.length === 0) continue;

          const pendingStartTime = pendingEvent.setup_start_time || pendingEvent.event_start_time;
          const pendingEndTime = pendingEvent.cleanup_end_time || pendingEvent.event_end_time;

          if (pendingStartTime && pendingEndTime) {
            const timeToMinutes = (timeStr) => {
              const [hours, minutes] = timeStr.split(':').map(Number);
              return hours * 60 + minutes;
            };

            const eventStartMinutes = timeToMinutes(eventStartTime);
            const eventEndMinutes = timeToMinutes(eventEndTime);
            const pendingStartMinutes = timeToMinutes(pendingStartTime);
            const pendingEndMinutes = timeToMinutes(pendingEndTime);

            if (eventStartMinutes < pendingEndMinutes && eventEndMinutes > pendingStartMinutes) {
              // Create a conflict notification for the pending event creator
              const [venueRows] = await pool.execute(
                `SELECT id, name FROM venues WHERE id IN (${commonVenues.join(',')})`,
                []
              );

              await pool.execute(
                'INSERT INTO notifications (type, message, eventId, status) VALUES (?, ?, ?, ?)',
                [
                  'event_conflict',
                  `Your pending event "${pendingEvent.event_name}" conflicts with the recently approved event "${event.name}" on ${new Date(event.start_date).toLocaleDateString()} from ${eventStartTime} to ${eventEndTime} at ${venueRows.map(v => v.name).join(', ')}. Please choose a different date, time, or venue.`,
                  pendingEvent.event_id,
                  'unread'
                ]
              );

              // Broadcast conflict notification
              broadcast({
                type: 'event_conflict',
                message: `Your pending event "${pendingEvent.event_name}" has a conflict`,
                eventId: pendingEvent.event_id
              });
            }
          }
        }
      }

      // Update notification status
      await pool.execute('UPDATE notifications SET status = ? WHERE id = ?', ['approved', req.params.id]);

      // Approve the event
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
