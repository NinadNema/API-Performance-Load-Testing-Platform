const runLoadTest = require('./loadTestRunner');
const calculateMetrics = require('./metrics');
const saveTestRun = require('./saveTestRun');
const { generateScalingInsights } = require('./insights');

async function runScalingTest({ url, method = 'GET', totalRequestsPerLevel, concurrencyLevels, headers = {}, body = null, timeout = 10000 }) {
  const scalingGroupId = `scale-${Date.now()}`; 
  const runs = [];

  for (const concurrency of concurrencyLevels) {
    const start = performance.now();
    const results = await runLoadTest({
      url,
      method,
      concurrency,
      totalRequests: totalRequestsPerLevel,
      headers,
      body,
      timeout,
    });
    const totalDurationMs = performance.now() - start;
    const metrics = calculateMetrics(results, totalDurationMs);

    const testRunId = saveTestRun({
      url,
      method,
      concurrency,
      totalRequests: totalRequestsPerLevel,
      totalDurationMs: Math.round(totalDurationMs),
      metrics,
      results,
      scalingGroupId,
    });

    runs.push({ testRunId, concurrency, metrics });
  }

  const insights = generateScalingInsights(runs);

  return { scalingGroupId, runs, insights };
}

module.exports = runScalingTest;