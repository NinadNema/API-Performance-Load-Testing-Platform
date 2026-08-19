function calculateMetrics(results) {
  const durations = results.map(r => r.durationMs);
  const successCount = results.filter((r) => r.success).length;
  const errorCount = results.length - successCount;

  const sum = durations.reduce((total, d) => total + d, 0);
  const avgMs = sum / durations.length;

  const minMs = Math.min(...durations);
  const maxMs = Math.max(...durations);

  return {
    totalRequests: results.length,
    successCount,
    errorCount, 
    successRate: (successCount / results.length) * 100,
    avgMs: Math.round(avgMs),
    minMs,
    maxMs,
  };
}

module.exports = calculateMetrics;
