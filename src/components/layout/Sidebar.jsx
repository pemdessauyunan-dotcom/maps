const NAV_GROUPS = [
  {
    title: 'ANALYSIS',
    items: [
      { id: 'home', icon: '🏠', label: 'Beranda' },
      { id: 'spectrum', icon: '🔬', label: 'Spektrum' },
      { id: 'thermal', icon: '🌡️', label: 'Thermal' },
      { id: 'alteration', icon: '🧱', label: 'Alterasi' },
      { id: 'lineament', icon: '🧵', label: 'Lineament' },
      { id: 'vegetation', icon: '🌿', label: 'Vegetasi' },
      { id: 'depth', icon: '📏', label: 'Kedalaman' },
      { id: 'prospectivity', icon: '🎯', label: 'Prospek' },
    ]
  },
  {
    title: 'INSTRUMENTS',
    items: [
      { id: 'gps', icon: '📍', label: 'GPS Tracking' },
      { id: 'profile', icon: '📈', label: 'Cross-Section' },
    ]
  }
]

export default function Sidebar({ activeTab, onTabChange, collapsed, onToggle, children }) {
  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <button onClick={onToggle} style={{
        position: 'absolute', right: collapsed ? -32 : -32, top: 10, width: 32, height: 32,
        background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)',
        borderRadius: '0 6px 6px 0', cursor: 'pointer', zIndex: 1001, fontSize: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        {collapsed ? '▶' : '◀'}
      </button>

      {!collapsed && (
        <>
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <span>●</span> GEOSAT <span>PRO</span>
            </div>
            <div className="sidebar-subtitle">Enterprise Survey Platform</div>
          </div>

          {NAV_GROUPS.map(group => (
            <div key={group.title} className="nav-group">
              <div className="nav-title">{group.title}</div>
              {group.items.map(item => (
                <button key={item.id}
                  className={`nav-btn ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => onTabChange(item.id)}>
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}

          {/* Content area */}
          <div className="sidebar-content" style={{ flex: 1, overflow: 'auto', padding: '0 8px 12px' }}>
            {children}
          </div>
        </>
      )}
    </div>
  )
}