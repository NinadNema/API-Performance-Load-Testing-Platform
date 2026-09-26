const test = require('node:test');
const assert = require('node:assert');
const ConcurrencyLimiter = require('./concurrencyLimiter');
const calculateMetrics = require('./metrics');
const {
  calculateApdex,
  diagnoseErrorPatterns,
  analyzeLatencyDistribution,
  generateInsights,
  generateScalingInsights,
} = require('./insights');
const { getByPath, substituteVariables, runWorkflow } = require('./workflow');
const compareRuns = require('./compareRuns');
const saveTestRun = require('./saveTestRun');
const runLoadTest = require('./loadTestRunner');
const runScalingTest = require('./scalingTest');
const db = require('./db');

test('1. ConcurrencyLimiter: limits concurrent active tasks and handles synchronous exceptions', async () => {
  const limiter = new ConcurrencyLimiter(2);
  let active = 0;
  let maxActive = 0;

  const tasks = Array.from({ length: 6 }, () =>
    limiter.run(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
    })
  );

  await Promise.all(tasks);
  assert.strictEqual(maxActive, 2);
  assert.strictEqual(active, 0);

  // Verify limiter handles sync exception without deadlocking
  try {
    await limiter.run(() => {
      throw new Error('Sync error inside task');
    });
  } catch (err) {
    assert.strictEqual(err.message, 'Sync error inside task');
  }
  assert.strictEqual(limiter.active, 0);
});

test('2. calculateMetrics: calculates statistics, percentiles, throughput and handles edge cases', () => {
  const empty = calculateMetrics([], 1000);
  assert.strictEqual(empty.totalRequests, 0);
  assert.strictEqual(empty.avgMs, 0);
  assert.strictEqual(empty.p95, 0);

  const results = [
    { durationMs: 10, success: true },
    { durationMs: 20, success: true },
    { durationMs: 30, success: true },
    { durationMs: 40, success: true },
    { durationMs: 100, success: false },
  ];

  const metrics = calculateMetrics(results, 500);
  assert.strictEqual(metrics.totalRequests, 5);
  assert.strictEqual(metrics.successCount, 4);
  assert.strictEqual(metrics.errorCount, 1);
  assert.strictEqual(metrics.successRate, 80);
  assert.strictEqual(metrics.avgMs, 40);
  assert.strictEqual(metrics.minMs, 10);
  assert.strictEqual(metrics.maxMs, 100);
  assert.strictEqual(metrics.p50, 30);
  assert.strictEqual(metrics.p95, 100);
  assert.strictEqual(metrics.p99, 100);
  assert.strictEqual(metrics.throughputRps, 10);
});

test('3. calculateApdex: evaluates user satisfaction score, counts, and ratings', () => {
  const results = [
    { durationMs: 100, success: true }, // satisfied (<=250)
    { durationMs: 200, success: true }, // satisfied
    { durationMs: 500, success: true }, // tolerating (250 < t <= 1000)
    { durationMs: 1200, success: true }, // frustrated (> 1000)
    { durationMs: 50, success: false }, // frustrated (failed)
  ];

  const apdex = calculateApdex(results, 250);
  // score = (2 + 1/2) / 5 = 2.5 / 5 = 0.50
  assert.strictEqual(apdex.score, 0.5);
  assert.strictEqual(apdex.rating, 'Poor');
  assert.strictEqual(apdex.satisfied, 2);
  assert.strictEqual(apdex.tolerating, 1);
  assert.strictEqual(apdex.frustrated, 2);
});

test('4. diagnoseErrorPatterns: categorizes 429 rate limit, 502/504 gateway, 500, and network drops', () => {
  const errorResults = [
    { status: 429, success: false, error: 'Too Many Requests' },
    { status: 429, success: false, error: 'Too Many Requests' },
    { status: 504, success: false, error: 'Gateway Timeout' },
    { status: 500, success: false, error: 'Internal Server Error' },
    { status: null, success: false, error: 'ETIMEDOUT: Connection timed out' },
    { status: 200, success: true, durationMs: 50 },
  ];

  const diagnostics = diagnoseErrorPatterns(errorResults);
  assert.ok(diagnostics.some((d) => d.category === 'rate_limit'));
  assert.ok(diagnostics.some((d) => d.category === 'gateway_failure'));
  assert.ok(diagnostics.some((d) => d.category === 'server_exception'));
  assert.ok(diagnostics.some((d) => d.category === 'network_timeout'));
});

test('5. analyzeLatencyDistribution: detects serverless cold starts and latency jitter', () => {
  // Cold start pattern: first 2 requests slow, remaining 18 fast
  const coldStartResults = [
    { durationMs: 950, success: true },
    { durationMs: 850, success: true },
    ...Array.from({ length: 18 }, () => ({ durationMs: 40, success: true })),
  ];

  const coldInsights = analyzeLatencyDistribution(coldStartResults, { avgMs: 125 });
  assert.ok(coldInsights.some((i) => i.category === 'cold_start'));
});

test('6. generateInsights: comprehensive rule evaluation & baseline comparisons', () => {
  const badMetrics = {
    p95: 1500,
    p50: 100,
    p99: 1800,
    successRate: 95,
    errorCount: 5,
    totalRequests: 100,
  };

  const insights = generateInsights(badMetrics);
  assert.ok(insights.some((i) => i.level === 'warning' && i.category === 'high_latency'));
  assert.ok(insights.some((i) => i.level === 'error' && i.category === 'low_availability'));
  assert.ok(insights.some((i) => i.level === 'warning' && i.category === 'tail_latency_gap'));

  // Baseline comparison
  const baselineMetrics = { p95: 500 };
  const regressionInsights = generateInsights({ ...badMetrics, p95: 1000 }, baselineMetrics);
  assert.ok(regressionInsights.some((i) => i.category === 'regression'));
});

test('7. generateScalingInsights: finds sweet spot, flags saturation & collapses', () => {
  const scalingRuns = [
    { concurrency: 1, throughput_rps: 50, success_rate: 100, p95: 20 },
    { concurrency: 5, throughput_rps: 180, success_rate: 100, p95: 25 },
    { concurrency: 10, throughput_rps: 200, success_rate: 100, p95: 50 }, // Sweet spot
    { concurrency: 25, throughput_rps: 198, success_rate: 98, p95: 140 }, // Saturation
    { concurrency: 50, throughput_rps: 40, success_rate: 80, p95: 900 }, // Collapse
  ];

  const scalingInsights = generateScalingInsights(scalingRuns);
  assert.ok(scalingInsights.some((i) => i.category === 'sweet_spot' && i.message.includes('10 Virtual Users')));
  assert.ok(scalingInsights.some((i) => i.category === 'throughput_collapse'));
  assert.ok(scalingInsights.some((i) => i.category === 'saturation_point'));
});

test('8. workflow: variable extraction, interpolation, and multi-step execution', async () => {
  const context = { token: 'secret"with"quotes', id: 42, user: { name: 'Alice' } };
  const template = {
    url: 'https://api.com/users/{{id}}',
    auth: 'Bearer {{token}}',
    rawId: '{{id}}',
  };

  const resolved = substituteVariables(template, context);
  assert.strictEqual(resolved.url, 'https://api.com/users/42');
  assert.strictEqual(resolved.auth, 'Bearer secret"with"quotes');
  assert.strictEqual(resolved.rawId, 42);

  const bodyData = {
    users: [{ id: 101, profile: { email: 'test@example.com' } }],
    Headers: { Authorization: 'Bearer abc' },
  };
  assert.strictEqual(getByPath(bodyData, 'users[0].id'), 101);
  assert.strictEqual(getByPath(bodyData, 'users.0.profile.email'), 'test@example.com');
  assert.strictEqual(getByPath(bodyData, 'headers.authorization'), 'Bearer abc');

  // Test runWorkflow with mockable public test endpoint
  const wfResult = await runWorkflow([
    {
      name: 'Step 1: Get Post',
      request: { method: 'GET', url: 'https://jsonplaceholder.typicode.com/posts/1' },
      extract: { userId: 'body.userId' },
    },
    {
      name: 'Step 2: Get User',
      request: { method: 'GET', url: 'https://jsonplaceholder.typicode.com/users/{{userId}}' },
      extract: { username: 'body.username' },
    },
  ]);

  assert.strictEqual(wfResult.steps.length, 2);
  assert.strictEqual(wfResult.steps[0].success, true);
  assert.strictEqual(wfResult.steps[1].success, true);
  assert.strictEqual(wfResult.context.userId, 1);
  assert.ok(wfResult.context.username);
});

test('9. saveTestRun & compareRuns: SQLite transaction and metric diff engine', () => {
  const metricsA = {
    avgMs: 100, minMs: 50, maxMs: 200,
    p50: 80, p95: 150, p99: 190,
    successRate: 100, throughputRps: 50,
  };
  const resultsA = [
    { requestIndex: 0, durationMs: 80, status: 200, success: true },
    { requestIndex: 1, durationMs: 120, status: 200, success: true },
  ];

  const runIdA = saveTestRun({
    url: 'https://api.example.com/test',
    method: 'GET',
    concurrency: 5,
    totalRequests: 2,
    totalDurationMs: 40,
    metrics: metricsA,
    results: resultsA,
  });
  assert.ok(runIdA > 0);

  const metricsB = {
    avgMs: 60, minMs: 30, maxMs: 120,
    p50: 50, p95: 90, p99: 110,
    successRate: 100, throughputRps: 80,
  };
  const resultsB = [
    { requestIndex: 0, durationMs: 50, status: 200, success: true },
    { requestIndex: 1, durationMs: 70, status: 200, success: true },
  ];

  const runIdB = saveTestRun({
    url: 'https://api.example.com/test',
    method: 'GET',
    concurrency: 5,
    totalRequests: 2,
    totalDurationMs: 25,
    metrics: metricsB,
    results: resultsB,
  });
  assert.ok(runIdB > 0);

  // Read back and compare
  const comp = compareRuns(runIdA, runIdB);
  assert.strictEqual(comp.comparison.p95.verdict, 'improved');
  assert.strictEqual(comp.comparison.throughput_rps.verdict, 'improved');

  // Verify deletion cleanup
  const delStmt = db.prepare('DELETE FROM requests WHERE test_run_id = ?');
  const delRunStmt = db.prepare('DELETE FROM test_runs WHERE id = ?');
  delStmt.run(runIdA);
  delRunStmt.run(runIdA);
  delStmt.run(runIdB);
  delRunStmt.run(runIdB);
});

test('10. loadTestRunner: executes concurrent HTTP requests with progress tracking', async () => {
  let progressCount = 0;
  const results = await runLoadTest({
    url: 'https://jsonplaceholder.typicode.com/posts/1',
    method: 'GET',
    concurrency: 3,
    totalRequests: 5,
    onProgress: (_, completed, total) => {
      progressCount = completed;
      assert.strictEqual(total, 5);
    },
  });

  assert.strictEqual(results.length, 5);
  assert.strictEqual(progressCount, 5);
  assert.strictEqual(results[0].success, true);
  assert.strictEqual(results[0].status, 200);
});
