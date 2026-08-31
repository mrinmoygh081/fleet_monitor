const { pool } = require('../config/db');



async function create({ userId, tokenHash, expiresAt }) {
  const query = `
    INSERT INTO auth_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
    RETURNING id, user_id AS "userId", token_hash AS "tokenHash", expires_at AS "expiresAt", created_at AS "createdAt"
  `;
  const result = await pool.query(query, [userId, tokenHash, expiresAt]);
  return result.rows[0];
}




async function findValidByHash(tokenHash) {
  const query = `
    SELECT id, user_id AS "userId", token_hash AS "tokenHash", expires_at AS "expiresAt"
    FROM auth_tokens
    WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
  `;
  const result = await pool.query(query, [tokenHash]);
  return result.rows[0] || null;
}

async function revoke(id) {
  const query = `UPDATE auth_tokens SET revoked_at = NOW() WHERE id = $1 RETURNING id`;
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}

async function revokeByHash(tokenHash) {
  const query = `UPDATE auth_tokens SET revoked_at = NOW() WHERE token_hash = $1 RETURNING id`;
  const result = await pool.query(query, [tokenHash]);
  return result.rows[0] || null;
}



async function deleteExpired() {
  const query = `DELETE FROM auth_tokens WHERE expires_at < NOW()`;
  const result = await pool.query(query);
  return result.rowCount;
}

module.exports = { create, findValidByHash, revoke, revokeByHash, deleteExpired };
