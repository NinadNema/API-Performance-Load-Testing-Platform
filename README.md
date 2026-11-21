# PulseAPI: API Performance & Load Testing Platform

PulseAPI is a full-stack tool for sending HTTP requests to an API and measuring how it behaves under concurrent load. You give it a URL, a method, a number of total requests and a concurrency limit. It fires the requests through a hand-built concurrency limiter, records the timing of every request, computes latency, throughput and success-rate metrics, shows a latency chart and saves each run to a per-user history.

It is built with React, Express, Axios and SQLite. The main goal of the project was to understand concurrency control, performance measurement and safe handling of user-supplied URLs from first principles, rather than to wrap a library.

## Features

- **Single request tester:** send one GET, POST, PUT, DELETE, PATCH, HEAD or OPTIONS request with custom headers, body and timeout, and see the status, timing, headers and response body.
- **Concurrent load test:** choose total requests (1 to 1,000) and concurrency (1 to 50). A custom promise-based limiter keeps no more than that many requests in flight at once.
- **Performance metrics:** average, minimum and maximum latency, P95 tail latency, success rate and throughput (requests per second).
- **Latency chart:** per-request latency plotted with Recharts.
- **Accounts:** register and sign in with a username or email. Passwords are hashed with bcrypt and sessions use JWTs.
- **Private history:** every load test and its individual request results are saved to SQLite and linked to the signed-in user. Users can open a saved run, delete one run or delete all of their runs (with confirmation dialogs).
- **Safe targets:** requests to localhost, private networks and other internal addresses are blocked (see Security).

Sign-in is required to send requests or run load tests, so every request is tied to an account and covered by per-user rate limits.

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 19, Vite, Recharts | Three screens: Load Test, Single Request, History |
| Backend | Node.js, Express 5, Axios | Axios is used for both single requests and every request in a load test |
| Auth | bcryptjs, jsonwebtoken | Salted password hashes, signed JWTs |
| Database | SQLite via `better-sqlite3` | Single file, synchronous API, parameterized queries |
| Concurrency | Custom `ConcurrencyLimiter` | Counter plus FIFO queue, no external library |

## Architecture

```text
Browser (React + Vite, :5173)
   |  JSON over HTTP, Authorization: Bearer <JWT>
   v
Express API (:4000)
   |- CORS allowlist, 1 MB JSON body limit
   |- authenticateToken -> per-user rate limiter -> route handler
   |- targetSecurity.js   validates the target URL and pins DNS results
   |- loadTestRunner.js   sends requests through ConcurrencyLimiter
   |- metrics.js          computes avg / min / max / P95 / throughput / success rate
   |- saveTestRun.js      writes one run and its request rows in one transaction
   v
SQLite (backend/loadtester.db): users, test_runs, requests
```

## How a load test works

1. The frontend sends the URL, method, headers, body, timeout, total requests and concurrency to `POST /api/load-test` with the user's JWT.
2. The server checks the token, applies the per-user rate limit, validates every parameter and validates the target URL (see Security).
3. `loadTestRunner.js` creates one task per request and hands each to `ConcurrencyLimiter`. The limiter starts tasks until `maxConcurrent` are in flight and queues the rest. When any request finishes, the next queued task starts. This is a rolling window, not fixed batches, so one slow request never stalls the others.
4. Each task is timed with `performance.now()` from the moment it actually starts, so time spent waiting in the queue is not counted as latency.
5. Axios runs with `validateStatus: () => true`, so HTTP error responses such as 404 or 500 are recorded as results instead of thrown. A request counts as successful if the status is 200 to 399. Network errors and timeouts are recorded with no status and `success: false`.
6. When all tasks have settled (`Promise.allSettled`), results are sorted by request index and `calculateMetrics` computes the summary.
7. The run and every request result are saved in a single SQLite transaction, then returned to the frontend, which shows the metrics and the latency chart.

Results appear when the whole test finishes. There is no live streaming while it runs.

### Metrics

| Metric | Definition |
|---|---|
| Average, min, max | Computed from per-request durations, rounded to whole milliseconds |
| P95 | Nearest-rank percentile: sort durations and take the value at index `ceil(0.95 × n) − 1`. 95% of requests were at least this fast |
| Success rate | Requests with status 200 to 399 divided by all completed requests |
| Throughput | Completed requests divided by total test duration, in requests per second. Failed requests are included in the count |

P95 is reported because the average hides slow outliers, while the tail shows what the slowest 5% of users would experience.

## Security

PulseAPI sends requests to URLs that users type in, so it is designed to avoid being used to reach internal systems or to flood other sites.

- **SSRF protection** (`targetSecurity.js`): only `http` and `https` are allowed. Hostnames such as `localhost` and `*.localhost` are rejected. Private, loopback, link-local, carrier-grade NAT, documentation, multicast and reserved IPv4 ranges are blocked, as are the equivalent IPv6 ranges, including IPv4-mapped IPv6 addresses in both dotted and hexadecimal form.
- **DNS resolution checks:** the hostname is resolved first and the request is refused if any resolved address is private.
- **DNS rebinding defence:** the already-validated addresses are passed to Axios through a custom `lookup` function, so the connection goes to exactly the addresses that were checked. A second DNS lookup cannot return a different address. The URL is not rewritten, so TLS certificate checks and the Host header still use the real hostname.
- **No redirects:** `maxRedirects: 0`, so a public URL cannot redirect the server to an internal address.
- **Authentication:** passwords are hashed with bcrypt (cost 10). JWTs are signed with `JWT_SECRET`, and the server refuses to start if the secret is missing or shorter than 32 characters. The token's user is re-checked in the database on every request, so deleted accounts are rejected. Tokens expire after 30 days.
- **Per-user data isolation:** every history query filters by the user ID taken from the verified token (`WHERE user_id = ?`), including reads, single-run deletes and delete-all. Users cannot see or remove another user's runs.
- **Rate limiting** (in memory, 15-minute windows): 60 single requests, 10 load tests and 10 login or register attempts per window. Limits are keyed by user ID, or by IP address for unauthenticated routes.
- **CORS allowlist:** only origins listed in `CORS_ORIGIN` may call the API from a browser.
- **Input validation:** all parameters are validated server-side before any work is done.

  | Parameter | Allowed |
  |---|---|
  | Method | GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS |
  | Headers | JSON object |
  | Total requests | whole number, 1 to 1,000 |
  | Concurrency | whole number, 1 to 50 |
  | Timeout | whole number, 500 to 60,000 ms |
  | Request body (JSON) | up to 1 MB |

- **Safe errors:** errors are returned as structured JSON (`{ success: false, error }`) and internal details or stack traces are never sent to the client.
- **SQL injection:** all queries use prepared statements with bound parameters.

## Data model

| Table | Columns |
|---|---|
| `users` | id, username (unique), email (unique), password_hash, full_name, created_at |
| `test_runs` | id, user_id, url, method, concurrency, total_requests, total_duration_ms, avg_ms, min_ms, max_ms, p95, success_rate, throughput_rps, created_at |
| `requests` | id, test_run_id, request_index, duration_ms, status, success |

A run and its request rows are written in one transaction so history is never half-saved. Deleting a run deletes its request rows and the run in one transaction as well.

## API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | No | Health check |
| POST | `/api/auth/register` | No | Create an account and receive a token |
| POST | `/api/auth/login` | No | Sign in and receive a token |
| GET | `/api/auth/me` | Yes | Get the signed-in account |
| POST | `/api/request` | Yes | Send one request and return status, timing, headers and body |
| POST | `/api/load-test` | Yes | Run and save a load test |
| GET | `/api/test-runs` | Yes | List the signed-in user's runs |
| GET | `/api/test-runs/:id` | Yes | Get one saved run with its request results |
| DELETE | `/api/test-runs/:id` | Yes | Delete one saved run |
| DELETE | `/api/test-runs` | Yes | Delete all of the signed-in user's runs |

## Run locally

Prerequisites: Node.js 18 or newer and npm.

1. Create the environment files.

   macOS or Linux:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```
   Windows PowerShell:
   ```powershell
   Copy-Item backend\.env.example backend\.env
   Copy-Item frontend\.env.example frontend\.env
   ```

2. Generate a secret of at least 32 characters and put it in `backend/.env` as `JWT_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   `CORS_ORIGIN` must include the frontend origin (default `http://localhost:5173`).

3. Start the backend (runs on `http://localhost:4000`):
   ```bash
   cd backend
   npm install
   npm run dev
   ```

4. In a second terminal, start the frontend (usually `http://localhost:5173`):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Because requests to localhost and private addresses are blocked on purpose, test against a public API, for example `https://jsonplaceholder.typicode.com/posts/1`.

## Project structure

```text
backend/
  auth.js                 Registration, login, JWT creation and verification
  concurrencyLimiter.js   Promise-based concurrency cap with a FIFO queue
  db.js                   SQLite connection and schema
  loadTestRunner.js       Runs a load test through the limiter
  metrics.js              Percentile, average, throughput and success-rate math
  rateLimiter.js          In-memory fixed-window rate limiter
  saveTestRun.js          Transactional save of a run and its requests
  server.js               Express app, routes, validation, error handling
  targetSecurity.js       SSRF checks and DNS pinning

frontend/src/
  App.jsx                 Load Test, Single Request and History screens, chart
  components/             Sign-in form and account menu
  utils/auth.js           Auth API calls and browser session handling
```

## Known limitations

- The load generator, the API server and the database run in one Node process, so very high concurrency is limited by the machine running it, and measured latency includes your own network path.
- Rate limits live in memory and reset when the server restarts. They would not be shared across several server instances.
- The SSRF defence is a deny-list of address ranges, not an allowlist, so unusual address formats could still need hardening.
- The JWT is kept in `sessionStorage`, which is cleared when the tab closes but can be read by injected scripts if the app ever had an XSS bug.
- SQLite is a single-writer database and the tables have no secondary indexes, which is fine for local use but not for heavy multi-user traffic.
- The minimum password length is 6 characters, and tokens are not revocable before they expire.
- There are no automated tests yet.

## Possible next steps

- Stream progress to the UI while a test runs (WebSocket or server-sent events)
- Gradual ramp-up load profiles and P50/P99 percentiles
- Compare two saved runs
- Indexes on `test_runs.user_id` and `requests.test_run_id`, then PostgreSQL for multi-user use
- Automated tests for the limiter, metrics and SSRF checks
- Docker setup for one-command startup