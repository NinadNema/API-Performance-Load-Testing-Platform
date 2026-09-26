const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const os = require('node:os');
const runLoadTest = require('./loadTestRunner');

if (!isMainThread) {
  const { url, method, concurrency, totalRequests, headers, body, timeout, startIndex } = workerData;
  runLoadTest({
    url,
    method,
    concurrency,
    totalRequests,
    headers,
    body,
    timeout,
    onProgress: (result, completed, total) => {
      const adjustedResult = { ...result, requestIndex: startIndex + result.requestIndex };
      parentPort.postMessage({ type: 'progress', result: adjustedResult, completed, total });
    },
  }).then((results) => {
    const adjustedResults = results.map((r) => ({ ...r, requestIndex: startIndex + r.requestIndex }));
    parentPort.postMessage({ type: 'done', results: adjustedResults });
  }).catch((err) => {
    parentPort.postMessage({ type: 'error', error: err.message });
  });
} else {
  async function runMultiCoreLoadTest({
    url,
    method = 'GET',
    concurrency = 10,
    totalRequests = 100,
    headers = {},
    body = null,
    timeout = 10000,
    workerCount = 4,
    onProgress,
  }) {
    const numCores = os.cpus()?.length || 4;
    const effectiveWorkers = Math.max(1, Math.min(Number(workerCount) || 4, numCores, totalRequests));

    if (effectiveWorkers === 1) {
      return runLoadTest({ url, method, concurrency, totalRequests, headers, body, timeout, onProgress });
    }

    const baseRequestsPerWorker = Math.floor(totalRequests / effectiveWorkers);
    const remainderRequests = totalRequests % effectiveWorkers;

    const baseConcurrencyPerWorker = Math.max(1, Math.floor(concurrency / effectiveWorkers));
    const remainderConcurrency = concurrency % effectiveWorkers;

    let completedTotal = 0;
    const allResults = [];
    const workerPromises = [];
    let currentStartIndex = 0;

    for (let i = 0; i < effectiveWorkers; i++) {
      const workerTotalReqs = baseRequestsPerWorker + (i < remainderRequests ? 1 : 0);
      const workerConcurrency = baseConcurrencyPerWorker + (i < remainderConcurrency ? 1 : 0);
      const startIndex = currentStartIndex;
      currentStartIndex += workerTotalReqs;

      if (workerTotalReqs <= 0) continue;

      const p = new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
          workerData: {
            url,
            method,
            concurrency: workerConcurrency,
            totalRequests: workerTotalReqs,
            headers,
            body,
            timeout,
            startIndex,
          },
        });

        worker.on('message', (msg) => {
          if (msg.type === 'progress') {
            completedTotal++;
            if (onProgress) onProgress(msg.result, completedTotal, totalRequests);
          } else if (msg.type === 'done') {
            allResults.push(...msg.results);
            resolve();
          } else if (msg.type === 'error') {
            reject(new Error(msg.error));
          }
        });

        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
        });
      });

      workerPromises.push(p);
    }

    await Promise.all(workerPromises);
    allResults.sort((a, b) => a.requestIndex - b.requestIndex);
    return allResults;
  }

  module.exports = runMultiCoreLoadTest;
}
