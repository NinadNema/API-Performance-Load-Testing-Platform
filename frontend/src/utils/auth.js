const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const TOKEN_KEY = "pulseapi_auth_token";
const USER_KEY = "pulseapi_user_profile";

export function getStoredUser() {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeAuth(data) {
  try {
    sessionStorage.setItem(TOKEN_KEY, data.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
  } catch {
    throw new Error("Could not save your sign-in session in this browser.");
  }
}

export function clearAuthStorage() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // The session is cleared in memory even if browser storage is unavailable.
  }
}

export async function authFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch {
    // Requests can still be made without a stored token.
  }

  const finalUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;
  return fetch(finalUrl, { ...options, headers });
}

async function postAuth(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Authentication failed");
  }
  storeAuth(data);
  return data;
}

export function apiRegister({ username, email, password, fullName }) {
  return postAuth("/api/auth/register", { username, email, password, fullName });
}

export function apiLogin(identifier, password) {
  return postAuth("/api/auth/login", { identifier, password });
}

export async function apiGetMe() {
  let token;
  try {
    token = sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
  if (!token) return null;

  try {
    const response = await authFetch("/api/auth/me");
    if (!response.ok) {
      clearAuthStorage();
      return null;
    }
    const data = await response.json();
    if (data.success && data.user) {
      sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
      return data.user;
    }
    return null;
  } catch {
    return getStoredUser();
  }
}
