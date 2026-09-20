const express = require("express");
const cors = require("cors");
const runLoadTest = require("./loadTestRunner");
const calculateMetrics = require("./metrics");
const saveTestRun = require("./saveTestRun");
const { generateInsights, generateScalingInsights } = require('./insights');
const axios = require("axios");
const db = require('./db');
const compareRuns = require('./compareRuns');
const runScalingTest = require('./scalingTest');
const { WebSocketServer } = require('ws');
const { runWorkflow } = require('./workflow');

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/api/load-test", async (req, res) => {
  const { url, method = "GET", concurrency, totalRequests } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: "url is required" });
  }

  if (!concurrency || concurrency < 1) {
    return res
      .status(400)
      .json({ success: false, error: "concurrency must be at least 1" });
  }

  if (!totalRequests || totalRequests < 1) {
    return res
      .status(400)
      .json({ success: false, error: "totalRequests must be at least 1" });
  }

  try {
    const start = performance.now();
    const results = await runLoadTest({
      url,
      method,
      concurrency,
      totalRequests,
      onProgress: (result, completed, total) => {
        broadcast({ type: 'progress', result, completed, total });
      },
    });

    const totalDurationMs = performance.now() - start;

    const metrics = calculateMetrics(results, totalDurationMs);
    const insights = generateInsights(metrics);

    const testRunId = saveTestRun({
      url,
      method,
      concurrency,
      totalRequests,
      totalDurationMs: Math.round(totalDurationMs),
      metrics,
      results,
    });

    res.json({
      success: true,
      testRunId,
      totalDurationMs: Math.round(totalDurationMs),
      metrics,
      insights,
      results,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/request", async (req, res) => {
  const { method = "GET", url, headers = {}, body } = req.body;

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
      timeout: 10000,
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
  const runs = db.prepare('SELECT * FROM test_runs ORDER BY created_at DESC').all();
  res.json({ success: true, runs });
});

app.get('/api/test-runs/:id', (req, res) => {
  const run = db.prepare('SELECT * FROM test_runs WHERE id = ?').get(req.params.id);
  if (!run) {
    return res.status(404).json({ success: false, error: 'Test run not found' });
  }
  const requests = db.prepare('SELECT * FROM requests WHERE test_run_id = ?').all(req.params.id);
  res.json({ success: true, run, requests });
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
  const { url, method = 'GET', totalRequestsPerLevel, concurrencyLevels } = req.body;

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
    const result = await runScalingTest({ url, method, totalRequestsPerLevel, concurrencyLevels });
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

let clients = [];

wss.on('connection', (ws) => {
  console.log('Frontend connected via WebSocket');
  clients.push(ws);

  ws.on('close', () => {
    clients = clients.filter((c) => c !== ws);
    console.log('Frontend disconnected');
  });
});

function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`API tester backend running on http://localhost:${PORT}`);
});