const calculateMetrics = require('./metrics');

const fakeResults = Array.from({ length: 20 }, (_, i) => ({
  durationMs: i < 18 ? 100 + Math.random() * 50 : 2000 + Math.random() * 500,
  success: true,
}));

const fakeTotalDurationMs = 1000; // pretend the whole test took 1 second

console.log(calculateMetrics(fakeResults, fakeTotalDurationMs));