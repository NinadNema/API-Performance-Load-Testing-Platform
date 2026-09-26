function percentile(sortedDurations, p) {
  if (!sortedDurations || sortedDurations.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedDurations.length) - 1;
  return sortedDurations[Math.max(0, Math.min(index, sortedDurations.length - 1))] ?? 0;
}

function calculateMetrics(results, totalDurationMs) {
  if (!Array.isArray(results) || results.length === 0) {
    return {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      successRate: 0,
      avgMs: 0,
      minMs: 0,
      maxMs: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      throughputRps: 0,
    };
  }

  const durations = results
    .map((r) => (typeof r.durationMs === 'number' && !isNaN(r.durationMs) ? r.durationMs : 0))
    .sort((a, b) => a - b);

  const successCount = results.filter((r) => r.success).length;
  const errorCount = results.length - successCount;

  const sum = durations.reduce((total, d) => total + d, 0);
  const avgMs = durations.length > 0 ? sum / durations.length : 0;

  const validDuration = typeof totalDurationMs === 'number' && totalDurationMs > 0 ? totalDurationMs : 0;
  const throughputRps = validDuration > 0 ? (results.length / validDuration) * 1000 : 0;

  return {
    totalRequests: results.length,
    successCount,
    errorCount,
    successRate: results.length > 0 ? Math.round(((successCount / results.length) * 100) * 100) / 100 : 0,
    avgMs: Math.round(avgMs),
    minMs: durations[0] ?? 0,
    maxMs: durations[durations.length - 1] ?? 0,
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    p99: percentile(durations, 99),
    throughputRps: Math.round(throughputRps * 100) / 100,
  };
}

module.exports = calculateMetrics;
