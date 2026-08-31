require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 4000,
  DATABASE_URL: process.env.DATABASE_URL,

  JWT_SECRET: process.env.JWT_SECRET || 'dev_secret_change_me',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '1d',
  JWT_REFRESH_EXPIRES_IN_DAYS: Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS || 7),

  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,

  
  RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED === 'true',
  RATE_LIMIT_WINDOW_MIN: Number(process.env.RATE_LIMIT_WINDOW_MIN) || 15,
  RATE_LIMIT_MAX_REQUESTS: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  AUTH_RATE_LIMIT_MAX_REQUESTS: Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS) || 20,

  
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
  
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  SMTP_FROM: process.env.SMTP_FROM || 'Fleet Dashboard <no-reply@fleet-dashboard.local>',

  
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',

  
  
  PASSWORD_RESET_TOKEN_EXPIRY_MIN: Number(process.env.PASSWORD_RESET_TOKEN_EXPIRY_MIN) || 30,

  
  SEED_ADMIN_NAME: process.env.SEED_ADMIN_NAME || 'Admin',
  SEED_ADMIN_EMAIL: (process.env.SEED_ADMIN_EMAIL || 'rajibkrmondal2021@gmail.com').toLowerCase(),
  SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD || 'Admin123',

  PLACES_PROVIDER: process.env.PLACES_PROVIDER || 'MAPPLS',
  MAPPLS_CLIENT_ID: process.env.MAPPLS_CLIENT_ID,
  MAPPLS_CLIENT_SECRET: process.env.MAPPLS_CLIENT_SECRET,
  GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,
  OSM_NOMINATIM_BASE_URL: process.env.OSM_NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org',
  OSM_NOMINATIM_USER_AGENT: process.env.OSM_NOMINATIM_USER_AGENT || 'FleetWatch/1.0 (fleet dashboard place search)',

  
  
  
  
  
  
  
  
  
  
  OVERPASS_BASE_URL: process.env.OVERPASS_BASE_URL || 'https://overpass-api.de/api/interpreter',

  ROUTE_PROVIDER: process.env.ROUTE_PROVIDER || 'GOOGLE',
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
  MAPPLS_ROUTE_API_KEY: process.env.MAPPLS_ROUTE_API_KEY,

  TOLL_PROVIDER: process.env.TOLL_PROVIDER || 'MAPPLS',
  TOLLGURU_API_KEY: process.env.TOLLGURU_API_KEY,

  HUB_PROVIDER: process.env.HUB_PROVIDER || 'MAPPLS',

  
  
  DESTINATION_REACHED_RADIUS_METERS: Number(process.env.DESTINATION_REACHED_RADIUS_METERS) || 200,
  DEVIATION_RADIUS_METERS: Number(process.env.DEVIATION_RADIUS_METERS) || 500,
  UNAUTHORIZED_STOP_RADIUS_METERS: Number(process.env.UNAUTHORIZED_STOP_RADIUS_METERS) || 150,
  STOP_MOVEMENT_TOLERANCE_METERS: Number(process.env.STOP_MOVEMENT_TOLERANCE_METERS) || 60,
  STOP_MINUTES_THRESHOLD: Number(process.env.STOP_MINUTES_THRESHOLD) || 15,

  
  
  
  EXPECTED_AVERAGE_SPEED_KMPH: Number(process.env.EXPECTED_AVERAGE_SPEED_KMPH) || 40,
  
  
  DELAY_TOLERANCE_FRACTION: Number(process.env.DELAY_TOLERANCE_FRACTION) || 0.15,
  
  
  DELAY_GRACE_MINUTES: Number(process.env.DELAY_GRACE_MINUTES) || 10,

  
  
  
  
  
  DEVIATION_CONFIRM_PINGS: Number(process.env.DEVIATION_CONFIRM_PINGS) || 2,

  
  
  
  
  
  GPS_OFFLINE_MINUTES_THRESHOLD: Number(process.env.GPS_OFFLINE_MINUTES_THRESHOLD) || 20,
  GPS_OFFLINE_CHECK_CRON: process.env.GPS_OFFLINE_CHECK_CRON || '*/5 * * * *',
};
