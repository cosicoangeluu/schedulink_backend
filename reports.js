const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('./database');

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

// POST /api/reports/upload - Upload a narrative report PDF
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

// GET /api/reports - Get all reports
router.get('/', async (req, res) => {
  try {
    // Query all reports with event names, including reports for deleted events
    const [reports] = await pool.execute(`
      SELECT r.*, COALESCE(e.name, 'Event Deleted') as eventName
      FROM reports r
      LEFT JOIN events e ON r.eventId = e.id
      ORDER BY r.uploadedAt DESC
    `);

    res.json(reports);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// GET /api/reports/files - Get all uploaded files with event info
router.get('/files', async (req, res) => {
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

module.exports = router;
