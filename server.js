const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./database');
const eventsRouter = require('./events');
const notificationsRouter = require('./notifications');
const resourcesRouter = require('./resources');
const venuesRouter = require('./venues');

const reportsRouter = require('./reports');
const tasksRouter = require('./tasks');
const authRouter = require('./auth');
const { cache, clearCache } = require('./cache');
const { apiLimiter, strictLimiter } = require('./rateLimit');
const { addClient, removeClient } = require('./sse');



const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// general rate limiting application
app.use('/api/', apiLimiter);

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
app.use('/api/notifications', notificationsRouter);
app.use('/api/resources', resourcesRouter);
app.use('/api/venues', venuesRouter);

app.use('/api/reports', reportsRouter);
app.use('/api/tasks', tasksRouter);
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

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initializeDatabase();
});
