const Database = require("better-sqlite3");
const db = new Database("loadtester.db");

db.exec(`
    CREATE TABLE IF NOT EXISTS test_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
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

module.exports = db;