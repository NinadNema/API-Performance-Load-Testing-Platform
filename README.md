# API Performance & Load Testing Platform

A full-stack, locally-run tool for testing API performance under concurrent load — built from scratch to understand concurrency, performance measurement, and real-time systems, not just to produce a CRUD app.

Send single requests, run controlled concurrent load tests, watch live progress over WebSocket, visualize latency/throughput/status codes, compare test runs to catch regressions, run automated concurrency-scaling tests to find an API's breaking point, and chain multi-step workflows where one request's response feeds the next.

Everything runs locally — no cloud services, no paid APIs, no external dependencies beyond `npm install`.

---

## Why this exists

Most "full-stack project" tutorials are CRUD apps with a database and a form. This is different: it's a small, from-scratch performance-engineering tool that required actually understanding — not just using — concurrency control, percentile statistics, real-time communication, and API design under failure conditions. Every metric, chart, and insight in this tool is backed by logic written and verified from first principles, including hand-checked test cases for the trickier math (percentiles, throughput, comparison deltas).

## Features

- **Single request tester** — send any method/URL/headers/body, see status, timing, and response
- **Concurrent load testing** — configure concurrency (virtual users) and total requests; a custom-built concurrency limiter enforces the exact cap in real time
- **Live progress** — WebSocket-pushed updates as each request completes, streamed into the UI while a test is running
- **Real performance metrics** — average, min/max, **P50/P95/P99 latency**, success rate, error rate, throughput (req/s)
- **Visual dashboard** — latency-over-time line chart, status code breakdown, all rendered with Recharts
- **Persistent history** — every test run and every individual request is saved to SQLite; browse past runs anytime
- **Run comparison** — pick two saved runs and get a metric-by-metric diff with automatic improved/degraded/unchanged verdicts
- **Concurrency scaling tests** — automatically run the same test at increasing concurrency levels (e.g. 1, 5, 10, 25) and chart how P95 latency and throughput change as load increases
- **Rule-based insights** — automatic flags for high tail latency, elevated error rates, inconsistent performance (P50 vs P99 gap), and performance regressions or scaling collapses
- **Multi-step workflows** — chain requests together, extracting values from one response (e.g. an auth token) and substituting them into a later request

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + Express | Minimal framework — routing and middleware stay visible rather than hidden behind conventions |
| Concurrency | Custom `ConcurrencyLimiter` (hand-built) | Built from scratch to actually understand promise-based concurrency control, not just call a library |
| Database | SQLite via `better-sqlite3` | Single-file, zero-setup, synchronous API — genuinely appropriate for a local tool, not a shortcut |
| Real-time | `ws` (raw WebSocket) | No abstraction layer — direct exposure to connection lifecycle and message broadcasting |
| Frontend | React + Vite | Fast dev loop, component-based UI |
| Charts | Recharts | Composable chart primitives (line, bar, dual-axis) |
| HTTP client | Axios | Used both for the single-request tester and as the engine behind every concurrent load test request |

## Architecture

```
frontend/ (React + Vite, port 5173)
  ├─ Single Request / Load Test / History / Compare / Scaling Test / Workflow tabs
  ├─ WebSocket client — live progress during load tests
  └─ Recharts — latency, status breakdown, and scaling charts

backend/ (Express, port 4000 + WebSocket on 4001)
  ├─ /api/request           — single request proxy + timing
  ├─ /api/load-test         — concurrent load test (uses ConcurrencyLimiter)
  ├─ /api/test-runs         — saved run history (list + detail)
  ├─ /api/compare           — diff two saved runs
  ├─ /api/scaling-test      — sequential runs across concurrency levels
  ├─ /api/workflow          — multi-step chained requests
  ├─ concurrencyLimiter.js  — promise-based concurrency cap, built from scratch
  ├─ metrics.js             — avg/min/max/P50/P95/P99/throughput calculation
  ├─ insights.js            — rule-based performance flagging
  ├─ workflow.js            — variable extraction + substitution engine
  └─ loadtester.db          — SQLite file (test_runs + requests tables)
```

### How a load test actually works

1. `ConcurrencyLimiter` caps how many requests are ever "in flight" at once, queuing the rest until a slot frees up — a rolling window, not fixed batches.
2. Each completed request is timed with `performance.now()` and pushed into a results array.
3. As each request finishes, its result is broadcast over WebSocket to any connected frontend, enabling live progress.
4. Once all requests settle (`Promise.allSettled`, so failures don't abort the batch), `calculateMetrics` computes aggregate stats — including percentiles via sorted-array indexing.
5. The run and every individual request are persisted to SQLite.
6. `generateInsights` runs a small set of threshold-based rules against the metrics and flags anything notable.

### A real finding this tool produced

Running a concurrency-scaling test (1 → 5 → 10 → 25) against a public test API surfaced a genuine breaking point: throughput collapsed **91%** and the success rate dropped as concurrency hit 25, with one request hitting the 10-second timeout. The insights engine flagged both automatically. This wasn't a synthetic example — it's real behavior this tool discovered and measured.

## Getting started

### Prerequisites
- Node.js (v18+ recommended)
- npm

### Backend
```bash
cd backend
npm install
npm run dev
```
Runs on `http://localhost:4000` (HTTP) and `ws://localhost:4001` (WebSocket).

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Runs on `http://localhost:5173`.

Open the frontend URL, and both servers need to be running simultaneously.

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/request` | Send a single API request |
| POST | `/api/load-test` | Run a concurrent load test |
| GET | `/api/test-runs` | List all saved test runs |
| GET | `/api/test-runs/:id` | Get one run's full detail |
| GET | `/api/compare?runA=&runB=` | Diff two runs |
| POST | `/api/scaling-test` | Run a concurrency-scaling test |
| GET | `/api/scaling-test/:groupId` | Retrieve a scaling test's grouped runs |
| POST | `/api/workflow` | Run a multi-step chained workflow |

## What I learned building this

- **Concurrency isn't parallelism** — Node's single-threaded event loop handles many in-flight I/O operations by not blocking on any one of them; the `ConcurrencyLimiter` here is a promise-based semaphore built to enforce an exact concurrency cap, verified with timestamped test output before ever touching real HTTP requests.
- **Averages lie; percentiles tell the truth.** A P50/P95 gap of several hundred milliseconds shows up constantly in real API responses (even to well-behaved public test APIs) — this project's charts make that gap visible instead of hidden inside a single averaged number.
- **Silent failures are the hardest bugs.** Wrong property names, mismatched export shapes, and misplaced JSX don't always throw — they just quietly produce `undefined`, `NaN`, or nothing rendered at all. Most of the real debugging in this project was learning to trust evidence (console logs, curl output, hand-predicted expected values) over assumptions.
- **Validate at the boundary.** Every endpoint checks its inputs before doing real work; every response distinguishes "the request itself failed" from "the request succeeded but returned an error status" — a distinction that matters a lot once you're aggregating hundreds of results.

## Possible next steps

- Export test results as PDF/CSV
- Gradual ramp-up load pattern (instead of instant concurrency)
- Dockerize for one-command startup
- Reconnect logic for the WebSocket client