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
import { autoDetectAndParse } from "./utils/importers";
import { generateExecutivePdfReport } from "./utils/generatePdfReport";

function MetricCard({ label, value, highlight = false, unit = "", subtitle = "" }) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <span className={`metric-value ${highlight ? "highlight" : ""}`}>
        {value ?? "—"}{unit}
      </span>
      {subtitle && <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>{subtitle}</span>}
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
      {insights.map((ins, index) => (
        <div key={index} className={`insight-item ${ins.level || "info"}`}>
          <span className="insight-icon">{getCategoryIcon(ins)}</span>
          <div className="insight-content">
            {ins.category && (
              <span className="insight-category-badge">{ins.category.replace(/_/g, " ")}</span>
            )}
            <div>{ins.message}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ApdexCard({ apdex }) {
  if (!apdex) return null;

  const ratingClass =
    apdex.score >= 0.94
      ? "apdex-excellent"
      : apdex.score >= 0.85
      ? "apdex-good"
      : apdex.score >= 0.70
      ? "apdex-fair"
      : apdex.score >= 0.50
      ? "apdex-poor"
      : "apdex-unacceptable";

  const total = (apdex.satisfied || 0) + (apdex.tolerating || 0) + (apdex.frustrated || 0) || 1;
  const satPct = Math.round(((apdex.satisfied || 0) / total) * 100);
  const tolPct = Math.round(((apdex.tolerating || 0) / total) * 100);
  const fruPct = Math.round(((apdex.frustrated || 0) / total) * 100);

  return (
    <div className={`apdex-card ${ratingClass}`}>
      <div className="apdex-header">
        <div className="apdex-title">
          <span>Apdex User Satisfaction Index</span>
          <span className="apdex-badge">{apdex.rating}</span>
        </div>
        <div className="apdex-score-display">{apdex.score.toFixed(2)}</div>
      </div>

      <div className="apdex-progress-bar">
        <div
          className="apdex-bar satisfied"
          style={{ width: `${satPct}%` }}
          title={`Satisfied (${satPct}%)`}
        />
        <div
          className="apdex-bar tolerating"
          style={{ width: `${tolPct}%` }}
          title={`Tolerating (${tolPct}%)`}
        />
        <div
          className="apdex-bar frustrated"
          style={{ width: `${fruPct}%` }}
          title={`Frustrated (${fruPct}%)`}
        />
      </div>

      <div className="apdex-stats">
        <span>🟢 Satisfied ({satPct}%): <strong>{apdex.satisfied}</strong> (≤{apdex.targetLatencyMs}ms)</span>
        <span>🟡 Tolerating ({tolPct}%): <strong>{apdex.tolerating}</strong> (≤{apdex.targetLatencyMs * 4}ms)</span>
        <span>🔴 Frustrated ({fruPct}%): <strong>{apdex.frustrated}</strong> (&gt;{apdex.targetLatencyMs * 4}ms / errors)</span>
      </div>
    </div>
  );
}

function SlaVerdictCard({ slaVerdict }) {
  if (!slaVerdict) return null;
  const passed = slaVerdict.passed;

  return (
    <div className={`sla-card ${passed ? "sla-passed" : "sla-failed"}`}>
      <div className="sla-header">
        <span className="sla-badge">{passed ? "✓ SLA AUDIT PASSED" : "✗ SLA AUDIT FAILED"}</span>
        <span className="sla-summary">{slaVerdict.summary}</span>
      </div>
      <div className="sla-rules-grid">
        {slaVerdict.rules.map((rule, idx) => (
          <div key={idx} className={`sla-rule-item ${rule.passed ? "rule-pass" : "rule-fail"}`}>
            <div className="sla-rule-metric">{rule.metric}</div>
            <div className="sla-rule-target">Target: <span>{rule.target}</span></div>
            <div className="sla-rule-actual">Measured: <strong>{rule.actual}</strong></div>
            <div className="sla-rule-status">{rule.passed ? "PASSED" : "FAILED"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LatencyChart({ results }) {
  if (!results || results.length === 0) return null;

  const chartData = results.map((r) => ({
    request: `#${(r.requestIndex ?? 0) + 1}`,
    latency: typeof r.durationMs === "number" ? r.durationMs : 0,
    status: r.status || (r.success ? 200 : "ERR"),
    success: r.success,
  }));

  return (
    <div className="chart-wrapper">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>
          Per-Request Latency Timeline
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
          {results.length} requests plotted
        </div>
      </div>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="request" stroke="var(--text-dim)" fontSize={11} interval="preserveStartEnd" />
            <YAxis stroke="var(--text-dim)" fontSize={11} unit="ms" />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                borderColor: "rgba(255,255,255,0.15)",
                borderRadius: "8px",
                color: "#f8fafc",
                fontSize: "0.8rem",
                boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
              }}
            />
            <Line
              type="monotone"
              dataKey="latency"
              name="Latency (ms)"
              stroke="#38bdf8"
              strokeWidth={2}
              dot={{ r: 2 }}
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
  results.forEach((r) => {
    const code = r.status ? String(r.status) : "Network Err";
    counts[code] = (counts[code] || 0) + 1;
  });

  const data = Object.entries(counts).map(([status, count]) => ({
    status,
    count,
  }));

  return (
    <div className="chart-wrapper">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>
          HTTP Status Distribution
        </div>
      </div>
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="status" stroke="var(--text-dim)" fontSize={11} />
            <YAxis stroke="var(--text-dim)" fontSize={11} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                borderColor: "rgba(255,255,255,0.15)",
                borderRadius: "8px",
                color: "#f8fafc",
                fontSize: "0.8rem",
              }}
            />
            <Bar dataKey="count" name="Count" fill="#818cf8" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ScalingChart({ runs }) {
  if (!runs || runs.length === 0) return null;

  const chartData = runs.map((r) => ({
    concurrency: `${r.concurrency} VUs`,
    avgMs: r.metrics.avgMs,
    p95Ms: r.metrics.p95,
    throughput: r.metrics.throughputRps,
  }));

  return (
    <div className="chart-wrapper">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>
          Scaling Profile: Latency vs. Throughput Curve
        </div>
      </div>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="concurrency" stroke="var(--text-dim)" fontSize={11} />
            <YAxis yAxisId="left" stroke="#38bdf8" fontSize={11} unit="ms" />
            <YAxis yAxisId="right" orientation="right" stroke="#34d399" fontSize={11} unit=" rps" />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                borderColor: "rgba(255,255,255,0.15)",
                borderRadius: "8px",
                color: "#f8fafc",
                fontSize: "0.8rem",
              }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="avgMs"
              name="Avg Latency (ms)"
              stroke="#38bdf8"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="p95Ms"
              name="P95 Latency (ms)"
              stroke="#f59e0b"
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

const PRESETS = [
  {
    name: "⚡ Standard Load (20 VUs)",
    mode: "load",
    method: "GET",
    url: "https://jsonplaceholder.typicode.com/posts/1",
    concurrency: 5,
    totalRequests: 20,
    headers: '{\n  "Content-Type": "application/json"\n}',
    body: "",
  },
  {
    name: "🚀 High Burst (50 VUs)",
    mode: "load",
    method: "GET",
    url: "https://jsonplaceholder.typicode.com/posts/1",
    concurrency: 25,
    totalRequests: 100,
    headers: '{\n  "Content-Type": "application/json"\n}',
    body: "",
  },
  {
    name: "📈 Step Scaling Matrix",
    mode: "scaling",
    method: "GET",
    url: "https://jsonplaceholder.typicode.com/posts/1",
    scalingLevels: "1, 5, 10, 25",
    scalingReqs: 20,
  },
  {
    name: "🔗 Chained User Workflow",
    mode: "workflow",
  },
];

export default function App() {
  const [mode, setMode] = useState("load");
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("https://jsonplaceholder.typicode.com/posts/1");
  const [headers, setHeaders] = useState('{\n  "Content-Type": "application/json"\n}');
  const [body, setBody] = useState("");
  const [timeout, setTimeoutVal] = useState(10000);
  const [activeSubTab, setActiveSubTab] = useState("headers");

  const [concurrency, setConcurrency] = useState(5);
  const [totalRequests, setTotalRequests] = useState(20);
  const [useMultiCore, setUseMultiCore] = useState(false);
  const [workerCount, setWorkerCount] = useState(4);

  const [enableSlaBudget, setEnableSlaBudget] = useState(false);
  const [targetP95, setTargetP95] = useState(500);
  const [targetP99, setTargetP99] = useState(1000);
  const [maxErrorRate, setMaxErrorRate] = useState(1.0);
  const [minApdex, setMinApdex] = useState(0.85);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importInput, setImportInput] = useState("");
  const [importError, setImportError] = useState("");
  const [parsedEndpoints, setParsedEndpoints] = useState([]);

  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [singleResponseTab, setSingleResponseTab] = useState("body");

  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);

  const [testRuns, setTestRuns] = useState([]);
  const [historySearch, setHistorySearch] = useState("");
  const [selectedRunDetail, setSelectedRunDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [compareRunA, setCompareRunA] = useState("");
  const [compareRunB, setCompareRunB] = useState("");
  const [compareResult, setCompareResult] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const [scalingLevels, setScalingLevels] = useState("1, 5, 10, 25");
  const [scalingReqs, setScalingReqs] = useState(20);
  const [scalingResult, setScalingResult] = useState(null);
  const [scalingLoading, setScalingLoading] = useState(false);

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
        } catch (err) {
          void err;
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
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  async function fetchTestRuns() {
    try {
      const res = await fetch("http://localhost:4000/api/test-runs");
      const data = await res.json();
      if (data.success) {
        setTestRuns(data.runs);
        if (data.runs.length >= 2) {
          setCompareRunA(String(data.runs[0].id));
          setCompareRunB(String(data.runs[1].id));
        }
      }
    } catch {
      void 0;
    }
  }

  async function fetchRunDetail(runId) {
    setDetailLoading(true);
    try {
      const res = await fetch(`http://localhost:4000/api/test-runs/${runId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedRunDetail(data);
      }
    } catch {
      void 0;
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleDeleteRun(e, runId) {
    e.stopPropagation();
    try {
      const res = await fetch(`http://localhost:4000/api/test-runs/${runId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setTestRuns((prev) => prev.filter((r) => r.id !== runId));
        if (selectedRunDetail?.run?.id === runId) {
          setSelectedRunDetail(null);
        }
      }
    } catch {
      void 0;
    }
  }

  async function handleClearAllRuns() {
    if (!window.confirm("Are you sure you want to clear all test run history?")) return;
    try {
      const res = await fetch("http://localhost:4000/api/test-runs", {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setTestRuns([]);
        setSelectedRunDetail(null);
      }
    } catch {
      void 0;
    }
  }

  function parseJsonPayloads() {
    let parsedHeaders = {};
    if (headers.trim()) {
      try {
        parsedHeaders = JSON.parse(headers);
      } catch {
        throw new Error("Headers must be valid JSON format (e.g. {\"Authorization\": \"Bearer ...\"})");
      }
    }

    let parsedBody = null;
    if (body.trim()) {
      try {
        parsedBody = JSON.parse(body);
      } catch {
        parsedBody = body;
      }
    }

    return { parsedHeaders, parsedBody };
  }

  function handleImportSubmit() {
    setImportError("");
    try {
      const result = autoDetectAndParse(importInput);
      if (result.type === "curl") {
        const item = result.items[0];
        setMethod(item.method);
        setUrl(item.url);
        setHeaders(JSON.stringify(item.headers, null, 2));
        setBody(typeof item.body === "object" ? JSON.stringify(item.body, null, 2) : String(item.body || ""));
        setShowImportModal(false);
      } else {
        setParsedEndpoints(result.items);
      }
    } catch (err) {
      setImportError(err.message || "Failed to parse input.");
    }
  }

  function handleSelectImportedEndpoint(ep, targetMode = "single") {
    setMethod(ep.method);
    setUrl(ep.url);
    setHeaders(JSON.stringify(ep.headers || {}, null, 2));
    setBody(typeof ep.body === "object" ? JSON.stringify(ep.body, null, 2) : String(ep.body || ""));
    setMode(targetMode);
    setShowImportModal(false);
  }

  function handleImportAsWorkflow() {
    if (!parsedEndpoints || parsedEndpoints.length === 0) return;
    const steps = parsedEndpoints.map((ep) => ({
      name: ep.name || `${ep.method} ${ep.url}`,
      request: {
        method: ep.method,
        url: ep.url,
        headers: ep.headers,
        body: ep.body ? (typeof ep.body === "string" ? JSON.parse(ep.body || "{}") : ep.body) : undefined,
      },
    }));
    setWorkflowSteps(JSON.stringify(steps, null, 2));
    setMode("workflow");
    setShowImportModal(false);
  }

  function handleLoadPreset(preset) {
    if (preset.mode) setMode(preset.mode);
    if (preset.method) setMethod(preset.method);
    if (preset.url) setUrl(preset.url);
    if (preset.concurrency) setConcurrency(preset.concurrency);
    if (preset.totalRequests) setTotalRequests(preset.totalRequests);
    if (preset.headers) setHeaders(preset.headers);
    if (preset.body !== undefined) setBody(preset.body);
    if (preset.scalingLevels) setScalingLevels(preset.scalingLevels);
    if (preset.scalingReqs) setScalingReqs(preset.scalingReqs);
  }

  function prettyPrintJson(text, setter) {
    try {
      const obj = JSON.parse(text);
      setter(JSON.stringify(obj, null, 2));
    } catch {
      alert("Invalid JSON format");
    }
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

    const slaBudget = enableSlaBudget
      ? {
          targetP95Ms: Number(targetP95) || 0,
          targetP99Ms: Number(targetP99) || 0,
          maxErrorRate: Number(maxErrorRate) || 0,
          minApdex: Number(minApdex) || 0,
        }
      : null;

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
          useMultiCore,
          workerCount: Number(workerCount) || 4,
          slaBudget,
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
      if (data.success) {
        setCompareResult(data);
      } else {
        alert(data.error || "Comparison failed");
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setCompareLoading(false);
    }
  }

  async function handleRunScalingTest() {
    setScalingLoading(true);
    setScalingResult(null);

    let payloads;
    try {
      payloads = parseJsonPayloads();
    } catch (err) {
      alert(err.message);
      setScalingLoading(false);
      return;
    }

    const levels = scalingLevels
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);

    if (levels.length === 0) {
      alert("Please provide at least one valid concurrency level (e.g. 1, 5, 10)");
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
      if (data.success) {
        setScalingResult(data);
      } else {
        alert(data.error || "Scaling test failed");
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setScalingLoading(false);
    }
  }

  async function handleRunWorkflow() {
    setWorkflowLoading(true);
    setWorkflowResult(null);

    let parsedSteps;
    try {
      parsedSteps = JSON.parse(workflowSteps);
    } catch {
      alert("Workflow steps must be a valid JSON array");
      setWorkflowLoading(false);
      return;
    }

    try {
      const res = await fetch("http://localhost:4000/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: parsedSteps }),
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
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `loadtest-run-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(href);
  }

  function exportResultsAsCsv(results) {
    if (!results || results.length === 0) return;
    const header = "RequestIndex,DurationMs,Status,Success\n";
    const rows = results
      .map((r) => `${(r.requestIndex ?? 0) + 1},${r.durationMs ?? 0},${r.status ?? "ERR"},${r.success ? 1 : 0}`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `loadtest-requests-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(href);
  }

  const filteredRuns = testRuns.filter((r) => {
    if (!historySearch.trim()) return true;
    const q = historySearch.toLowerCase();
    return (
      r.url?.toLowerCase().includes(q) ||
      r.method?.toLowerCase().includes(q) ||
      String(r.id).includes(q)
    );
  });

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">⚡</div>
          <div>
            <h1>PulseAPI Platform</h1>
            <div className="brand-subtitle">
              High-Throughput Load Tester, Statistical Latency Analyzer & Diagnostics
            </div>
          </div>
        </div>

        <div className="header-actions">
          <button
            className="btn-secondary"
            onClick={() => {
              setImportInput("");
              setImportError("");
              setParsedEndpoints([]);
              setShowImportModal(true);
            }}
          >
            <span>📥</span>
            <span>Import API (cURL / Swagger / Postman)</span>
          </button>

          <div className="ws-status">
            <div className={`status-dot ${wsConnected ? "connected" : ""}`} />
            <span>{wsConnected ? "Live Socket Active" : "Socket Reconnecting..."}</span>
          </div>
        </div>
      </header>

      <div className="presets-bar">
        <span className="presets-label">⚡ Quick Presets:</span>
        {PRESETS.map((p, i) => (
          <button
            key={i}
            className="preset-chip"
            onClick={() => handleLoadPreset(p)}
          >
            {p.name}
          </button>
        ))}
      </div>

      <nav className="nav-tabs">
        {[
          { id: "load", label: "Load Benchmark", icon: "🚀" },
          { id: "single", label: "Single Request", icon: "🎯" },
          { id: "scaling", label: "Scaling Matrix", icon: "📈" },
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

      {(mode === "single" || mode === "load" || mode === "scaling") && (
        <section className="card">
          <div className="card-title">
            <span>
              {mode === "single"
                ? "Individual Request Inspector"
                : mode === "load"
                ? "Concurrent Load Test Engine"
                : "Stepped Concurrency Scaling Benchmark"}
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              {mode === "load" && `${totalRequests} reqs @ ${concurrency} VUs ${useMultiCore ? `(${workerCount} threads)` : ""}`}
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
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/endpoint"
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
                {loading ? `Testing (${progress.completed}/${progress.total})...` : "Launch Load Test"}
              </button>
            )}

            {mode === "scaling" && (
              <button
                className="btn-primary"
                onClick={handleRunScalingTest}
                disabled={scalingLoading || !url.trim()}
              >
                {scalingLoading ? "Testing Matrix..." : "Launch Scaling Test"}
              </button>
            )}
          </div>

          {mode === "load" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.25rem" }}>
              <div className="options-row">
                <div className="option-group">
                  <label>Virtual Users (VUs):</label>
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
                    style={{ width: "95px" }}
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
                    style={{ width: "95px" }}
                    value={timeout}
                    onChange={(e) => setTimeoutVal(Number(e.target.value))}
                  />
                </div>

                <div className="option-group" style={{ flexDirection: "row", alignItems: "center", gap: "0.6rem", marginTop: "auto" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={useMultiCore}
                      onChange={(e) => setUseMultiCore(e.target.checked)}
                    />
                    <span>⚡ Multi-Core Engine</span>
                  </label>
                  {useMultiCore && (
                    <select
                      value={workerCount}
                      onChange={(e) => setWorkerCount(Number(e.target.value))}
                      className="option-input"
                      style={{ padding: "0.25rem 0.5rem" }}
                    >
                      <option value="2">2 Worker Threads</option>
                      <option value="4">4 Worker Threads</option>
                      <option value="8">8 Worker Threads</option>
                      <option value="16">16 Worker Threads</option>
                    </select>
                  )}
                </div>
              </div>

              <div className="budget-collapsible">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: 700, fontSize: "0.875rem" }}>
                    <input
                      type="checkbox"
                      checked={enableSlaBudget}
                      onChange={(e) => setEnableSlaBudget(e.target.checked)}
                    />
                    <span>🎯 Enforce SLA Performance Budget & Assertions</span>
                  </label>
                  <span style={{ fontSize: "0.75rem", color: enableSlaBudget ? "var(--accent)" : "var(--text-dim)", fontWeight: 600 }}>
                    {enableSlaBudget ? "Active Evaluation" : "Disabled"}
                  </span>
                </div>

                {enableSlaBudget && (
                  <div className="budget-inputs-grid">
                    <div className="option-group">
                      <label>Target P95 (ms):</label>
                      <input
                        type="number"
                        min="10"
                        className="option-input"
                        value={targetP95}
                        onChange={(e) => setTargetP95(Number(e.target.value))}
                      />
                    </div>
                    <div className="option-group">
                      <label>Target P99 (ms):</label>
                      <input
                        type="number"
                        min="10"
                        className="option-input"
                        value={targetP99}
                        onChange={(e) => setTargetP99(Number(e.target.value))}
                      />
                    </div>
                    <div className="option-group">
                      <label>Max Error Rate (%):</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        className="option-input"
                        value={maxErrorRate}
                        onChange={(e) => setMaxErrorRate(Number(e.target.value))}
                      />
                    </div>
                    <div className="option-group">
                      <label>Min Apdex Score:</label>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        className="option-input"
                        value={minApdex}
                        onChange={(e) => setMinApdex(Number(e.target.value))}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === "scaling" && (
            <div className="options-row">
              <div className="option-group">
                <label>Concurrency Matrix Levels:</label>
                <input
                  type="text"
                  style={{ width: "200px" }}
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
                  style={{ width: "95px" }}
                  value={scalingReqs}
                  onChange={(e) => setScalingReqs(Number(e.target.value))}
                />
              </div>

              <div className="option-group">
                <label>Timeout (ms):</label>
                <input
                  type="number"
                  min="500"
                  step="500"
                  className="option-input"
                  style={{ width: "95px" }}
                  value={timeout}
                  onChange={(e) => setTimeoutVal(Number(e.target.value))}
                />
              </div>
            </div>
          )}

          <div style={{ marginTop: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
              </div>

              <button
                className="btn-secondary"
                style={{ padding: "0.25rem 0.65rem", fontSize: "0.75rem" }}
                onClick={() => {
                  if (activeSubTab === "headers") prettyPrintJson(headers, setHeaders);
                  else prettyPrintJson(body, setBody);
                }}
              >
                ✨ Format JSON
              </button>
            </div>

            {activeSubTab === "headers" && (
              <textarea
                className="code-editor"
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                placeholder='{\n  "Authorization": "Bearer token"\n}'
              />
            )}

            {activeSubTab === "body" && (
              <textarea
                className="code-editor"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder='{\n  "title": "foo",\n  "body": "bar",\n  "userId": 1\n}'
              />
            )}
          </div>
        </section>
      )}

      {loading && mode === "load" && (
        <section className="card">
          <div className="progress-container">
            <div className="progress-labels">
              <span>🚀 Dispatching Concurrent Virtual User Load...</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>
                {progress.completed} / {progress.total} requests (
                {Math.round((progress.completed / (progress.total || 1)) * 100)}%)
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.round((progress.completed / (progress.total || 1)) * 100)}%`,
                }}
              />
            </div>
          </div>
        </section>
      )}

      {mode === "single" && response && (
        <section className="card">
          <div className="card-title">
            <span>Response Inspector</span>
            <div className="response-header">
              <StatusBadge status={response.status} />
              <span style={{ fontSize: "0.85rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                Latency: <strong>{response.durationMs}ms</strong>
              </span>
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

      {mode === "load" && response && response.metrics && (
        <section className="card">
          <div className="card-title">
            <span>Load Benchmark Analytics Dashboard</span>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button
                className="btn-primary"
                style={{ padding: "0.45rem 0.95rem", fontSize: "0.8rem", background: "linear-gradient(135deg, #0284c7, #2563eb)" }}
                onClick={() =>
                  generateExecutivePdfReport({
                    run: { url, method, concurrency, total_requests: totalRequests },
                    metrics: response.metrics,
                    apdex: response.apdex,
                    insights: response.insights,
                    slaVerdict: response.slaVerdict,
                  })
                }
              >
                📄 Export Executive PDF
              </button>
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

          {response.slaVerdict && <SlaVerdictCard slaVerdict={response.slaVerdict} />}

          {response.apdex && <ApdexCard apdex={response.apdex} />}

          {response.insights && response.insights.length > 0 && (
            <div>
              <div style={{ marginBottom: "0.5rem", fontSize: "0.85rem", fontWeight: 700 }}>
                Performance Intelligence & Root-Cause Diagnostics
              </div>
              <InsightsList insights={response.insights} />
            </div>
          )}

          {response.results && response.results.length > 0 && (
            <>
              <LatencyChart results={response.results} />
              <StatusBreakdownChart results={response.results} />
            </>
          )}
        </section>
      )}

      {mode === "scaling" && scalingResult && (
        <section className="card">
          <div className="card-title">
            <span>Scaling Matrix Results (Group #{scalingResult.scalingGroupId})</span>
            <button
              className="btn-primary"
              style={{ padding: "0.45rem 0.95rem", fontSize: "0.8rem", background: "linear-gradient(135deg, #0284c7, #2563eb)" }}
              onClick={() =>
                generateExecutivePdfReport({
                  run: { url, method, concurrency: "Stepped Matrix", total_requests: scalingReqs * scalingResult.runs.length },
                  metrics: scalingResult.runs[scalingResult.runs.length - 1]?.metrics,
                  apdex: null,
                  insights: scalingResult.insights,
                  slaVerdict: null,
                })
              }
            >
              📄 Export Executive PDF
            </button>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Concurrency</th>
                <th>Avg Latency</th>
                <th>P50</th>
                <th>P95</th>
                <th>P99</th>
                <th>Throughput</th>
                <th>Success Rate</th>
              </tr>
            </thead>
            <tbody>
              {scalingResult.runs.map((r) => (
                <tr key={r.concurrency}>
                  <td>
                    <strong>{r.concurrency} VUs</strong>
                  </td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{r.metrics.avgMs}ms</td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{r.metrics.p50}ms</td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{r.metrics.p95}ms</td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{r.metrics.p99}ms</td>
                  <td style={{ color: "var(--success)", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                    {r.metrics.throughputRps} rps
                  </td>
                  <td>
                    <span className={r.metrics.successRate >= 99 ? "badge badge-2xx" : "badge badge-4xx"}>
                      {r.metrics.successRate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {scalingResult.insights && scalingResult.insights.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <div style={{ marginBottom: "0.5rem", fontSize: "0.85rem", fontWeight: 700 }}>
                Sweet Spot & Capacity Saturation Analysis
              </div>
              <InsightsList insights={scalingResult.insights} />
            </div>
          )}

          <ScalingChart runs={scalingResult.runs} />
        </section>
      )}

      {mode === "workflow" && (
        <section className="card">
          <div className="card-title">
            <span>Chained Multi-Step Workflow Engine</span>
            <button
              className="btn-primary"
              onClick={handleRunWorkflow}
              disabled={workflowLoading}
            >
              {workflowLoading ? "Executing Steps..." : "Run Workflow"}
            </button>
          </div>

          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0.25rem 0 0.75rem" }}>
            Chain dependent requests where downstream steps dynamically extract values from upstream responses using{" "}
            <code>&#123;&#123;variableName&#125;&#125;</code> template syntax.
          </p>

          <textarea
            className="code-editor"
            style={{ height: "240px" }}
            value={workflowSteps}
            onChange={(e) => setWorkflowSteps(e.target.value)}
          />

          {workflowResult && (
            <div style={{ marginTop: "1.25rem" }}>
              <div className="card-title">
                <span>Workflow Execution Summary</span>
                <StatusBadge status={workflowResult.success ? 200 : 500} />
              </div>

              <div className="metrics-grid">
                <MetricCard label="Total Steps" value={workflowResult.totalSteps} />
                <MetricCard
                  label="Passed Steps"
                  value={workflowResult.completedSteps}
                  highlight={workflowResult.success}
                />
                <MetricCard
                  label="Total Duration"
                  value={workflowResult.totalDurationMs}
                  unit="ms"
                />
              </div>

              {workflowResult.stepResults && (
                <div style={{ marginTop: "1rem" }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Step #</th>
                        <th>Name</th>
                        <th>Method & URL</th>
                        <th>Status</th>
                        <th>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workflowResult.stepResults.map((s) => (
                        <tr key={s.stepIndex}>
                          <td>#{s.stepIndex + 1}</td>
                          <td>
                            <strong>{s.name}</strong>
                          </td>
                          <td style={{ fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}>
                            {s.request?.method} {s.request?.url}
                          </td>
                          <td>
                            <StatusBadge status={s.status} />
                          </td>
                          <td style={{ fontFamily: "var(--font-mono)" }}>{s.durationMs}ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {mode === "compare" && (
        <section className="card">
          <div className="card-title">
            <span>Regression & Diff Engine (A/B Test Run Comparison)</span>
          </div>

          <div className="request-bar">
            <div className="option-group" style={{ flex: 1 }}>
              <label>Baseline Run (Run A):</label>
              <select
                className="option-input"
                style={{ width: "100%" }}
                value={compareRunA}
                onChange={(e) => setCompareRunA(e.target.value)}
              >
                <option value="">Select Baseline Run</option>
                {testRuns.map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.id} — {r.method} {r.url} ({r.concurrency} VUs, {r.avg_ms}ms avg)
                  </option>
                ))}
              </select>
            </div>

            <div className="option-group" style={{ flex: 1 }}>
              <label>Comparison Run (Run B):</label>
              <select
                className="option-input"
                style={{ width: "100%" }}
                value={compareRunB}
                onChange={(e) => setCompareRunB(e.target.value)}
              >
                <option value="">Select Comparison Run</option>
                {testRuns.map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.id} — {r.method} {r.url} ({r.concurrency} VUs, {r.avg_ms}ms avg)
                  </option>
                ))}
              </select>
            </div>

            <button
              className="btn-primary"
              style={{ alignSelf: "flex-end" }}
              onClick={handleCompare}
              disabled={compareLoading || !compareRunA || !compareRunB}
            >
              {compareLoading ? "Analyzing..." : "Compare Runs"}
            </button>
          </div>

          {compareResult && compareResult.comparison && (
            <div style={{ marginTop: "1.25rem" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Run #{compareResult.runA.id} (Before)</th>
                    <th>Run #{compareResult.runB.id} (After)</th>
                    <th>Difference</th>
                    <th>% Change</th>
                    <th>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(compareResult.comparison).map(([metric, diff]) => {
                    const isImproved = diff.verdict === "improved";
                    const isDegraded = diff.verdict === "degraded";
                    return (
                      <tr key={metric}>
                        <td>
                          <strong>{metric}</strong>
                        </td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>{diff.before}</td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>{diff.after}</td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>
                          {diff.diff > 0 ? `+${diff.diff}` : diff.diff}
                        </td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>
                          {diff.percentChange > 0
                            ? `+${diff.percentChange}%`
                            : `${diff.percentChange}%`}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              isImproved
                                ? "badge-2xx"
                                : isDegraded
                                ? "badge-4xx"
                                : "badge-3xx"
                            }`}
                          >
                            {diff.verdict.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {mode === "history" && (
        <section className="card">
          <div className="card-title">
            <span>Historical Test Run Records</span>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Search history by URL or ID..."
                className="option-input"
                style={{ width: "220px" }}
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
              {testRuns.length > 0 && (
                <button
                  className="btn-danger"
                  style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }}
                  onClick={handleClearAllRuns}
                >
                  Clear History
                </button>
              )}
            </div>
          </div>

          {filteredRuns.length === 0 ? (
            <div style={{ color: "var(--text-dim)", textAlign: "center", padding: "2.5rem" }}>
              No test runs recorded matching your search. Execute a Load Test to persist runs here.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Method & Target URL</th>
                  <th>VUs</th>
                  <th>Total Reqs</th>
                  <th>Avg Latency</th>
                  <th>P95</th>
                  <th>Throughput</th>
                  <th>Success Rate</th>
                  <th>Recorded At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map((r) => (
                  <tr
                    key={r.id}
                    className="clickable"
                    onClick={() => fetchRunDetail(r.id)}
                  >
                    <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>#{r.id}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>
                      <span className={`method-${r.method}`} style={{ fontWeight: 800, marginRight: "0.5rem" }}>
                        {r.method}
                      </span>
                      {r.url}
                    </td>
                    <td>{r.concurrency} VUs</td>
                    <td>{r.total_requests}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{r.avg_ms}ms</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{r.p95}ms</td>
                    <td style={{ fontFamily: "var(--font-mono)", color: "var(--success)" }}>{r.throughput_rps} rps</td>
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
                        style={{ padding: "0.25rem 0.55rem", fontSize: "0.75rem" }}
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

      {selectedRunDetail && (
        <div className="modal-overlay" onClick={() => setSelectedRunDetail(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="card-title">
              <span>
                Test Run #{selectedRunDetail.run.id} Details: {selectedRunDetail.run.method}{" "}
                {selectedRunDetail.run.url}
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  className="btn-primary"
                  style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem", background: "linear-gradient(135deg, #0284c7, #2563eb)" }}
                  onClick={() =>
                    generateExecutivePdfReport({
                      run: selectedRunDetail.run,
                      metrics: selectedRunDetail.metrics,
                      apdex: selectedRunDetail.apdex,
                      insights: selectedRunDetail.insights,
                      slaVerdict: selectedRunDetail.slaVerdict,
                    })
                  }
                >
                  📄 Export Executive PDF
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => setSelectedRunDetail(null)}
                >
                  Close
                </button>
              </div>
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

            {selectedRunDetail.slaVerdict && <SlaVerdictCard slaVerdict={selectedRunDetail.slaVerdict} />}

            {selectedRunDetail.apdex && <ApdexCard apdex={selectedRunDetail.apdex} />}

            {selectedRunDetail.insights && (
              <InsightsList insights={selectedRunDetail.insights} />
            )}

            {selectedRunDetail.requests && (
              <>
                <LatencyChart results={selectedRunDetail.requests} />
                <div style={{ marginTop: "1rem" }}>
                  <div style={{ marginBottom: "0.5rem", fontSize: "0.85rem", fontWeight: 700 }}>
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

      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="card-title">
              <span>Import API Definition / Request</span>
              <button className="btn-secondary" onClick={() => setShowImportModal(false)}>
                Close
              </button>
            </div>

            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>
              Paste a <strong>cURL command</strong>, <strong>Swagger / OpenAPI JSON</strong>, or a <strong>Postman Collection (v2.1) JSON</strong> to automatically configure tests.
            </p>

            <textarea
              className="code-editor"
              style={{ height: "160px" }}
              value={importInput}
              onChange={(e) => setImportInput(e.target.value)}
              placeholder="curl -X POST https://api.example.com/login -H 'Content-Type: application/json' -d '{&quot;username&quot;: &quot;admin&quot;}'"
            />

            {importError && (
              <div className="insight-item error" style={{ margin: 0 }}>
                <span>⚠️</span>
                <div>{importError}</div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button className="btn-primary" onClick={handleImportSubmit} disabled={!importInput.trim()}>
                Parse & Extract Endpoints
              </button>
            </div>

            {parsedEndpoints.length > 0 && (
              <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                    Extracted Endpoints ({parsedEndpoints.length} routes found)
                  </div>
                  <button className="btn-secondary" onClick={handleImportAsWorkflow}>
                    Import All into Workflow Chain
                  </button>
                </div>

                <div className="endpoint-picker">
                  {parsedEndpoints.map((ep, idx) => (
                    <div key={idx} className="endpoint-picker-item">
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span className={`method-${ep.method}`} style={{ fontWeight: 800, fontSize: "0.8rem" }}>
                          {ep.method}
                        </span>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                          {ep.url}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button
                          className="btn-secondary"
                          style={{ padding: "0.25rem 0.55rem", fontSize: "0.75rem" }}
                          onClick={() => handleSelectImportedEndpoint(ep, "single")}
                        >
                          Single Request
                        </button>
                        <button
                          className="btn-primary"
                          style={{ padding: "0.25rem 0.55rem", fontSize: "0.75rem" }}
                          onClick={() => handleSelectImportedEndpoint(ep, "load")}
                        >
                          Load Test
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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