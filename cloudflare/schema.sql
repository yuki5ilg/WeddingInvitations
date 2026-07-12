-- RSVP テーブル
CREATE TABLE IF NOT EXISTS rsvp (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,
  name        TEXT,
  furigana    TEXT,
  attendance  TEXT,
  birthday    TEXT,
  email       TEXT,
  allergy     TEXT,
  message     TEXT
);
