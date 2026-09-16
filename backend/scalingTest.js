const runLoadTest = require('./loadTestRunner');
const calculateMetrics = require('./metrics');
const saveTestRun = require('./saveTestRun');

async function runScalingTest({ url, method = 'GET', totalRequestsPerLevel, concurrencyLevels }) {
  const scalingGroupId = `scale-${Date.now()}`; 
  const runs = [];

  for (const concurrency of concurrencyLevels) {
    const start = performance.now();
    const results = await runLoadTest({ url, method, concurrency, totalRequests: totalRequestsPerLevel });
    const totalDurationMs = performance.now() - start;
    const metrics = calculateMetrics(results, totalDurationMs);

    const testRunId = saveTestRun({
      url, method, concurrency,
      totalRequests: totalRequestsPerLevel,
      totalDurationMs: Math.round(totalDurationMs),
      metrics, results, scalingGroupId,
    });

    runs.push({ testRunId, concurrency, metrics });
  }

  return { scalingGroupId, runs };
}

module.exports = runScalingTest;