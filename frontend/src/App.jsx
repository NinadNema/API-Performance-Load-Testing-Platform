import { useState } from "react";
import { useEffect, useRef } from "react";

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

  async function handleSend() {
    setLoading(true);
    setResponse(null);

    let parseHeaders = {};
    let parseBody = null;

    try {
      parseHeaders = headers.trim ? JSON.parse(headers) : {};
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
      const res = await fetch("http://localHost:4000/api/load-test", {
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
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
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
          </div>
        )}

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
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label>Headers (JSON) </label>
        <textarea
          value={headers}
          onChange={(e) => setHeaders(e.target.value)}
          placeholder='{"Authorization" : "Bearer token"}'
          rows={3}
          style={{ widtth: "100%", display: "block" }}
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
