function percentile(sortedDurations, p){
    const index = Math.ceil((p / 100) * sortedDurations.length) - 1;
    return sortedDurations[Math.max(0, index)];
}

function calculateMetrics(results, totalDurationMs) {
  const durations = results.map(r => r.durationMs).sort((a, b) => a - b);
  const successCount = results.filter((r) => r.success).length;
  const errorCount = results.length - successCount;

  const sum = durations.reduce((total, d) => total + d, 0);
  const avgMs = sum / durations.length;

  const throughputRps = totalDurationMs > 0 ? (results.length / totalDurationMs) * 1000 : 0;

  return {
    totalRequests: results.length,
    successCount,
    errorCount, 
    successRate: (successCount / results.length) * 100,
    avgMs: Math.round(avgMs),
    minMs: durations[0],
    maxMs: durations[durations.length - 1],
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    p99: percentile(durations, 99),
    throughputRps: Math.round(throughputRps * 100) / 100,
  };
}

module.exports = calculateMetrics;
