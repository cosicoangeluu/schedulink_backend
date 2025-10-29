const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { initializeDatabase } = require('./database');
const eventsRouter = require('./events');
const notificationsRouter = require('./notifications');
const resourcesRouter = require('./resources');
const venuesRouter = require('./venues');

const reportsRouter = require('./reports');
const tasksRouter = require('./tasks');
const authRouter = require('./auth');
const { protect } = require('./authMiddleware');
const { cache, clearCache } = require('./cache');
const { addClient, removeClient } = require('./sse');
const { notFound, errorHandler } = require('./errorMiddleware');


const app = express();
const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));


// Cache cleaning middleware - for POST, PUT, DELETE requests
app.use('/api/', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    return clearCache('cache:*')(req, res, next);
  }
  next();
});

// Caching middleware - for GET requests (5 minute cache)
app.use('/api/', cache(300));

app.use('/api/events', eventsRouter);
app.use('/api/notifications', protect, notificationsRouter);
app.use('/api/resources', protect, resourcesRouter);
app.use('/api/venues', protect, venuesRouter);

app.use('/api/reports', protect, reportsRouter);
app.use('/api/tasks', protect, tasksRouter);
app.use('/api/auth', authRouter);

// SSE endpoint
app.get('/api/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });

  addClient(res);

  req.on('close', () => {
    removeClient(res);
  });

  res.write('\n');
});

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initializeDatabase();
});
