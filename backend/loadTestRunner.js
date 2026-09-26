const axios = require("axios");
const ConcurrencyLimiter = require("./concurrencyLimiter");

async function runLoadTest({
  url,
  method = 'GET',
  concurrency = 5,
  totalRequests = 20,
  headers = {},
  body = null,
  timeout = 10000,
  onProgress,
}) {
  const limiter = new ConcurrencyLimiter(concurrency);
  const results = [];
  let completedCount = 0;

  const tasks = Array.from({ length: totalRequests }, (_, i) =>
    limiter.run(async () => {
      const start = performance.now();
      try {
        const response = await axios({
          method,
          url,
          headers,
          data: body,
          timeout,
          validateStatus: () => true,
        });
        const durationMs = performance.now() - start;

        const result = {
          requestIndex: i,
          durationMs: Math.round(durationMs),
          status: response.status,
          success: response.status >= 200 && response.status < 400,
        };
        results.push(result);
        completedCount++;
        if (onProgress) onProgress(result, completedCount, totalRequests);
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
        completedCount++;
        if (onProgress) onProgress(result, completedCount, totalRequests);
      }
    })
  );

  await Promise.allSettled(tasks);
  results.sort((a, b) => a.requestIndex - b.requestIndex);
  return results;
}

module.exports = runLoadTest;
