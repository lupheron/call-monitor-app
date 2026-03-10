import Database from 'better-sqlite3';

const db = new Database('calls.db', { verbose: console.log });
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    call_id TEXT UNIQUE NOT NULL,
    from_number TEXT,
    to_number TEXT,
    direction TEXT,
    result TEXT,
    user_extension TEXT,
    start_time TEXT,
    duration INTEGER,
    recording_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  -- Indexes for fast querying
  CREATE INDEX IF NOT EXISTS idx_start_time ON calls (start_time);
  CREATE INDEX IF NOT EXISTS idx_user_extension ON calls (user_extension);
`);

export default db;
