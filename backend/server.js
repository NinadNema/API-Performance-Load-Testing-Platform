const express = require("express");
const cors = require("cors");
const runLoadTest = require("./loadTestRunner");
const calculateMetrics = require("./metrics");
const saveTestRun = require("./saveTestRun");

const app = express();

const { WebSocketServer } = require('ws');

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const axios = require("axios");

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
      totalDurationMs: Math.round(totalDurationMs),
      metrics,
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


const db = require('./db');

app.get('/api/test-runs', (req, res) => {
    const runs = db.prepare('SELECT * FROM test_runs ORDER BY created_at DESC').all();
    res.json({ success: true, runs});
});

app.get('/api/test-runs/:id', (req, res) => {
    const run = db.prepare('SELECT * FROM test_runs WHERE id = ?').get(req.params.id);
    if(!run){
        return res.status(404).json({success: false, error: 'Test run not found' });
    }
    const requests = db.prepare('SELECT * FROM requests WHERE test_run_id = ?').all(req.params.id);
    res.json({success: true, run, requests });
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
  clients.forEach((clients) => {
    if(clients.readyState === 1)  {
      clients.send(message);
    }
  });
}

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`API tester backend running on http://localhost:${PORT}`);
});
