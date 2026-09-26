import { useState, useEffect, useRef } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import "./App.css";

function MetricCard({ label, value, highlight = false, unit = "" }) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <span className={`metric-value ${highlight ? "highlight" : ""}`}>
        {value ?? "—"}{unit}
      </span>
    </div>
  );
}

function getCategoryIcon(insight) {
  if (insight.category === "rate_limit") return "🛑";
  if (insight.category === "gateway_failure") return "⏱️";
  if (insight.category === "server_exception") return "💥";
  if (insight.category === "auth_failure") return "🔒";
  if (insight.category === "network_timeout") return "📡";
  if (insight.category === "cold_start") return "❄️";
  if (insight.category === "high_jitter") return "〰️";
  if (insight.category === "bimodal_distribution") return "🔀";
  if (insight.category === "sweet_spot") return "🎯";
  if (insight.category === "saturation_point") return "🧱";
  if (insight.category === "scaling_efficiency") return "⚡";
  if (insight.category === "throughput_collapse") return "📉";
  if (insight.category?.startsWith("apdex")) return "⭐";
  if (insight.level === "error") return "🚨";
  if (insight.level === "warning") return "⚠️";
  if (insight.level === "info") return "ℹ️";
  return "✅";
}

function InsightsList({ insights }) {
  if (!insights || insights.length === 0) return null;

  return (
    <div className="insights-list">
      {insights.map((insight, idx) => (
        <div key={idx} className={`insight-item ${insight.level}`}>
          <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>
            {getCategoryIcon(insight)}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>
                {insight.category
                  ? insight.category.replace(/_/g, " ").toUpperCase()
                  : insight.level === "error"
                  ? "ISSUE DETECTED"
                  : insight.level === "warning"
                  ? "WARNING"
                  : "OPTIMAL"}
              </strong>
              <span className={`badge badge-${insight.level === 'error' ? '5xx' : insight.level === 'warning' ? '4xx' : '2xx'}`}>
                {insight.level.toUpperCase()}
              </span>
            </div>
            <p style={{ marginTop: "0.25rem", color: "inherit", opacity: 0.95 }}>
              {insight.message}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ApdexCard({ apdex }) {
  if (!apdex) return null;
  const ratingBadge =
    apdex.rating === "Excellent" || apdex.rating === "Good"
      ? "badge-2xx"
      : apdex.rating === "Fair"
      ? "badge-3xx"
      : "badge-5xx";

  return (
    <div
      style={{
        background: "var(--bg-input)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-md)",
        padding: "0.9rem 1.25rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "0.75rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span style={{ fontSize: "1.5rem" }}>⭐</span>
        <div>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-dim)", fontWeight: 600 }}>
            Apdex User Experience Score (T = {apdex.targetLatencyMs}ms)
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.15rem" }}>
            <span style={{ fontSize: "1.25rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
              {apdex.score}
            </span>
            <span className={`badge ${ratingBadge}`}>{apdex.rating}</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
        <span>😊 Satisfied (≤{apdex.targetLatencyMs}ms): <strong style={{ color: "#34d399" }}>{apdex.satisfied}</strong></span>
        <span>😐 Tolerating (≤{apdex.targetLatencyMs * 4}ms): <strong style={{ color: "#fbbf24" }}>{apdex.tolerating}</strong></span>
        <span>😞 Frustrated: <strong style={{ color: "#f87171" }}>{apdex.frustrated}</strong></span>
      </div>
    </div>
  );
}

function LatencyChart({ results }) {
  if (!results || results.length === 0) return null;

  const chartData = [...results]
    .sort((a, b) => a.requestIndex - b.requestIndex)
    .map((r) => ({
      request: `#${(r.requestIndex ?? 0) + 1}`,
      latency: r.durationMs ?? 0,
      status: r.status ?? "ERR",
    }));

  return (
    <div className="chart-wrapper">
      <div style={{ marginBottom: "0.75rem", fontSize: "0.875rem", fontWeight: 600 }}>
        Request Latency Timeline (ms)
      </div>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#23304a" />
            <XAxis dataKey="request" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit="ms" />
            <Tooltip
              contentStyle={{
                backgroundColor: "#111827",
                borderColor: "#334155",
                borderRadius: "8px",
                color: "#f8fafc",
                fontSize: "0.8rem",
              }}
            />
            <Line
              type="monotone"
              dataKey="latency"
              stroke="#38bdf8"
              strokeWidth={2}
              dot={{ r: 2, fill: "#38bdf8" }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StatusBreakdownChart({ results }) {
  if (!results || results.length === 0) return null;

  const counts = {};
  for (const r of results) {
    const key = r.status ? String(r.status) : "Error / Timeout";
    counts[key] = (counts[key] || 0) + 1;
  }

  const chartData = Object.entries(counts).map(([status, count]) => ({
    status,
    count,
  }));

  return (
    <div className="chart-wrapper">
      <div style={{ marginBottom: "0.75rem", fontSize: "0.875rem", fontWeight: 600 }}>
        HTTP Status Code Breakdown
      </div>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#23304a" />
            <XAxis dataKey="status" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis stroke="#64748b" allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#111827",
                borderColor: "#334155",
                borderRadius: "8px",
                color: "#f8fafc",
                fontSize: "0.8rem",
              }}
            />
            <Bar dataKey="count" fill="#818cf8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ScalingChart({ runs }) {
  if (!runs || runs.length === 0) return null;

  const chartData = [...runs]
    .sort((a, b) => a.concurrency - b.concurrency)
    .map((r) => ({
      concurrency: `VU ${r.concurrency}`,
      p95: r.metrics?.p95 ?? r.p95 ?? 0,
      throughput: r.metrics?.throughputRps ?? r.throughput_rps ?? 0,
    }));

  return (
    <div className="chart-wrapper">
      <div style={{ marginBottom: "0.75rem", fontSize: "0.875rem", fontWeight: 600 }}>
        Concurrency Scaling: P95 Latency vs Throughput
      </div>
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#23304a" />
            <XAxis dataKey="concurrency" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis
              yAxisId="left"
              stroke="#38bdf8"
              tick={{ fontSize: 11 }}
              unit="ms"
              label={{ value: "P95 Latency", angle: -90, position: "insideLeft", fill: "#38bdf8", fontSize: 12 }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#34d399"
              tick={{ fontSize: 11 }}
              unit=" rps"
              label={{ value: "Throughput", angle: 90, position: "insideRight", fill: "#34d399", fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#111827",
                borderColor: "#334155",
                borderRadius: "8px",
                color: "#f8fafc",
                fontSize: "0.8rem",
              }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="p95"
              name="P95 Latency (ms)"
              stroke="#38bdf8"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="throughput"
              name="Throughput (req/s)"
              stroke="#34d399"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  if (!status) return <span className="badge badge-err">ERROR</span>;
  if (status >= 200 && status < 300) return <span className="badge badge-2xx">{status} OK</span>;
  if (status >= 300 && status < 400) return <span className="badge badge-3xx">{status} REDIRECT</span>;
  if (status >= 400 && status < 500) return <span className="badge badge-4xx">{status} CLIENT ERR</span>;
  return <span className="badge badge-5xx">{status} SERVER ERR</span>;
}

export default function App() {
  const [mode, setMode] = useState("single");
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("https://jsonplaceholder.typicode.com/posts/1");
  const [headers, setHeaders] = useState('{\n  "Content-Type": "application/json"\n}');
  const [body, setBody] = useState("");
  const [timeout, setTimeoutVal] = useState(10000);
  const [activeSubTab, setActiveSubTab] = useState("headers");

  // Load test state
  const [concurrency, setConcurrency] = useState(5);
  const [totalRequests, setTotalRequests] = useState(20);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [singleResponseTab, setSingleResponseTab] = useState("body");

  // WebSocket state
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);

  // History state
  const [testRuns, setTestRuns] = useState([]);
  const [selectedRunDetail, setSelectedRunDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Compare state
  const [compareRunA, setCompareRunA] = useState("");
  const [compareRunB, setCompareRunB] = useState("");
  const [compareResult, setCompareResult] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);

  // Scaling state
  const [scalingLevels, setScalingLevels] = useState("1, 5, 10, 25");
  const [scalingReqs, setScalingReqs] = useState(20);
  const [scalingResult, setScalingResult] = useState(null);
  const [scalingLoading, setScalingLoading] = useState(false);

  // Workflow state
  const [workflowSteps, setWorkflowSteps] = useState(
    JSON.stringify(
      [
        {
          name: "Fetch Post",
          request: {
            method: "GET",
            url: "https://jsonplaceholder.typicode.com/posts/1",
          },
          extract: {
            userId: "body.userId",
          },
        },
        {
          name: "Fetch Post Author",
          request: {
            method: "GET",
            url: "https://jsonplaceholder.typicode.com/users/{{userId}}",
          },
        },
      ],
      null,
      2
    )
  );
  const [workflowResult, setWorkflowResult] = useState(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);

  // WebSocket Connection with automatic reconnection
  useEffect(() => {
    let reconnectTimeout = null;

    function connectWs() {
      const ws = new WebSocket("ws://localhost:4001");
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "progress") {
            setProgress({ completed: data.completed, total: data.total });
          }
        } catch {
          // ignore invalid json
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimeout = setTimeout(connectWs, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connectWs();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  async function fetchTestRuns() {
    try {
      const res = await fetch("http://localhost:4000/api/test-runs");
      const data = await res.json();
      if (data.success) {
        setTestRuns(data.runs || []);
      }
    } catch (err) {
      console.error("Failed to fetch test runs:", err);
    }
  }

  async function handleViewRunDetail(runId) {
    setDetailLoading(true);
    setSelectedRunDetail(null);
    try {
      const res = await fetch(`http://localhost:4000/api/test-runs/${runId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedRunDetail(data);
      }
    } catch (err) {
      console.error("Failed to fetch run detail:", err);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleDeleteRun(e, runId) {
    e.stopPropagation();
    if (!window.confirm(`Delete test run #${runId}?`)) return;
    try {
      const res = await fetch(`http://localhost:4000/api/test-runs/${runId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        fetchTestRuns();
        if (selectedRunDetail?.run?.id === runId) {
          setSelectedRunDetail(null);
        }
      }
    } catch (err) {
      console.error("Failed to delete run:", err);
    }
  }

  async function handleClearAllHistory() {
    if (!window.confirm("Are you sure you want to clear all test history?")) return;
    try {
      const res = await fetch("http://localhost:4000/api/test-runs", {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setTestRuns([]);
        setSelectedRunDetail(null);
      }
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  }

  function parseJsonPayloads() {
    let parsedHeaders = {};
    let parsedBody = null;

    if (headers.trim()) {
      try {
        parsedHeaders = JSON.parse(headers);
      } catch (err) {
        throw new Error("Headers must be valid JSON: " + err.message, { cause: err });
      }
    }

    if (body.trim()) {
      try {
        parsedBody = JSON.parse(body);
      } catch (err) {
        throw new Error("Body must be valid JSON: " + err.message, { cause: err });
      }
    }

    return { parsedHeaders, parsedBody };
  }

  async function handleSendSingleRequest() {
    setLoading(true);
    setResponse(null);

    let payloads;
    try {
      payloads = parseJsonPayloads();
    } catch (err) {
      setResponse({ success: false, error: err.message });
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("http://localhost:4000/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          url: url.trim(),
          headers: payloads.parsedHeaders,
          body: payloads.parsedBody,
          timeout: Number(timeout) || 10000,
        }),
      });
      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setResponse({ success: false, error: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleRunLoadTest() {
    setLoading(true);
    setResponse(null);
    setProgress({ completed: 0, total: totalRequests });

    let payloads;
    try {
      payloads = parseJsonPayloads();
    } catch (err) {
      setResponse({ success: false, error: err.message });
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("http://localhost:4000/api/load-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          url: url.trim(),
          concurrency: Number(concurrency) || 1,
          totalRequests: Number(totalRequests) || 1,
          headers: payloads.parsedHeaders,
          body: payloads.parsedBody,
          timeout: Number(timeout) || 10000,
        }),
      });
      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setResponse({ success: false, error: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleCompare() {
    if (!compareRunA || !compareRunB) return;
    setCompareLoading(true);
    setCompareResult(null);

    try {
      const res = await fetch(
        `http://localhost:4000/api/compare?runA=${compareRunA}&runB=${compareRunB}`
      );
      const data = await res.json();
      setCompareResult(data);
    } catch (err) {
      setCompareResult({ success: false, error: err.message });
    } finally {
      setCompareLoading(false);
    }
  }

  async function handleRunScalingTest() {
    const levels = scalingLevels
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n) && n > 0);

    if (levels.length === 0) {
      setScalingResult({
        success: false,
        error: "Enter valid comma-separated concurrency levels, e.g. 1, 5, 10, 25",
      });
      return;
    }

    setScalingLoading(true);
    setScalingResult(null);

    let payloads;
    try {
      payloads = parseJsonPayloads();
    } catch (err) {
      setScalingResult({ success: false, error: err.message });
      setScalingLoading(false);
      return;
    }

    try {
      const res = await fetch("http://localhost:4000/api/scaling-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          method,
          totalRequestsPerLevel: Number(scalingReqs) || 20,
          concurrencyLevels: levels,
          headers: payloads.parsedHeaders,
          body: payloads.parsedBody,
          timeout: Number(timeout) || 10000,
        }),
      });
      const data = await res.json();
      setScalingResult(data);
    } catch (err) {
      setScalingResult({ success: false, error: err.message });
    } finally {
      setScalingLoading(false);
    }
  }

  async function handleRunWorkflow() {
    let steps;
    try {
      steps = JSON.parse(workflowSteps);
    } catch (err) {
      setWorkflowResult({
        success: false,
        error: "Workflow steps JSON is invalid: " + err.message,
      });
      return;
    }

    if (!Array.isArray(steps) || steps.length === 0) {
      setWorkflowResult({
        success: false,
        error: "Workflow steps must be a non-empty array",
      });
      return;
    }

    setWorkflowLoading(true);
    setWorkflowResult(null);

    try {
      const res = await fetch("http://localhost:4000/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps }),
      });
      const data = await res.json();
      setWorkflowResult(data);
    } catch (err) {
      setWorkflowResult({ success: false, error: err.message });
    } finally {
      setWorkflowLoading(false);
    }
  }

  function exportResultsAsJson(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `loadtest-run-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(href);
  }

  function exportResultsAsCsv(results) {
    if (!results || results.length === 0) return;
    const header = "RequestIndex,DurationMs,Status,Success,Error\n";
    const rows = results
      .map(
        (r) =>
          `${r.requestIndex ?? ""},${r.durationMs ?? ""},${r.status ?? ""},${
            r.success ? "1" : "0"
          },"${(r.error || "").replace(/"/g, '""')}"`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `loadtest-requests-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">⚡</div>
          <div>
            <h1>API Performance & Load Tester</h1>
            <div className="brand-subtitle">
              High-throughput benchmark engine, statistical analyzer & workflow runner
            </div>
          </div>
        </div>

        <div className="ws-status">
          <div className={`status-dot ${wsConnected ? "connected" : ""}`} />
          <span>{wsConnected ? "Live Socket Active" : "Socket Reconnecting..."}</span>
        </div>
      </header>

      {/* Mode Navigation Tabs */}
      <nav className="nav-tabs">
        {[
          { id: "single", label: "Single Request", icon: "🎯" },
          { id: "load", label: "Load Test", icon: "🚀" },
          { id: "scaling", label: "Scaling Test", icon: "📈" },
          { id: "workflow", label: "Workflow Chain", icon: "🔗" },
          { id: "compare", label: "Compare Runs", icon: "⚖️" },
          { id: "history", label: "History & Logs", icon: "📜" },
        ].map((tab) => (
          <button
            key={tab.id}
            className={`nav-tab ${mode === tab.id ? "active" : ""}`}
            onClick={() => {
              setMode(tab.id);
              if (tab.id === "history" || tab.id === "compare") {
                fetchTestRuns();
              }
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Main Request Configuration Form (For Single, Load, Scaling) */}
      {(mode === "single" || mode === "load" || mode === "scaling") && (
        <section className="card">
          <div className="card-title">
            <span>
              {mode === "single"
                ? "Send Individual Request"
                : mode === "load"
                ? "Concurrent Load Test Configuration"
                : "Concurrency Scaling Benchmark"}
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
              {mode === "load" && `Target: ${totalRequests} requests @ ${concurrency} concurrent`}
            </span>
          </div>

          <div className="request-bar">
            <select
              className={`method-select method-${method}`}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
              <option value="PATCH">PATCH</option>
            </select>

            <input
              type="text"
              className="url-input"
              placeholder="https://api.example.com/endpoint"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />

            {mode === "single" && (
              <button
                className="btn-primary"
                onClick={handleSendSingleRequest}
                disabled={loading || !url.trim()}
              >
                {loading ? "Sending..." : "Send Request"}
              </button>
            )}

            {mode === "load" && (
              <button
                className="btn-primary"
                onClick={handleRunLoadTest}
                disabled={loading || !url.trim()}
              >
                {loading ? `Testing... (${progress.completed}/${progress.total})` : "Start Load Test"}
              </button>
            )}

            {mode === "scaling" && (
              <button
                className="btn-primary"
                onClick={handleRunScalingTest}
                disabled={scalingLoading || !url.trim()}
              >
                {scalingLoading ? "Running Scaling Matrix..." : "Start Scaling Test"}
              </button>
            )}
          </div>

          {/* Load Test Specific Controls */}
          {mode === "load" && (
            <div className="options-row">
              <div className="option-group">
                <label>Concurrency (Virtual Users):</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  className="option-input"
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                />
              </div>

              <div className="option-group">
                <label>Total Requests:</label>
                <input
                  type="number"
                  min="1"
                  max="50000"
                  className="option-input"
                  style={{ width: "90px" }}
                  value={totalRequests}
                  onChange={(e) => setTotalRequests(Number(e.target.value))}
                />
              </div>

              <div className="option-group">
                <label>Timeout (ms):</label>
                <input
                  type="number"
                  min="500"
                  step="500"
                  className="option-input"
                  style={{ width: "90px" }}
                  value={timeout}
                  onChange={(e) => setTimeoutVal(Number(e.target.value))}
                />
              </div>
            </div>
          )}

          {/* Scaling Test Specific Controls */}
          {mode === "scaling" && (
            <div className="options-row">
              <div className="option-group">
                <label>Concurrency Levels:</label>
                <input
                  type="text"
                  style={{ width: "180px" }}
                  value={scalingLevels}
                  onChange={(e) => setScalingLevels(e.target.value)}
                  placeholder="1, 5, 10, 25"
                />
              </div>

              <div className="option-group">
                <label>Requests Per Level:</label>
                <input
                  type="number"
                  min="1"
                  className="option-input"
                  value={scalingReqs}
                  onChange={(e) => setScalingReqs(Number(e.target.value))}
                />
              </div>

              <div className="option-group">
                <label>Timeout (ms):</label>
                <input
                  type="number"
                  min="500"
                  className="option-input"
                  style={{ width: "90px" }}
                  value={timeout}
                  onChange={(e) => setTimeoutVal(Number(e.target.value))}
                />
              </div>
            </div>
          )}

          {/* Payload and Headers Sub-tabs */}
          <div>
            <div className="sub-tabs">
              <button
                className={`sub-tab ${activeSubTab === "headers" ? "active" : ""}`}
                onClick={() => setActiveSubTab("headers")}
              >
                Headers (JSON)
              </button>
              <button
                className={`sub-tab ${activeSubTab === "body" ? "active" : ""}`}
                onClick={() => setActiveSubTab("body")}
              >
                Request Body (JSON)
              </button>
              {mode === "single" && (
                <button
                  className={`sub-tab ${activeSubTab === "settings" ? "active" : ""}`}
                  onClick={() => setActiveSubTab("settings")}
                >
                  Timeout
                </button>
              )}
            </div>

            <div style={{ marginTop: "0.75rem" }}>
              {activeSubTab === "headers" && (
                <textarea
                  rows={4}
                  style={{ width: "100%" }}
                  placeholder='{"Authorization": "Bearer token", "Custom-Header": "value"}'
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                />
              )}

              {activeSubTab === "body" && (
                <textarea
                  rows={5}
                  style={{ width: "100%" }}
                  placeholder='{\n  "title": "Example Post",\n  "body": "Lorem ipsum"\n}'
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              )}

              {activeSubTab === "settings" && mode === "single" && (
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <label style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Request Timeout (ms):
                  </label>
                  <input
                    type="number"
                    min="500"
                    style={{ width: "110px" }}
                    value={timeout}
                    onChange={(e) => setTimeoutVal(Number(e.target.value))}
                  />
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Live Progress Bar for Load Testing */}
      {loading && mode === "load" && (
        <div className="progress-container">
          <div className="progress-header">
            <span>Executing Concurrent Requests...</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {progress.completed} / {progress.total} (
              {progress.total > 0
                ? Math.round((progress.completed / progress.total) * 100)
                : 0}
              %)
            </span>
          </div>
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{
                width: `${
                  progress.total > 0
                    ? (progress.completed / progress.total) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Single Request Result View */}
      {mode === "single" && response && (
        <section className="card">
          <div className="card-title">
            <span>Response</span>
            <div className="response-header">
              <StatusBadge status={response.status} />
              {response.durationMs !== undefined && (
                <span className="badge badge-3xx">{response.durationMs}ms</span>
              )}
            </div>
          </div>

          {!response.success && response.error && (
            <div className="insight-item error">
              <span>⚠️</span>
              <div>
                <strong>Request Failed:</strong> {response.error}
              </div>
            </div>
          )}

          <div className="sub-tabs">
            <button
              className={`sub-tab ${singleResponseTab === "body" ? "active" : ""}`}
              onClick={() => setSingleResponseTab("body")}
            >
              Response Body
            </button>
            <button
              className={`sub-tab ${singleResponseTab === "headers" ? "active" : ""}`}
              onClick={() => setSingleResponseTab("headers")}
            >
              Headers
            </button>
            <button
              className={`sub-tab ${singleResponseTab === "raw" ? "active" : ""}`}
              onClick={() => setSingleResponseTab("raw")}
            >
              Raw Payload
            </button>
          </div>

          <div>
            {singleResponseTab === "body" && (
              <pre className="raw-json-box">
                {typeof response.body === "object"
                  ? JSON.stringify(response.body, null, 2)
                  : String(response.body ?? "No body returned")}
              </pre>
            )}

            {singleResponseTab === "headers" && (
              <pre className="raw-json-box">
                {JSON.stringify(response.headers ?? {}, null, 2)}
              </pre>
            )}

            {singleResponseTab === "raw" && (
              <pre className="raw-json-box">
                {JSON.stringify(response, null, 2)}
              </pre>
            )}
          </div>
        </section>
      )}

      {/* Load Test Result Dashboard */}
      {mode === "load" && response && response.metrics && (
        <section className="card">
          <div className="card-title">
            <span>Load Test Benchmark Results</span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="btn-secondary"
                onClick={() => exportResultsAsJson(response)}
              >
                Export JSON
              </button>
              <button
                className="btn-secondary"
                onClick={() => exportResultsAsCsv(response.results)}
              >
                Export CSV
              </button>
            </div>
          </div>

          {/* Metric Cards Grid */}
          <div className="metrics-grid">
            <MetricCard label="Total Requests" value={response.metrics.totalRequests} />
            <MetricCard
              label="Success Rate"
              value={response.metrics.successRate}
              unit="%"
              highlight
            />
            <MetricCard label="Avg Latency" value={response.metrics.avgMs} unit="ms" />
            <MetricCard label="P50 Latency" value={response.metrics.p50} unit="ms" />
            <MetricCard label="P95 Latency" value={response.metrics.p95} unit="ms" highlight />
            <MetricCard label="P99 Latency" value={response.metrics.p99} unit="ms" />
            <MetricCard
              label="Throughput"
              value={response.metrics.throughputRps}
              unit=" req/s"
              highlight
            />
            <MetricCard label="Duration" value={response.totalDurationMs} unit="ms" />
          </div>

          {/* Apdex Score Card */}
          {response.apdex && <ApdexCard apdex={response.apdex} />}

          {/* Rule-based Insights */}
          {response.insights && response.insights.length > 0 && (
            <div>
              <div style={{ marginBottom: "0.5rem", fontSize: "0.85rem", fontWeight: 600 }}>
                Rule-Based Performance & Root-Cause Diagnostics
              </div>
              <InsightsList insights={response.insights} />
            </div>
          )}

          {/* Charts */}
          {response.results && response.results.length > 0 && (
            <>
              <LatencyChart results={response.results} />
              <StatusBreakdownChart results={response.results} />
            </>
          )}
        </section>
      )}

      {/* Scaling Test Result View */}
      {mode === "scaling" && scalingResult && (
        <section className="card">
          <div className="card-title">
            <span>Scaling Benchmark Results</span>
          </div>

          {!scalingResult.success && (
            <div className="insight-item error">
              <span>⚠️</span>
              <div>{scalingResult.error}</div>
            </div>
          )}

          {scalingResult.success && scalingResult.runs && (
            <>
              <ScalingChart runs={scalingResult.runs} />

              {/* Concurrency Scaling Insights */}
              {scalingResult.insights && scalingResult.insights.length > 0 && (
                <div>
                  <div style={{ marginBottom: "0.5rem", fontSize: "0.85rem", fontWeight: 600 }}>
                    Concurrency Bottleneck & Scaling Insights
                  </div>
                  <InsightsList insights={scalingResult.insights} />
                </div>
              )}

              <div style={{ marginTop: "1rem" }}>
                <div style={{ marginBottom: "0.5rem", fontSize: "0.85rem", fontWeight: 600 }}>
                  Per-Level Metric Breakdown
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Concurrency</th>
                      <th>Requests</th>
                      <th>Avg Latency</th>
                      <th>P50</th>
                      <th>P95</th>
                      <th>P99</th>
                      <th>Throughput</th>
                      <th>Success Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scalingResult.runs.map((run, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600, color: "var(--accent)" }}>
                          {run.concurrency} VUs
                        </td>
                        <td>{run.metrics.totalRequests}</td>
                        <td>{run.metrics.avgMs}ms</td>
                        <td>{run.metrics.p50}ms</td>
                        <td style={{ color: "#38bdf8" }}>{run.metrics.p95}ms</td>
                        <td>{run.metrics.p99}ms</td>
                        <td style={{ color: "#34d399", fontWeight: 600 }}>
                          {run.metrics.throughputRps} req/s
                        </td>
                        <td>{run.metrics.successRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* Multi-step Workflow View */}
      {mode === "workflow" && (
        <section className="card">
          <div className="card-title">
            <span>Multi-Step Workflow Chaining</span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="btn-secondary"
                onClick={() =>
                  setWorkflowSteps(
                    JSON.stringify(
                      [
                        {
                          name: "Get Post",
                          request: {
                            method: "GET",
                            url: "https://jsonplaceholder.typicode.com/posts/1",
                          },
                          extract: { postId: "body.id", userId: "body.userId" },
                        },
                        {
                          name: "Get User Info",
                          request: {
                            method: "GET",
                            url: "https://jsonplaceholder.typicode.com/users/{{userId}}",
                          },
                          extract: { email: "body.email" },
                        },
                        {
                          name: "Create Comment",
                          request: {
                            method: "POST",
                            url: "https://jsonplaceholder.typicode.com/comments",
                            body: {
                              postId: "{{postId}}",
                              name: "Automated Feedback",
                              email: "{{email}}",
                              body: "Great post!",
                            },
                          },
                        },
                      ],
                      null,
                      2
                    )
                  )
                }
              >
                Load Preset (3-Step)
              </button>
            </div>
          </div>

          <div className="card-subtitle">
            Define sequential API steps. Extracted values from earlier responses can be
            referenced in subsequent steps using <code>{"{{variableName}}"}</code>.
          </div>

          <textarea
            rows={14}
            value={workflowSteps}
            onChange={(e) => setWorkflowSteps(e.target.value)}
            style={{ width: "100%", fontSize: "0.825rem" }}
          />

          <div>
            <button
              className="btn-primary"
              onClick={handleRunWorkflow}
              disabled={workflowLoading}
            >
              {workflowLoading ? "Executing Workflow Chain..." : "Execute Workflow"}
            </button>
          </div>

          {workflowResult && (
            <div style={{ marginTop: "1rem" }}>
              {!workflowResult.success && (
                <div className="insight-item error">
                  <span>⚠️</span>
                  <div>{workflowResult.error}</div>
                </div>
              )}

              {workflowResult.success && (
                <>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Step</th>
                        <th>Status</th>
                        <th>Duration</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workflowResult.steps.map((s, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{s.name}</td>
                          <td>
                            <StatusBadge status={s.status} />
                          </td>
                          <td style={{ fontFamily: "var(--font-mono)" }}>
                            {s.durationMs}ms
                          </td>
                          <td style={{ color: s.success ? "var(--success)" : "var(--danger)" }}>
                            {s.success ? "Passed" : s.error || "Failed"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ marginTop: "1.25rem" }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                      Extracted Context Variables:
                    </div>
                    <pre className="raw-json-box">
                      {JSON.stringify(workflowResult.context, null, 2)}
                    </pre>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* Compare Runs View */}
      {mode === "compare" && (
        <section className="card">
          <div className="card-title">
            <span>Compare Two Benchmark Runs</span>
          </div>
          <div className="card-subtitle">
            Compare metrics between baseline and new test runs to evaluate performance regressions.
          </div>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            <select
              style={{ flex: 1, minWidth: "220px" }}
              value={compareRunA}
              onChange={(e) => setCompareRunA(e.target.value)}
            >
              <option value="">Select Baseline Run A (Before)</option>
              {testRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.id} | {r.method} {r.url} (P95: {r.p95}ms, {r.concurrency} VU)
                </option>
              ))}
            </select>

            <select
              style={{ flex: 1, minWidth: "220px" }}
              value={compareRunB}
              onChange={(e) => setCompareRunB(e.target.value)}
            >
              <option value="">Select Target Run B (After)</option>
              {testRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.id} | {r.method} {r.url} (P95: {r.p95}ms, {r.concurrency} VU)
                </option>
              ))}
            </select>

            <button
              className="btn-primary"
              onClick={handleCompare}
              disabled={!compareRunA || !compareRunB || compareLoading}
            >
              {compareLoading ? "Diffing..." : "Compare Runs"}
            </button>
          </div>

          {compareResult && compareResult.success && (
            <div style={{ marginTop: "1rem" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Before (Run #{compareRunA})</th>
                    <th>After (Run #{compareRunB})</th>
                    <th>Delta</th>
                    <th>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(compareResult.comparison).map(([metric, data]) => (
                    <tr key={metric}>
                      <td style={{ fontWeight: 600 }}>{metric.toUpperCase()}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{data.before}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{data.after}</td>
                      <td
                        style={{
                          fontFamily: "var(--font-mono)",
                          color:
                            data.diff > 0
                              ? "var(--danger)"
                              : data.diff < 0
                              ? "var(--success)"
                              : "inherit",
                        }}
                      >
                        {data.diff > 0 ? `+${data.diff}` : data.diff} ({data.percentChange}%)
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            data.verdict === "improved"
                              ? "badge-2xx"
                              : data.verdict === "degraded"
                              ? "badge-5xx"
                              : "badge-3xx"
                          }`}
                        >
                          {data.verdict.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* History & Logs View */}
      {mode === "history" && (
        <section className="card">
          <div className="card-title">
            <span>Historical Test Runs</span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="btn-secondary" onClick={fetchTestRuns}>
                Refresh
              </button>
              {testRuns.length > 0 && (
                <button className="btn-danger" onClick={handleClearAllHistory}>
                  Clear All History
                </button>
              )}
            </div>
          </div>

          {testRuns.length === 0 ? (
            <div style={{ color: "var(--text-dim)", padding: "2rem", textAlign: "center" }}>
              No saved test runs found. Run a load test to view history here.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Method & Endpoint</th>
                  <th>Concurrency</th>
                  <th>P95 Latency</th>
                  <th>Throughput</th>
                  <th>Success Rate</th>
                  <th>Created At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {testRuns.map((r) => (
                  <tr
                    key={r.id}
                    className="clickable"
                    onClick={() => handleViewRunDetail(r.id)}
                  >
                    <td style={{ fontWeight: 600, color: "var(--accent)" }}>#{r.id}</td>
                    <td
                      style={{
                        maxWidth: "260px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span className={`badge method-${r.method}`} style={{ marginRight: "0.5rem" }}>
                        {r.method}
                      </span>
                      {r.url}
                    </td>
                    <td>{r.concurrency} VU</td>
                    <td style={{ color: "#38bdf8", fontWeight: 600 }}>{r.p95}ms</td>
                    <td>{r.throughput_rps} req/s</td>
                    <td>
                      <span className={r.success_rate >= 99 ? "badge badge-2xx" : "badge badge-4xx"}>
                        {r.success_rate}%
                      </span>
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                      {r.created_at}
                    </td>
                    <td>
                      <button
                        className="btn-danger"
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                        onClick={(e) => handleDeleteRun(e, r.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* Run Detail Drilldown Modal */}
      {selectedRunDetail && (
        <div className="modal-overlay" onClick={() => setSelectedRunDetail(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="card-title">
              <span>
                Test Run #{selectedRunDetail.run.id} Details: {selectedRunDetail.run.method}{" "}
                {selectedRunDetail.run.url}
              </span>
              <button
                className="btn-secondary"
                onClick={() => setSelectedRunDetail(null)}
              >
                Close
              </button>
            </div>

            <div className="metrics-grid">
              <MetricCard
                label="Total Requests"
                value={selectedRunDetail.metrics.totalRequests}
              />
              <MetricCard
                label="Success Rate"
                value={selectedRunDetail.metrics.successRate}
                unit="%"
                highlight
              />
              <MetricCard label="Avg Latency" value={selectedRunDetail.metrics.avgMs} unit="ms" />
              <MetricCard label="P50 Latency" value={selectedRunDetail.metrics.p50} unit="ms" />
              <MetricCard
                label="P95 Latency"
                value={selectedRunDetail.metrics.p95}
                unit="ms"
                highlight
              />
              <MetricCard label="P99 Latency" value={selectedRunDetail.metrics.p99} unit="ms" />
              <MetricCard
                label="Throughput"
                value={selectedRunDetail.metrics.throughputRps}
                unit=" req/s"
                highlight
              />
            </div>

            {/* Apdex Score Card */}
            {selectedRunDetail.apdex && <ApdexCard apdex={selectedRunDetail.apdex} />}

            {selectedRunDetail.insights && (
              <InsightsList insights={selectedRunDetail.insights} />
            )}

            {selectedRunDetail.requests && (
              <>
                <LatencyChart results={selectedRunDetail.requests} />
                <div style={{ marginTop: "1rem" }}>
                  <div style={{ marginBottom: "0.5rem", fontSize: "0.85rem", fontWeight: 600 }}>
                    Request Logs ({selectedRunDetail.requests.length} requests recorded)
                  </div>
                  <div style={{ maxHeight: "250px", overflowY: "auto" }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Request #</th>
                          <th>Duration</th>
                          <th>Status</th>
                          <th>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRunDetail.requests.slice(0, 100).map((req, i) => (
                          <tr key={i}>
                            <td>#{req.request_index + 1}</td>
                            <td style={{ fontFamily: "var(--font-mono)" }}>
                              {req.duration_ms}ms
                            </td>
                            <td>
                              <StatusBadge status={req.status} />
                            </td>
                            <td style={{ color: req.success ? "var(--success)" : "var(--danger)" }}>
                              {req.success ? "Success" : "Failed"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {detailLoading && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "300px", textAlign: "center" }}>
            Loading test run details...
          </div>
        </div>
      )}
    </div>
  );
}