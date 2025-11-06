const express = require('express');
const router = express.Router();
const db = require('./database.js'); // Assuming you have a db connection module
const authenticateToken = require('./middleware/authenticateToken'); // Assuming JWT auth middleware
const multer = require('multer');
const { cloudinary } = require('./cloudinary');
const { Readable } = require('stream');

// Use memory storage for multer to avoid saving to disk before uploading to Cloudinary
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * @route   POST /api/reports/upload/:eventId
 * @desc    Upload a report for a specific event
 * @access  Private (Student)
 */
router.post('/upload/:eventId', authenticateToken, upload.single('report'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const { eventId } = req.params;
    const userId = req.user.id; // Assuming authenticateToken adds user to req

    try {
        // Check if user is authorized to submit a report for this event
        const [event] = await db.query('SELECT * FROM events WHERE id = ?', [eventId]);
        if (!event || event.length === 0) {
            return res.status(404).send('Event not found.');
        }
        // Add more authorization logic if needed (e.g., is user part of the event)

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
        const originalname = req.file.originalname;

        const [insertResult] = await db.query(
            'INSERT INTO reports (event_id, user_id, file_name, file_url, public_id) VALUES (?, ?, ?, ?, ?)',
            [eventId, userId, originalname, secure_url, public_id]
        );

        res.status(201).json({
            message: 'Report uploaded successfully',
            report: {
                id: insertResult.insertId,
                event_id: eventId,
                file_name: originalname,
                file_url: secure_url,
            },
        });
    } catch (error) {
        console.error('Error uploading report:', error);
        res.status(500).send('Server error');
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
        const [reports] = await db.query('SELECT id, event_id, user_id, file_name, file_url, created_at FROM reports ORDER BY created_at DESC');
        res.json(reports);
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).send('Server error');
    }
});

/**
 * @route   DELETE /api/reports/:id
 * @desc    Delete a report
 * @access  Private (Admin)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).send('Access denied.');
    }

    const { id } = req.params;

    try {
        // Get report to find its public_id
        const [reportResult] = await db.query('SELECT public_id FROM reports WHERE id = ?', [id]);
        if (reportResult.length === 0) {
            return res.status(404).send('Report not found.');
        }
        const { public_id } = reportResult[0];

        // Delete from Cloudinary
        if (public_id) {
            await cloudinary.uploader.destroy(public_id, { resource_type: 'raw' });
        }

        // Delete from database
        await db.query('DELETE FROM reports WHERE id = ?', [id]);

        res.send('Report deleted successfully.');
    } catch (error) {
        console.error('Error deleting report:', error);
        res.status(500).send('Server error');
    }
});

module.exports = router;