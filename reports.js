const express = require('express');
const router = express.Router();
const db = require('./database.js'); // Assuming you have a db connection module
const { protect: authenticateToken } = require('./authMiddleware');
const multer = require('multer');
const { cloudinary } = require('./cloudinary');
const { Readable } = require('stream');

// Use memory storage for multer to avoid saving to disk before uploading to Cloudinary
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * @route   POST /api/reports/upload
 * @desc    Upload a report for a specific event
 * @access  Private (Student/Admin)
 */
router.post('/upload', upload.single('report'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { eventId, uploadedBy } = req.body;

    if (!eventId || !uploadedBy) {
        return res.status(400).json({ error: 'Missing eventId or uploadedBy' });
    }

    try {
        // Check if event exists
        const [eventResult] = await db.query('SELECT * FROM events WHERE id = ?', [eventId]);
        if (!eventResult || eventResult.length === 0) {
            return res.status(404).json({ error: 'Event not found.' });
        }

        // Upload to Cloudinary
        const uploadStream = (buffer) => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { resource_type: 'raw', folder: 'reports' },
                    (error, result) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve(result);
                        }
                    }
                );
                const readable = Readable.from(buffer);
                readable.pipe(stream);
            });
        };

        const result = await uploadStream(req.file.buffer);

        // Save report metadata to database
        const { secure_url, public_id } = result;
        const fileName = req.file.originalname;
        const fileSize = req.file.size;

        const [insertResult] = await db.query(
            'INSERT INTO reports (eventId, filePath, fileName, uploadedBy, uploadedAt) VALUES (?, ?, ?, ?, NOW())',
            [eventId, secure_url, fileName, uploadedBy]
        );

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
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @route   GET /api/reports
 * @desc    Get all reports
 * @access  Private (Admin)
 */
router.get('/', authenticateToken, async (req, res) => {
    // Assuming only admins can see all reports
    if (req.user.role !== 'admin') {
        return res.status(403).send('Access denied.');
    }
    try {
        const [reports] = await db.query(`
            SELECT
                r.id,
                r.eventId,
                r.filePath,
                r.fileName,
                r.uploadedBy,
                r.uploadedAt,
                e.name as eventName,
                0 as fileSize,
                1 as exists
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
 * @access  Private (Admin)
 */
router.get('/file/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied.' });
    }

    const { id } = req.params;

    try {
        const [reportResult] = await db.query('SELECT filePath FROM reports WHERE id = ?', [id]);
        if (reportResult.length === 0) {
            return res.status(404).json({ error: 'Report not found.' });
        }

        const { filePath } = reportResult[0];

        // Fetch the file from Cloudinary
        const response = await fetch(filePath);
        if (!response.ok) {
            return res.status(404).json({ error: 'File not found.' });
        }

        const buffer = await response.buffer();
        res.set('Content-Type', 'application/pdf');
        res.send(buffer);
    } catch (error) {
        console.error('Error fetching report file:', error);
        res.status(500).json({ error: 'Server error' });
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
        const [reportResult] = await db.query('SELECT filePath FROM reports WHERE id = ?', [id]);
        if (reportResult.length === 0) {
            return res.status(404).json({ error: 'Report not found.' });
        }

        // Delete from database
        await db.query('DELETE FROM reports WHERE id = ?', [id]);

        res.json({ message: 'Report deleted successfully.' });
    } catch (error) {
        console.error('Error deleting report:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;