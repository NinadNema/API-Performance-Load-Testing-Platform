const db = require('./db');
const saveTestRun = require('./saveTestRun');

const fakeMetrics = {
  avgMs: 124, minMs: 70, maxMs: 295,
  p50: 78, p95: 262, p99: 295,
  successRate: 100, throughputRps: 37.34,
};

const fakeResults = [
  { requestIndex: 0, durationMs: 295, status: 200, success: true },
  { requestIndex: 1, durationMs: 262, status: 200, success: true },
  { requestIndex: 2, durationMs: 74, status: 200, success: true },
];

const id = saveTestRun({
  url: 'https://jsonplaceholder.typicode.com/posts/1',
  method: 'GET',
  concurrency: 5,
  totalRequests: 3,
  totalDurationMs: 536,
  metrics: fakeMetrics,
  results: fakeResults,
});

console.log('Saved test run with ID:', id);

// Read it back to prove it actually persisted
const savedRun = db.prepare('SELECT * FROM test_runs WHERE id = ?').get(id);
const savedRequests = db.prepare('SELECT * FROM requests WHERE test_run_id = ?').all(id);

console.log('Saved run:', savedRun);
console.log('Saved requests:', savedRequests);