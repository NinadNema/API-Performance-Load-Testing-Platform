import { useState, useRef, useEffect } from "react";

export default function UserMenu({
  currentUser,
  onOpenAuth,
  onLogout,
  onViewMyRuns,
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!currentUser) {
    return (
      <div className="auth-header-trigger">
        <button
          className="btn-auth-signin"
          onClick={() => onOpenAuth("login")}
          title="Sign in or create an account"
        >
          <span>Sign In / Register</span>
        </button>
      </div>
    );
  }

  const displayName = currentUser.fullName || currentUser.username || "Developer";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="user-menu-container" ref={menuRef}>
      <button
        className="user-profile-chip"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        aria-expanded={dropdownOpen}
      >
        <div className="user-avatar-small">{initial}</div>
        <div className="user-profile-chip-info">
          <span className="user-profile-chip-name">{displayName}</span>
          <span className="user-profile-chip-role">{currentUser.role || "Developer"}</span>
        </div>
        <span className={`dropdown-chevron ${dropdownOpen ? "open" : ""}`}>▼</span>
      </button>

      {dropdownOpen && (
        <div className="user-dropdown-menu">
          <div className="user-dropdown-header">
            <div className="user-avatar-med">{initial}</div>
            <div className="user-dropdown-userinfo">
              <div className="user-dropdown-name">{displayName}</div>
              <div className="user-dropdown-email">{currentUser.email}</div>
              <span className="user-role-badge">@{currentUser.username}</span>
            </div>
          </div>

          <div className="user-dropdown-divider" />

          <button
            className="user-dropdown-item"
            onClick={() => {
              setDropdownOpen(false);
              onOpenAuth("profile");
            }}
          >
            <span className="dropdown-item-icon">👤</span>
            <span>Profile & Security</span>
          </button>

          <button
            className="user-dropdown-item"
            onClick={() => {
              setDropdownOpen(false);
              onViewMyRuns();
            }}
          >
            <span className="dropdown-item-icon">📜</span>
            <span>My Benchmark History</span>
          </button>

          <div className="user-dropdown-divider" />

          <button
            className="user-dropdown-item logout-item"
            onClick={() => {
              setDropdownOpen(false);
              onLogout();
            }}
          >
            <span className="dropdown-item-icon">🚪</span>
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
