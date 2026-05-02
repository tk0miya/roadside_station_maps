-- Migration number: 0001
-- Stores per-user station visit styles. Replaces client-side cookie/localStorage.

CREATE TABLE IF NOT EXISTS visits (
    user_id    TEXT    NOT NULL,
    station_id TEXT    NOT NULL,
    style_id   INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, station_id)
);

CREATE INDEX IF NOT EXISTS idx_visits_user ON visits (user_id);
