import { useState, useEffect } from "react";
import {
  apiLogin,
  apiRegister,
  apiUpdateProfile,
  evaluatePasswordStrength,
} from "../utils/auth";

export default function AuthModal({
  isOpen,
  onClose,
  initialTab = "login",
  currentUser,
  onAuthSuccess,
  onLogout,
}) {
  const [tab, setTab] = useState(initialTab); // 'login' | 'register' | 'profile'
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register form state
  const [regFullName, setRegFullName] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Profile form state
  const [profileFullName, setProfileFullName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  useEffect(() => {
    if (isOpen) {
      setError("");
      setSuccessMsg("");
      if (currentUser && initialTab === "profile") {
        setTab("profile");
        setProfileFullName(currentUser.fullName || currentUser.username || "");
      } else if (currentUser) {
        setTab("profile");
        setProfileFullName(currentUser.fullName || currentUser.username || "");
      } else {
        setTab(initialTab || "login");
      }
    }
  }, [isOpen, initialTab, currentUser]);

  if (!isOpen) return null;

  const passwordStrength = evaluatePasswordStrength(regPassword);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!loginIdentifier.trim() || !loginPassword) {
      setError("Please enter your username/email and password.");
      return;
    }

    setLoading(true);
    try {
      const data = await apiLogin(loginIdentifier.trim(), loginPassword);
      setSuccessMsg(`Welcome back, ${data.user.fullName || data.user.username}!`);
      setTimeout(() => {
        onAuthSuccess(data.user);
        onClose();
      }, 500);
    } catch (err) {
      setError(err.message || "Failed to sign in. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!regUsername.trim() || !regEmail.trim() || !regPassword) {
      setError("Please fill in all required fields.");
      return;
    }

    if (regUsername.trim().length < 3) {
      setError("Username must be at least 3 characters long.");
      return;
    }

    if (regPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const data = await apiRegister({
        username: regUsername.trim(),
        email: regEmail.trim(),
        password: regPassword,
        fullName: regFullName.trim() || regUsername.trim(),
      });
      setSuccessMsg(`Account created! Welcome, ${data.user.username}!`);
      setTimeout(() => {
        onAuthSuccess(data.user);
        onClose();
      }, 600);
    } catch (err) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateProfile(e) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (newPassword && newPassword !== confirmNewPassword) {
      setError("New passwords do not match.");
      return;
    }

    if (newPassword && !currentPassword) {
      setError("Please provide your current password to set a new password.");
      return;
    }

    setLoading(true);
    try {
      const updated = await apiUpdateProfile({
        fullName: profileFullName,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
      });
      setSuccessMsg("Profile successfully updated!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      onAuthSuccess(updated);
    } catch (err) {
      setError(err.message || "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content auth-modal-box"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="auth-header-title">
            <span className="auth-icon-badge">
              {tab === "login" ? "🔐" : tab === "register" ? "✨" : "👤"}
            </span>
            <div>
              <h3>
                {tab === "login"
                  ? "Sign In to PulseAPI"
                  : tab === "register"
                  ? "Create Your Account"
                  : "Account & Profile Settings"}
              </h3>
              <p className="auth-subtitle">
                {tab === "login"
                  ? "Access your saved test runs, custom headers & benchmark metrics"
                  : tab === "register"
                  ? "Sync your load tests, metrics history and SLA reports"
                  : `Signed in as @${currentUser?.username}`}
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Auth Navigation Switcher */}
        {!currentUser ? (
          <div className="auth-tab-switch">
            <button
              className={`auth-switch-btn ${tab === "login" ? "active" : ""}`}
              onClick={() => {
                setTab("login");
                setError("");
                setSuccessMsg("");
              }}
              type="button"
            >
              Sign In
            </button>
            <button
              className={`auth-switch-btn ${tab === "register" ? "active" : ""}`}
              onClick={() => {
                setTab("register");
                setError("");
                setSuccessMsg("");
              }}
              type="button"
            >
              Create Account
            </button>
          </div>
        ) : null}

        {error && (
          <div className="auth-alert error">
            <span className="alert-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="auth-alert success">
            <span className="alert-icon">✅</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* TAB 1: SIGN IN */}
        {tab === "login" && !currentUser && (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label>Username or Email</label>
              <input
                type="text"
                placeholder="e.g. dev_engineer or alex@company.com"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="form-group">
              <div className="label-with-action">
                <label>Password</label>
                <button
                  type="button"
                  className="text-link-btn"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                >
                  {showLoginPassword ? "Hide" : "Show"}
                </button>
              </div>
              <div className="input-with-icon">
                <input
                  type={showLoginPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="auth-form-actions">
              <button
                type="submit"
                className="btn-primary auth-submit-btn"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In to PulseAPI 🚀"}
              </button>
            </div>

            <div className="auth-footer-prompt">
              Don't have an account?{" "}
              <button
                type="button"
                className="text-highlight-btn"
                onClick={() => {
                  setTab("register");
                  setError("");
                }}
              >
                Create one now
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: REGISTER */}
        {tab === "register" && !currentUser && (
          <form onSubmit={handleRegister} className="auth-form">
            <div className="form-row">
              <div className="form-group">
                <label>Username *</label>
                <input
                  type="text"
                  placeholder="e.g. alex_tester"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Alex Morgan"
                  value={regFullName}
                  onChange={(e) => setRegFullName(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Work / Personal Email *</label>
              <input
                type="email"
                placeholder="alex@company.dev"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <div className="label-with-action">
                  <label>Password *</label>
                  <button
                    type="button"
                    className="text-link-btn"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                  >
                    {showRegPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <input
                  type={showRegPassword ? "text" : "password"}
                  placeholder="Min 6 characters"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Confirm Password *</label>
                <input
                  type={showRegPassword ? "text" : "password"}
                  placeholder="Re-enter password"
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Password strength meter */}
            {regPassword && (
              <div className="password-strength-container">
                <div className="strength-header">
                  <span>Password Strength:</span>
                  <span
                    className="strength-label"
                    style={{ color: passwordStrength.color }}
                  >
                    {passwordStrength.label}
                  </span>
                </div>
                <div className="strength-track">
                  <div
                    className="strength-fill"
                    style={{
                      width: `${passwordStrength.percent}%`,
                      backgroundColor: passwordStrength.color,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="auth-form-actions">
              <button
                type="submit"
                className="btn-primary auth-submit-btn"
                disabled={loading}
              >
                {loading ? "Creating Account..." : "Create Free Account ✨"}
              </button>
            </div>

            <div className="auth-footer-prompt">
              Already have an account?{" "}
              <button
                type="button"
                className="text-highlight-btn"
                onClick={() => {
                  setTab("login");
                  setError("");
                }}
              >
                Sign in here
              </button>
            </div>
          </form>
        )}

        {/* TAB 3: USER PROFILE & SETTINGS */}
        {currentUser && (
          <div className="profile-container">
            <div className="profile-badge-card">
              <div className="profile-avatar-large">
                {(currentUser.fullName || currentUser.username || "U")
                  .charAt(0)
                  .toUpperCase()}
              </div>
              <div className="profile-info-block">
                <div className="profile-name-row">
                  <h4>{currentUser.fullName || currentUser.username}</h4>
                  <span className="role-pill">{currentUser.role || "DEVELOPER"}</span>
                </div>
                <div className="profile-email-text">📧 {currentUser.email}</div>
                <div className="profile-username-text">
                  🆔 @{currentUser.username} • Member since{" "}
                  {currentUser.createdAt
                    ? new Date(currentUser.createdAt).toLocaleDateString()
                    : "Recently"}
                </div>
              </div>
            </div>

            <form onSubmit={handleUpdateProfile} className="auth-form profile-form">
              <div className="form-group">
                <label>Display / Full Name</label>
                <input
                  type="text"
                  value={profileFullName}
                  onChange={(e) => setProfileFullName(e.target.value)}
                  placeholder="Your Full Name"
                />
              </div>

              <div className="security-section-title">
                <span>🔒 Security & Change Password</span>
              </div>

              <div className="form-group">
                <label>Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password to change"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                  />
                </div>
                <div className="form-group">
                  <label>Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Repeat new password"
                  />
                </div>
              </div>

              <div className="profile-actions-row">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                >
                  {loading ? "Saving Changes..." : "Save Profile Changes"}
                </button>

                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={() => {
                    onLogout();
                    onClose();
                  }}
                >
                  <span>🚪 Sign Out</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
