const express = require('express');
const multer = require('multer');
const path = require('path');
const { pool } = require('./database');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Helper function to check for event conflicts
async function checkEventConflicts(eventData, excludeEventId = null) {
  const { start_date, end_date, venues, event_start_time, event_end_time, setup_start_time, cleanup_end_time } = eventData;

  console.log('=== START CONFLICT CHECK ===');
  console.log('Event data received:', {
    start_date,
    end_date,
    venues,
    event_start_time,
    event_end_time,
    excludeEventId
  });

  // Parse venues if it's a string
  const venueIds = typeof venues === 'string' ? JSON.parse(venues) : venues;

  console.log('Parsed venue IDs:', venueIds);

  if (!venueIds || venueIds.length === 0) {
    return []; // No venues to check
  }

  // Use only event start and end times (NOT setup or cleanup times)
  const eventStartTime = event_start_time;
  const eventEndTime = event_end_time;

  if (!eventStartTime || !eventEndTime) {
    return []; // Cannot check conflicts without times
  }

  // Build query to find overlapping events
  let query = `
    SELECT e.*, e.id as event_id, e.name as event_name, e.venues as event_venues
    FROM events e
    WHERE e.status = 'approved'
  `;

  const params = [];

  // Exclude current event if updating
  if (excludeEventId) {
    query += ` AND e.id != ?`;
    params.push(excludeEventId);
  }

  // Check date overlap: events overlap if they occur on the same date
  // For single-day events, check if start_date matches
  // For multi-day events, check if date ranges overlap
  query += ` AND (
    (DATE(e.start_date) = DATE(?) OR
     (e.end_date IS NOT NULL AND DATE(?) BETWEEN DATE(e.start_date) AND DATE(e.end_date)) OR
     (e.end_date IS NOT NULL AND ? IS NOT NULL AND DATE(e.start_date) BETWEEN DATE(?) AND DATE(?)))
  )`;
  params.push(start_date, start_date, end_date, start_date, end_date);

  const [events] = await pool.execute(query, params);

  console.log(`Found ${events.length} approved events on the same date`);

  // Filter events that have venue and time conflicts
  const conflicts = [];

  for (const existingEvent of events) {
    console.log('Checking event:', existingEvent.event_name, 'ID:', existingEvent.event_id);
    // Parse existing event venues
    let existingVenues = [];
    try {
      existingVenues = existingEvent.event_venues ? JSON.parse(existingEvent.event_venues) : [];
    } catch (e) {
      existingVenues = [];
    }

    // Check if there's any common venue
    const commonVenues = venueIds.filter(v => existingVenues.includes(v));

    console.log('Venue check:', {
      newEventVenues: venueIds,
      existingEventVenues: existingVenues,
      commonVenues: commonVenues
    });

    if (commonVenues.length === 0) {
      console.log('No common venues, skipping');
      continue; // No venue conflict, skip to next event
    }

    console.log('Common venues found, checking times...');

    // Check time overlap - use only event times (NOT setup or cleanup times)
    const existingStartTime = existingEvent.event_start_time;
    const existingEndTime = existingEvent.event_end_time;

    if (existingStartTime && existingEndTime) {
      // Convert times to comparable format (minutes since midnight)
      const timeToMinutes = (timeStr) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
      };

      const eventStartMinutes = timeToMinutes(eventStartTime);
      const eventEndMinutes = timeToMinutes(eventEndTime);
      const existingStartMinutes = timeToMinutes(existingStartTime);
      const existingEndMinutes = timeToMinutes(existingEndTime);

      // Check if times overlap
      // Times overlap if: (start1 < end2) AND (end1 > start2)
      console.log('Comparing times:', {
        newEvent: { start: eventStartMinutes, end: eventEndMinutes },
        existingEvent: { start: existingStartMinutes, end: existingEndMinutes, name: existingEvent.event_name },
        overlaps: eventStartMinutes < existingEndMinutes && eventEndMinutes > existingStartMinutes
      });

      if (eventStartMinutes < existingEndMinutes && eventEndMinutes > existingStartMinutes) {
        // Get venue names for the conflicting venues
        const [venueRows] = await pool.execute(
          `SELECT id, name FROM venues WHERE id IN (${commonVenues.join(',')})`,
          []
        );

        console.log('CONFLICT DETECTED:', {
          eventName: existingEvent.event_name,
          venues: venueRows.map(v => v.name)
        });

        conflicts.push({
          eventId: existingEvent.event_id,
          eventName: existingEvent.event_name,
          date: existingEvent.start_date,
          startTime: existingStartTime,
          endTime: existingEndTime,
          conflictingVenues: venueRows
        });
      }
    }
  }

  return conflicts;
}

// POST /api/events/check-conflicts - Check for event conflicts
router.post('/check-conflicts', async (req, res) => {
  try {
    const { start_date, end_date, venues, event_start_time, event_end_time, setup_start_time, cleanup_end_time, excludeEventId } = req.body;

    console.log('Checking conflicts for:', {
      start_date,
      end_date,
      venues,
      event_start_time,
      event_end_time,
      excludeEventId
    });

    const conflicts = await checkEventConflicts({
      start_date,
      end_date,
      venues,
      event_start_time,
      event_end_time,
      setup_start_time,
      cleanup_end_time
    }, excludeEventId);

    console.log('Conflicts found:', conflicts.length);
    console.log('=== END CONFLICT CHECK ===\n');

    res.json({ conflicts });
  } catch (error) {
    console.error('Error checking conflicts:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/events/debug-approved - Debug endpoint to see all approved events
router.get('/debug-approved', async (req, res) => {
  try {
    const [events] = await pool.execute(
      'SELECT id, name, start_date, event_start_time, event_end_time, venues, status FROM events WHERE status = "approved" ORDER BY start_date DESC'
    );

    // Parse venues for display
    const formattedEvents = events.map(event => ({
      ...event,
      venues: event.venues ? JSON.parse(event.venues) : []
    }));

    res.json({
      count: events.length,
      events: formattedEvents
    });
  } catch (error) {
    console.error('Error fetching approved events:', error);
    res.status(500).json({ error: error.message });
  }
});

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

    // Parse JSON fields
    rows.forEach(row => {
      if (row.venues) {
        try {
          row.venues = JSON.parse(row.venues);
        } catch (e) {
          row.venues = [];
        }
      } else {
        row.venues = [];
      }
      if (row.equipment) {
        try {
          row.equipment = JSON.parse(row.equipment);
        } catch (e) {
          row.equipment = [];
        }
      } else {
        row.equipment = [];
      }
    });

    // If no authentication (public access), only return approved events
    if (!req.headers.authorization) {
      const approvedEvents = rows.filter(event => event.status === 'approved');
      return res.json(approvedEvents);
    }

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

    // Parse JSON fields
    const event = rows[0];
    if (event.venues) {
      try {
        event.venues = JSON.parse(event.venues);
      } catch (e) {
        event.venues = [];
      }
    } else {
      event.venues = [];
    }
    if (event.equipment) {
      try {
        event.equipment = JSON.parse(event.equipment);
      } catch (e) {
        event.equipment = [];
      }
    } else {
      event.equipment = [];
    }

    // If no authentication (public access), only allow viewing approved events
    if (!req.headers.authorization && event.status !== 'approved') {
      return res.status(403).json({ error: 'Access denied. Event not approved.' });
    }

    res.json(event);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/events - Create new event with status pending and create notification (requires authentication)
router.post('/', upload.single('multi_day_schedule'), async (req, res) => {
  // Check if user is authenticated
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Authentication required to create events' });
  }
  const {
    name,
    description,
    start_date,
    end_date,
    venues,
    equipment,
    application_date,
    rental_date,
    behalf_of,
    contact_info,
    nature_of_event,
    requires_equipment,
    chairs_qty,
    tables_qty,
    projector,
    other_equipment,
    setup_start_time,
    setup_end_time,
    setup_hours,
    event_start_time,
    event_end_time,
    event_hours,
    cleanup_start_time,
    cleanup_end_time,
    cleanup_hours,
    total_hours,
    multi_day_schedule
  } = req.body;

  // Validate required fields
  if (!name || !start_date) {
    return res.status(400).json({ error: 'Event name and start date are required' });
  }

  // Check for conflicts before creating the event and BLOCK if conflicts exist
  try {
    const conflicts = await checkEventConflicts({
      start_date,
      end_date,
      venues,
      event_start_time,
      event_end_time,
      setup_start_time,
      cleanup_end_time
    });

    if (conflicts.length > 0) {
      // Block event creation and return conflict details
      return res.status(409).json({
        error: 'Event conflict detected',
        message: 'This event conflicts with existing approved events at the same venue and time. Please choose a different venue or time slot.',
        conflicts
      });
    }
  } catch (conflictError) {
    console.error('Error checking conflicts:', conflictError);
    // Continue with creation if conflict check fails (to avoid blocking due to errors)
  }

  // Set default values for optional fields
  const defaultValues = {
    description: description || '',
    end_date: end_date && end_date.trim() !== '' ? end_date : null,
    venues: venues ? JSON.parse(venues) : [],
    equipment: equipment ? JSON.parse(equipment) : [],
    application_date: application_date && application_date.trim() !== '' ? application_date : null,
    rental_date: rental_date && rental_date.trim() !== '' ? rental_date : null,
    behalf_of: behalf_of || '',
    contact_info: contact_info || '',
    nature_of_event: nature_of_event || '',
    requires_equipment: requires_equipment === 'true' || requires_equipment === true || false,
    chairs_qty: chairs_qty ? parseInt(chairs_qty) || 0 : 0,
    tables_qty: tables_qty ? parseInt(tables_qty) || 0 : 0,
    projector: projector === 'true' || projector === true || false,
    other_equipment: other_equipment || '',
    setup_start_time: setup_start_time && setup_start_time.trim() !== '' ? setup_start_time : null,
    setup_end_time: setup_end_time && setup_end_time.trim() !== '' ? setup_end_time : null,
    setup_hours: setup_hours ? parseFloat(setup_hours) || 0 : 0,
    event_start_time: event_start_time && event_start_time.trim() !== '' ? event_start_time : null,
    event_end_time: event_end_time && event_end_time.trim() !== '' ? event_end_time : null,
    event_hours: event_hours ? parseFloat(event_hours) || 0 : 0,
    cleanup_start_time: cleanup_start_time && cleanup_start_time.trim() !== '' ? cleanup_start_time : null,
    cleanup_end_time: cleanup_end_time && cleanup_end_time.trim() !== '' ? cleanup_end_time : null,
    cleanup_hours: cleanup_hours ? parseFloat(cleanup_hours) || 0 : 0,
    total_hours: total_hours ? parseFloat(total_hours) || 0 : 0,
    multi_day_schedule: req.file ? req.file.filename : multi_day_schedule || null
  };

  try {
    const [result] = await pool.execute(
      'INSERT INTO events (name, description, start_date, end_date, venues, equipment, application_date, rental_date, behalf_of, contact_info, nature_of_event, requires_equipment, chairs_qty, tables_qty, projector, other_equipment, setup_start_time, setup_end_time, setup_hours, event_start_time, event_end_time, event_hours, cleanup_start_time, cleanup_end_time, cleanup_hours, total_hours, multi_day_schedule, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        name,
        defaultValues.description,
        start_date,
        defaultValues.end_date,
        JSON.stringify(defaultValues.venues),
        JSON.stringify(defaultValues.equipment),
        defaultValues.application_date,
        defaultValues.rental_date,
        defaultValues.behalf_of,
        defaultValues.contact_info,
        defaultValues.nature_of_event,
        defaultValues.requires_equipment,
        defaultValues.chairs_qty,
        defaultValues.tables_qty,
        defaultValues.projector,
        defaultValues.other_equipment,
        defaultValues.setup_start_time,
        defaultValues.setup_end_time,
        defaultValues.setup_hours,
        defaultValues.event_start_time,
        defaultValues.event_end_time,
        defaultValues.event_hours,
        defaultValues.cleanup_start_time,
        defaultValues.cleanup_end_time,
        defaultValues.cleanup_hours,
        defaultValues.total_hours,
        defaultValues.multi_day_schedule,
        'pending'
      ]
    );
    const eventId = result.insertId;

    // Create notification
    await pool.execute(
      'INSERT INTO notifications (type, message, eventId, status) VALUES (?, ?, ?, ?)',
      ['event_approval', `New event "${name}" requires approval`, eventId, 'pending']
    );

    res.status(201).json({
      id: eventId,
      name,
      description: defaultValues.description,
      start_date,
      end_date: defaultValues.end_date,
      venues: defaultValues.venues,
      equipment: defaultValues.equipment,
      application_date: defaultValues.application_date,
      rental_date: defaultValues.rental_date,
      behalf_of: defaultValues.behalf_of,
      contact_info: defaultValues.contact_info,
      nature_of_event: defaultValues.nature_of_event,
      requires_equipment: defaultValues.requires_equipment,
      chairs_qty: defaultValues.chairs_qty,
      tables_qty: defaultValues.tables_qty,
      projector: defaultValues.projector,
      other_equipment: defaultValues.other_equipment,
      setup_start_time: defaultValues.setup_start_time,
      setup_end_time: defaultValues.setup_end_time,
      setup_hours: defaultValues.setup_hours,
      event_start_time: defaultValues.event_start_time,
      event_end_time: defaultValues.event_end_time,
      event_hours: defaultValues.event_hours,
      cleanup_start_time: defaultValues.cleanup_start_time,
      cleanup_end_time: defaultValues.cleanup_end_time,
      cleanup_hours: defaultValues.cleanup_hours,
      total_hours: defaultValues.total_hours,
      multi_day_schedule: defaultValues.multi_day_schedule,
      status: 'pending',
      created_at: new Date()
    });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/events/:id - Update event details (requires authentication)
router.put('/:id', upload.single('multi_day_schedule'), async (req, res) => {
  // Check if user is authenticated
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Authentication required to update events' });
  }
  const {
    name,
    description,
    start_date,
    end_date,
    venues,
    equipment,
    application_date,
    rental_date,
    behalf_of,
    contact_info,
    nature_of_event,
    requires_equipment,
    chairs_qty,
    tables_qty,
    projector,
    other_equipment,
    setup_start_time,
    setup_end_time,
    setup_hours,
    event_start_time,
    event_end_time,
    event_hours,
    cleanup_start_time,
    cleanup_end_time,
    cleanup_hours,
    total_hours,
    multi_day_schedule
  } = req.body;

  // Validate required fields
  if (!name || !start_date) {
    return res.status(400).json({ error: 'Event name and start date are required' });
  }

  // Check for conflicts before updating the event (excluding the current event)
  try {
    const conflicts = await checkEventConflicts({
      start_date,
      end_date,
      venues,
      event_start_time,
      event_end_time,
      setup_start_time,
      cleanup_end_time
    }, req.params.id);

    if (conflicts.length > 0) {
      return res.status(409).json({
        error: 'Event conflict detected',
        message: 'This event conflicts with existing approved events at the same venue and time',
        conflicts
      });
    }
  } catch (conflictError) {
    console.error('Error checking conflicts:', conflictError);
    // Continue with update if conflict check fails (to avoid blocking)
  }

  // Set default values for optional fields
  const defaultValues = {
    description: description || '',
    end_date: end_date && end_date.trim() !== '' ? end_date : null,
    venues: venues ? JSON.parse(venues) : [],
    equipment: equipment ? JSON.parse(equipment) : [],
    application_date: application_date && application_date.trim() !== '' ? application_date : null,
    rental_date: rental_date && rental_date.trim() !== '' ? rental_date : null,
    behalf_of: behalf_of || '',
    contact_info: contact_info || '',
    nature_of_event: nature_of_event || '',
    requires_equipment: requires_equipment === 'true' || requires_equipment === true || false,
    chairs_qty: chairs_qty ? parseInt(chairs_qty) || 0 : 0,
    tables_qty: tables_qty ? parseInt(tables_qty) || 0 : 0,
    projector: projector === 'true' || projector === true || false,
    other_equipment: other_equipment || '',
    setup_start_time: setup_start_time && setup_start_time.trim() !== '' ? setup_start_time : null,
    setup_end_time: setup_end_time && setup_end_time.trim() !== '' ? setup_end_time : null,
    setup_hours: setup_hours ? parseFloat(setup_hours) || 0 : 0,
    event_start_time: event_start_time && event_start_time.trim() !== '' ? event_start_time : null,
    event_end_time: event_end_time && event_end_time.trim() !== '' ? event_end_time : null,
    event_hours: event_hours ? parseFloat(event_hours) || 0 : 0,
    cleanup_start_time: cleanup_start_time && cleanup_start_time.trim() !== '' ? cleanup_start_time : null,
    cleanup_end_time: cleanup_end_time && cleanup_end_time.trim() !== '' ? cleanup_end_time : null,
    cleanup_hours: cleanup_hours ? parseFloat(cleanup_hours) || 0 : 0,
    total_hours: total_hours ? parseFloat(total_hours) || 0 : 0,
    multi_day_schedule: req.file ? req.file.filename : multi_day_schedule || null
  };

  try {
    const [result] = await pool.execute(
      'UPDATE events SET name = ?, description = ?, start_date = ?, end_date = ?, venues = ?, equipment = ?, application_date = ?, rental_date = ?, behalf_of = ?, contact_info = ?, nature_of_event = ?, requires_equipment = ?, chairs_qty = ?, tables_qty = ?, projector = ?, other_equipment = ?, setup_start_time = ?, setup_end_time = ?, setup_hours = ?, event_start_time = ?, event_end_time = ?, event_hours = ?, cleanup_start_time = ?, cleanup_end_time = ?, cleanup_hours = ?, total_hours = ?, multi_day_schedule = ? WHERE id = ?',
      [
        name,
        defaultValues.description,
        start_date,
        defaultValues.end_date,
        JSON.stringify(defaultValues.venues),
        JSON.stringify(defaultValues.equipment),
        defaultValues.application_date,
        defaultValues.rental_date,
        defaultValues.behalf_of,
        defaultValues.contact_info,
        defaultValues.nature_of_event,
        defaultValues.requires_equipment,
        defaultValues.chairs_qty,
        defaultValues.tables_qty,
        defaultValues.projector,
        defaultValues.other_equipment,
        defaultValues.setup_start_time,
        defaultValues.setup_end_time,
        defaultValues.setup_hours,
        defaultValues.event_start_time,
        defaultValues.event_end_time,
        defaultValues.event_hours,
        defaultValues.cleanup_start_time,
        defaultValues.cleanup_end_time,
        defaultValues.cleanup_hours,
        defaultValues.total_hours,
        defaultValues.multi_day_schedule,
        req.params.id
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Fetch the updated event to return complete data
    const [rows] = await pool.execute('SELECT * FROM events WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Event not found after update' });
    }

    // Parse JSON fields
    const updatedEvent = rows[0];
    if (updatedEvent.venues) {
      try {
        updatedEvent.venues = JSON.parse(updatedEvent.venues);
      } catch (e) {
        updatedEvent.venues = [];
      }
    } else {
      updatedEvent.venues = [];
    }
    if (updatedEvent.equipment) {
      try {
        updatedEvent.equipment = JSON.parse(updatedEvent.equipment);
      } catch (e) {
        updatedEvent.equipment = [];
      }
    } else {
      updatedEvent.equipment = [];
    }

    res.json(updatedEvent);
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/events/:id - Delete event and related records (requires authentication)
router.delete('/:id', async (req, res) => {
  // Check if user is authenticated
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Authentication required to delete events' });
  }
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
