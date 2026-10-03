const API_BASE = "http://localhost:4000";

const TOKEN_KEY = "pulseapi_auth_token";
const USER_KEY = "pulseapi_user_profile";
const GUEST_RUNS_KEY = "pulseapi_guest_session_runs";

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    void 0;
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user) {
  try {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  } catch {
    void 0;
  }
}

export function clearAuthStorage() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    void 0;
  }
}

// Session-only Guest History (cleared automatically when browser/tab closes)
export function getGuestSessionRuns() {
  try {
    const raw = sessionStorage.getItem(GUEST_RUNS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addGuestSessionRun(run) {
  try {
    const existing = getGuestSessionRuns();
    const updated = [run, ...existing.filter((r) => r.id !== run.id)].slice(0, 50);
    sessionStorage.setItem(GUEST_RUNS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function removeGuestSessionRun(runId) {
  try {
    const existing = getGuestSessionRuns();
    const updated = existing.filter((r) => r.id !== runId);
    sessionStorage.setItem(GUEST_RUNS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function clearGuestSessionRuns() {
  try {
    sessionStorage.removeItem(GUEST_RUNS_KEY);
  } catch {
    void 0;
  }
}

export async function authFetch(url, options = {}) {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const mergedOptions = {
    ...options,
    headers,
  };

  const finalUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;
  return fetch(finalUrl, mergedOptions);
}

export async function apiRegister({ username, email, password, fullName }) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password, fullName }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Registration failed");
  }
  setStoredToken(data.token);
  setStoredUser(data.user);
  return data;
}

export async function apiLogin(identifier, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Login failed");
  }
  setStoredToken(data.token);
  setStoredUser(data.user);
  return data;
}

export async function apiGetMe() {
  const token = getStoredToken();
  if (!token) return null;

  try {
    const res = await authFetch("/api/auth/me");
    if (res.status === 401 || res.status === 403) {
      clearAuthStorage();
      return null;
    }
    if (!res.ok) {
      return getStoredUser();
    }
    const data = await res.json();
    if (data.success && data.user) {
      setStoredUser(data.user);
      return data.user;
    }
    return getStoredUser();
  } catch {
    return getStoredUser();
  }
}

export async function apiUpdateProfile({ fullName, currentPassword, newPassword }) {
  const res = await authFetch("/api/auth/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName, currentPassword, newPassword }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to update profile");
  }
  setStoredUser(data.user);
  return data.user;
}

export async function apiSaveSessionRun(runData) {
  const res = await authFetch("/api/test-runs/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(runData),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to save test run to account");
  }
  return data;
}

export async function apiBulkSaveSessionRuns(runs) {
  const res = await authFetch("/api/test-runs/bulk-save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runs }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to save session runs to account");
  }
  return data;
}

export function evaluatePasswordStrength(password) {
  if (!password) return { score: 0, label: "Empty", color: "#64748b" };

  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return { score, label: "Weak", color: "#f43f5e", percent: 33 };
  if (score <= 4) return { score, label: "Good", color: "#f59e0b", percent: 66 };
  return { score, label: "Strong", color: "#10b981", percent: 100 };
}
