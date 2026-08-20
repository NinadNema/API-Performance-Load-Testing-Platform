const db = require('./db');

function saveTestRun({ url, method, concurrency, totalRequests, totalDurationMs, metrics, results }){
    const insertRun = db.prepare(`
        INSERT INTO test_runs (
            url, method, concurrency, total_requests, total_duration_ms, avg_ms, min_ms, max_ms, p50, p95, p99, success_rate, throughput_rps
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const info = insertRun.run(
            url, method, concurrency, totalRequests, totalDurationMs, metrics.avgMs, metrics.minMs, metrics.maxMs, metrics.p50, metrics.p95, metrics.p99, metrics.successRate, metrics.throughputRps
        );

        const testRunId = info.lastInsertRowid;

        const insertRequest = db.prepare(`
            INSERT INTO requests (test_run_id, request_index, duration_ms, status, success)
            VALUES (?, ?, ?, ?, ?)
        `);

        for (const r of results){
            insertRequest.run(testRunId, r.requestIndex, r.durationMs, r.status, r.success ? 1 : 0);
        }

        return testRunId;
}

module.exports = saveTestRun;