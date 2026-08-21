const pool = require('../config/pgPool');

async function ensureSchema() {
  await pool.query(`
    -- ================= users (auth identity) =================
    -- is_default: TRUE = still on the system/default password, FALSE =
    -- user has set their own (flipped by User.updatePassword()).
    CREATE TABLE IF NOT EXISTS users (
      user_id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name                 TEXT NOT NULL,
      email                TEXT NOT NULL UNIQUE,
      password             TEXT NOT NULL,
      is_default           BOOLEAN NOT NULL DEFAULT TRUE,
      role                 TEXT NOT NULL DEFAULT 'OPERATOR' CHECK (role IN ('OPERATOR','ADMIN')),
      two_factor_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ,
      updated_by           INTEGER,
      deactivated_at       TIMESTAMPTZ,
      deactivated_by       INTEGER
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT TRUE;

    -- ================= password_reset_tokens =================
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      token_hash   TEXT NOT NULL UNIQUE,
      expires_at   TIMESTAMPTZ NOT NULL,
      used         BOOLEAN NOT NULL DEFAULT FALSE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);

    -- ================= auth_tokens (session / refresh-token store) =================
    -- Kept as its own table — the token-expiry requirement (section 2 of
    -- the workflow doc) needs a real expires_at row per session, checked
    -- by authMiddleware AND swept by cron/tokenCleanupCron.js.
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id        INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      token_hash     TEXT NOT NULL UNIQUE,
      expires_at     TIMESTAMPTZ NOT NULL,
      revoked_at     TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);

    -- ================= vehicles (MASTER TABLE 1) =================
    CREATE TABLE IF NOT EXISTS vehicles (
      vehicle_id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      plate_number     TEXT NOT NULL UNIQUE,
      vehicle_type     TEXT,
      capacity_kg      DOUBLE PRECISION,
      fuel_type        TEXT,
      gps_device       TEXT,
      gps_device_no    TEXT UNIQUE,
      current_status   TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (current_status IN ('RUNNING','IDLE','OFFLINE','UNKNOWN')),
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by       INTEGER,
      updated_at       TIMESTAMPTZ,
      updated_by       INTEGER,
      cancelled_at     TIMESTAMPTZ,
      cancelled_by     INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_vehicles_gps_device_no ON vehicles(gps_device_no);

    -- ================= places (MASTER TABLE 2) =================
    -- deleted_at/deleted_by: soft-delete, same pattern as vehicles.
    -- DELETE /places/:id must NEVER hard-delete a place, since a place's
    -- id can be sitting inside routes.hubs (JSONB) — hard-deleting it
    -- would leave that reference pointing at nothing.
    CREATE TABLE IF NOT EXISTS places (
      place_id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      place_name         TEXT NOT NULL,
      coordinates        JSONB NOT NULL,
      place_type         TEXT NOT NULL DEFAULT 'OTHER',
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by         INTEGER,
      updated_at         TIMESTAMPTZ,
      updated_by         INTEGER,
      deleted_at         TIMESTAMPTZ,
      deleted_by         INTEGER
    );
    -- Migration guard: DBs created before these columns existed just get
    -- them added, nothing destructive. Safe to run every boot.
    ALTER TABLE places ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE places ADD COLUMN IF NOT EXISTS deleted_by INTEGER;
    ALTER TABLE places ALTER COLUMN deleted_at DROP DEFAULT;
    CREATE INDEX IF NOT EXISTS idx_places_type ON places(place_type);
    CREATE INDEX IF NOT EXISTS idx_places_lat ON places(((coordinates->>'lat')::double precision));
    CREATE INDEX IF NOT EXISTS idx_places_lng ON places(((coordinates->>'lng')::double precision));

    -- ================= hubs (curated master list — fuel stops, rest
    -- areas, service centres, etc.) =================
    -- Separate from 'places' on purpose: places are generic named points
    -- (source/destination search results, anything picked from the map).
    -- hubs are a maintained master list an ADMIN/OPERATOR curates
    -- specifically to be offered as route stopovers, each with its own
    -- type + a geofence radius (radius_meters) used later for
    -- deviation/stop alerting around that hub. Never hard-deleted for the
    -- same reason as places: a hub_id can be sitting inside routes.hubs
    -- (JSONB) — removing the row would leave that reference dangling.
    CREATE TABLE IF NOT EXISTS hubs (
      hub_id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name               TEXT NOT NULL,
      type               TEXT NOT NULL DEFAULT 'OTHER',
      coordinates        JSONB NOT NULL,
      radius_meters      DOUBLE PRECISION NOT NULL DEFAULT 300,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by         INTEGER,
      updated_at         TIMESTAMPTZ,
      updated_by         INTEGER,
      cancelled_at       TIMESTAMPTZ,
      cancelled_by       INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_hubs_type ON hubs(type);
    CREATE INDEX IF NOT EXISTS idx_hubs_lat ON hubs(((coordinates->>'lat')::double precision));
    CREATE INDEX IF NOT EXISTS idx_hubs_lng ON hubs(((coordinates->>'lng')::double precision));

    -- ================= trip_planning (mirrors client ERP data) =================
    -- trip_planning_id is FleetWatch's own internal, auto-increment id --
    -- used by every FleetWatch API (assign-vehicle, get-by-id, and later
    -- by trips.trip_planning_id).
    -- erp_reference_id: the ERP's OWN id for this planning record, sent
    -- by the client on every sync call. UNIQUE so Postgres itself
    -- enforces "one row per ERP trip" -- this is what upsert() below
    -- matches on to decide INSERT (new erp_reference_id) vs UPDATE
    -- (erp_reference_id already exists). Nullable, because older/manual
    -- rows may not have one.
    CREATE TABLE IF NOT EXISTS trip_planning (
      trip_planning_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      erp_reference_id     TEXT UNIQUE,
      trip_name           TEXT,
      src_coords          JSONB NOT NULL,
      dest_coords         JSONB NOT NULL,
      plate_number        TEXT REFERENCES vehicles(plate_number),
      hubs                 JSONB NOT NULL DEFAULT '[]',
      status               TEXT NOT NULL DEFAULT 'PLANNED',
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by           INTEGER,
      updated_at           TIMESTAMPTZ,
      updated_by           INTEGER,
      cancelled_at         TIMESTAMPTZ,
      cancelled_by         INTEGER
    );
    -- Migration guard: DBs created before this column existed just get it
    -- added, nothing destructive. Safe to run every boot.
    ALTER TABLE trip_planning ADD COLUMN IF NOT EXISTS erp_reference_id TEXT;
    -- Same guard for cancelled_at/cancelled_by/updated_at/updated_by —
    -- databases created before these existed were missing them entirely,
    -- which broke every query that referenced tp.cancelled_at (list,
    -- remove/soft-cancel, the active-vehicle-conflict check).
    ALTER TABLE trip_planning ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    ALTER TABLE trip_planning ADD COLUMN IF NOT EXISTS updated_by INTEGER;
    ALTER TABLE trip_planning ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
    ALTER TABLE trip_planning ADD COLUMN IF NOT EXISTS cancelled_by INTEGER;
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'trip_planning_erp_reference_id_key'
      ) THEN
        ALTER TABLE trip_planning ADD CONSTRAINT trip_planning_erp_reference_id_key UNIQUE (erp_reference_id);
      END IF;
    END $$;
    CREATE INDEX IF NOT EXISTS idx_trip_planning_plate_number ON trip_planning(plate_number);
    CREATE INDEX IF NOT EXISTS idx_trip_planning_erp_reference_id ON trip_planning(erp_reference_id);

    -- ================= routes (MASTER TABLE 3) =================
    -- Reference/master data, same role as vehicles and places: trips
    -- points to a route via route_id (foreign key), the same way
    -- trip_planning points to vehicles via plate_number. Rows here are
    -- reusable route definitions (auto-populated from Google/Mappls on
    -- first search, then reused/counted via times_used), not timestamped
    -- events — so by relationship and role it's a master table, not a
    -- transaction table, even though it's not manually entered by a user.
    -- dist replaces distance_meters (distance in meters). is_delete is
    -- the new soft-delete flag — replaces cancelled_at/cancelled_by for
    -- this table. duration_seconds was originally dropped alongside
    -- distance_meters, but the Excel sheet's note on Search Routes
    -- ("share the routematrix in the response") calls for both distance
    -- AND duration together — so it's back as its own column.
    CREATE TABLE IF NOT EXISTS routes (
      route_id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      src_coords           JSONB NOT NULL,
      dest_coords          JSONB NOT NULL,
      route_label          TEXT NOT NULL DEFAULT 'RECOMMENDED',
      route_geometry       JSONB NOT NULL,
      hubs                 JSONB NOT NULL DEFAULT '[]',
      dist                 DOUBLE PRECISION,
      duration_seconds     DOUBLE PRECISION,
      toll_info            JSONB,
      times_used           INTEGER NOT NULL DEFAULT 0,
      last_used_at         TIMESTAMPTZ,
      is_delete            BOOLEAN NOT NULL DEFAULT FALSE,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by           INTEGER
    );
    -- Guard for a routes table that already existed before duration_seconds
    -- was added back — same ADD COLUMN IF NOT EXISTS pattern used
    -- elsewhere in this file (trip_planning.erp_reference_id etc.).
    ALTER TABLE routes ADD COLUMN IF NOT EXISTS duration_seconds DOUBLE PRECISION;
    CREATE INDEX IF NOT EXISTS idx_routes_src_lat ON routes(((src_coords->>'lat')::double precision));
    CREATE INDEX IF NOT EXISTS idx_routes_src_lng ON routes(((src_coords->>'lng')::double precision));
    CREATE INDEX IF NOT EXISTS idx_routes_dst_lat ON routes(((dest_coords->>'lat')::double precision));
    CREATE INDEX IF NOT EXISTS idx_routes_dst_lng ON routes(((dest_coords->>'lng')::double precision));

    -- ================= trips =================
    CREATE TABLE IF NOT EXISTS trips (
      trip_id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      trip_planning_id       INTEGER NOT NULL REFERENCES trip_planning(trip_planning_id),
      route_id               INTEGER NOT NULL REFERENCES routes(route_id),
      trip_name               TEXT,
      status                 TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','ONGOING','COMPLETED','CANCELLED')),
      curr_coords            JSONB,
      hub_ids                INTEGER[] NOT NULL DEFAULT '{}',
      notifications           JSONB NOT NULL DEFAULT '{"deviation_alert": true, "delay_alert": true, "stoppage_alert": false, "gps_offline_alert": true, "destination_alert": true, "emergency_alert": true}',
      started_at             TIMESTAMPTZ,
      completed_at           TIMESTAMPTZ,
      cancelled_at           TIMESTAMPTZ,
      cancelled_by           INTEGER,
      cancellation_reason    TEXT,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by             INTEGER,
      updated_at             TIMESTAMPTZ,
      updated_by             INTEGER
    );
    -- Migration guard: DBs created before hub_ids/trip_name/notifications
    -- existed just get them added, nothing destructive. Safe to run every
    -- boot.
    -- hub_ids is the trip's own selected-hub list — directly queryable
    -- off trips (e.g. "trips passing through hub X":
    -- WHERE $1 = ANY(hub_ids)) without joining through routes. It also
    -- feeds services/geoAlertService.js's isAuthorizedStop() so a stop at
    -- any of these hubs never raises an UNAUTHORIZED_STOP alert.
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS hub_ids INTEGER[] NOT NULL DEFAULT '{}';
    -- trip_name / notifications: added per the documented Create Trip
    -- payload — { tripName, tripPlanningId, routeId, notifications, hubs }.
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS trip_name TEXT;
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS notifications JSONB NOT NULL DEFAULT '{"deviation_alert": true, "delay_alert": true, "stoppage_alert": false, "gps_offline_alert": true, "destination_alert": true, "emergency_alert": true}';
    -- Backfill: rows written before gps_offline_alert/destination_alert/
    -- emergency_alert existed keep working (a missing key reads as
    -- undefined -> treated as "on" by the alert engine anyway), but this
    -- makes it explicit/queryable for old rows too.
    UPDATE trips SET notifications = notifications
      || '{"gps_offline_alert": true}'::jsonb
      || '{"destination_alert": true}'::jsonb
      || '{"emergency_alert": true}'::jsonb
      WHERE NOT (notifications ? 'gps_offline_alert')
         OR NOT (notifications ? 'destination_alert')
         OR NOT (notifications ? 'emergency_alert');
    CREATE INDEX IF NOT EXISTS idx_trips_hub_ids ON trips USING GIN (hub_ids);
    CREATE INDEX IF NOT EXISTS idx_trips_planning ON trips(trip_planning_id);
    CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);

    -- ================= alerts =================
    -- Only ONE coordinate column: the point that triggered the alert.
    -- No source/destination copy here — that lives on trip_planning and
    -- is reached by joining trip_id -> trips -> trip_planning.
    CREATE TABLE IF NOT EXISTS alerts (
      alert_id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      trip_id                  INTEGER NOT NULL REFERENCES trips(trip_id),
      gps_device_no            TEXT NOT NULL REFERENCES vehicles(gps_device_no),
      alert_type               TEXT NOT NULL CHECK (alert_type IN ('DEVIATION','UNAUTHORIZED_STOP','DELAY','OFFLINE','DESTINATION_REACHED','EMERGENCY')),
      coordinates               JSONB,
      -- Human-readable "why" (e.g. "0.62 km off the selected route
      -- (limit 0.50 km)") + the structured numbers behind it. Every alert
      -- the engine raises now fills both in (services/geoAlertService.js)
      -- so a dashboard/operator sees a real explanation, not just a type
      -- + a dot on a map.
      reason                    TEXT,
       -- WRONG: operator marked this alert as a false positive via
      -- POST /alerts/:id/wrong — that same coordinate is then saved into
      -- places (see Alert.markWrong / alertController.markWrong) so the
      -- automatic engine in services/geoAlertService.js recognizes it as
      -- a known/authorized spot and never raises it again.
      status                   TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RESOLVED','WRONG')),
      resolved_at              TIMESTAMPTZ,
      resolved_by              INTEGER,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_trip ON alerts(trip_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_gps_device_no ON alerts(gps_device_no);
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);

    -- Migration guard: a DB created before the WRONG status existed still
    -- has the old 2-value CHECK constraint baked in. Safe to run every
    -- boot — DROP IF EXISTS + re-ADD is a no-op once it's already current.
    ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_status_check;
    ALTER TABLE alerts ADD CONSTRAINT alerts_status_check CHECK (status IN ('PENDING','RESOLVED','WRONG'));

    -- Same guard for alert_type, now that EMERGENCY (driver panic button,
    -- see POST /tracking/emergency) is a valid type too.
    ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_alert_type_check;
    ALTER TABLE alerts ADD CONSTRAINT alerts_alert_type_check
      CHECK (alert_type IN ('DEVIATION','UNAUTHORIZED_STOP','DELAY','OFFLINE','DESTINATION_REACHED','EMERGENCY'));

    -- Additive migration: a DB from before reason/meta existed just gets
    -- the two columns added, nothing destructive. ADD COLUMN IF NOT
    -- EXISTS is natively idempotent, no drop/re-add dance needed here.
    ALTER TABLE alerts ADD COLUMN IF NOT EXISTS reason TEXT;
    ALTER TABLE alerts ADD COLUMN IF NOT EXISTS meta JSONB;
  `);

  console.log('[schema] all tables are ready — master: vehicles, places, routes | transaction: users, password_reset_tokens, auth_tokens, trip_planning, trips, alerts.');
}

module.exports = { ensureSchema };
