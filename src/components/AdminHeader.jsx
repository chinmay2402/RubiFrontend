import { Icon } from './Icon'
import { useNavigate } from 'react-router-dom'
import api from '../api/api'

export function AdminHeader({
  reviewer,
  searchValue,
  onSearchChange,
  showSearch = false,
  backLabel,
  onBack,
  onProfileClick,
  profileOpen = false,
}) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const displayName = user ? user.name : reviewer ? reviewer.name : "Admin";
  const displayRole = user ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : reviewer ? reviewer.role : "Admin";

  const handleLogout = async () => {
    try {
      if (user && user._id) {
        await api.post("/auth/logout", { userId: user._id });
      }
    } catch (err) {
      console.error("Logout log failed:", err);
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/");
    }
  };

  return (
    <header className="admin-topbar">
      <div className="admin-topbar__left" style={{ flex: 1 }}>
        {onBack && (
          <button className="admin-back" type="button" onClick={onBack}>
            <Icon name="arrow-left" size={16} />
            <span>{backLabel}</span>
          </button>
        )}

        {showSearch && (
          <label 
            className="admin-searchbar" 
            htmlFor="admin-search"
            style={{ 
              flex: 1, 
              maxWidth: '400px', 
              marginLeft: onBack ? '20px' : '0',
              border: '1.5px solid #2f6fed' // Adding a distinct border to ensure visibility
            }}
          >
            <Icon name="search" size={14} />
            <input
              id="admin-search"
              type="search"
              placeholder="Search by ID, prompt, or output..."
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              autoComplete="off"
            />
          </label>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <button
          className={`reviewer-chip reviewer-chip--compact profile-btn ${profileOpen ? 'is-active' : ''}`}
          onClick={onProfileClick}
          title="View profile"
          type="button"
        >
          <div className="reviewer-avatar reviewer-avatar--compact">
            <Icon name="user" size={14} />
          </div>
          <div>
            <div className="reviewer-name reviewer-name--compact">{displayName}</div>
            <div className="reviewer-role">{displayRole}</div>
          </div>
        </button>

        <button 
          onClick={handleLogout}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: '#ef4444', 
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.85rem'
          }}
        >
          Logout
        </button>
      </div>
    </header>
  )
}
