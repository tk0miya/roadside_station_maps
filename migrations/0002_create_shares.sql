-- Migration number: 0002
-- Stores per-user share IDs for live-shared visit views.
-- Each user has at most one share id; resolving a share returns the
-- creator's current visits live (no snapshotting).

CREATE TABLE IF NOT EXISTS shares (
    share_id   TEXT    PRIMARY KEY,
    user_id    TEXT    NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shares_user ON shares (user_id);
