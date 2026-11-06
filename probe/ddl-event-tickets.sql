CREATE TABLE IF NOT EXISTS event_tickets (
  id SERIAL PRIMARY KEY,
  event_key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  ip TEXT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  UNIQUE (event_key, user_id),
  UNIQUE (event_key, device_id)
);
