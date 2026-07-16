import { useGeosat } from '../../context/GeosatContext'

export default function StatusBar() {
  const { state } = useGeosat()
  const { coordinate, telemetry, analysis } = state

  const statusClass = telemetry.tracking ? 'processing' : 'online'

  return (
    <div className="status-bar">
      <div className="status-left">
        <span className={`status-dot ${statusClass}`} />
        <span>{telemetry.tracking ? 'GPS ACTIVE' : 'STANDBY'}</span>
        <span>|</span>
        <span>LAT: {coordinate.lat.toFixed(4)}</span>
        <span>LNG: {coordinate.lng.toFixed(4)}</span>
        {telemetry.accuracy && <span>ACC: {telemetry.accuracy}m</span>}
      </div>
      <div className="status-right">
        {analysis.thermal && <span>🌡️ {analysis.thermal.temperature.surface}°C</span>}
        {analysis.prospectivity && <span>🎯 {(analysis.prospectivity.score * 100).toFixed(0)}%</span>}
        <span>v1.0.0</span>
      </div>
    </div>
  )
}