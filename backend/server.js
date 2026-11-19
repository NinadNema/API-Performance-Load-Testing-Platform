const express = require("express");
const cors = require("cors");
const axios = require("axios");
const runLoadTest = require("./loadTestRunner");
const calculateMetrics = require("./metrics");
const saveTestRun = require("./saveTestRun");
const db = require("./db");
const {
  registerUser,
  loginUser,
  authenticateToken,
} = require("./auth");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password, fullName } = req.body;
    const result = await registerUser({ username, email, password, fullName });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const result = await loginUser({ identifier, password });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get("/api/auth/me", authenticateToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

app.post("/api/request", async (req, res) => {
  const { method = "GET", url, headers = {}, body, timeout = 10000 } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ success: false, error: "A valid url is required" });
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
    res.json({
      success: true,
      status: response.status,
      statusText: response.statusText,
      durationMs: Math.round(performance.now() - start),
      headers: response.headers,
      body: response.data,
    });
  } catch (err) {
    res.json({
      success: false,
      error: err.message,
      code: err.code,
      durationMs: Math.round(performance.now() - start),
    });
  }
});

app.post("/api/load-test", authenticateToken, async (req, res) => {
  const {
    url,
    method = "GET",
    concurrency = 5,
    totalRequests = 20,
    headers = {},
    body = null,
    timeout = 10000,
  } = req.body;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ success: false, error: "A valid url is required" });
  }

  const requestCount = Number(totalRequests);
  if (!Number.isInteger(requestCount) || requestCount < 1 || requestCount > 1000) {
    return res.status(400).json({
      success: false,
      error: "totalRequests must be a whole number between 1 and 1000",
    });
  }

  const concurrencyCount = Number(concurrency);
  if (!Number.isInteger(concurrencyCount) || concurrencyCount < 1 || concurrencyCount > 50) {
    return res.status(400).json({
      success: false,
      error: "concurrency must be a whole number between 1 and 50",
    });
  }

  const timeoutMs = Number(timeout);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 60000) {
    return res.status(400).json({
      success: false,
      error: "timeout must be a whole number between 500 and 60000 milliseconds",
    });
  }

  try {
    const start = performance.now();
    const results = await runLoadTest({
      url,
      method,
      concurrency: concurrencyCount,
      totalRequests: requestCount,
      headers,
      body,
      timeout: timeoutMs,
    });
    const totalDurationMs = Math.round(performance.now() - start);
    const metrics = calculateMetrics(results, totalDurationMs);
    const testRunId = saveTestRun({
      userId: req.user.id,
      url,
      method,
      concurrency: concurrencyCount,
      totalRequests: requestCount,
      totalDurationMs,
      metrics,
      results,
    });

    res.json({
      success: true,
      testRunId,
      totalDurationMs,
      metrics,
      results,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/test-runs", authenticateToken, (req, res) => {
  try {
    const runs = db
      .prepare("SELECT * FROM test_runs WHERE user_id = ? ORDER BY id DESC")
      .all(req.user.id);
    res.json({ success: true, runs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/test-runs/:id", authenticateToken, (req, res) => {
  try {
    const run = db
      .prepare("SELECT * FROM test_runs WHERE id = ? AND user_id = ?")
      .get(req.params.id, req.user.id);
    if (!run) {
      return res.status(404).json({ success: false, error: "Test run not found" });
    }

    const requests = db
      .prepare("SELECT * FROM requests WHERE test_run_id = ? ORDER BY request_index")
      .all(run.id);
    const metrics = {
      totalRequests: run.total_requests,
      avgMs: run.avg_ms,
      minMs: run.min_ms,
      maxMs: run.max_ms,
      p95: run.p95,
      successRate: run.success_rate,
      throughputRps: run.throughput_rps,
    };
    res.json({ success: true, run, requests, metrics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/test-runs/:id", authenticateToken, (req, res) => {
  try {
    const run = db
      .prepare("SELECT id FROM test_runs WHERE id = ? AND user_id = ?")
      .get(req.params.id, req.user.id);
    if (!run) {
      return res.status(404).json({ success: false, error: "Test run not found" });
    }

    db.transaction(() => {
      db.prepare("DELETE FROM requests WHERE test_run_id = ?").run(run.id);
      db.prepare("DELETE FROM test_runs WHERE id = ? AND user_id = ?").run(run.id, req.user.id);
    })();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/test-runs", authenticateToken, (req, res) => {
  try {
    db.transaction(() => {
      const runs = db.prepare("SELECT id FROM test_runs WHERE user_id = ?").all(req.user.id);
      const deleteRequests = db.prepare("DELETE FROM requests WHERE test_run_id = ?");
      for (const run of runs) deleteRequests.run(run.id);
      db.prepare("DELETE FROM test_runs WHERE user_id = ?").run(req.user.id);
    })();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`API tester backend running on http://localhost:${PORT}`);
});
