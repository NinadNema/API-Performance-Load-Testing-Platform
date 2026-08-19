const calculateMetrics = require('./metrics');

const fakeResults = [
  { durationMs: 100, success: true },
  { durationMs: 200, success: true },
  { durationMs: 150, success: true },
  { durationMs: 5000, success: false }, // one slow failure, on purpose
];

console.log(calculateMetrics(fakeResults));