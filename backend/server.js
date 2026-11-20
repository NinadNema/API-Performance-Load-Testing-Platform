require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const runLoadTest = require("./loadTestRunner");
const calculateMetrics = require("./metrics");
const saveTestRun = require("./saveTestRun");
const db = require("./db");
const { validateTargetUrl } = require("./targetSecurity");
const createRateLimiter = require("./rateLimiter");
const {
  registerUser,
  loginUser,
  authenticateToken,
} = require("./auth");

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Origin is not allowed"));
    }
  },
}));
app.use(express.json({ limit: "1mb" }));

const requestRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, limit: 60 });
const loadTestRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, limit: 10 });
const authRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, limit: 10 });

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/api/auth/register", authRateLimiter, async (req, res) => {
  try {
    const { username, email, password, fullName } = req.body;
    const result = await registerUser({ username, email, password, fullName });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post("/api/auth/login", authRateLimiter, async (req, res) => {
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

app.post("/api/request", authenticateToken, requestRateLimiter, async (req, res) => {
  const payload = req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? req.body
    : {};
  const {
    method = "GET",
    url,
    headers = {},
    body,
    timeout = 10000,
  } = payload;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ success: false, error: "A valid url is required" });
  }

  if (typeof method !== "string") {
    return res.status(400).json({ success: false, error: "method must be a string" });
  }

  if (!["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    return res.status(400).json({ success: false, error: "Unsupported HTTP method" });
  }

  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return res.status(400).json({ success: false, error: "headers must be a JSON object" });
  }

  const timeoutMs = Number(timeout);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 60000) {
    return res.status(400).json({
      success: false,
      error: "timeout must be a whole number between 500 and 60000 milliseconds",
    });
  }

  let target;
  try {
    target = await validateTargetUrl(url);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }

  const start = performance.now();
  try {
    const response = await axios({
      method: method.toUpperCase(),
      url: target.url,
      headers,
      data: body,
      timeout: timeoutMs,
      validateStatus: () => true,
      maxRedirects: 0,
      lookup: target.lookup,
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
      error: "The target request failed",
      durationMs: Math.round(performance.now() - start),
    });
  }
});

app.post("/api/load-test", authenticateToken, loadTestRateLimiter, async (req, res) => {
  const payload = req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? req.body
    : {};
  const {
    url,
    method = "GET",
    concurrency = 5,
    totalRequests = 20,
    headers = {},
    body = null,
    timeout = 10000,
  } = payload;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ success: false, error: "A valid url is required" });
  }

  if (typeof method !== "string") {
    return res.status(400).json({ success: false, error: "method must be a string" });
  }

  if (!["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    return res.status(400).json({ success: false, error: "Unsupported HTTP method" });
  }

  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return res.status(400).json({ success: false, error: "headers must be a JSON object" });
  }

  let target;
  try {
    target = await validateTargetUrl(url);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
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
      url: target.url,
      method,
      concurrency: concurrencyCount,
      totalRequests: requestCount,
      headers,
      body,
      timeout: timeoutMs,
      lookup: target.lookup,
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
    res.status(500).json({ success: false, error: "Could not run the load test" });
  }
});

app.get("/api/test-runs", authenticateToken, (req, res) => {
  try {
    const runs = db
      .prepare("SELECT * FROM test_runs WHERE user_id = ? ORDER BY id DESC")
      .all(req.user.id);
    res.json({ success: true, runs });
  } catch (err) {
    console.error("Could not load test runs:", err);
    res.status(500).json({ success: false, error: "Could not load test runs" });
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
    console.error("Could not load test run:", err);
    res.status(500).json({ success: false, error: "Could not load test run" });
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
    console.error("Could not delete test run:", err);
    res.status(500).json({ success: false, error: "Could not delete test run" });
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
    console.error("Could not delete test runs:", err);
    res.status(500).json({ success: false, error: "Could not delete test runs" });
  }
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err?.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({
      success: false,
      error: "Invalid JSON in the request body",
    });
  }

  if (err?.message === "Origin is not allowed") {
    return res.status(403).json({
      success: false,
      error: "Origin is not allowed",
    });
  }

  return res.status(err?.statusCode >= 400 && err?.statusCode < 500 ? err.statusCode : 500).json({
    success: false,
    error: err?.statusCode >= 400 && err?.statusCode < 500
      ? err.message
      : "An unexpected server error occurred",
  });
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`API tester backend running on http://localhost:${PORT}`);
});
