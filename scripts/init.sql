CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_super INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO users (username, password_hash, is_super, created_at, updated_at)
VALUES (
  'admin',
  '$pbkdf2-sha256$29000$g5Ay5pxzjvH.PwfAOKf03g$liovv6UJAKXVLL4gbVoeFE4xPSs6voDx7ezdqPVR.3U',
  1,
  NOW(),
  NOW()
)
ON CONFLICT (username) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  is_super = EXCLUDED.is_super,
  updated_at = EXCLUDED.updated_at;

