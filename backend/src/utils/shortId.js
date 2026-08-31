const crypto = require('crypto');


function generateShortId(modelName) {
  const prefix = (modelName || 'ID').slice(0, 3).toUpperCase();
  const random = crypto.randomBytes(6).toString('hex').toUpperCase().slice(0, 8);
  return `${prefix}-${random}`;
}

module.exports = { generateShortId };
