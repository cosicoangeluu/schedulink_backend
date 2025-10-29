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
