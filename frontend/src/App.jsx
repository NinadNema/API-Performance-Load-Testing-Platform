import { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./App.css";
import "./beginner.css";
import "./workstation.css";
import AuthModal from "./components/AuthModal";
import UserMenu from "./components/UserMenu";
import {
  apiGetMe,
  authFetch,
  clearAuthStorage,
  getStoredUser,
} from "./utils/auth";

const API_BASE = "http://localhost:4000";

function MetricCard({ label, value, unit = "" }) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value ?? "—"}{unit}</span>
    </div>
  );
}

function ResponseViewer({ value }) {
  if (value === null || typeof value !== "object") {
    return <div className="response-value">{value == null ? "No response body" : String(value)}</div>;
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [`[${index}]`, item])
    : Object.entries(value);

  return (
    <div className="response-object">
      {entries.map(([key, item]) => (
        <div className="response-entry" key={key}>
          <span className="response-key">{key}</span>
          <ResponseViewer value={item} />
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  if (!status) return <span className="badge badge-err">Network error</span>;
  const kind = status < 300 ? "badge-2xx" : status < 400 ? "badge-3xx" : status < 500 ? "badge-4xx" : "badge-5xx";
  return <span className={`badge ${kind}`}>{status}</span>;
}

function ToastNotification({ toast, onClose }) {
  if (!toast) return null;

  return (
    <div
      className={`toast-notification toast-${toast.type}`}
      role={toast.type === "error" ? "alert" : "status"}
    >
      <span>{toast.message}</span>
      <button className="toast-close" onClick={onClose} aria-label="Dismiss notification">
        ×
      </button>
    </div>
  );
}

function ConfirmationCard({ confirmation, busy, onCancel, onConfirm }) {
  if (!confirmation) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <section
        className="modal-content confirmation-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-message"
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <h2 id="confirmation-title">{confirmation.title}</h2>
          <p id="confirmation-message">{confirmation.message}</p>
        </div>
        <div className="confirmation-actions">
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Deleting..." : "Delete"}
          </button>
        </div>
      </section>
    </div>
  );
}

function LatencyChart({ results }) {
  if (!results?.length) return null;

  const data = results.map((result, index) => ({
    request: index + 1,
    latency: result.durationMs ?? result.duration_ms ?? 0,
  }));

  return (
    <div className="chart-wrapper">
      <h3>Request latency</h3>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="request" stroke="var(--text-dim)" />
            <YAxis stroke="var(--text-dim)" unit="ms" />
            <Tooltip />
            <Line type="monotone" dataKey="latency" name="Latency (ms)" stroke="var(--accent)" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(getStoredUser());
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState("login");
  const [mode, setMode] = useState("load");
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("https://jsonplaceholder.typicode.com/posts/1");
  const [headers, setHeaders] = useState('{\n  "Content-Type": "application/json"\n}');
  const [body, setBody] = useState("");
  const [requestTimeout, setRequestTimeout] = useState(10000);
  const [concurrency, setConcurrency] = useState(5);
  const [totalRequests, setTotalRequests] = useState(20);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [testRuns, setTestRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);

  useEffect(() => {
    if (!toast) return undefined;
    const timerId = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timerId);
  }, [toast]);

  function showToast(message, type = "success") {
    setToast({ message, type });
  }

  const loadHistory = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/test-runs`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Could not load run history");
      }
      setTestRuns(data.runs);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load run history");
    }
  }, []);

  useEffect(() => {
    apiGetMe().then((user) => {
      setCurrentUser(user);
      if (user) loadHistory();
    });
  }, [loadHistory]);

  function parseRequestInput() {
    let parsedHeaders = {};
    if (headers.trim()) {
      try {
        parsedHeaders = JSON.parse(headers);
      } catch {
        throw new Error("Headers must be valid JSON.");
      }
      if (!parsedHeaders || Array.isArray(parsedHeaders) || typeof parsedHeaders !== "object") {
        throw new Error("Headers must be a JSON object.");
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

  async function sendRequest() {
    setLoading(true);
    setResponse(null);
    setError("");

    try {
      const { parsedHeaders, parsedBody } = parseRequestInput();
      const res = await authFetch(`${API_BASE}/api/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          url: url.trim(),
          headers: parsedHeaders,
          body: parsedBody,
          timeout: Number(requestTimeout) || 10000,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResponse(data);
      if (data.success) {
        showToast(data.status >= 400 ? `Request returned HTTP ${data.status}` : "Request completed");
      } else {
        showToast(data.error || "The request failed", "error");
      }
    } catch (err) {
      setError(err.message || "Could not send request");
    } finally {
      setLoading(false);
    }
  }

  async function runLoadTest() {
    if (!currentUser) {
      setAuthModalTab("login");
      setAuthModalOpen(true);
      return;
    }

    setLoading(true);
    setResponse(null);
    setError("");
    try {
      const { parsedHeaders, parsedBody } = parseRequestInput();
      const res = await authFetch(`${API_BASE}/api/load-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          url: url.trim(),
          headers: parsedHeaders,
          body: parsedBody,
          timeout: Number(requestTimeout) || 10000,
          concurrency: Number(concurrency),
          totalRequests: Number(totalRequests),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (res.status === 401 || res.status === 403) {
          clearAuthStorage();
          setCurrentUser(null);
          setAuthModalTab("login");
          setAuthModalOpen(true);
        }
        throw new Error(data.error || "Load test failed");
      }
      setResponse(data);
      await loadHistory();
      showToast("Load test completed and saved to history");
    } catch (err) {
      setError(err.message || "Could not run load test");
    } finally {
      setLoading(false);
    }
  }

  async function openRun(runId) {
    setSelectedRun(null);
    setError("");
    try {
      const res = await authFetch(`${API_BASE}/api/test-runs/${runId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not open this run");
      setSelectedRun(data);
    } catch (err) {
      setError(err.message || "Could not open this run");
    }
  }

  async function deleteRun(runId) {
    try {
      const res = await authFetch(`${API_BASE}/api/test-runs/${runId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not delete this run");
      setTestRuns((runs) => runs.filter((run) => run.id !== runId));
      if (selectedRun?.run.id === runId) setSelectedRun(null);
      setError("");
      showToast("Test run deleted");
    } catch (err) {
      setError(err.message || "Could not delete this run");
    }
  }

  async function clearHistory() {
    try {
      const res = await authFetch(`${API_BASE}/api/test-runs`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not clear history");
      setTestRuns([]);
      setSelectedRun(null);
      setError("");
      showToast("Run history cleared");
    } catch (err) {
      setError(err.message || "Could not clear history");
    }
  }

  async function confirmDelete() {
    if (!confirmation) return;
    setConfirmationBusy(true);
    try {
      if (confirmation.type === "run") {
        await deleteRun(confirmation.runId);
      } else {
        await clearHistory();
      }
      setConfirmation(null);
    } finally {
      setConfirmationBusy(false);
    }
  }

  function handleLogout() {
    clearAuthStorage();
    setCurrentUser(null);
    setTestRuns([]);
    setSelectedRun(null);
    showToast("Signed out");
  }

  function handleAuthSuccess(user) {
    setCurrentUser(user);
    loadHistory();
    showToast("Signed in successfully");
  }

  const metrics = response?.metrics;

  return (
    <main className="app-container">
      <ToastNotification toast={toast} onClose={() => setToast(null)} />
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon" aria-hidden="true">↗</div>
          <div>
            <h1>PulseAPI</h1>
            <p className="brand-subtitle">A simple API testing and load testing tool</p>
          </div>
        </div>
        <div className="header-actions">
          {currentUser ? (
            <UserMenu
              currentUser={currentUser}
              onViewHistory={() => setMode("history")}
              onLogout={handleLogout}
            />
          ) : (
            <button className="btn-primary" onClick={() => setAuthModalOpen(true)}>
              Sign in / Register
            </button>
          )}
        </div>
      </header>

      <section className="workstation-intro">
        <div className="workstation-copy">
          <div className="workstation-eyebrow">API TESTING / LOCAL</div>
          <h2>Test an API, then measure how it handles load.</h2>
          <p>Start with one request. When you are ready, run a small load test and review the results.</p>
        </div>
        <div className="session-indicator">
          <span className={`session-dot ${currentUser ? "account" : "guest"}`} />
          <div>
            <strong>{currentUser ? `SIGNED IN / @${currentUser.username}` : "NOT SIGNED IN"}</strong>
            <span>{currentUser ? "Your load-test runs are saved to your account" : "Sign in is required to save and run load tests"}</span>
          </div>
        </div>
      </section>

      <nav className="nav-tabs" aria-label="Main navigation">
        {[
          { id: "load", label: "Load Test" },
          { id: "request", label: "Single Request" },
          { id: "history", label: "History" },
        ].map((tab) => (
          <button
            key={tab.id}
            className={`nav-tab ${mode === tab.id ? "active" : ""}`}
            onClick={() => {
              setMode(tab.id);
              setResponse(null);
              setError("");
              if (tab.id === "history" && currentUser) loadHistory();
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {error && <div className="beginner-alert error" role="alert">{error}</div>}

      {(mode === "load" || mode === "request") && (
        <section className="card">
          <div className="card-title">
            {mode === "load" ? "Run a Load Test" : "Send a Single Request"}
          </div>

          <div className="request-bar">
            <select
              className="method-select"
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              aria-label="HTTP method"
            >
              {["GET", "POST", "PUT", "DELETE", "PATCH"].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <input
              className="url-input"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://api.example.com/endpoint"
              aria-label="Request URL"
            />
            <button
              className="btn-primary"
              onClick={mode === "load" ? runLoadTest : sendRequest}
              disabled={loading || !url.trim()}
            >
              {loading ? "Working..." : mode === "load" ? "Run Load Test" : "Send Request"}
            </button>
          </div>

          <div className="beginner-form-grid">
            <label>
              Request headers (JSON)
              <textarea
                className="code-editor"
                value={headers}
                onChange={(event) => setHeaders(event.target.value)}
                rows={5}
              />
            </label>
            <label>
              Request body (optional)
              <textarea
                className="code-editor"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={5}
                placeholder='{"example": "value"}'
              />
            </label>
          </div>

          <div className="options-row">
            {mode === "load" && (
              <>
                <label className="option-group">
                  <span>Concurrent requests</span>
                  <input
                    className="option-input"
                    type="number"
                    min="1"
                    max="50"
                    value={concurrency}
                    onChange={(event) => setConcurrency(event.target.value)}
                  />
                </label>
                <label className="option-group">
                  <span>Total requests</span>
                  <input
                    className="option-input"
                    type="number"
                    min="1"
                    max="1000"
                    value={totalRequests}
                    onChange={(event) => setTotalRequests(event.target.value)}
                  />
                </label>
              </>
            )}
            <label className="option-group">
              <span>Timeout (milliseconds)</span>
              <input
                className="option-input"
                type="number"
                min="500"
                max="60000"
                step="500"
                value={requestTimeout}
                onChange={(event) => setRequestTimeout(event.target.value)}
              />
            </label>
          </div>

          {mode === "load" && !currentUser && (
            <p className="beginner-help">Sign in or create an account to run a load test and save its results to your history.</p>
          )}
        </section>
      )}

      {(mode === "request" ? response : metrics) && (
        <section className="card">
          <div className="card-title">
            <span>{mode === "request" ? "Request Result" : "Load Test Results"}</span>
            {response.status && <StatusBadge status={response.status} />}
          </div>
          {mode === "request" ? (
            <>
              <div className="metrics-grid">
                <MetricCard label="Status" value={response.status || "Failed"} />
                <MetricCard label="Response time" value={response.durationMs} unit=" ms" />
              </div>
              <div className="beginner-response">
                <ResponseViewer value={response.body ?? response.error} />
              </div>
            </>
          ) : (
            <>
              <div className="metrics-grid">
                <MetricCard label="Requests" value={metrics.totalRequests} />
                <MetricCard label="Success rate" value={metrics.successRate} unit="%" />
                <MetricCard label="Average latency" value={metrics.avgMs} unit=" ms" />
                <MetricCard label="Minimum latency" value={metrics.minMs} unit=" ms" />
                <MetricCard label="Maximum latency" value={metrics.maxMs} unit=" ms" />
                <MetricCard label="P95 latency" value={metrics.p95} unit=" ms" />
                <MetricCard label="Throughput" value={metrics.throughputRps} unit=" req/s" />
                <MetricCard label="Total duration" value={response.totalDurationMs} unit=" ms" />
              </div>
              <LatencyChart results={response.results} />
            </>
          )}
        </section>
      )}

      {mode === "history" && (
        <section className="card">
          <div className="card-title">
            <span>Saved Load-Test History</span>
            {currentUser && testRuns.length > 0 && (
              <button
                className="btn-danger"
                onClick={() => setConfirmation({
                  type: "history",
                  title: "Clear your run history?",
                  message: "This will permanently delete all of your saved load-test runs.",
                })}
              >
                Clear History
              </button>
            )}
          </div>
          {!currentUser ? (
            <div className="empty-state">
              <strong>Sign in to view your history.</strong>
              <p>Load-test runs are saved to your account.</p>
              <button className="btn-primary" onClick={() => setAuthModalOpen(true)}>Sign in / Register</button>
            </div>
          ) : testRuns.length === 0 ? (
            <div className="empty-state">
              <strong>No saved load tests yet.</strong>
              <p>Run a load test to see its results here.</p>
            </div>
          ) : (
            <div className="beginner-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Method and URL</th>
                    <th>Concurrency</th>
                    <th>Requests</th>
                    <th>Average</th>
                    <th>P95</th>
                    <th>Success</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {testRuns.map((run) => (
                    <tr key={run.id}>
                      <td>#{run.id}</td>
                      <td><strong>{run.method}</strong> {run.url}</td>
                      <td>{run.concurrency}</td>
                      <td>{run.total_requests}</td>
                      <td>{run.avg_ms} ms</td>
                      <td>{run.p95} ms</td>
                      <td>{run.success_rate}%</td>
                      <td>{run.created_at}</td>
                      <td>
                        <div className="beginner-actions">
                          <button className="btn-secondary" onClick={() => openRun(run.id)}>View</button>
                          <button
                            className="btn-danger"
                            onClick={() => setConfirmation({
                              type: "run",
                              runId: run.id,
                              title: "Delete this test run?",
                              message: `Run #${run.id} and its request details will be permanently deleted.`,
                            })}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {selectedRun && (
        <div className="modal-overlay" onClick={() => setSelectedRun(null)}>
          <section className="modal-content beginner-run-modal" onClick={(event) => event.stopPropagation()}>
            <div className="card-title">
              <span>Run #{selectedRun.run.id}: {selectedRun.run.method} {selectedRun.run.url}</span>
              <button className="btn-secondary" onClick={() => setSelectedRun(null)}>Close</button>
            </div>
            <div className="metrics-grid">
              <MetricCard label="Requests" value={selectedRun.metrics.totalRequests} />
              <MetricCard label="Success rate" value={selectedRun.metrics.successRate} unit="%" />
              <MetricCard label="Average latency" value={selectedRun.metrics.avgMs} unit=" ms" />
              <MetricCard label="Minimum latency" value={selectedRun.metrics.minMs} unit=" ms" />
              <MetricCard label="Maximum latency" value={selectedRun.metrics.maxMs} unit=" ms" />
              <MetricCard label="P95 latency" value={selectedRun.metrics.p95} unit=" ms" />
              <MetricCard label="Throughput" value={selectedRun.metrics.throughputRps} unit=" req/s" />
            </div>
            <LatencyChart results={selectedRun.requests} />
          </section>
        </div>
      )}

      <ConfirmationCard
        confirmation={confirmation}
        busy={confirmationBusy}
        onCancel={() => setConfirmation(null)}
        onConfirm={confirmDelete}
      />

      {authModalOpen && <AuthModal
        key={authModalTab}
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialTab={authModalTab}
        onAuthSuccess={handleAuthSuccess}
      />}
    </main>
  );
}
