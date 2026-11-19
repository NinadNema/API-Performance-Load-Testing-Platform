import { useState } from "react";
import { apiLogin, apiRegister } from "../utils/auth";

export default function AuthModal({ isOpen, onClose, initialTab = "login", onAuthSuccess }) {
  const [tab, setTab] = useState(initialTab);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      let data;
      if (tab === "register") {
        if (username.trim().length < 3) throw new Error("Username must be at least 3 characters.");
        if (password.length < 6) throw new Error("Password must be at least 6 characters.");
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        data = await apiRegister({
          username: username.trim(),
          email: email.trim(),
          password,
          fullName: fullName.trim() || username.trim(),
        });
      } else {
        data = await apiLogin(username.trim(), password);
      }
      onAuthSuccess(data.user);
      onClose();
    } catch (err) {
      setError(err.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section className="modal-content auth-modal-box" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{tab === "login" ? "Sign in" : "Create an account"}</h3>
            <p className="auth-subtitle">Your account keeps your load-test history private.</p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="auth-tab-switch">
          <button
            type="button"
            className={`auth-switch-btn ${tab === "login" ? "active" : ""}`}
            onClick={() => { setTab("login"); setError(""); }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`auth-switch-btn ${tab === "register" ? "active" : ""}`}
            onClick={() => { setTab("register"); setError(""); }}
          >
            Register
          </button>
        </div>

        {error && <div className="auth-alert error" role="alert">{error}</div>}

        <form onSubmit={submit} className="auth-form">
          {tab === "register" && (
            <>
              <div className="form-group">
                <label htmlFor="auth-username">Username</label>
                <input id="auth-username" value={username} onChange={(event) => setUsername(event.target.value)} required />
              </div>
              <div className="form-group">
                <label htmlFor="auth-full-name">Full name (optional)</label>
                <input id="auth-full-name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="auth-email">Email</label>
                <input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </div>
            </>
          )}
          {tab === "login" && (
            <div className="form-group">
              <label htmlFor="auth-identifier">Username or email</label>
              <input id="auth-identifier" value={username} onChange={(event) => setUsername(event.target.value)} required />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="auth-password">Password</label>
            <input id="auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required />
          </div>
          {tab === "register" && (
            <div className="form-group">
              <label htmlFor="auth-confirm-password">Confirm password</label>
              <input id="auth-confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
            </div>
          )}
          <button type="submit" className="btn-primary auth-submit-btn" disabled={loading}>
            {loading ? "Please wait..." : tab === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </section>
    </div>
  );
}
