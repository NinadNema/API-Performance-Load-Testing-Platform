# PulseAPI frontend

The React and Vite frontend provides three screens:

- **Load Test:** configure and run a concurrent test. Sign in first to save it to your account.
- **Single Request:** send one HTTP request without signing in.
- **History:** view and delete load tests saved to your account.

To run it locally, start the backend first, then run:

```powershell
npm install
npm run dev
```

The frontend connects to the backend at `http://localhost:4000`.
