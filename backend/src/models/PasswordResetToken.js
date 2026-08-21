const { pool } = require('../config/db');

const SELECT_COLUMNS = `
  id, user_id AS "userId", token_hash AS "tokenHash",
  expires_at AS "expiresAt", used, created_at AS "createdAt"
`;


async function create({ userId, tokenHash, expiresAt }) {
  const query = `
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
    RETURNING ${SELECT_COLUMNS}
  `;
  const values = [userId, tokenHash, expiresAt];
  const result = await pool.query(query, values);
  return result.rows[0];
}

async function findValidByTokenHash(tokenHash) {
  const query = `
    SELECT ${SELECT_COLUMNS} FROM password_reset_tokens
    WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW()
    LIMIT 1
  `;
  const values = [tokenHash];
  const result = await pool.query(query, values);
  return result.rows[0] || null;
}

async function markUsed(id) {
  const query = `
    UPDATE password_reset_tokens SET used = TRUE
    WHERE id = $1
    RETURNING ${SELECT_COLUMNS}
  `;
  const values = [id];
  const result = await pool.query(query, values);
  return result.rows[0];
}



async function invalidateAllForUser(userId) {
  const query = `
    UPDATE password_reset_tokens SET used = TRUE
    WHERE user_id = $1 AND used = FALSE
  `;
  const values = [userId];
  await pool.query(query, values);
}

async function deleteExpired() {
  const query = `DELETE FROM password_reset_tokens WHERE expires_at < CURRENT_TIMESTAMP`;
  const result = await pool.query(query);
  return result.rowCount;
}

module.exports = { create, findValidByTokenHash, markUsed, invalidateAllForUser, deleteExpired };
