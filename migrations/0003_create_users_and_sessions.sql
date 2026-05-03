-- Migration number: 0003
-- Tables for the authorization-code login flow:
--   users    - one row per Google account, stores Google's refresh_token
--   sessions - opaque server-side session ids referenced by the refreshToken JWT
--              so we can revoke a session and detect long-idle ones.

CREATE TABLE IF NOT EXISTS users (
    user_id                  TEXT    PRIMARY KEY,
    google_refresh_token     TEXT    NOT NULL,
    google_refresh_updated_at INTEGER NOT NULL,
    created_at               INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    sid           TEXT    PRIMARY KEY,
    user_id       TEXT    NOT NULL,
    created_at    INTEGER NOT NULL,
    last_used_at  INTEGER NOT NULL,
    revoked_at    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
