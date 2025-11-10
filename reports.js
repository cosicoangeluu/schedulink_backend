const express = require('express');
const router = express.Router();
const { pool } = require('./database.js');
const { protect: authenticateToken } = require('./authMiddleware');
const multer = require('multer');
const { cloudinary } = require('./cloudinary');
const fetch = require('node-fetch');

// Use memory storage for multer to avoid saving to disk before uploading to Cloudinary
const storage = multer.memoryStorage();

// Configure multer with file size limit and file type validation
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept only PDF files
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed!'), false);
        }
    }
});

/**
 * @route   POST /api/reports/upload
 * @desc    Upload a report for a specific event
 * @access  Public (Student/Admin)
 */
router.post('/upload', (req, res) => {
    upload.single('report')(req, res, async (err) => {
        // Handle multer errors (file size, file type, etc.)
        if (err instanceof multer.MulterError) {
            console.error('Multer error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'File size exceeds 10MB limit.' });
            }
            return res.status(400).json({ error: `Upload error: ${err.message}` });
        } else if (err) {
            console.error('File filter error:', err);
            return res.status(400).json({ error: err.message });
        }

        try {
            console.log('Upload request received');
            console.log('File:', req.file ? `${req.file.originalname} (${req.file.size} bytes, ${req.file.mimetype})` : 'No file');
            console.log('Body:', req.body);

            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded. Please select a PDF file.' });
            }

            const eventId = parseInt(req.body.eventId, 10);
            const uploadedBy = req.body.uploadedBy;

            if (!eventId || !uploadedBy) {
                console.error('Missing required fields:', { eventId, uploadedBy });
                return res.status(400).json({ error: 'Missing eventId or uploadedBy' });
            }

        // Check if event exists
        const [eventResult] = await pool.execute('SELECT * FROM events WHERE id = ?', [eventId]);
        if (!eventResult || eventResult.length === 0) {
            console.error('Event not found:', eventId);
            return res.status(404).json({ error: 'Event not found.' });
        }

        console.log('Uploading to Cloudinary...');

        // Upload to Cloudinary using buffer directly
        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { resource_type: 'raw', folder: 'reports' },
                (error, result) => {
                    if (error) {
                        console.error('Cloudinary upload error:', error);
                        reject(error);
                    } else {
                        console.log('Cloudinary upload successful:', result.public_id);
                        resolve(result);
                    }
                }
            );

            // Write the buffer to the stream and end it
            stream.end(req.file.buffer);
        });

        // Save report metadata to database
        const { secure_url } = result;
        const fileName = req.file.originalname;

        console.log('Saving to database...');

        const [insertResult] = await pool.execute(
            'INSERT INTO reports (eventId, filePath, fileName, uploadedBy, uploadedAt) VALUES (?, ?, ?, ?, NOW())',
            [eventId, secure_url, fileName, uploadedBy]
        );

        console.log('Report saved successfully with ID:', insertResult.insertId);

        res.status(201).json({
            message: 'Report uploaded successfully',
            report: {
                id: insertResult.insertId,
                eventId: eventId,
                fileName: fileName,
                filePath: secure_url,
                uploadedBy: uploadedBy,
            },
        });
        } catch (error) {
            console.error('Error uploading report:', error);
            res.status(500).json({ error: 'Server error', details: error.message });
        }
    });
});

/**
 * @route   GET /api/reports
 * @desc    Get all reports
 * @access  Public (Admin)
 */
router.get('/', async (req, res) => {
    try {
        const [reports] = await pool.execute(`
            SELECT
                r.id,
                r.eventId,
                r.filePath,
                r.fileName,
                r.uploadedBy,
                r.uploadedAt,
                e.name as eventName,
                0 as fileSize,
                1 as \`exists\`
            FROM reports r
            LEFT JOIN events e ON r.eventId = e.id
            ORDER BY r.uploadedAt DESC
        `);
        res.json(reports);
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).send('Server error');
    }
});

/**
 * @route   GET /api/reports/file/:id
 * @desc    Get a report file
 * @access  Public (Admin)
 */
router.get('/file/:id', async (req, res) => {
    const { id } = req.params;

    try {
        console.log('Fetching report file with ID:', id);

        const [reportResult] = await pool.execute('SELECT filePath FROM reports WHERE id = ?', [id]);
        if (reportResult.length === 0) {
            console.error('Report not found in database:', id);
            return res.status(404).json({ error: 'Report not found.' });
        }

        const { filePath } = reportResult[0];
        console.log('Cloudinary file path:', filePath);

        // Validate that filePath exists
        if (!filePath) {
            console.error('File path is null or undefined');
            return res.status(404).json({ error: 'File path not found in database.' });
        }

        // Fetch the file from Cloudinary
        console.log('Fetching file from Cloudinary...');
        const response = await fetch(filePath);
        console.log('Cloudinary response status:', response.status, response.statusText);

        if (!response.ok) {
            console.error('Cloudinary fetch failed:', response.status, response.statusText);
            const errorText = await response.text().catch(() => 'Unable to read error');
            console.error('Cloudinary error response:', errorText);
            return res.status(404).json({ error: `File not found on Cloudinary. Status: ${response.status}` });
        }

        // Get content type from Cloudinary response
        const contentType = response.headers.get('content-type') || 'application/pdf';
        console.log('Content-Type from Cloudinary:', contentType);

        // Convert arrayBuffer to Buffer (node-fetch v3 compatibility)
        console.log('Converting file to buffer...');
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log('File fetched successfully. Size:', buffer.length, 'bytes');

        // Set appropriate headers
        res.set('Content-Type', contentType);
        res.set('Content-Length', buffer.length.toString());
        res.set('Content-Disposition', 'inline');
        res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

        res.send(buffer);
    } catch (error) {
        console.error('Error fetching report file:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
    }
});

/**
 * @route   DELETE /api/reports/:id
 * @desc    Delete a report
 * @access  Private (Admin)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied.' });
    }

    const { id } = req.params;

    try {
        // Get report to find its filePath
        const [reportResult] = await pool.execute('SELECT filePath FROM reports WHERE id = ?', [id]);
        if (reportResult.length === 0) {
            return res.status(404).json({ error: 'Report not found.' });
        }

        // Delete from database
        await pool.execute('DELETE FROM reports WHERE id = ?', [id]);

        res.json({ message: 'Report deleted successfully.' });
    } catch (error) {
        console.error('Error deleting report:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;