const bcrypt = require('bcrypt');
const User = require('../models/User');
const { SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = require('../config/env');


async function seedAdmin() {
  try {
    const existing = await User.findByEmail(SEED_ADMIN_EMAIL);
    if (existing) {
      return; 
    }

    const hashed = await bcrypt.hash(SEED_ADMIN_PASSWORD, 10);
    await User.create({ name: SEED_ADMIN_NAME, email: SEED_ADMIN_EMAIL, password: hashed, role: 'ADMIN' });

    console.log(`[seedAdmin] Created default ADMIN account: ${SEED_ADMIN_EMAIL}`);
  } catch (err) {
    
    
    console.error('[seedAdmin] Failed to seed default admin:', err.message);
  }
}

module.exports = { seedAdmin };
