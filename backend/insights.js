function generateInsights(metrics, baselineMetrics = null) {
  const insights = [];

  if (metrics.p95 > 1000) {
    insights.push({
      level: 'warning',
      message: `P95 latency is ${Math.round(metrics.p95)}ms — above the 1000ms threshold typically considered acceptable for APIs.`,
    });
  }

  if (metrics.successRate < 99) {
    insights.push({
      level: 'error',
      message: `Success rate is ${metrics.successRate.toFixed(1)}% — ${metrics.errorCount} out of ${metrics.totalRequests} requests failed.`,
    });
  }

  if (metrics.p50 > 0 && (metrics.p99 - metrics.p50) > metrics.p50 * 3) {
    insights.push({
      level: 'warning',
      message: `Large gap between P50 (${Math.round(metrics.p50)}ms) and P99 (${Math.round(metrics.p99)}ms) — some requests are much slower than typical, suggesting inconsistent performance.`,
    });
  }

  if (baselineMetrics && baselineMetrics.p95 > 0) {
    const p95Change = ((metrics.p95 - baselineMetrics.p95) / baselineMetrics.p95) * 100;
    if (p95Change > 20) {
      insights.push({
        level: 'error',
        message: `P95 latency degraded ${p95Change.toFixed(1)}% compared to the baseline run.`,
      });
    } else if (p95Change < -20) {
      insights.push({
        level: 'success',
        message: `P95 latency improved ${Math.abs(p95Change).toFixed(1)}% compared to the baseline run.`,
      });
    }
  }

  if (insights.length === 0) {
    insights.push({ level: 'success', message: 'No performance issues detected.' });
  }

  return insights;
}

function generateScalingInsights(runs) {
  const insights = [];

  if (runs.length < 2) return insights; 

  for (let i = 1; i < runs.length; i++) {
    const prev = runs[i - 1];
    const curr = runs[i];

    const throughputChange = prev.throughput_rps > 0
      ? ((curr.throughput_rps - prev.throughput_rps) / prev.throughput_rps) * 100
      : 0;

    if (throughputChange < -20) {
      insights.push({
        level: 'error',
        message: `Throughput dropped ${Math.abs(throughputChange).toFixed(1)}% when concurrency increased from ${prev.concurrency} to ${curr.concurrency} — likely a bottleneck or rate limit around concurrency ${curr.concurrency}.`,
      });
    }

    if (curr.success_rate < prev.success_rate) {
      insights.push({
        level: 'warning',
        message: `Success rate dropped from ${prev.success_rate}% to ${curr.success_rate}% at concurrency ${curr.concurrency} — the API may be struggling under this load level.`,
      });
    }
  }

  if (insights.length === 0) {
    insights.push({ level: 'success', message: 'Performance scaled cleanly across all tested concurrency levels.' });
  }

  return insights;
}

module.exports = { generateInsights, generateScalingInsights };