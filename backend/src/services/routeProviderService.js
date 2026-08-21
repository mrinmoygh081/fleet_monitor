const { ROUTE_PROVIDER } = require('../config/env');
const googleRouteProvider = require('./routeProviders/googleRouteProvider');
const mapplsRouteProvider = require('./routeProviders/mapplsRouteProvider');
const osrmRouteProvider = require('./routeProviders/osrmRouteProvider');

 const PROVIDERS = {
  GOOGLE: googleRouteProvider,
  MAPPLS: mapplsRouteProvider,
  OSRM: osrmRouteProvider
  };

async function generateRoutes(params) {
  const selected = PROVIDERS[ROUTE_PROVIDER] || osrmRouteProvider;

  if (selected.isConfigured()) {
    try {
      const routes = await selected.generateRoutes(params);
      if (Array.isArray(routes) && routes.length > 0) {
        return routes;
      }
      console.warn(`[routeProviderService] ${selected.name} (ROUTE_PROVIDER=${ROUTE_PROVIDER}) returned no routes`);
    } catch (err) {
      console.error(`[routeProviderService] ${selected.name} (ROUTE_PROVIDER=${ROUTE_PROVIDER}) failed:`, err.message);
    }
  } else {
    console.warn(`[routeProviderService] ROUTE_PROVIDER=${ROUTE_PROVIDER} is not configured (missing key)`);
  }

  if (selected !== osrmRouteProvider) {
    try {
      console.warn('[routeProviderService] falling back to OSRM');
      return await osrmRouteProvider.generateRoutes(params);
    } catch (err) {
      console.error('[routeProviderService] OSRM fallback also failed:', err.message);
    }
  }

  return [];
}

module.exports = { generateRoutes };