function calculateApdex(results, targetLatencyMs = 250) {
  if (!Array.isArray(results) || results.length === 0) {
    return { score: 1.0, rating: 'Excellent', satisfied: 0, tolerating: 0, frustrated: 0, targetLatencyMs };
  }

  const t = Number(targetLatencyMs) || 250;
  const fourT = t * 4;

  let satisfied = 0;
  let tolerating = 0;
  let frustrated = 0;

  for (const r of results) {
    const duration = typeof r.durationMs === 'number' ? r.durationMs : 0;
    const isSuccess = Boolean(r.success);

    if (isSuccess && duration <= t) {
      satisfied++;
    } else if (isSuccess && duration <= fourT) {
      tolerating++;
    } else {
      frustrated++;
    }
  }

  const score = results.length > 0 ? (satisfied + tolerating / 2) / results.length : 1.0;
  const roundedScore = Math.round(score * 100) / 100;

  let rating = 'Unacceptable';
  if (roundedScore >= 0.94) rating = 'Excellent';
  else if (roundedScore >= 0.85) rating = 'Good';
  else if (roundedScore >= 0.70) rating = 'Fair';
  else if (roundedScore >= 0.50) rating = 'Poor';

  return {
    score: roundedScore,
    rating,
    satisfied,
    tolerating,
    frustrated,
    targetLatencyMs: t,
  };
}

function diagnoseErrorPatterns(results) {
  const insights = [];
  if (!Array.isArray(results) || results.length === 0) return insights;

  const statusCounts = {};
  const networkErrors = {};
  let totalErrors = 0;

  results.forEach((r) => {
    if (!r.success) {
      totalErrors++;
      if (r.status) {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      } else {
        const errType = (r.error || 'Network Error').split(':')[0].trim();
        networkErrors[errType] = (networkErrors[errType] || 0) + 1;
      }
    }
  });

  if (totalErrors === 0) return insights;

  if (statusCounts[429]) {
    insights.push({
      level: 'error',
      category: 'rate_limit',
      message: `Rate limiting (HTTP 429) triggered on ${statusCounts[429]} requests. The target server's concurrency rate limit was exceeded. Consider increasing rate limits or adding client backoff.`,
    });
  }

  const gatewayErrors = (statusCounts[502] || 0) + (statusCounts[503] || 0) + (statusCounts[504] || 0);
  if (gatewayErrors > 0) {
    insights.push({
      level: 'error',
      category: 'gateway_failure',
      message: `Upstream gateway failure (502/503/504) on ${gatewayErrors} requests. The reverse proxy or upstream backend service exhausted its connection pool or timed out.`,
    });
  }

  if (statusCounts[500]) {
    insights.push({
      level: 'error',
      category: 'server_exception',
      message: `Internal server errors (HTTP 500) occurred on ${statusCounts[500]} requests. Unhandled exceptions or database deadlocks were encountered on the application server.`,
    });
  }

  const authErrors = (statusCounts[401] || 0) + (statusCounts[403] || 0);
  if (authErrors > 0) {
    insights.push({
      level: 'warning',
      category: 'auth_failure',
      message: `Authentication/Permission failures (401/403) detected on ${authErrors} requests. Verify authorization headers and token expiration.`,
    });
  }

  const networkErrorCount = Object.values(networkErrors).reduce((a, b) => a + b, 0);
  if (networkErrorCount > 0) {
    insights.push({
      level: 'error',
      category: 'network_timeout',
      message: `Network connection drops / client timeouts on ${networkErrorCount} requests. The server dropped connections or exceeded the request timeout threshold.`,
    });
  }

  if (totalErrors >= 5 && results.length >= 20) {
    const firstHalfErrors = results.slice(0, Math.floor(results.length / 2)).filter((r) => !r.success).length;
    const secondHalfErrors = results.slice(Math.floor(results.length / 2)).filter((r) => !r.success).length;

    if (firstHalfErrors === 0 && secondHalfErrors === totalErrors) {
      insights.push({
        level: 'error',
        category: 'cascade_failure',
        message: 'Cascading failure detected: The API ran cleanly at first, then experienced a total failure collapse in the second half of the load test.',
      });
    }
  }

  return insights;
}

function analyzeLatencyDistribution(results, metrics) {
  const insights = [];
  if (!Array.isArray(results) || results.length < 10) return insights;

  const durations = results.map((r) => (typeof r.durationMs === 'number' ? r.durationMs : 0));

  const sampleSize = Math.max(2, Math.floor(results.length * 0.1));
  const warmup = durations.slice(0, sampleSize);
  const steady = durations.slice(sampleSize);

  const warmupAvg = warmup.reduce((a, b) => a + b, 0) / warmup.length;
  const steadyAvg = steady.reduce((a, b) => a + b, 0) / steady.length;

  if (warmupAvg > 200 && warmupAvg > steadyAvg * 2.5) {
    insights.push({
      level: 'warning',
      category: 'cold_start',
      message: `Cold start detected: Initial requests averaged ${Math.round(warmupAvg)}ms before settling to a steady-state average of ${Math.round(steadyAvg)}ms. Typical of serverless lambdas or JIT warmup.`,
    });
  }

  const mean = metrics.avgMs || steadyAvg || 1;
  const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 0;

  if (cv > 0.8 && durations.length >= 15) {
    insights.push({
      level: 'warning',
      category: 'high_jitter',
      message: `High latency variance / jitter (StdDev: ${Math.round(stdDev)}ms, CV: ${cv.toFixed(2)}). Latencies are highly unpredictable under load, suggesting garbage collection pauses or thread pool contention.`,
    });
  }

  const p50 = metrics.p50 || 0;
  const p95 = metrics.p95 || 0;
  const p99 = metrics.p99 || 0;

  if (p50 > 0 && p50 < 100 && p99 > 800 && p99 > p50 * 5) {
    insights.push({
      level: 'info',
      category: 'bimodal_distribution',
      message: `Bimodal latency distribution: Fast typical response (P50: ${Math.round(p50)}ms) contrasted with slow tail latency (P99: ${Math.round(p99)}ms). Suggests cache hits vs database cache misses.`,
    });
  }

  return insights;
}

function generateInsights(metrics, baselineMetrics = null, results = null, options = {}) {
  const insights = [];
  if (!metrics) return [{ level: 'info', message: 'No metrics available.' }];

  const p95 = metrics.p95 ?? 0;
  const p50 = metrics.p50 ?? 0;
  const p99 = metrics.p99 ?? 0;
  const successRate = metrics.successRate ?? 0;
  const errorCount = metrics.errorCount ?? 0;
  const totalRequests = metrics.totalRequests ?? 0;

  if (p95 > 1000) {
    insights.push({
      level: 'warning',
      category: 'high_latency',
      message: `P95 latency is ${Math.round(p95)}ms — exceeds the standard 1000ms SLA target.`,
    });
  }

  if (successRate < 99) {
    insights.push({
      level: 'error',
      category: 'low_availability',
      message: `Success rate is ${Number(successRate).toFixed(1)}% — ${errorCount} out of ${totalRequests} requests failed.`,
    });
  }

  if (p50 > 0 && (p99 - p50) > p50 * 3) {
    insights.push({
      level: 'warning',
      category: 'tail_latency_gap',
      message: `Large tail gap: P50 is ${Math.round(p50)}ms while P99 reaches ${Math.round(p99)}ms. Significant latency divergence under concurrent load.`,
    });
  }

  if (Array.isArray(results) && results.length > 0) {
    const targetLatency = options.targetLatencyMs || (p50 > 0 ? Math.max(100, Math.round(p50 * 1.5)) : 250);
    const apdex = calculateApdex(results, targetLatency);

    if (apdex.score < 0.70) {
      insights.push({
        level: 'error',
        category: 'apdex_poor',
        message: `Apdex User Experience Score: ${apdex.score} (${apdex.rating}) with target ${targetLatency}ms. ${apdex.frustrated} requests frustrated users.`,
      });
    } else if (apdex.score < 0.85) {
      insights.push({
        level: 'warning',
        category: 'apdex_fair',
        message: `Apdex User Experience Score: ${apdex.score} (${apdex.rating}) with target ${targetLatency}ms.`,
      });
    } else {
      insights.push({
        level: 'success',
        category: 'apdex_good',
        message: `Apdex User Experience Score: ${apdex.score} (${apdex.rating}) with target ${targetLatency}ms — excellent responsiveness.`,
      });
    }

    const errorInsights = diagnoseErrorPatterns(results);
    insights.push(...errorInsights);

    const latencyInsights = analyzeLatencyDistribution(results, metrics);
    insights.push(...latencyInsights);
  }

  if (baselineMetrics && baselineMetrics.p95 > 0) {
    const baseP95 = baselineMetrics.p95;
    const p95Change = ((p95 - baseP95) / baseP95) * 100;
    if (p95Change > 20) {
      insights.push({
        level: 'error',
        category: 'regression',
        message: `Performance regression: P95 latency degraded ${p95Change.toFixed(1)}% compared to the baseline run.`,
      });
    } else if (p95Change < -20) {
      insights.push({
        level: 'success',
        category: 'optimization',
        message: `Performance improved: P95 latency improved ${Math.abs(p95Change).toFixed(1)}% compared to the baseline run.`,
      });
    }
  }

  if (insights.length === 0) {
    insights.push({ level: 'success', message: 'All requests passed SLA thresholds cleanly with no performance anomalies detected.' });
  }

  const severityOrder = { error: 0, warning: 1, info: 2, success: 3 };
  insights.sort((a, b) => (severityOrder[a.level] ?? 99) - (severityOrder[b.level] ?? 99));

  return insights;
}

function generateScalingInsights(runs) {
  const insights = [];

  if (!Array.isArray(runs) || runs.length < 2) return insights;

  let maxThroughput = 0;
  let optimalRun = runs[0];
  let saturationDetected = false;

  for (let i = 0; i < runs.length; i++) {
    const curr = runs[i];
    const currThroughput = curr.throughput_rps ?? curr.metrics?.throughputRps ?? 0;
    const currSuccessRate = curr.success_rate ?? curr.metrics?.successRate ?? 100;

    if (currSuccessRate >= 98 && currThroughput > maxThroughput) {
      maxThroughput = currThroughput;
      optimalRun = curr;
    }

    if (i > 0) {
      const prev = runs[i - 1];
      const prevThroughput = prev.throughput_rps ?? prev.metrics?.throughputRps ?? 0;
      const prevSuccessRate = prev.success_rate ?? prev.metrics?.successRate ?? 100;
      const prevP95 = prev.p95 ?? prev.metrics?.p95 ?? 0;
      const currP95 = curr.p95 ?? curr.metrics?.p95 ?? 0;

      const throughputChange = prevThroughput > 0
        ? ((currThroughput - prevThroughput) / prevThroughput) * 100
        : 0;

      if (throughputChange < -20) {
        insights.push({
          level: 'error',
          category: 'throughput_collapse',
          message: `Throughput collapsed ${Math.abs(throughputChange).toFixed(1)}% (from ${prevThroughput} to ${currThroughput} req/s) when concurrency increased from ${prev.concurrency} to ${curr.concurrency} VUs — clear server bottleneck or rate limit.`,
        });
      }

      if (currSuccessRate < prevSuccessRate && (prevSuccessRate - currSuccessRate) >= 2) {
        insights.push({
          level: 'error',
          category: 'availability_drop',
          message: `Success rate dropped from ${prevSuccessRate.toFixed(1)}% to ${currSuccessRate.toFixed(1)}% at concurrency ${curr.concurrency} VUs. The server is failing under this load.`,
        });
      }

      if (prevP95 > 0 && currP95 > prevP95 * 2) {
        insights.push({
          level: 'warning',
          category: 'latency_surge',
          message: `P95 latency doubled from ${Math.round(prevP95)}ms to ${Math.round(currP95)}ms when scaling from ${prev.concurrency} to ${curr.concurrency} VUs.`,
        });
      }

      if (Math.abs(throughputChange) < 5 && currP95 > prevP95 * 1.5 && !saturationDetected) {
        saturationDetected = true;
        insights.push({
          level: 'warning',
          category: 'saturation_point',
          message: `Saturation reached at ${prev.concurrency} VUs: Increasing concurrency to ${curr.concurrency} VUs yielded zero throughput gain (${currThroughput} req/s) and only increased queue waiting latency.`,
        });
      }
    }
  }

  if (optimalRun && maxThroughput > 0) {
    insights.push({
      level: 'success',
      category: 'sweet_spot',
      message: `Optimal Concurrency Sweet Spot: ${optimalRun.concurrency} Virtual Users achieved peak stable throughput of ${maxThroughput} req/s with ${(optimalRun.metrics?.successRate ?? optimalRun.success_rate ?? 100).toFixed(1)}% success rate.`,
    });
  }

  const first = runs[0];
  const last = runs[runs.length - 1];
  const firstThroughput = first.throughput_rps ?? first.metrics?.throughputRps ?? 0;
  const lastThroughput = last.throughput_rps ?? last.metrics?.throughputRps ?? 0;
  const concurrencyMultiplier = (last.concurrency || 1) / (first.concurrency || 1);

  if (firstThroughput > 0 && concurrencyMultiplier > 1) {
    const idealThroughput = firstThroughput * concurrencyMultiplier;
    const efficiencyPct = Math.min(100, Math.round((lastThroughput / idealThroughput) * 100));

    if (efficiencyPct >= 70) {
      insights.push({
        level: 'success',
        category: 'scaling_efficiency',
        message: `High scaling efficiency: API maintained ${efficiencyPct}% linear scaling efficiency up to ${last.concurrency} concurrent users.`,
      });
    } else if (efficiencyPct < 40) {
      insights.push({
        level: 'warning',
        category: 'scaling_efficiency',
        message: `Low scaling efficiency: Scaling efficiency degraded to ${efficiencyPct}% at ${last.concurrency} VUs. Additional hardware resources or caching recommended for higher loads.`,
      });
    }
  }

  if (insights.length === 0) {
    insights.push({ level: 'success', message: 'Performance scaled cleanly across all tested concurrency levels.' });
  }

  const severityOrder = { error: 0, warning: 1, info: 2, success: 3 };
  insights.sort((a, b) => (severityOrder[a.level] ?? 99) - (severityOrder[b.level] ?? 99));

  return insights;
}

module.exports = {
  calculateApdex,
  diagnoseErrorPatterns,
  analyzeLatencyDistribution,
  generateInsights,
  generateScalingInsights,
};