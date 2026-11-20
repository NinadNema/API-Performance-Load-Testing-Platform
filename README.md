# PulseAPI: Beginner API Load Tester

PulseAPI is a local full-stack project for sending API requests and measuring how an API responds to a small amount of concurrent traffic. It uses React, Express, Axios, and SQLite.

## Features

- Send one GET, POST, PUT, DELETE, or PATCH request.
- Set request headers, a request body, and a timeout.
- Run a load test with a configurable number of concurrent requests and total requests.
- View average, minimum, maximum, and P95 latency, success rate, throughput, and a latency chart.
- Register and sign in with a username/email and password.
- Save load-test results to a private SQLite history associated with the signed-in account.
- View and delete saved runs.

Load tests require sign-in so each saved run belongs to an account. Single requests can be sent without signing in.

## Tech stack

- **Frontend:** React, Vite, Recharts
- **Backend:** Node.js, Express, Axios
- **Authentication:** bcryptjs password hashing and JSON Web Tokens
- **Database:** SQLite with `better-sqlite3`
- **Concurrency:** A small promise-based concurrency limiter

## Run locally

Prerequisites: Node.js 18 or newer and npm.

Create local environment files before starting the servers:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

Generate a random `JWT_SECRET` containing at least 32 characters and place it in `backend/.env`. `CORS_ORIGIN` should include the frontend origin, while `VITE_API_BASE_URL` can point to the backend URL.

Start the backend:

```powershell
cd backend
npm install
npm run dev
```

The backend runs at `http://localhost:4000`.

In another terminal, start the frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

## How a load test works

1. The frontend sends the test settings to the Express API.
2. The backend uses a concurrency limiter to keep simultaneous requests under the selected limit.
3. Each request's duration and HTTP status are recorded.
4. The backend calculates summary metrics and saves the run and request results in SQLite.
5. The frontend displays the metrics and request-latency chart.

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Sign in and receive a token |
| GET | `/api/auth/me` | Get the signed-in account |
| POST | `/api/request` | Send a single request |
| POST | `/api/load-test` | Run and save an authenticated load test |
| GET | `/api/test-runs` | List the signed-in user's runs |
| GET | `/api/test-runs/:id` | View one saved run |
| DELETE | `/api/test-runs/:id` | Delete one saved run |
| DELETE | `/api/test-runs` | Delete all of the signed-in user's runs |

## Project structure

```text
backend/
  auth.js                 Account registration, login, and token checks
  concurrencyLimiter.js   Limits simultaneous requests
  db.js                   SQLite setup
  loadTestRunner.js       Sends requests for a load test
  metrics.js              Calculates test metrics
  saveTestRun.js          Saves runs and request results
  server.js               Express routes

frontend/src/
  App.jsx                 Request, load-test, results, and history screens
  components/             Sign-in form and account menu
  utils/auth.js           Authentication requests and browser session
```
