export default function Toolbar({ activeTool, onToolChange }) {
  const tools = [
    { id: 'cursor', icon: '☝️', label: 'Select' },
    { id: 'thermal', icon: '🌡️', label: 'Thermal' },
    { id: 'gps', icon: '📍', label: 'GPS' },
    { id: 'profile', icon: '📈', label: 'Profile' },
    { id: 'ruler', icon: '📏', label: 'Ruler' },
    { id: 'marker', icon: '📌', label: 'Marker' },
  ]

  return (
    <div className="toolbar">
      {tools.map(tool => (
        <button key={tool.id}
          className={`tool-btn ${activeTool === tool.id ? 'active' : ''}`}
          onClick={() => onToolChange(tool.id)}>
          {tool.icon} {tool.label}
        </button>
      ))}
    </div>
  )
}