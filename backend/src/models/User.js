const { pool } = require('../config/db');




const SELECT_COLUMNS = `
  user_id AS "id", name, email, password, is_default AS "isDefault", role,
  two_factor_enabled AS "twoFactorEnabled",
  created_at AS "createdAt", updated_at AS "updatedAt", updated_by AS "updatedBy",
  deactivated_at AS "deactivatedAt", deactivated_by AS "deactivatedBy"
`;

async function findByEmail(email) {
  const query = `SELECT ${SELECT_COLUMNS} FROM users WHERE email = $1`;
  const result = await pool.query(query, [email]);
  return result.rows[0] || null;
}

async function findById(id) {
  const query = `SELECT ${SELECT_COLUMNS} FROM users WHERE user_id = $1`;
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}






async function create({ name, email, password, role, isDefault }) {
  const query = `
    INSERT INTO users (name, email, password, role, is_default)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING ${SELECT_COLUMNS}
  `;
  const values = [name, email, password, role || 'OPERATOR', isDefault !== undefined ? Boolean(isDefault) : true];
  const result = await pool.query(query, values);
  return result.rows[0];
}




async function updatePassword(id, hashedPassword) {
  const query = `
    UPDATE users SET password = $2, is_default = FALSE
    WHERE user_id = $1
    RETURNING ${SELECT_COLUMNS}
  `;
  const values = [id, hashedPassword];
  const result = await pool.query(query, values);
  return result.rows[0];
}


async function updateTwoFactor(id, enabled) {
  const query = `
    UPDATE users SET two_factor_enabled = $2
    WHERE user_id = $1
    RETURNING ${SELECT_COLUMNS}
  `;
  const values = [id, Boolean(enabled)];
  const result = await pool.query(query, values);
  return result.rows[0];
}

module.exports = { findByEmail, findById, create, updatePassword, updateTwoFactor };
