const axios = require("axios");
const ConcurrencyLimiter = require("./concurrencyLimiter");

async function runLoadTest({ url, method = 'GET', concurrency, totalRequests, onProgress }) {
  const limiter = new ConcurrencyLimiter(concurrency);
  const results = [];

  const tasks = Array.from({ length: totalRequests }, (_, i) =>
    limiter.run(async () => {
      const start = performance.now();
      try {
        const response = await axios({
          method, url, timeout: 10000, validateStatus: () => true,
        });
        const durationMs = performance.now() - start;

        const result = {
          requestIndex: i,
          durationMs: Math.round(durationMs),
          status: response.status,
          success: response.status < 400,
        };
        results.push(result);
        if (onProgress) onProgress(result, results.length, totalRequests); // NEW
      } catch (err) {
        const durationMs = performance.now() - start;
        const result = {
          requestIndex: i,
          durationMs: Math.round(durationMs),
          status: null,
          success: false,
          error: err.message,
        };
        results.push(result);
        if (onProgress) onProgress(result, results.length, totalRequests); // NEW
      }
    })
  );

  await Promise.allSettled(tasks);
  return results;
}

module.exports = runLoadTest;
