const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/authRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const placeRoutes = require('./routes/placeRoutes');
const hubRoutes = require('./routes/hubRoutes');
const tripPlanningRoutes = require('./routes/tripPlanningRoutes');
const routeRoutes = require('./routes/routeRoutes');
const tripRoutes = require('./routes/tripRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
const alertRoutes = require('./routes/alertRoutes');
const searchRoutes = require('./routes/searchRoutes');
const importRoutes = require('./routes/importRoutes');

const errorHandler = require('./middleware/errorHandler');
const { globalLimiter, authLimiter } = require('./middleware/rateLimiter');
const { CORS_ALLOWED_ORIGINS } = require('./config/env');
const pool = require('./config/pgPool');

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));






const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

// Any localhost/127.0.0.1 origin (on any port) is always allowed, on top
// of whatever CORS_ALLOWED_ORIGINS says. This is what actually fixes the
// common "blocked by CORS policy" dev error: Vite's dev server port isn't



const isLocalOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

app.use(cors({
  origin: function (origin, callback) {
    
    
    
    if (!origin) return callback(null, true);

    const normalized = origin.replace(/\/+$/, '');
    if (allowedOrigins.includes(normalized) || isLocalOrigin(normalized)) {
      return callback(null, true);
    }

    // Don't throw — throwing turns every blocked preflight into an
    
    
    
    
    console.warn(`[CORS] Blocked request from origin "${origin}". Allowed origins: ${allowedOrigins.join(', ')}`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.use(globalLimiter);


app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    db: 'unknown',
  };

  try {
    await pool.query('SELECT 1');
    health.db = 'connected';
  } catch (err) {
    health.status = 'error';
    health.db = 'disconnected';
    health.dbError = err.message;
    return res.status(503).json(health);
  }

  res.json(health);
  });




app.use('/api/auth', authLimiter, authRoutes);

app.use('/api/vehicles', vehicleRoutes);

app.use('/api/places', placeRoutes);




app.use('/api/hubs', hubRoutes);

app.use('/api/trip-planning', tripPlanningRoutes);


app.use('/api/routes', routeRoutes);

app.use('/api/trips', tripRoutes);


app.use('/api/tracking', trackingRoutes);


app.use('/api/alerts', alertRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/import', importRoutes);

app.use(errorHandler); 

module.exports = app;