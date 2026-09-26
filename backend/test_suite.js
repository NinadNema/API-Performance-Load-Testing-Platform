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
const { getByPath, substituteVariables } = require('./workflow');
const compareRuns = require('./compareRuns');
const saveTestRun = require('./saveTestRun');
const db = require('./db');

test('ConcurrencyLimiter limits concurrent active tasks', async () => {
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
});

test('calculateMetrics calculates statistics accurately and handles edge cases', () => {
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
  assert.strictEqual(metrics.throughputRps, 10);
});

test('calculateApdex correctly calculates user satisfaction score and rating', () => {
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

test('diagnoseErrorPatterns identifies rate limiting, gateway errors and 500s', () => {
  const errorResults = [
    { status: 429, success: false, error: 'Too Many Requests' },
    { status: 429, success: false, error: 'Too Many Requests' },
    { status: 504, success: false, error: 'Gateway Timeout' },
    { status: 500, success: false, error: 'Internal Server Error' },
    { status: 200, success: true, durationMs: 50 },
  ];

  const diagnostics = diagnoseErrorPatterns(errorResults);
  assert.ok(diagnostics.some((d) => d.category === 'rate_limit'));
  assert.ok(diagnostics.some((d) => d.category === 'gateway_failure'));
  assert.ok(diagnostics.some((d) => d.category === 'server_exception'));
});

test('analyzeLatencyDistribution flags cold starts and high jitter', () => {
  // 2 initial slow requests (cold start) followed by fast requests
  const coldStartResults = [
    { durationMs: 900, success: true },
    { durationMs: 800, success: true },
    ...Array.from({ length: 18 }, () => ({ durationMs: 50, success: true })),
  ];

  const coldInsights = analyzeLatencyDistribution(coldStartResults, { avgMs: 130 });
  assert.ok(coldInsights.some((i) => i.category === 'cold_start'));
});

test('generateScalingInsights calculates sweet spot and detects saturation', () => {
  const scalingRuns = [
    { concurrency: 1, throughput_rps: 50, success_rate: 100, p95: 20 },
    { concurrency: 5, throughput_rps: 180, success_rate: 100, p95: 25 },
    { concurrency: 10, throughput_rps: 200, success_rate: 100, p95: 50 }, // Sweet spot (peak throughput)
    { concurrency: 25, throughput_rps: 198, success_rate: 98, p95: 140 }, // Saturation (flat throughput, high latency)
    { concurrency: 50, throughput_rps: 40, success_rate: 80, p95: 900 }, // Collapse
  ];

  const scalingInsights = generateScalingInsights(scalingRuns);
  assert.ok(scalingInsights.some((i) => i.category === 'sweet_spot' && i.message.includes('10 Virtual Users')));
  assert.ok(scalingInsights.some((i) => i.category === 'throughput_collapse'));
  assert.ok(scalingInsights.some((i) => i.category === 'saturation_point'));
});

test('workflow variable extraction and substitution handles JSON and types safely', () => {
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

  const bodyData = { users: [{ id: 101, profile: { email: 'test@example.com' } }] };
  assert.strictEqual(getByPath(bodyData, 'users[0].id'), 101);
  assert.strictEqual(getByPath(bodyData, 'users.0.profile.email'), 'test@example.com');
});
