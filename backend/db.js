const Database = require("better-sqlite3");
const db = new Database("loadtester.db");

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        role TEXT DEFAULT 'developer',
        avatar_seed TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS test_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        url TEXT NOT NULL,
        method TEXT NOT NULL,
        concurrency INTEGER NOT NULL,
        total_requests INTEGER NOT NULL,
        total_duration_ms REAL,
        avg_ms REAL,
        min_ms REAL,
        max_ms REAL,
        p50 REAL,
        p95 REAL,
        p99 REAL,
        success_rate REAL,
        throughput_rps REAL,
        scaling_group_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_run_id INTEGER NOT NULL,
        request_index INTEGER,
        duration_ms REAL,
        status INTEGER,
        success INTEGER,
        FOREIGN KEY (test_run_id) REFERENCES test_runs(id)
    );
`);

// Safe migration for existing SQLite database files
try {
  const columns = db.prepare("PRAGMA table_info(test_runs)").all();
  const hasUserId = columns.some((c) => c.name === "user_id");
  if (!hasUserId) {
    db.exec("ALTER TABLE test_runs ADD COLUMN user_id INTEGER;");
  }
} catch (err) {
  console.warn("Migration warning for test_runs table:", err.message);
}

module.exports = db;