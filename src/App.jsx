import { useState, useCallback, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap, useMapEvents, LayersControl } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './index.css'
import { fetchElevationBatch } from './services/elevationApi'
import { fetchGeologicalInfo } from './services/geologicalApi'
import { analyzeThermalLithology, getThermalColor, getAnomalyColor, THERMAL_BASE } from './services/thermalLithology'
import {
  startGpsTracking,
  stopGpsTracking as stopGps,
  getCurrentPosition,
} from './services/gpsTracking'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

// Map click handler
function MapClickHandler({ onClick, onMove }) {
  useMapEvents({
    click: (e) => onClick?.(e.latlng),
    move: (e) => onMove?.(e.target.getCenter()),
  })
  return null
}

const TILE_LAYERS = {
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', name: 'Satelit' },
  terrain: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', name: 'Terrain' },
  street: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', name: 'Peta Jalan' },
}

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState('home')
  const [mapCenter, setMapCenter] = useState({ lat: -6.68, lng: 107.73 })

  // Thermal analysis state
  const [selectedPoint, setSelectedPoint] = useState(null)
  const [thermalResult, setThermalResult] = useState(null)
  const [geoInfo, setGeoInfo] = useState(null)
  const [loading, setLoading] = useState(false)

  // GPS tracking
  const [gpsTracking, setGpsTracking] = useState(false)
  const [gpsPosition, setGpsPosition] = useState(null)
  const [gpsPath, setGpsPath] = useState([])
  const [gpsAccuracy, setGpsAccuracy] = useState(null)
  const [gpsThermal, setGpsThermal] = useState([])
  const gpsWatchRef = useRef(null)

  // Thermal grid overlay
  const [thermalGrid, setThermalGrid] = useState([])
  const [showThermal, setShowThermal] = useState(false)

  // Cross-section
  const [profileMode, setProfileMode] = useState(false)
  const [profileStart, setProfileStart] = useState(null)
  const [profileResult, setProfileResult] = useState(null)

  const mapRef = useRef(null)

  // === CLICK TO ANALYZE ===
  const handleMapClick = async (latlng) => {
    setLoading(true)
    setSelectedPoint(latlng)
    setThermalResult(null)
    setGeoInfo(null)

    try {
      // Fetch elevation
      const elevRes = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${latlng.lat}&longitude=${latlng.lng}`)
      const elevData = elevRes.ok ? await elevRes.json() : { elevation: [200] }
      const elevation = elevData.elevation?.[0] || 200

      // Fetch geology
      const geoInfo = await fetchGeologicalInfo(latlng.lat, latlng.lng)

      // Analyze thermal lithology
      const thermal = analyzeThermalLithology(latlng.lat, latlng.lng, { elevation }, geoInfo)

      setThermalResult(thermal)
      setGeoInfo(geoInfo)
    } catch (err) {
      console.error('Analysis failed:', err)
    }
    setLoading(false)
  }

  // === GPS TRACKING ===
  const toggleGpsTracking = () => {
    if (gpsTracking) {
      stopGps(gpsWatchRef.current)
      gpsWatchRef.current = null
      setGpsTracking(false)
    } else {
      const watchId = startGpsTracking(
        async (pos) => {
          setGpsPosition(pos)
          setGpsAccuracy(pos.accuracy)
          setGpsPath(prev => [...prev.slice(-998), { lat: pos.lat, lng: pos.lng }])

          // Auto-analyze thermal at each position
          const geoInfo = await fetchGeologicalInfo(pos.lat, pos.lng)
          const thermal = analyzeThermalLithology(pos.lat, pos.lng, { elevation: pos.elevation || 200 }, geoInfo)
          setGpsThermal(prev => [...prev.slice(-98), thermal])
        },
        (err) => console.warn('GPS:', err.message),
        { enableHighAccuracy: true, timeout: 10000 }
      )
      gpsWatchRef.current = watchId
      setGpsTracking(true)
    }
  }

  // === LOAD THERMAL OVERLAY ===
  const loadThermalOverlay = async () => {
    if (!mapRef.current) return
    setLoading(true)
    const bounds = mapRef.current.getBounds()
    const points = []
    const latStep = (bounds.getNorth() - bounds.getSouth()) / 12
    const lngStep = (bounds.getEast() - bounds.getWest()) / 12

    for (let i = 0; i <= 12; i++) {
      for (let j = 0; j <= 12; j++) {
        points.push({
          lat: bounds.getSouth() + i * latStep + (Math.random() - 0.5) * latStep * 0.3,
          lng: bounds.getWest() + j * lngStep + (Math.random() - 0.5) * lngStep * 0.3,
        })
      }
    }
    // Batched elevation fetch
    const lats = points.map(p => p.lat.toFixed(5)).join(',')
    const lngs = points.map(p => p.lng.toFixed(5)).join(',')
    let elevations = []
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`)
      if (r.ok) elevations = (await r.json()).elevation || []
    } catch { elevations = points.map(() => 200 + Math.random() * 300) }

    const results = []
    for (let i = 0; i < points.length; i++) {
      const geo = await fetchGeologicalInfo(points[i].lat, points[i].lng)
      const thermal = analyzeThermalLithology(points[i].lat, points[i].lng, { elevation: elevations[i] || 200 }, geo)
      results.push(thermal)
    }

    setThermalGrid(results)
    setShowThermal(true)
    setLoading(false)
  }

  // === CROSS-SECTION ===
  const handleCrossSectionClick = async (start, end) => {
    setProfileMode(false)
    setProfileStart(start)
    const steps = 30
    const pts = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      pts.push({ lat: start.lat + (end.lat - start.lat) * t, lng: start.lng + (end.lng - start.lng) * t })
    }
    const lats = pts.map(p => p.lat.toFixed(5)).join(',')
    const lngs = pts.map(p => p.lng.toFixed(5)).join(',')
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`)
      if (r.ok) {
        const elevs = (await r.json()).elevation || []
        // Get geology at midpoint
        const midPoint = pts[Math.floor(pts.length / 2)]
        const geo = await fetchGeologicalInfo(midPoint.lat, midPoint.lng)
        const profile = pts.map((p, i) => {
          const thermal = analyzeThermalLithology(p.lat, p.lng, { elevation: elevs[i] || 200 }, geo)
          return { ...p, elevation: elevs[i] || 0, ...thermal }
        })
        setProfileResult(profile)
        setActiveTab('profile')
      }
    } catch {}
  }

  // === RENDER PROFILE CHART ===
  const renderProfileChart = () => {
    if (!profileResult || profileResult.length < 2) return null
    const width = 560, height = 200, pad = { top: 20, right: 20, bottom: 35, left: 45 }
    const chartW = width - pad.left - pad.right
    const chartH = height - pad.top - pad.bottom
    const elevs = profileResult.map(p => p.elevation || 0)
    const minE = Math.min(...elevs), maxE = Math.max(...elevs), range = maxE - minE || 1
    const totalDist = profileResult.length > 1 ? profileResult.length * 30 : 1 // ~30m per step

    const svgPoints = profileResult.map((p, i) => ({
      x: pad.left + (i / (profileResult.length - 1)) * chartW,
      y: pad.top + chartH - ((p.elevation - minE) / range) * chartH,
      temp: p.temperature?.surface || 30,
    }))

    return (
      <div className="card">
        <div className="card-title">📈 Thermal Cross-Section</div>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', background: '#0d1117', borderRadius: 6 }}>
          {[0, 0.25, 0.5, 0.75, 1].map(t => {
            const y = pad.top + chartH - t * chartH
            return <g key={t}>
              <text x={pad.left - 8} y={y + 3} textAnchor="end" fill="#6e7681" fontSize={9}>{Math.round(minE + t * range)}m</text>
              <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#30363d" strokeWidth={0.5} />
            </g>
          })}
          {[0, 0.25, 0.5, 0.75, 1].map(t => (
            <text key={t + 'x'} x={pad.left + t * chartW} y={height - 8} textAnchor="middle" fill="#6e7681" fontSize={9}>
              {Math.round(t * totalDist)}m
            </text>
          ))}
          {/* Thermal gradient fill */}
          <defs>
            <linearGradient id="thermalGrad" x1="0" y1="0" x2="1" y2="0">
              {svgPoints.map((p, i) => (
                <stop key={i} offset={`${(i / (svgPoints.length - 1)) * 100}%`}
                  stopColor={p.temp > 35 ? '#d50000' : p.temp > 30 ? '#ff6f00' : p.temp > 25 ? '#00bcd4' : '#1a237e'} />
              ))}
            </linearGradient>
          </defs>
          <polyline points={svgPoints.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="url(#thermalGrad)" strokeWidth={3} />
          <circle cx={svgPoints[0].x} cy={svgPoints[0].y} r={3} fill="#3fb950" />
          <circle cx={svgPoints[svgPoints.length - 1].x} cy={svgPoints[svgPoints.length - 1].y} r={3} fill="#f0883e" />
        </svg>
        {profileResult.some(p => p.anomalyLevel !== 'normal') && (
          <div className="action-guide" style={{ marginTop: 8 }}>
            <div className="guide-title">🔥 Anomali Termal Terdeteksi</div>
            {profileResult.filter(p => p.anomalyLevel === 'critical' || p.anomalyLevel === 'high')
              .slice(0, 3).map((p, i) => (
                <div key={i} style={{ fontSize: 11, margin: '4px 0', padding: '4px 8px', background: 'var(--bg-card-hover)', borderRadius: 4 }}>
                  {p.anomalies?.[0]?.emoji || '⚠️'} {p.anomalies?.[0]?.label || 'Anomali'} di {p.lat.toFixed(5)},{p.lng.toFixed(5)}
                  {' '}| {(p.temperature?.surface || 0).toFixed(1)}°C ({(p.temperature?.anomaly || 0) > 0 ? '+' : ''}{(p.temperature?.anomaly || 0).toFixed(1)}°C)
                </div>
              ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="app-container">
      <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
          {sidebarCollapsed ? '▶' : '◀'}
        </button>
        {!sidebarCollapsed && (
          <>
            <div className="app-logo">
              <span className="logo-icon">🌡️</span>
              <span className="logo-text">Thermal<br/>Lithology</span>
            </div>
            <div className="tab-bar">
              {[
                ['home', '🏠 Beranda'],
                ['thermal', '🌡️ Thermal'],
                ['gps', '📍 GPS'],
                ['profile', '📈 Profil'],
              ].map(([k, l]) => (
                <button key={k}
                  className={`tab-btn ${activeTab === k ? 'active' : ''}`}
                  onClick={() => { setActiveTab(k); if (k === 'profile' && !profileResult) setProfileMode(true) }}>
                  {l}
                </button>
              ))}
            </div>

            <div className="tab-content">
              {/* HOME TAB */}
              {activeTab === 'home' && (
                <div className="card" style={{ borderColor: 'var(--accent)' }}>
                  <div className="card-title" style={{ fontSize: 15 }}>🌡️ Thermal Lithology Mapper</div>
                  <p className="card-desc">
                    Deteksi anomali bawah tanah melalui analisis termal & litologi real-time.
                  </p>
                  <div className="quick-actions">
                    <button className="btn btn-success btn-block" onClick={() => { setActiveTab('thermal'); loadThermalOverlay() }}>
                      🌡️ Lihat Thermal Map
                    </button>
                    <button className="btn btn-primary btn-block" onClick={() => { setActiveTab('gps'); toggleGpsTracking() }}>
                      📍 Mulai GPS Tracking
                    </button>
                    <button className="btn btn-secondary btn-block" onClick={() => { setActiveTab('profile'); setProfileMode(true) }}>
                      📈 Buat Cross-Section
                    </button>
                  </div>
                  <div className="info-panel" style={{ marginTop: 8, fontSize: 11 }}>
                    <div className="info-row"><span className="info-label">Cara:</span><span className="info-value">Klik peta → analisis otomatis</span></div>
                    <div className="info-row"><span className="info-label">Data:</span><span className="info-value">SRTM + Macrostrat + Open-Meteo</span></div>
                  </div>
                </div>
              )}

              {/* THERMAL TAB */}
              {activeTab === 'thermal' && (
                <div className="card">
                  <div className="card-title">🌡️ Thermal Lithology</div>
                  <p className="card-desc">
                    Peta termal menunjukkan distribusi suhu permukaan yang mengindikasikan jenis batuan, mineral, dan rongga bawah tanah.
                  </p>
                  <div className="legend">
                    <div className="legend-item"><span style={{ background: '#d50000', width: 12, height: 12, borderRadius: 2 }}></span> Panas (Mineral Logam)</div>
                    <div className="legend-item"><span style={{ background: '#ff6f00', width: 12, height: 12, borderRadius: 2 }}></span> Hangat (Batuan Beku)</div>
                    <div className="legend-item"><span style={{ background: '#00bcd4', width: 12, height: 12, borderRadius: 2 }}></span> Normal (Sedimen)</div>
                    <div className="legend-item"><span style={{ background: '#1a237e', width: 12, height: 12, borderRadius: 2 }}></span> Dingin (Rongga/Air)</div>
                  </div>
                  <button className={`btn ${showThermal ? 'btn-danger' : 'btn-success'} btn-block`}
                    onClick={() => { if (!showThermal) loadThermalOverlay(); else setShowThermal(false) }}
                    disabled={loading} style={{ marginTop: 8 }}>
                    {loading ? '⏳ Mengomputasi...' : showThermal ? '🗺️ Sembunyikan Peta Termal' : '🗺️ TAMPILKAN PETA TERMAL'}
                  </button>
                </div>
              )}

              {/* GPS TAB */}
              {activeTab === 'gps' && (
                <div className="card" style={{ borderColor: gpsTracking ? 'var(--green)' : 'var(--accent)' }}>
                  <div className="card-title" style={{ color: gpsTracking ? 'var(--green)' : '' }}>
                    {gpsTracking ? '📍 GPS AKTIF' : '📍 GPS Tracking'}
                  </div>
                  <p className="card-desc">
                    Aktifkan GPS untuk melacak posisi real-time. Anomali termal terdeteksi otomatis saat lo berjalan.
                  </p>
                  <button className={`btn ${gpsTracking ? 'btn-danger' : 'btn-success'} btn-block`}
                    onClick={toggleGpsTracking} style={{ padding: 14, fontSize: 15 }}>
                    {gpsTracking ? '⏹ STOP' : '▶ MULAI GPS'}
                  </button>
                  {gpsTracking && gpsPosition && (
                    <div className="info-panel" style={{ marginTop: 8 }}>
                      <div className="info-row"><span className="info-label">Lat</span><span className="info-value">{gpsPosition.lat.toFixed(6)}</span></div>
                      <div className="info-row"><span className="info-label">Lng</span><span className="info-value">{gpsPosition.lng.toFixed(6)}</span></div>
                      <div className="info-row"><span className="info-label">Akurasi</span><span className="info-value">±{gpsAccuracy}m</span></div>
                      {gpsPosition.elevation && <div className="info-row"><span className="info-label">Elevasi</span><span className="info-value">{gpsPosition.elevation}m</span></div>}
                      <div className="info-row"><span className="info-label">Titik</span><span className="info-value">{gpsPath.length}</span></div>
                    </div>
                  )}
                  {gpsThermal.length > 0 && (
                    <div className="card" style={{ marginTop: 8 }}>
                      <div className="card-title" style={{ fontSize: 12, color: 'var(--orange)' }}>
                        🔥 Anomali Terdeteksi
                      </div>
                      {gpsThermal.filter(t => t.anomalyLevel !== 'normal').slice(-5).reverse().map((t, i) => (
                        <div key={i} className="point-item" style={{ fontSize: 11 }}>
                          <span style={{ color: getAnomalyColor(t.anomalyLevel) }}>
                            {t.anomalies?.[0]?.emoji || '⚠️'} {t.anomalies?.[0]?.label || t.anomalyLevel}
                          </span>
                          <span className="coords">{t.temperature.surface.toFixed(1)}°C</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* PROFILE TAB */}
              {activeTab === 'profile' && (
                <>
                  <div className="card">
                    <div className="card-title">📈 Thermal Cross-Section</div>
                    <p className="card-desc">
                      Klik 2 titik di peta untuk membuat profil elevasi + termal.
                    </p>
                    <button className={`btn ${profileMode ? 'btn-danger' : 'btn-primary'} btn-block`}
                      onClick={() => setProfileMode(!profileMode)}>
                      {profileMode ? '⏹ Batal' : '📏 Gambar Profil'}
                    </button>
                    {profileMode && (
                      <div className="info-panel" style={{ marginTop: 6 }}>
                        <div className="info-row">
                          <span className="info-label">Mode</span>
                          <span className="info-value" style={{ color: '#f85149' }}>Klik titik pertama</span>
                        </div>
                      </div>
                    )}
                  </div>
                  {profileResult && renderProfileChart()}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* MAP */}
      <div className="map-container">
        <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={14} ref={mapRef}
          style={{ height: '100%', width: '100%' }}>
          <LayersControl position="topright">
            {Object.entries(TILE_LAYERS).map(([k, v]) => (
              <LayersControl.BaseLayer key={k} checked={k === 'satellite'} name={v.name}>
                <TileLayer url={v.url} attribution={v.name} />
              </LayersControl.BaseLayer>
            ))}
          </LayersControl>
          <MapClickHandler onClick={handleMapClick} onMove={setMapCenter} />

          {/* Thermal grid overlay */}
          {showThermal && thermalGrid.map((t, i) => {
            const temps = thermalGrid.map(x => x.temperature.surface)
            const minT = Math.min(...temps), maxT = Math.max(...temps)
            return (
              <CircleMarker key={i} center={[t.lat, t.lng]}
                radius={8} opacity={0.6}
                pathOptions={{
                  color: getThermalColor(t.temperature.surface, minT, maxT),
                  fillColor: getThermalColor(t.temperature.surface, minT, maxT),
                  fillOpacity: 0.4,
                  weight: 1,
                }}>
                <Popup>
                  <div style={{ color: '#333', fontSize: 11, minWidth: 180 }}>
                    <strong>{t.lithology.rockEmoji} {t.lithology.rockLabel}</strong><br/>
                    Suhu: {t.temperature.surface.toFixed(1)}°C (anomali: {(t.temperature.anomaly > 0 ? '+' : '')}{t.temperature.anomaly.toFixed(1)}°C)<br/>
                    Elevasi: {t.elevation}m<br/>
                    Formasi: {t.lithology.formation}<br/>
                    {t.anomalies.length > 0 && <><strong>Terindikasi:</strong> {t.anomalies.map(a => `${a.emoji} ${a.label} (${(a.confidence * 100).toFixed(0)}%)`).join(', ')}</>}
                  </div>
                </Popup>
              </CircleMarker>
            )}
          )}

          {/* Selected point */}
          {selectedPoint && (
            <CircleMarker center={[selectedPoint.lat, selectedPoint.lng]} radius={10}
              pathOptions={{ color: '#fff', weight: 2, fillColor: '#58a6ff', fillOpacity: 0.6 }}>
              <Popup>
                <div style={{ color: '#333', fontSize: 11, minWidth: 200 }}>
                  {loading ? '⏳ Menganalisis...' : thermalResult ? <>
                    <strong>🌡️ Analisis Termal</strong><br/>
                    {thermalResult.lithology.rockEmoji} {thermalResult.lithology.rockLabel}<br/>
                    🌡️ {thermalResult.temperature.surface.toFixed(1)}°C ({(thermalResult.temperature.anomaly > 0 ? '+' : '')}{thermalResult.temperature.anomaly.toFixed(1)}°C anomaly)<br/>
                    📏 {thermalResult.elevation}m<br/>
                    {thermalResult.anomalies.length > 0 ? <>
                      <strong>🔥 Terdeteksi:</strong><br/>
                      {thermalResult.anomalies.map((a, i) => (
                        <span key={i}>{a.emoji} {a.label} ({(a.confidence * 100).toFixed(0)}%)<br/></span>
                      ))}
                    </> : '✅ Tidak ada anomali signifikan'}
                  </> : '⏳'}
                </div>
              </Popup>
            </CircleMarker>
          )}

          {/* GPS path */}
          {gpsPath.length > 0 && (
            <Polyline positions={gpsPath} pathOptions={{ color: '#58a6ff', weight: 3, opacity: 0.6 }} />
          )}
          {gpsPosition && (
            <CircleMarker center={[gpsPosition.lat, gpsPosition.lng]}
              radius={gpsAccuracy ? Math.min(gpsAccuracy, 30) : 8}
              pathOptions={{ color: '#f0883e', fillColor: '#f0883e', fillOpacity: 0.3, weight: 2 }}>
              <Popup>
                <div style={{ color: '#333', fontSize: 11 }}>
                  <strong>📍 Posisi</strong><br/>
                  {gpsPosition.lat.toFixed(6)}, {gpsPosition.lng.toFixed(6)}<br/>
                  Elevasi: {gpsPosition.elevation || '—'}m<br/>
                  Akurasi: ±{gpsAccuracy}m
                </div>
              </Popup>
            </CircleMarker>
          )}

          {/* Cross-section markers */}
          {profileMode && (
            <CircleMarker center={[mapCenter.lat, mapCenter.lng]} radius={15}
              pathOptions={{ color: '#f85149', weight: 2, fillColor: '#f8514911', fillOpacity: 0.3, dashArray: '5,5' }}>
              <Popup><div style={{ color: '#333' }}>Klik titik PERTAMA untuk profil</div></Popup>
            </CircleMarker>
          )}
        </MapContainer>

        {/* Overlay indicators */}
        <div className="map-overlay">
          {gpsTracking && (
            <div className="gps-badge">
              <span className="gps-dot"></span>
              GPS {gpsAccuracy ? `±${gpsAccuracy}m` : 'Mencari...'}
            </div>
          )}
          {showThermal && (
            <div className="thermal-badge">🌡️ Thermal Layer Aktif</div>
          )}
          {loading && <div className="loading-badge">⏳ Memproses...</div>}
          {profileMode && <div className="profile-badge">📏 Klik 2 titik untuk cross-section</div>}
        </div>
      </div>
    </div>
  )
}