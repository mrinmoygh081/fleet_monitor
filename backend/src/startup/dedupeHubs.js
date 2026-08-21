const { pool } = require('../config/db');
const { isSameLocation } = require('../utils/coordinates');

async function dedupeHubs() {
  try {
    const { rows: hubs } = await pool.query(`
      SELECT hub_id AS "id", coordinates
      FROM hubs
      WHERE cancelled_at IS NULL
      ORDER BY created_at ASC
    `);

    const canonicalByDuplicateId = new Map();
    const kept = [];
    for (const hub of hubs) {
      const match = kept.find((k) => isSameLocation(k.coordinates, hub.coordinates));
      if (match) {
        canonicalByDuplicateId.set(hub.id, match.id);
      } else {
        kept.push(hub);
      }
    }

    if (canonicalByDuplicateId.size === 0) return;

    for (const [duplicateId, canonicalId] of canonicalByDuplicateId) {

      await pool.query(
        `UPDATE trips
         SET hub_ids = (
           SELECT ARRAY(SELECT DISTINCT unnest(array_replace(hub_ids, $1, $2)))
         )
         WHERE $1 = ANY(hub_ids)`,
        [duplicateId, canonicalId],
      );

      await pool.query(
        `UPDATE routes
         SET hubs = (
           SELECT jsonb_agg(
             CASE WHEN (elem->>'hubId')::int = $1
               THEN jsonb_set(elem, '{hubId}', to_jsonb($2::int))
               ELSE elem
             END
           )
           FROM jsonb_array_elements(hubs) AS elem
         )
         WHERE hubs @> jsonb_build_array(jsonb_build_object('hubId', $1))`,
        [duplicateId, canonicalId],
      );

      await pool.query(
        `UPDATE hubs SET cancelled_at = NOW() WHERE hub_id = $1 AND cancelled_at IS NULL`,
        [duplicateId],
      );
    }

    console.log(`[dedupeHubs] Merged ${canonicalByDuplicateId.size} duplicate hub row(s) into their originals.`);
  } catch (err) {

    console.error('[dedupeHubs] Skipped due to error:', err.message);
  }
}

module.exports = { dedupeHubs };
