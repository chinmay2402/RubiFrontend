import { Icon } from './Icon'
import { useNavigate } from 'react-router-dom'
import api from '../api/api'

export function Navbar({ reviewer, searchValue, onSearchChange, onProfileClick, profileOpen = false }) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const displayName = user ? user.name : reviewer ? reviewer.name : "User";
  const displayRole = user ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : reviewer ? reviewer.role : "Guest";

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
    <header className="topbar">
      <label className="searchbar" htmlFor="global-search">
        <Icon name="search" size={16} />
        <input
          id="global-search"
          type="search"
          placeholder="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <button
          className={`reviewer-chip profile-btn ${profileOpen ? 'is-active' : ''}`}
          onClick={onProfileClick}
          title="View profile"
          type="button"
        >
          <div className="reviewer-avatar">
            <Icon name="user" size={16} />
          </div>
          <div>
            <div className="reviewer-name">{displayName}</div>
            <div className="reviewer-role">{displayRole}</div>
          </div>
        </button>
        
        <button 
          onClick={handleLogout}
          className="logout-button"
          style={{ 
            background: 'none', 
            border: 'none', 
            color: '#ef4444', 
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.9rem'
          }}
        >
          Logout
        </button>
      </div>
    </header>
  )
}