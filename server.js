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

app.use(cors({
  origin: ['http://localhost:3000', 'https://schedulink.ccsdepartment.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control']
}));
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use('/uploads/personal_info', express.static('uploads/personal_info'));


// Cache cleaning middleware - for POST, PUT, DELETE requests
app.use('/api/', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    return clearCache('cache:*')(req, res, next);
  }
  next();
});

// Caching middleware - for GET requests (5 minute cache)
app.use('/api/', (req, res, next) => {
  // Skip caching for reports endpoints to allow unauthenticated uploads
  if (req.path.startsWith('/api/reports')) {
    return next();
  }
  return cache(300)(req, res, next);
});

app.use('/api/events', eventsRouter);
app.use('/api/notifications', protect, notificationsRouter);
app.use('/api/resources', resourcesRouter);
app.use('/api/venues', venuesRouter);

app.use('/api/reports', reportsRouter);
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
