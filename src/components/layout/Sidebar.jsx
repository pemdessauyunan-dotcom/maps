const NAV_SECTIONS = [
  {
    id: 'analysis',
    label: 'ANALYSIS',
    items: [
      { id: 'home', icon: '🏠', label: 'Home' },
      { id: 'spectrum', icon: '🔬', label: 'Spectrum' },
      { id: 'thermal', icon: '🌡️', label: 'Thermal' },
      { id: 'alteration', icon: '🧱', label: 'Alteration' },
      { id: 'lineament', icon: '🧵', label: 'Lineament' },
      { id: 'vegetation', icon: '🌿', label: 'Vegetation' },
      { id: 'depth', icon: '📏', label: 'Depth' },
      { id: 'prospectivity', icon: '🎯', label: 'Prospect' },
    ],
    cols: 2,
  },
  {
    id: 'tools',
    label: 'TOOLS',
    items: [
      { id: 'gps', icon: '📍', label: 'GPS' },
      { id: 'profile', icon: '📈', label: 'Profile' },
    ],
    cols: 2,
  },
]

export default function Sidebar({ activeTab, onTabChange, collapsed, onToggle, children }) {
  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <button onClick={onToggle} style={{
        position: 'absolute', right: -28, top: 12, width: 28, height: 28,
        background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)',
        borderRadius: '0 6px 6px 0', cursor: 'pointer', zIndex: 1001, fontSize: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: 0.8,
      }}>
        {collapsed ? '▶' : '◀'}
      </button>

      {!collapsed && (
        <>
          {/* Header */}
          <div style={{
            padding: '10px 14px 8px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: 'linear-gradient(135deg, var(--accent), #6366f1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 700, color: 'white',
            }}>G</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.5px' }}>
                GEOSAT <span style={{ color: 'var(--accent)' }}>PRO</span>
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '1px' }}>
                Enterprise Survey
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div style={{ padding: '6px 8px 0' }}>
            {NAV_SECTIONS.map(section => (
              <div key={section.id} style={{ marginBottom: 6 }}>
                <div style={{
                  fontSize: 9, fontWeight: 600, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '1.5px',
                  padding: '4px 6px', marginBottom: 3,
                }}>
                  {section.label}
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: section.cols === 2 ? '1fr 1fr' : '1fr',
                  gap: 2,
                }}>
                  {section.items.map(item => {
                    const isActive = activeTab === item.id
                    return (
                      <button key={item.id}
                        onClick={() => onTabChange(item.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '5px 7px',
                          background: isActive ? 'var(--accent-glow)' : 'transparent',
                          border: `1px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                          borderRadius: 5,
                          color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                          fontSize: 10, fontWeight: isActive ? 600 : 400,
                          cursor: 'pointer', transition: 'all 0.12s',
                        }}
                        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
                        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
                      >
                        <span style={{ fontSize: 12 }}>{item.icon}</span>
                        <span>{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Content */}
          <div style={{
            flex: 1, overflow: 'auto', padding: '0 8px 8px',
            scrollbarWidth: 'thin',
          }}>
            {children}
          </div>
        </>
      )}
    </div>
  )
}