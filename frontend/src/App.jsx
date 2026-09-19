import { useState } from "react";
import { useEffect, useRef } from "react";
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

function MetricCard({ label, value }) {
  return (
    <div
      style={{
        background: "#1a1a1a",
        padding: "1rem",
        borderRadius: "6px",
        minWidth: "110px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "0.75rem", color: "#999" }}>{label}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: "bold", color: "#eee" }}>
        {value}
      </div>
    </div>
  );
}

function LatencyChart({ results }) {
  const chartData = [...results]
    .sort((a, b) => a.requestIndex - b.requestIndex)
    .map((r) => ({ request: r.requestIndex, latency: r.durationMs }));

  return (
    <div style={{ width: "100%", height: 300, marginTop: "1.5rem" }}>
      <ResponsiveContainer>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis
            dataKey="request"
            stroke="#999"
            label={{
              value: "Request #",
              position: "insideBottom",
              offset: -5,
              fill: "#999",
            }}
          />
          <YAxis
            stroke="#999"
            label={{
              value: "Latency (ms)",
              angle: -90,
              position: "insideLeft",
              fill: "#999",
            }}
          />
          <Tooltip
            contentStyle={{ background: "#1a1a1a", border: "1px solid #444" }}
          />
          <Line
            type="monotone"
            dataKey="latency"
            stroke="#4fc3f7"
            dot={{ r: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatusBreakdownChart({ results }) {
  const counts = {};
  for (const r of results) {
    const key = r.status ?? "error";
    counts[key] = (counts[key] || 0) + 1;
  }

  const chartData = Object.entries(counts).map(([status, count]) => ({
    status: String(status),
    count,
  }));

  return (
    <div style={{ width: "100%", height: 250, marginTop: "1.5rem" }}>
      <ResponsiveContainer>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="status" stroke="#999" />
          <YAxis stroke="#999" allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "#1a1a1a", border: "1px solid #444" }}
          />
          <Bar dataKey="count" fill="#4fc3f7" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ScalingChart({ runs }) {
  const chartData = [...runs]
    .sort((a, b) => a.concurrency - b.concurrency)
    .map((r) => ({
      concurrency: r.concurrency,
      p95: r.metrics.p95,
      throughput: r.metrics.throughput_rps,
    }));

  return (
    <div style={{ width: "100%", height: 300, marginTop: "1.5rem" }}>
      <ResponsiveContainer>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis
            dataKey="concurrency"
            stroke="#999"
            label={{
              value: "Concurrency",
              position: "insideBottom",
              offset: -5,
              fill: "#999",
            }}
          />
          <YAxis
            yAxisId="left"
            stroke="#4fc3f7"
            label={{
              value: "P95 (ms)",
              angle: -90,
              position: "insideLeft",
              fill: "#4fc3f7",
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#81c784"
            label={{
              value: "Throughput (req/s)",
              angle: 90,
              position: "insideRight",
              fill: "#81c784",
            }}
          />
          <Tooltip
            contentStyle={{ background: "#1a1a1a", border: "1px solid #444" }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="p95"
            stroke="#4fc3f7"
            name="P95 (ms)"
            dot={{ r: 3 }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="throughput"
            stroke="#81c784"
            name="Throughput (req/s)"
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function App() {
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [headers, setHeaders] = useState("{}");
  const [body, setBody] = useState("");
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const wsRef = useRef(null);
  const [mode, setMode] = useState("single");
  const [concurrency, setConcurrency] = useState(5);
  const [totalRequests, setTotalRequests] = useState(20);
  const [testRuns, setTestRuns] = useState([]);
  const [compareRunA, setCompareRunA] = useState("");
  const [compareRunB, setCompareRunB] = useState("");
  const [compareResult, setCompareResult] = useState(null);
  const [scalingConcurrencyLevels, setScalingConcurrencyLevels] =
    useState("1,5,10,25");
  const [scalingRequestsPerLevel, setScalingRequestsPerLevel] = useState(20);
  const [scalingResult, setScalingResult] = useState(null);
  const [scalingLoading, setScalingLoading] = useState(false);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:4001");
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "progress") {
        setProgress({ completed: data.completed, total: data.total });
      }
    };

    return () => ws.close();
  }, []);

  async function fetchTestRuns() {
    try {
      const res = await fetch("http://localhost:4000/api/test-runs");
      const data = await res.json();
      if (data.success) setTestRuns(data.runs);
    } catch (err) {
      console.error("Failed to fetch test runs:", err);
    }
  }

  async function handleSend() {
    setLoading(true);
    setResponse(null);

    let parseHeaders = {};
    let parseBody = null;

    try {
      parseHeaders = headers.trim() ? JSON.parse(headers) : {};
    } catch (err) {
      setResponse({
        success: false,
        error: "Header is not valid JSON: " + err.message,
      });
      setLoading(false);
      return;
    }

    if (body.trim()) {
      try {
        parseBody = JSON.parse(body);
      } catch (err) {
        setResponse({
          success: false,
          error: "Body is not valid JSON: " + err.message,
        });
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch("http://localhost:4000/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          url,
          headers: parseHeaders,
          body: parseBody,
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

    try {
      const res = await fetch("http://localhost:4000/api/load-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, url, concurrency, totalRequests }),
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
    try {
      const res = await fetch(
        `http://localhost:4000/api/compare?runA=${compareRunA}&runB=${compareRunB}`,
      );
      const data = await res.json();
      setCompareResult(data);
    } catch (err) {
      setCompareResult({ success: false, error: err.message });
    }
  }

  async function handleRunScalingTest() {
    const levels = scalingConcurrencyLevels
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n) && n > 0);

    if (levels.length === 0) {
      setScalingResult({
        success: false,
        error: "Enter valid comma-separated concurrency levels, e.g. 1,5,10,25",
      });
      return;
    }

    setScalingLoading(true);
    setScalingResult(null);

    try {
      const res = await fetch("http://localhost:4000/api/scaling-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          method,
          totalRequestsPerLevel: scalingRequestsPerLevel,
          concurrencyLevels: levels,
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

  return (
    <div style={{ padding: "2em", maxWidth: "700px", margin: "0 auto" }}>
      <h1>API Load Tester</h1>

      <div style={{ marginBottom: "1rem" }}>
        <button
          onClick={() => {
            setMode("single");
            setResponse(null);
          }}
          disabled={mode === "single"}
        >
          Single Request
        </button>
        <button
          onClick={() => {
            setMode("load");
            setResponse(null);
          }}
          disabled={mode === "load"}
        >
          Load Test
        </button>
        <button
          onClick={() => {
            setMode("history");
            setResponse(null);
            fetchTestRuns();
          }}
          disabled={mode === "history"}
        >
          History
        </button>
        <button
          onClick={() => {
            setMode("compare");
            setResponse(null);
            fetchTestRuns();
          }}
          disabled={mode === "compare"}
        >
          Compare
        </button>
        <button
          onClick={() => {
            setMode("scaling");
            setResponse(null);
            setScalingResult(null);
          }}
          disabled={mode === "scaling"}
        >
          Scaling Test
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value={"GET"}>GET</option>
          <option value={"POST"}>POST</option>
          <option value={"PUT"}>PUT</option>
          <option value={"DELETE"}>DELETE</option>
        </select>

        <input
          type="text"
          placeholder="https://api.example.com/endpoint"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ flex: 1 }}
        />

        {mode === "load" && (
          <>
            <label>
              Concurrency:
              <input
                type="number"
                min="1"
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                style={{ width: "60px", marginLeft: "0.5rem" }}
              />
            </label>
            <label>
              Total Requests:
              <input
                type="number"
                min="1"
                value={totalRequests}
                onChange={(e) => setTotalRequests(Number(e.target.value))}
                style={{ width: "80px", marginLeft: "0.5rem" }}
              />
            </label>
          </>
        )}

        {(mode === "single" || mode === "load") && (
          <button
            onClick={mode === "single" ? handleSend : handleRunLoadTest}
            disabled={loading || !url}
          >
            {loading
              ? mode === "load"
                ? `Running... (${progress.completed}/${progress.total})`
                : "Sending..."
              : "Send"}
          </button>
        )}
      </div>

      <div>
        {mode === "history" && (
          <div>
            <h3>Saved Test Runs</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{ textAlign: "left", borderBottom: "1px solid #444" }}
                >
                  <th style={{ padding: "0.5rem" }}>ID</th>
                  <th style={{ padding: "0.5rem" }}>URL</th>
                  <th style={{ padding: "0.5rem" }}>Concurrency</th>
                  <th style={{ padding: "0.5rem" }}>P95</th>
                  <th style={{ padding: "0.5rem" }}>Success Rate</th>
                  <th style={{ padding: "0.5rem" }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {testRuns.map((run) => (
                  <tr
                    key={run.id}
                    style={{ borderBottom: "1px solid #2a2a2a" }}
                  >
                    <td style={{ padding: "0.5rem" }}>{run.id}</td>
                    <td
                      style={{
                        padding: "0.5rem",
                        maxWidth: "250px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {run.url}
                    </td>
                    <td style={{ padding: "0.5rem" }}>{run.concurrency}</td>
                    <td style={{ padding: "0.5rem" }}>{run.p95}ms</td>
                    <td style={{ padding: "0.5rem" }}>{run.success_rate}%</td>
                    <td style={{ padding: "0.5rem" }}>{run.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {mode === "compare" && (
          <div>
            <h3>Compare Two Runs</h3>
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <select
                value={compareRunA}
                onChange={(e) => setCompareRunA(e.target.value)}
              >
                <option value="">Select Run A (before)</option>
                {testRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    #{run.id} — concurrency {run.concurrency}, P95 {run.p95}ms (
                    {run.created_at})
                  </option>
                ))}
              </select>

              <select
                value={compareRunB}
                onChange={(e) => setCompareRunB(e.target.value)}
              >
                <option value="">Select Run B (after)</option>
                {testRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    #{run.id} — concurrency {run.concurrency}, P95 {run.p95}ms (
                    {run.created_at})
                  </option>
                ))}
              </select>

              <button
                onClick={handleCompare}
                disabled={!compareRunA || !compareRunB}
              >
                Compare
              </button>
            </div>

            {compareResult && compareResult.success && (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #444",
                    }}
                  >
                    <th style={{ padding: "0.5rem" }}>Metric</th>
                    <th style={{ padding: "0.5rem" }}>Before</th>
                    <th style={{ padding: "0.5rem" }}>After</th>
                    <th style={{ padding: "0.5rem" }}>Change</th>
                    <th style={{ padding: "0.5rem" }}>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(compareResult.comparison).map(
                    ([metric, data]) => (
                      <tr
                        key={metric}
                        style={{ borderBottom: "1px solid #2a2a2a" }}
                      >
                        <td style={{ padding: "0.5rem" }}>{metric}</td>
                        <td style={{ padding: "0.5rem" }}>{data.before}</td>
                        <td style={{ padding: "0.5rem" }}>{data.after}</td>
                        <td style={{ padding: "0.5rem" }}>
                          {data.percentChange}%
                        </td>
                        <td
                          style={{
                            padding: "0.5rem",
                            color:
                              data.verdict === "improved"
                                ? "#4caf50"
                                : data.verdict === "degraded"
                                  ? "#f44336"
                                  : "#999",
                          }}
                        >
                          {data.verdict}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            )}

            {compareResult && !compareResult.success && (
              <div style={{ color: "#f44336" }}>{compareResult.error}</div>
            )}
          </div>
        )}

        {mode === "scaling" && (
          <div>
            <h3>Concurrency Scaling Test</h3>
            <p style={{ fontSize: "0.85rem", color: "#999" }}>
              Uses the URL/method from the input row above. Runs one full load
              test per concurrency level, sequentially — this can take a while.
            </p>

            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                marginBottom: "1rem",
                alignItems: "center",
              }}
            >
              <label>
                Concurrency levels:
                <input
                  type="text"
                  value={scalingConcurrencyLevels}
                  onChange={(e) => setScalingConcurrencyLevels(e.target.value)}
                  style={{ marginLeft: "0.5rem", width: "150px" }}
                />
              </label>
              <label>
                Requests per level:
                <input
                  type="number"
                  min="1"
                  value={scalingRequestsPerLevel}
                  onChange={(e) =>
                    setScalingRequestsPerLevel(Number(e.target.value))
                  }
                  style={{ marginLeft: "0.5rem", width: "70px" }}
                />
              </label>
              <button
                onClick={handleRunScalingTest}
                disabled={scalingLoading || !url}
              >
                {scalingLoading
                  ? "Running scaling test..."
                  : "Run Scaling Test"}
              </button>
            </div>

            {scalingResult && scalingResult.success && (
              <>
                <ScalingChart runs={scalingResult.runs} />

                {scalingResult.insights &&
                  scalingResult.insights.length > 0 && (
                    <div style={{ marginTop: "1rem" }}>
                      {scalingResult.insights.map((insight, i) => (
                        <div
                          key={i}
                          style={{
                            padding: "0.75rem",
                            marginBottom: "0.5rem",
                            borderRadius: "4px",
                            background:
                              insight.level === "error"
                                ? "#3a1a1a"
                                : insight.level === "warning"
                                  ? "#3a2f1a"
                                  : "#1a3a1f",
                            color:
                              insight.level === "error"
                                ? "#ff8a80"
                                : insight.level === "warning"
                                  ? "#ffcc80"
                                  : "#a5d6a7",
                          }}
                        >
                          {insight.message}
                        </div>
                      ))}
                    </div>
                  )}
              </>
            )}

            {scalingResult && !scalingResult.success && (
              <div style={{ color: "#f44336" }}>{scalingResult.error}</div>
            )}
          </div>
        )}

        {loading && progress.total > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            Progress: {progress.completed} / {progress.total}
          </div>
        )}

        {response && response.metrics && (
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              flexWrap: "wrap",
              marginTop: "1rem",
            }}
          >
            <MetricCard
              label="Total Requests"
              value={response.metrics.totalRequests}
            />
            <MetricCard
              label="Success Rate"
              value={`${response.metrics.successRate}%`}
            />
            <MetricCard label="Avg (ms)" value={response.metrics.avgMs} />
            <MetricCard label="P50 (ms)" value={response.metrics.p50} />
            <MetricCard label="P95 (ms)" value={response.metrics.p95} />
            <MetricCard label="P99 (ms)" value={response.metrics.p99} />
            <MetricCard
              label="Throughput (req/s)"
              value={response.metrics.throughputRps}
            />
          </div>
        )}

        {response && response.results && response.results.length > 0 && (
          <LatencyChart results={response.results} />
        )}

        {response && response.results && response.results.length > 0 && (
          <>
            <LatencyChart results={response.results} />
            <StatusBreakdownChart results={response.results} />
          </>
        )}

        {response && (
          <pre
            style={{
              background: "#1a1a1a",
              color: "#eee",
              padding: "1rem",
              marginTop: "1rem",
              overflow: "auto",
              maxWidth: "100%",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {JSON.stringify(response, null, 2)}
          </pre>
        )}
      </div>

      <div style={{ marginBottom: "1rem", marginTop: "1rem" }}>
        <label>Headers (JSON)</label>
        <textarea
          value={headers}
          onChange={(e) => setHeaders(e.target.value)}
          placeholder='{"Authorization": "Bearer token"}'
          rows={3}
          style={{ width: "100%", display: "block" }}
        />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label>Body (JSON, optional)</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder='{"key": "value"}'
          rows={4}
          style={{ width: "100%", display: "block" }}
        />
      </div>
    </div>
  );
}

export default App;
