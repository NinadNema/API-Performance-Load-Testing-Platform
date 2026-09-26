const db = require('./db');

const insertRunStmt = db.prepare(`
  INSERT INTO test_runs (
    url, method, concurrency, total_requests, total_duration_ms,
    avg_ms, min_ms, max_ms, p50, p95, p99, success_rate, throughput_rps, scaling_group_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertRequestStmt = db.prepare(`
  INSERT INTO requests (test_run_id, request_index, duration_ms, status, success)
  VALUES (?, ?, ?, ?, ?)
`);

const saveTransaction = db.transaction((data) => {
  const { url, method, concurrency, totalRequests, totalDurationMs, metrics, results, scalingGroupId = null } = data;

  const info = insertRunStmt.run(
    url,
    method,
    concurrency,
    totalRequests,
    totalDurationMs,
    metrics?.avgMs ?? 0,
    metrics?.minMs ?? 0,
    metrics?.maxMs ?? 0,
    metrics?.p50 ?? 0,
    metrics?.p95 ?? 0,
    metrics?.p99 ?? 0,
    metrics?.successRate ?? 0,
    metrics?.throughputRps ?? 0,
    scalingGroupId
  );

  const testRunId = info.lastInsertRowid;

  if (Array.isArray(results) && results.length > 0) {
    for (const r of results) {
      insertRequestStmt.run(
        testRunId,
        r.requestIndex ?? 0,
        r.durationMs ?? 0,
        r.status ?? null,
        r.success ? 1 : 0
      );
    }
  }

  return testRunId;
});

function saveTestRun(data) {
  return saveTransaction(data);
}

module.exports = saveTestRun;