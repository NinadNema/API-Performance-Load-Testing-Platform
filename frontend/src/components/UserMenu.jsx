import { useState } from "react";

export default function UserMenu({ currentUser, onViewHistory, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="user-menu-container">
      <button
        className="user-profile-chip"
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
      >
        <span className="user-avatar-small">
          {(currentUser.fullName || currentUser.username || "U").charAt(0).toUpperCase()}
        </span>
        <span>{currentUser.fullName || currentUser.username}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {menuOpen && (
        <div className="user-dropdown-menu">
          <button
            className="user-dropdown-item"
            onClick={() => {
              setMenuOpen(false);
              onViewHistory();
            }}
          >
            View saved history
          </button>
          <button
            className="user-dropdown-item logout-item"
            onClick={() => {
              setMenuOpen(false);
              onLogout();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
