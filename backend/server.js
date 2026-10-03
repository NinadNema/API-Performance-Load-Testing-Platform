const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { WebSocketServer } = require("ws");
const runLoadTest = require("./loadTestRunner");
const runMultiCoreLoadTest = require("./workerLoadRunner");
const calculateMetrics = require("./metrics");
const saveTestRun = require("./saveTestRun");
const {
  generateInsights,
  generateScalingInsights,
  calculateApdex,
  evaluateSlaBudget,
} = require("./insights");
const db = require("./db");
const compareRuns = require("./compareRuns");
const runScalingTest = require("./scalingTest");
const { runWorkflow } = require("./workflow");
const {
  registerUser,
  loginUser,
  getUserById,
  updateUserProfile,
  authenticateToken,
  optionalAuth,
} = require("./auth");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(optionalAuth);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- AUTHENTICATION ROUTES ---
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password, fullName } = req.body;
    const result = await registerUser({ username, email, password, fullName });
    res.status(201).json({
      success: true,
      message: "Registration successful",
      user: result.user,
      token: result.token,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const result = await loginUser({ identifier, password });
    res.json({
      success: true,
      message: "Login successful",
      user: result.user,
      token: result.token,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get("/api/auth/me", authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

app.put("/api/auth/profile", authenticateToken, async (req, res) => {
  try {
    const { fullName, currentPassword, newPassword } = req.body;
    const updatedUser = await updateUserProfile(req.user.id, {
      fullName,
      currentPassword,
      newPassword,
    });
    res.json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// --- WEBSOCKET BROADCAST ---
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

// --- BENCHMARKING ROUTES ---
app.post("/api/load-test", async (req, res) => {
  const {
    url,
    method = "GET",
    concurrency = 5,
    totalRequests = 20,
    headers = {},
    body = null,
    timeout = 10000,
    useMultiCore = false,
    workerCount = 4,
    slaBudget = null,
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
    const runner = useMultiCore ? runMultiCoreLoadTest : runLoadTest;
    const results = await runner({
      url,
      method,
      concurrency: numConcurrency,
      totalRequests: numTotal,
      headers,
      body,
      timeout: Number(timeout) || 10000,
      workerCount: Number(workerCount) || 4,
      onProgress: (result, completed, total) => {
        const now = Date.now();
        if (completed === total || now - lastBroadcastTime > 40) {
          lastBroadcastTime = now;
          broadcast({ type: "progress", result, completed, total });
        }
      },
    });

    const totalDurationMs = performance.now() - start;

    const metrics = calculateMetrics(results, totalDurationMs);
    const apdex = calculateApdex(
      results,
      metrics.p50 > 0 ? Math.max(100, Math.round(metrics.p50 * 1.5)) : 250
    );
    const insights = generateInsights(metrics, null, results);
    const slaVerdict = evaluateSlaBudget(metrics, apdex, slaBudget);

    let testRunId = null;
    // Only persist permanently to database if user is authenticated
    if (req.user?.id) {
      testRunId = saveTestRun({
        userId: req.user.id,
        url,
        method,
        concurrency: numConcurrency,
        totalRequests: numTotal,
        totalDurationMs: Math.round(totalDurationMs),
        metrics,
        results,
      });
    }

    const sessionRun = {
      id: testRunId || `session-${Date.now()}`,
      url,
      method,
      concurrency: numConcurrency,
      total_requests: numTotal,
      total_duration_ms: Math.round(totalDurationMs),
      avg_ms: metrics.avgMs,
      min_ms: metrics.minMs,
      max_ms: metrics.maxMs,
      p50: metrics.p50,
      p95: metrics.p95,
      p99: metrics.p99,
      success_rate: metrics.successRate,
      throughput_rps: metrics.throughputRps,
      created_at: new Date().toISOString().replace("T", " ").substring(0, 19),
      owner_username: req.user?.username || null,
      owner_name: req.user?.fullName || null,
      metrics,
      results,
      apdex,
      insights,
      slaVerdict,
      isGuest: !req.user,
    };

    res.json({
      success: true,
      testRunId,
      isGuest: !req.user,
      sessionRun,
      totalDurationMs: Math.round(totalDurationMs),
      metrics,
      apdex,
      insights,
      slaVerdict,
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

// Save single session run to authenticated account
app.post("/api/test-runs/save", authenticateToken, (req, res) => {
  try {
    const {
      url,
      method = "GET",
      concurrency = 1,
      totalRequests = 1,
      totalDurationMs = 0,
      metrics = {},
      results = [],
      scalingGroupId = null,
    } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: "url is required" });
    }

    const testRunId = saveTestRun({
      userId: req.user.id,
      url,
      method,
      concurrency: Number(concurrency) || 1,
      totalRequests: Number(totalRequests) || 1,
      totalDurationMs: Number(totalDurationMs) || 0,
      metrics,
      results,
      scalingGroupId,
    });

    res.json({
      success: true,
      testRunId,
      message: "Run saved to account successfully",
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk-save multiple guest session runs to authenticated account
app.post("/api/test-runs/bulk-save", authenticateToken, (req, res) => {
  try {
    const { runs } = req.body;
    if (!Array.isArray(runs) || runs.length === 0) {
      return res.status(400).json({ success: false, error: "runs array is required" });
    }

    const savedIds = [];
    for (const runData of runs) {
      const metrics = runData.metrics || {
        avgMs: runData.avg_ms ?? 0,
        minMs: runData.min_ms ?? 0,
        maxMs: runData.max_ms ?? 0,
        p50: runData.p50 ?? 0,
        p95: runData.p95 ?? 0,
        p99: runData.p99 ?? 0,
        successRate: runData.success_rate ?? 100,
        throughputRps: runData.throughput_rps ?? 0,
      };

      const testRunId = saveTestRun({
        userId: req.user.id,
        url: runData.url,
        method: runData.method || "GET",
        concurrency: Number(runData.concurrency) || 1,
        totalRequests: Number(runData.total_requests || runData.totalRequests) || 1,
        totalDurationMs: Number(runData.total_duration_ms || runData.totalDurationMs) || 0,
        metrics,
        results: runData.results || [],
        scalingGroupId: runData.scaling_group_id || null,
      });
      savedIds.push(testRunId);
    }

    res.json({
      success: true,
      savedIds,
      count: savedIds.length,
      message: `Successfully saved ${savedIds.length} benchmark run(s) to your account`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/test-runs", (req, res) => {
  try {
    // If user is authenticated, return their saved runs
    if (req.user?.id) {
      const runs = db
        .prepare(
          `SELECT t.*, u.username as owner_username, u.full_name as owner_name 
           FROM test_runs t 
           LEFT JOIN users u ON t.user_id = u.id 
           WHERE t.user_id = ? 
           ORDER BY t.id DESC`
        )
        .all(req.user.id);
      return res.json({ success: true, runs });
    }

    // Guest users have no persistent backend runs (held in browser sessionStorage)
    return res.json({ success: true, runs: [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/test-runs/:id", (req, res) => {
  try {
    const run = db
      .prepare(
        `SELECT t.*, u.username as owner_username, u.full_name as owner_name 
         FROM test_runs t 
         LEFT JOIN users u ON t.user_id = u.id 
         WHERE t.id = ?`
      )
      .get(req.params.id);

    if (!run) {
      return res.status(404).json({ success: false, error: "Test run not found" });
    }

    const requests = db
      .prepare("SELECT * FROM requests WHERE test_run_id = ?")
      .all(req.params.id);

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
    const apdex = calculateApdex(
      mappedRequests,
      metrics.p50 > 0 ? Math.max(100, Math.round(metrics.p50 * 1.5)) : 250
    );
    const insights = generateInsights(metrics, null, mappedRequests);

    res.json({ success: true, run, requests, metrics, apdex, insights });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/test-runs/:id", (req, res) => {
  try {
    if (!req.user?.id) {
      return res.json({ success: true, message: "Deleted from session" });
    }

    const deleteReqs = db.prepare("DELETE FROM requests WHERE test_run_id = ?");
    const deleteRun = db.prepare("DELETE FROM test_runs WHERE id = ? AND user_id = ?");

    db.transaction(() => {
      deleteReqs.run(req.params.id);
      deleteRun.run(req.params.id, req.user.id);
    })();

    res.json({ success: true, message: "Test run deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/test-runs", (req, res) => {
  try {
    if (!req.user?.id) {
      return res.json({ success: true, message: "Session history cleared" });
    }

    db.transaction(() => {
      const userRuns = db.prepare("SELECT id FROM test_runs WHERE user_id = ?").all(req.user.id);
      const deleteReqStmt = db.prepare("DELETE FROM requests WHERE test_run_id = ?");
      for (const r of userRuns) {
        deleteReqStmt.run(r.id);
      }
      db.prepare("DELETE FROM test_runs WHERE user_id = ?").run(req.user.id);
    })();
    res.json({ success: true, message: "User test runs cleared" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/compare", (req, res) => {
  const runA = req.query?.runA;
  const runB = req.query?.runB;

  if (!runA || !runB) {
    return res
      .status(400)
      .json({ success: false, error: "runA and runB query params are required" });
  }

  try {
    const result = compareRuns(runA, runB);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

app.post("/api/scaling-test", async (req, res) => {
  const {
    url,
    method = "GET",
    totalRequestsPerLevel,
    concurrencyLevels,
    headers = {},
    body = null,
    timeout = 10000,
  } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: "url is required" });
  }
  if (!totalRequestsPerLevel || totalRequestsPerLevel < 1) {
    return res
      .status(400)
      .json({ success: false, error: "totalRequestsPerLevel must be at least 1" });
  }
  if (!Array.isArray(concurrencyLevels) || concurrencyLevels.length === 0) {
    return res
      .status(400)
      .json({ success: false, error: "concurrencyLevels must be a non-empty array" });
  }

  try {
    const result = await runScalingTest({
      userId: req.user?.id || null,
      url,
      method,
      totalRequestsPerLevel,
      concurrencyLevels,
      headers,
      body,
      timeout,
    });
    res.json({ success: true, ...result, isGuest: !req.user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/scaling-test/:groupId", (req, res) => {
  const runs = db
    .prepare(
      "SELECT * FROM test_runs WHERE scaling_group_id = ? ORDER BY concurrency ASC"
    )
    .all(req.params.groupId);
  if (runs.length === 0) {
    return res
      .status(404)
      .json({ success: false, error: "No runs found for this scaling group" });
  }
  const insights = generateScalingInsights(runs);
  res.json({ success: true, scalingGroupId: req.params.groupId, runs, insights });
});

app.post("/api/workflow", async (req, res) => {
  const { steps } = req.body;

  if (!Array.isArray(steps) || steps.length === 0) {
    return res
      .status(400)
      .json({ success: false, error: "steps must be a non-empty array" });
  }

  try {
    const result = await runWorkflow(steps);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const wss = new WebSocketServer({ port: 4001 });

wss.on("connection", (ws) => {
  clients.push(ws);

  ws.on("error", (err) => {
    console.error("WebSocket client error:", err.message);
  });

  ws.on("close", () => {
    clients = clients.filter((c) => c !== ws);
  });
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`API tester backend running on http://localhost:${PORT}`);
});