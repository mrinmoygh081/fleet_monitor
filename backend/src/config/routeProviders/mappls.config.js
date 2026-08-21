

const { MAPPLS_CLIENT_ID, MAPPLS_CLIENT_SECRET } = require('../env');

module.exports = {
  isConfigured: Boolean(MAPPLS_CLIENT_ID && MAPPLS_CLIENT_SECRET),
  clientId: MAPPLS_CLIENT_ID,
  clientSecret: MAPPLS_CLIENT_SECRET,
  tokenUrl: 'https://outpost.mappls.com/api/security/oauth/token',
  routeUrlBase: 'https://apis.mappls.com/advancedmaps/v1',
};
