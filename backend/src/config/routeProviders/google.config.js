const { GOOGLE_MAPS_API_KEY } = require('../env');

module.exports = {
  isConfigured: Boolean(GOOGLE_MAPS_API_KEY),
  apiKey: GOOGLE_MAPS_API_KEY,
  directionsUrl: 'https://maps.googleapis.com/maps/api/directions/json',
};
