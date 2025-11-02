const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('./database');
const { protect } = require('./authMiddleware');

const router = express.Router();

// Configure multer for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'), false);
    }
  }
});

// POST /api/reports/upload - Upload a narrative report PDF (no auth required for students)
router.post('/upload', upload.single('report'), async (req, res) => {
  try {
    const { eventId, uploadedBy } = req.body;
    const filePath = req.file.path;

    if (!eventId || !uploadedBy) {
      return res.status(400).json({ error: 'eventId and uploadedBy are required' });
    }

    const [result] = await pool.execute(
      'INSERT INTO reports (eventId, filePath, uploadedBy) VALUES (?, ?, ?)',
      [eventId, filePath, uploadedBy]
    );

    res.status(201).json({
      message: 'Report uploaded successfully',
      reportId: result.insertId
    });
  } catch (error) {
    console.error('Error uploading report:', error);
    res.status(500).json({ error: 'Failed to upload report' });
  }
});

// GET /api/reports - Get all reports with file details (admin only)
router.get('/', protect, async (req, res) => {
  try {
    // Query all reports with event names, including reports for deleted events
    const [reports] = await pool.execute(`
      SELECT r.id, r.eventId, r.filePath, r.uploadedBy, r.uploadedAt, COALESCE(e.name, 'Event Deleted') as eventName, COALESCE(e.id, r.eventId) as eventId
      FROM reports r
      LEFT JOIN events e ON r.eventId = e.id
      ORDER BY r.uploadedAt DESC
    `);

    // Add file size and check if file exists
    const reportsWithDetails = reports.map(report => {
      const filePath = path.join(__dirname, report.filePath);
      let fileSize = 0;
      let exists = false;
      try {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          fileSize = stats.size;
          exists = true;
        }
      } catch (error) {
        console.error('Error checking file:', error);
      }

      return {
        ...report,
        fileName: path.basename(report.filePath),
        fileSize,
        exists
      };
    });

    res.json(reportsWithDetails);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// GET /api/reports/files - Get all uploaded files with event info (admin only)
router.get('/files', protect, async (req, res) => {
  try {
    // Query all reports with event names and file details, including reports for deleted events
    const [reports] = await pool.execute(`
      SELECT r.id, r.filePath, r.uploadedBy, r.uploadedAt, COALESCE(e.name, 'Event Deleted') as eventName, COALESCE(e.id, r.eventId) as eventId
      FROM reports r
      LEFT JOIN events e ON r.eventId = e.id
      ORDER BY r.uploadedAt DESC
    `);

    // Add file size and check if file exists
    const filesWithDetails = reports.map(report => {
      const filePath = path.join(__dirname, report.filePath);
      let fileSize = 0;
      let exists = false;
      try {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          fileSize = stats.size;
          exists = true;
        }
      } catch (error) {
        console.error('Error checking file:', error);
      }

      return {
        ...report,
        fileName: path.basename(report.filePath),
        fileSize,
        exists
      };
    });

    res.json(filesWithDetails);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// GET /api/reports/file/:id - Serve the uploaded file (admin only)
router.get('/file/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT filePath FROM reports WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    const filePath = path.join(__dirname, rows[0].filePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// DELETE /api/reports/:id - Delete a report and its file (admin only)
router.delete('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Attempting to delete report with id:', id);

    // Get the report details first
    const [reports] = await pool.execute('SELECT filePath FROM reports WHERE id = ?', [id]);
    if (reports.length === 0) {
      console.log('Report not found in database');
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = reports[0];
    const filePath = path.join(__dirname, report.filePath);
    console.log('File path to delete:', filePath);

    // Delete the physical file if it exists
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('Physical file deleted successfully');
      } else {
        console.log('Physical file does not exist');
      }
    } catch (fileError) {
      console.error('Error deleting physical file:', fileError);
      // Continue with database deletion even if file deletion fails
    }

    // Delete the report from database
    const [deleteResult] = await pool.execute('DELETE FROM reports WHERE id = ?', [id]);
    console.log('Database delete result:', deleteResult);

    if (deleteResult.affectedRows === 0) {
      console.log('No rows affected in database delete');
      return res.status(500).json({ error: 'Failed to delete report from database' });
    }

    console.log('Report deleted successfully');
    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

// GET /api/reports/sync - Sync existing files in uploads folder with database (admin only)
router.get('/sync', protect, async (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, 'uploads');

    // Check if uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      return res.status(404).json({ error: 'Uploads directory not found' });
    }

    // Read all files in uploads directory
    const files = fs.readdirSync(uploadsDir).filter(file => file.endsWith('.pdf'));

    // Get all existing reports from database
    const [existingReports] = await pool.execute('SELECT filePath FROM reports');
    const existingPaths = existingReports.map(r => r.filePath);

    // Find files that are not in database
    const orphanedFiles = files.filter(file => {
      const filePath = `uploads/${file}`;
      return !existingPaths.includes(filePath);
    });

    if (orphanedFiles.length === 0) {
      return res.json({
        message: 'All files are already synced',
        syncedCount: 0,
        totalFiles: files.length
      });
    }

    // Get first event to associate orphaned files with
    const [events] = await pool.execute('SELECT id FROM events ORDER BY id ASC LIMIT 1');

    if (events.length === 0) {
      return res.status(400).json({
        error: 'No events found in database. Please create an event first.',
        orphanedFiles: orphanedFiles.length
      });
    }

    const defaultEventId = events[0].id;
    let syncedCount = 0;

    // Insert orphaned files into database
    for (const file of orphanedFiles) {
      const filePath = `uploads/${file}`;
      try {
        await pool.execute(
          'INSERT INTO reports (eventId, filePath, uploadedBy) VALUES (?, ?, ?)',
          [defaultEventId, filePath, 'system']
        );
        syncedCount++;
      } catch (error) {
        console.error(`Error syncing file ${file}:`, error);
      }
    }

    res.json({
      message: `Successfully synced ${syncedCount} files`,
      syncedCount,
      totalFiles: files.length,
      orphanedFiles: orphanedFiles.length
    });
  } catch (error) {
    console.error('Error syncing files:', error);
    res.status(500).json({ error: 'Failed to sync files' });
  }
});

module.exports = router;
