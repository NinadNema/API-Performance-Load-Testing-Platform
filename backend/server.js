const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { WebSocketServer } = require('ws');
const runLoadTest = require("./loadTestRunner");
const calculateMetrics = require("./metrics");
const saveTestRun = require("./saveTestRun");
const { generateInsights, generateScalingInsights, calculateApdex } = require('./insights');
const db = require('./db');
const compareRuns = require('./compareRuns');
const runScalingTest = require('./scalingTest');
const { runWorkflow } = require('./workflow');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

let clients = [];
function broadcast(data) {
  const message = JSON.stringify(data);
  clients = clients.filter((client) => {
    if (client.readyState === 1) {
      try {
        client.send(message);
        return true;
      } catch {
        return false;
      }
    }
    return client.readyState !== 3;
  });
}

app.post("/api/load-test", async (req, res) => {
  const {
    url,
    method = "GET",
    concurrency = 5,
    totalRequests = 20,
    headers = {},
    body = null,
    timeout = 10000,
  } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: "url is required" });
  }

  const numConcurrency = Number(concurrency);
  if (!numConcurrency || numConcurrency < 1 || numConcurrency > 500) {
    return res
      .status(400)
      .json({ success: false, error: "concurrency must be between 1 and 500" });
  }

  const numTotal = Number(totalRequests);
  if (!numTotal || numTotal < 1 || numTotal > 50000) {
    return res
      .status(400)
      .json({ success: false, error: "totalRequests must be between 1 and 50000" });
  }

  try {
    let lastBroadcastTime = 0;
    const start = performance.now();
    const results = await runLoadTest({
      url,
      method,
      concurrency: numConcurrency,
      totalRequests: numTotal,
      headers,
      body,
      timeout: Number(timeout) || 10000,
      onProgress: (result, completed, total) => {
        const now = Date.now();
        if (completed === total || now - lastBroadcastTime > 40) {
          lastBroadcastTime = now;
          broadcast({ type: 'progress', result, completed, total });
        }
      },
    });

    const totalDurationMs = performance.now() - start;

    const metrics = calculateMetrics(results, totalDurationMs);
    const apdex = calculateApdex(results, metrics.p50 > 0 ? Math.max(100, Math.round(metrics.p50 * 1.5)) : 250);
    const insights = generateInsights(metrics, null, results);

    const testRunId = saveTestRun({
      url,
      method,
      concurrency: numConcurrency,
      totalRequests: numTotal,
      totalDurationMs: Math.round(totalDurationMs),
      metrics,
      results,
    });

    res.json({
      success: true,
      testRunId,
      totalDurationMs: Math.round(totalDurationMs),
      metrics,
      apdex,
      insights,
      results,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/request", async (req, res) => {
  const { method = "GET", url, headers = {}, body, timeout = 10000 } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: "url is required" });
  }

  const start = performance.now();

  try {
    const response = await axios({
      method,
      url,
      headers,
      data: body,
      timeout: Number(timeout) || 10000,
      validateStatus: () => true,
    });

    const durationMs = performance.now() - start;

    res.json({
      success: true,
      status: response.status,
      statusText: response.statusText,
      durationMs: Math.round(durationMs),
      headers: response.headers,
      body: response.data,
    });
  } catch (err) {
    const durationMs = performance.now() - start;

    res.json({
      success: false,
      error: err.message,
      code: err.code,
      durationMs: Math.round(durationMs),
    });
  }
});

app.get('/api/test-runs', (req, res) => {
  try {
    const runs = db.prepare('SELECT * FROM test_runs ORDER BY id DESC').all();
    res.json({ success: true, runs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/test-runs/:id', (req, res) => {
  try {
    const run = db.prepare('SELECT * FROM test_runs WHERE id = ?').get(req.params.id);
    if (!run) {
      return res.status(404).json({ success: false, error: 'Test run not found' });
    }
    const mappedRequests = requests.map((r) => ({
      requestIndex: r.request_index,
      durationMs: r.duration_ms,
      status: r.status,
      success: Boolean(r.success),
    }));

    const metrics = {
      totalRequests: run.total_requests,
      avgMs: run.avg_ms,
      minMs: run.min_ms,
      maxMs: run.max_ms,
      p50: run.p50,
      p95: run.p95,
      p99: run.p99,
      successRate: run.success_rate,
      throughputRps: run.throughput_rps,
    };
    const apdex = calculateApdex(mappedRequests, metrics.p50 > 0 ? Math.max(100, Math.round(metrics.p50 * 1.5)) : 250);
    const insights = generateInsights(metrics, null, mappedRequests);

    res.json({ success: true, run, requests, metrics, apdex, insights });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/test-runs/:id', (req, res) => {
  try {
    const deleteReqs = db.prepare('DELETE FROM requests WHERE test_run_id = ?');
    const deleteRun = db.prepare('DELETE FROM test_runs WHERE id = ?');

    db.transaction(() => {
      deleteReqs.run(req.params.id);
      deleteRun.run(req.params.id);
    })();

    res.json({ success: true, message: 'Test run deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/test-runs', (req, res) => {
  try {
    db.transaction(() => {
      db.prepare('DELETE FROM requests').run();
      db.prepare('DELETE FROM test_runs').run();
    })();
    res.json({ success: true, message: 'All test runs cleared' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/compare', (req, res) => {
  const runA = req.query?.runA;
  const runB = req.query?.runB;

  if (!runA || !runB) {
    return res.status(400).json({ success: false, error: 'runA and runB query params are required' });
  }

  try {
    const result = compareRuns(runA, runB);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

app.post('/api/scaling-test', async (req, res) => {
  const {
    url,
    method = 'GET',
    totalRequestsPerLevel,
    concurrencyLevels,
    headers = {},
    body = null,
    timeout = 10000,
  } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: 'url is required' });
  }
  if (!totalRequestsPerLevel || totalRequestsPerLevel < 1) {
    return res.status(400).json({ success: false, error: 'totalRequestsPerLevel must be at least 1' });
  }
  if (!Array.isArray(concurrencyLevels) || concurrencyLevels.length === 0) {
    return res.status(400).json({ success: false, error: 'concurrencyLevels must be a non-empty array' });
  }

  try {
    const result = await runScalingTest({
      url,
      method,
      totalRequestsPerLevel,
      concurrencyLevels,
      headers,
      body,
      timeout,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/scaling-test/:groupId', (req, res) => {
  const runs = db.prepare('SELECT * FROM test_runs WHERE scaling_group_id = ? ORDER BY concurrency ASC').all(req.params.groupId);
  if (runs.length === 0) {
    return res.status(404).json({ success: false, error: 'No runs found for this scaling group' });
  }
  const insights = generateScalingInsights(runs);
  res.json({ success: true, scalingGroupId: req.params.groupId, runs, insights });
});

app.post('/api/workflow', async (req, res) => {
  const { steps } = req.body;

  if (!Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ success: false, error: 'steps must be a non-empty array' });
  }

  try {
    const result = await runWorkflow(steps);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const wss = new WebSocketServer({ port: 4001 });

wss.on('connection', (ws) => {
  clients.push(ws);

  ws.on('error', (err) => {
    console.error('WebSocket client error:', err.message);
  });

  ws.on('close', () => {
    clients = clients.filter((c) => c !== ws);
  });
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`API tester backend running on http://localhost:${PORT}`);
});