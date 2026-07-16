import { useState, useCallback, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap, useMapEvents, LayersControl } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './index.css'
import { fetchElevationBatch } from './services/elevationApi'
import { fetchGeologicalInfo } from './services/geologicalApi'
import { analyzeThermalLithology, getThermalColor, getAnomalyColor } from './services/thermalLithology'
import {
  computeSpectralIndices,
  detectAlteration,
  analyzeEpithermal,
  getIndonesiaLithology,
  SPECTRAL_INDICES,
} from './services/indonesiaGeology'
import { analyzeLineaments } from './services/lineamentAnalysis'
import { analyzeVegetation } from './services/vegetationAnalysis'
import { calculateProspectivity } from './services/prospectivityModel'
import { predictDepth, ALTERATION_DEPTH } from './services/depthPrediction'
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
  const [spectralResult, setSpectralResult] = useState(null)
  const [alterationResult, setAlterationResult] = useState(null)
  const [epithermalResult, setEpithermalResult] = useState(null)
  const [geoInfo, setGeoInfo] = useState(null)
  const [loading, setLoading] = useState(false)

  // New analysis state
  const [lineamentResult, setLineamentResult] = useState(null)
  const [vegetationResult, setVegetationResult] = useState(null)
  const [prospectivityResult, setProspectivityResult] = useState(null)
  const [depthResult, setDepthResult] = useState(null)

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
    setSpectralResult(null)
    setAlterationResult(null)
    setEpithermalResult(null)
    setGeoInfo(null)
    setLineamentResult(null)
    setVegetationResult(null)
    setProspectivityResult(null)
    setDepthResult(null)
    setActiveTab('home')

    try {
      // Fetch elevation
      const elevRes = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${latlng.lat}&longitude=${latlng.lng}`)
      const elevData = elevRes.ok ? await elevRes.json() : { elevation: [200] }
      const elevation = elevData.elevation?.[0] || 200

      // Fetch geology
      const geoInfo = await fetchGeologicalInfo(latlng.lat, latlng.lng, elevation)

      // Analyze thermal lithology
      const thermal = analyzeThermalLithology(latlng.lat, latlng.lng, { elevation }, geoInfo)

      // Compute spectral indices
      const lithology = getIndonesiaLithology(latlng.lat, latlng.lng, elevation)
      const spectral = computeSpectralIndices(lithology, { elevation, slope: 0 })

      // Detect alteration
      const alteration = detectAlteration(spectral.indices, lithology)

      // Analyze epithermal potential
      const epithermal = analyzeEpithermal(lithology, spectral.indices, alteration)

      // NEW: Lineament analysis
      const terrainGrid = await fetchTerrainGrid(latlng.lat, latlng.lng)
      const lineament = analyzeLineaments(terrainGrid, latlng)

      // NEW: Vegetation stress analysis
      const vegetation = analyzeVegetation(latlng.lat, latlng.lng, { elevation, slope: 0 }, geoInfo, thermal.anomalies)

      // NEW: Prospectivity model
      const prospectivity = calculateProspectivity(thermal, spectral, alteration, lineament, vegetation, geoInfo)

      // NEW: Depth prediction
      const depth = predictDepth(thermal, alteration, lineament, prospectivity, geoInfo)

      setThermalResult(thermal)
      setSpectralResult(spectral)
      setAlterationResult(alteration)
      setEpithermalResult(epithermal)
      setGeoInfo(geoInfo)
      setLineamentResult(lineament)
      setVegetationResult(vegetation)
      setProspectivityResult(prospectivity)
      setDepthResult(depth)
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
    const lats = points.map(p => p.lat.toFixed(5)).join(',')
    const lngs = points.map(p => p.lng.toFixed(5)).join(',')
    let elevations = []
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`)
      if (r.ok) elevations = (await r.json()).elevation || []
    } catch { elevations = points.map((p, i) => 200 + Math.abs(p.lat * 100 + p.lng * 100 + i) % 300) }

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
    const totalDist = profileResult.length > 1 ? profileResult.length * 30 : 1

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

  // Result panel renderers
  const renderHomeTab = () => (
    <div className="home-tab">
      <div className="hero-section">
        <h2>🌡️ Thermal Lithology Mapper</h2>
        <p>Deteksi anomali bawah tanah melalui analisis multi-source real-time.</p>
      </div>
      {selectedPoint && thermalResult ? (
        <div className="result-section">
          <div className="result-header">
            <span className="result-coords">{selectedPoint.lat.toFixed(5)}, {selectedPoint.lng.toFixed(5)}</span>
            <span className="result-elev">{thermalResult.elevation}m</span>
          </div>

          {/* Thermal */}
          <div className="card">
            <div className="card-title">🌡️ Analisis Termal</div>
            <div className="card-grid">
              <div className="card-item">
                <span className="label">Suhu Permukaan</span>
                <span className={`value ${thermalResult.temperature.surface > 35 ? 'hot' : thermalResult.temperature.surface > 28 ? 'warm' : 'cool'}`}>
                  {thermalResult.temperature.surface}°C
                </span>
              </div>
              <div className="card-item">
                <span className="label">Anomali</span>
                <span className={`value ${thermalResult.anomalyLevel === 'critical' ? 'danger' : thermalResult.anomalyLevel === 'high' ? 'warning' : ''}`}>
                  {thermalResult.riskScore > 0.3 ? `${(thermalResult.riskScore * 100).toFixed(0)}%` : 'Normal'}
                </span>
              </div>
              <div className="card-item">
                <span className="label">Batuan</span>
                <span className="value">{thermalResult.lithology.rockEmoji} {thermalResult.lithology.rockLabel}</span>
              </div>
              <div className="card-item">
                <span className="label">Inersia Termal</span>
                <span className="value">{thermalResult.lithology.thermalInertia}</span>
              </div>
            </div>
            {thermalResult.anomalies.length > 0 && (
              <div className="detected-features">
                <div className="guide-title">🔍 Anomali Terdeteksi</div>
                {thermalResult.anomalies.slice(0, 4).map((a, i) => (
                  <div key={i} className="feature-badge">
                    {a.emoji} {a.label} <span className="conf">{(a.confidence * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Prospectivity */}
          {prospectivityResult && (
            <div className="card">
              <div className="card-title">🎯 Prospektivitas Mineral</div>
              <div className={`prospectivity-score ${prospectivityResult.riskLevel}`}>
                <span className="big-score">{(prospectivityResult.score * 100).toFixed(0)}%</span>
                <span className="score-label">Confidence {(prospectivityResult.confidence * 100).toFixed(0)}%</span>
              </div>
              {prospectivityResult.mineralPredictions.length > 0 && (
                <div className="prediction-list">
                  {prospectivityResult.mineralPredictions.slice(0, 3).map((p, i) => (
                    <div key={i} className="prediction-item">
                      <span>{p.emoji} {p.label}</span>
                      <span className={`prob ${p.confidence}`}>{(p.probability * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="action-guide">{prospectivityResult.recommendedAction}</div>
            </div>
          )}

          {/* Depth Prediction */}
          {depthResult && depthResult.depth && (
            <div className="card" onClick={() => setActiveTab('depth')} style={{ cursor: 'pointer' }}>
              <div className="card-title">📏 Kedalaman Potensi</div>
              <div className="depth-home">
                <span className="depth-home-value">{depthResult.depth}<small>m</small></span>
                <span className="depth-home-label">{depthResult.classification.emoji} {depthResult.classification.label}</span>
              </div>
              <div className="card-text small">Range: {depthResult.minDepth}m - {depthResult.maxDepth}m</div>
            </div>
          )}

          {/* Geology */}
          {geoInfo && (
            <div className="card">
              <div className="card-title">🪨 Geologi</div>
              <div className="card-text">{geoInfo.lithology || geoInfo.rockType}</div>
              <div className="card-text small">{geoInfo.formation}</div>
              {epithermalResult && epithermalResult.potential && (
                <div className="epithermal-badge">
                  🏆 Potensi Epitermal: {(epithermalResult.score * 100).toFixed(0)}%
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">👆</div>
          <p>Klik peta untuk memulai analisis</p>
        </div>
      )}
    </div>
  )

  // === RENDER SPECTRUM TAB ===
  const renderSpectrumTab = () => {
    if (!spectralResult) return <div className="empty-state"><p>Klik peta untuk melihat data spektrum</p></div>
    const { indices, anomalyLevel } = spectralResult

    const spectralItems = [
      { key: 'iron_oxide', label: 'Iron Oxide', emoji: '🟤', desc: 'Oksida besi — gossan/mineralisasi' },
      { key: 'clay_minerals', label: 'Clay Minerals', emoji: '🟠', desc: 'Mineral lempung — alterasi hidrotermal' },
      { key: 'ferrous_minerals', label: 'Ferrous Minerals', emoji: '🔵', desc: 'Mineral besi dalam (Fe²⁺)' },
      { key: 'silica_index', label: 'Silica/Quartz', emoji: '⚪', desc: 'Silika tinggi — zona urat kuarsa' },
      { key: 'ndvi', label: 'Vegetation Stress', emoji: '🟢', desc: 'NDVI rendah = stress vegetasi' },
      { key: 'alteration_index', label: 'Alteration Index', emoji: '🔴', desc: 'Indeks alterasi gabungan' },
    ]

    return (
      <div className="tab-content">
        <h3>🔬 Analisis Spektrum</h3>
        <div className={`anomaly-badge ${anomalyLevel}`}>
          Anomali Spektral: {anomalyLevel === 'high' ? 'TINGGI' : anomalyLevel === 'moderate' ? 'SEDANG' : 'RENDAH'}
        </div>
        {spectralItems.map(({ key, label, emoji, desc }) => (
          <div key={key} className="spectral-item">
            <div className="spectral-header">
              <span>{emoji} {label}</span>
              <span className="spectral-value">{(indices[key] * 100).toFixed(0)}%</span>
            </div>
            <div className="spectral-bar">
              <div className="spectral-fill" style={{ width: `${indices[key] * 100}%` }} />
            </div>
            <div className="spectral-desc">{desc}</div>
          </div>
        ))}
        {alterationResult && (
          <div className="card">
            <div className="card-title">🧱 Alterasi: {alterationResult.name}</div>
            <div className="card-text">{alterationResult.description}</div>
          </div>
        )}
      </div>
    )
  }

  // === RENDER THERMAL TAB ===
  const renderThermalTab = () => {
    if (!thermalResult) return <div className="empty-state"><p>Klik peta untuk melihat analisis termal</p></div>
    const { temperature, lithology, anomalies, terrain, elevation } = thermalResult

    return (
      <div className="tab-content">
        <h3>🌡️ Analisis Termal Detail</h3>
        <div className="card-grid">
          <div className="card-item">
            <span className="label">Suhu Permukaan</span>
            <span className="value big">{temperature.surface}°C</span>
          </div>
          <div className="card-item">
            <span className="label">Suhu Ekspektasi</span>
            <span className="value">{temperature.expected}°C</span>
          </div>
          <div className="card-item">
            <span className="label">Anomali Termal</span>
            <span className={`value ${temperature.anomaly > 2 ? 'hot' : temperature.anomaly < -2 ? 'cool' : ''}`}>
              {temperature.anomaly > 0 ? '+' : ''}{temperature.anomaly}°C
            </span>
          </div>
          <div className="card-item">
            <span className="label">Elevasi</span>
            <span className="value">{elevation}m</span>
          </div>
          <div className="card-item">
            <span className="label">Batuan</span>
            <span className="value">{lithology.rockEmoji} {lithology.rockLabel}</span>
          </div>
          <div className="card-item">
            <span className="label">Formasi</span>
            <span className="value">{lithology.formation}</span>
          </div>
        </div>

        {terrain && (
          <div className="card">
            <div className="card-title">🗺️ Terrain</div>
            <div className="card-grid">
              <div className="card-item"><span className="label">Slope</span><span className="value">{terrain.slope}°</span></div>
              <div className="card-item"><span className="label">Aspect</span><span className="value">{terrain.aspect}°</span></div>
              <div className="card-item"><span className="label">Curvature</span><span className="value">{terrain.curvature}</span></div>
            </div>
          </div>
        )}

        {anomalies.length > 0 && (
          <div className="card">
            <div className="card-title">🔍 Deteksi Anomali</div>
            {anomalies.map((a, i) => (
              <div key={i} className="anomaly-item">
                <span>{a.emoji} {a.label}</span>
                <span className="conf">{(a.confidence * 100).toFixed(0)}%</span>
                <span className="anomaly-temp">{a.tempAnomaly > 0 ? '+' : ''}{a.tempAnomaly}°C</span>
              </div>
            ))}
          </div>
        )}

        <button className="btn-secondary" onClick={loadThermalOverlay}>
          🌡️ Tampilkan Peta Termal
        </button>
      </div>
    )
  }

  // === RENDER ALTERATION TAB ===
  const renderAlterationTab = () => {
    if (!alterationResult) return <div className="empty-state"><p>Klik peta untuk melihat alterasi</p></div>
    return (
      <div className="tab-content">
        <h3>🧱 Zona Alterasi</h3>
        <div className="card">
          <div className="alteration-header">
            <span className="alteration-icon">{alterationResult.emoji}</span>
            <span className="alteration-name">{alterationResult.name}</span>
          </div>
          <div className="card-text">{alterationResult.description}</div>
          <div className="card-grid">
            <div className="card-item">
              <span className="label">Suhu Formasi</span>
              <span className="value">{alterationResult.temperature}</span>
            </div>
            <div className="card-item">
              <span className="label">Intensitas</span>
              <span className="value">{(alterationResult.intensity * 100).toFixed(0)}%</span>
            </div>
            <div className="card-item">
              <span className="label">Confidence</span>
              <span className="value">{(alterationResult.confidence * 100).toFixed(0)}%</span>
            </div>
          </div>
          {alterationResult.minerals && (
            <div className="card-text">
              Indikasi mineral: {alterationResult.minerals.map(m => {
                const icons = { gold: '🥇', silver: '🥈', copper: '🔶' }
                return `${icons[m] || '🪨'} ${m}`
              }).join(', ')}
            </div>
          )}
        </div>
        {epithermalResult && (
          <div className="card">
            <div className="card-title">🏆 Sistem Epitermal</div>
            <div className={`epithermal-score ${epithermalResult.potential ? 'high' : 'low'}`}>
              {(epithermalResult.score * 100).toFixed(0)}% Potensi
            </div>
            {epithermalResult.depositTypes.map((d, i) => (
              <div key={i} className="deposit-item">
                <span>{d.type}</span>
                <span className="conf">{(d.conf * 100).toFixed(0)}%</span>
              </div>
            ))}
            <div className={`exploration-badge ${epithermalResult.recommendedExploration === 'HIGH PRIORITY' ? 'high' : 'moderate'}`}>
              {epithermalResult.recommendedExploration}
            </div>
          </div>
        )}
      </div>
    )
  }

  // === RENDER LINEAMENT TAB ===
  const renderLineamentTab = () => {
    if (!lineamentResult) return <div className="empty-state"><p>Klik peta untuk analisis lineament</p></div>
    return (
      <div className="tab-content">
        <h3>🧵 Analisis Lineament</h3>
        <div className={`anomaly-badge ${lineamentResult.confidence > 0.5 ? 'high' : 'moderate'}`}>
          Confidence: {(lineamentResult.confidence * 100).toFixed(0)}%
        </div>
        <div className="card">
          <div className="card-grid">
            <div className="card-item">
              <span className="label">Kerapatan</span>
              <span className="value">{(lineamentResult.density * 100).toFixed(1)}%</span>
            </div>
            <div className="card-item">
              <span className="label">Lineament</span>
              <span className="value">{lineamentResult.totalLineaments}</span>
            </div>
            <div className="card-item">
              <span className="label">Arah Dominan</span>
              <span className="value">{lineamentResult.dominantDirection || '—'}</span>
            </div>
          </div>
          <div className="card-text small">{lineamentResult.summary}</div>
        </div>
        {lineamentResult.lineaments.length > 0 && (
          <div className="card">
            <div className="card-title">Lineament Terdeteksi</div>
            {lineamentResult.lineaments.slice(0, 8).map((l, i) => (
              <div key={i} className="lineament-item">
                <span>{l.type.emoji} {l.type.label}</span>
                <span className="lineament-dir">{l.direction != null ? `${Math.round(l.direction)}°` : '—'}</span>
                <span className="conf">{(l.score * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // === RENDER VEGETATION TAB ===
  const renderVegetationTab = () => {
    if (!vegetationResult) return <div className="empty-state"><p>Klik peta untuk analisis vegetasi</p></div>
    const { indices, anomaly, stressPattern, stressFactors } = vegetationResult
    return (
      <div className="tab-content">
        <h3>🌿 Analisis Geobotani</h3>
        <div className={`anomaly-badge ${anomaly.level}`}>
          {anomaly.level === 'critical' ? '⚠️ ANOMALI KRITIS' : anomaly.level === 'high' ? '⚠️ Stress Tinggi' : anomaly.level === 'moderate' ? 'Stress Sedang' : '✓ Normal'}
        </div>
        <div className="card">
          <div className="card-title">Indeks Vegetasi</div>
          <div className="card-grid">
            <div className="card-item">
              <span className="label">NDVI</span>
              <span className={`value ${indices.ndvi < 0.3 ? 'danger' : indices.ndvi < 0.45 ? 'warning' : ''}`}>{indices.ndvi.toFixed(3)}</span>
            </div>
            <div className="card-item">
              <span className="label">NDRE</span>
              <span className="value">{indices.ndre.toFixed(3)}</span>
            </div>
            <div className="card-item">
              <span className="label">Red Edge</span>
              <span className="value">{indices.redEdge.toFixed(3)}</span>
            </div>
            <div className="card-item">
              <span className="label">Moisture</span>
              <span className="value">{indices.moisture.toFixed(3)}</span>
            </div>
            <div className="card-item">
              <span className="label">Kesehatan</span>
              <span className={`value ${indices.health < 0.4 ? 'danger' : indices.health < 0.6 ? 'warning' : ''}`}>
                {(indices.health * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Pola Stress: {stressPattern.emoji} {stressPattern.label}</div>
          <div className="card-text">{stressPattern.desc}</div>
        </div>
        {stressFactors.length > 0 && (
          <div className="card">
            <div className="card-title">Faktor Stress</div>
            {stressFactors.map((s, i) => (
              <div key={i} className="stress-item">
                <span>{s.mineral}</span>
                <span>{s.indicator}</span>
              </div>
            ))}
          </div>
        )}
        <div className="card-text small">{vegetationResult.summary}</div>
      </div>
    )
  }

  // === RENDER PROSPECTIVITY TAB ===
  const renderProspectivityTab = () => {
    if (!prospectivityResult) return <div className="empty-state"><p>Klik peta untuk melihat prospektivitas</p></div>
    const { score, confidence, riskLevel, features, mineralPredictions, recommendedAction } = prospectivityResult
    return (
      <div className="tab-content">
        <h3>🎯 Prospektivitas Mineral</h3>
        <div className={`prospectivity-gauge ${riskLevel}`}>
          <div className="gauge-value">{(score * 100).toFixed(0)}%</div>
          <div className="gauge-label">Prospektivitas</div>
          <div className="gauge-bar">
            <div className="gauge-fill" style={{ width: `${score * 100}%` }} />
          </div>
        </div>
        <div className="card">
          <div className="card-title">Feature Contribution</div>
          {Object.entries(features).map(([key, f]) => (
            <div key={key} className="feature-row">
              <span className="feature-name">{key}</span>
              <div className="feature-bar-area">
                <div className="feature-bar">
                  <div className="feature-fill" style={{ width: `${f.score * 100}%` }} />
                </div>
              </div>
              <span className="feature-contribution">{(f.contribution * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
        {mineralPredictions.length > 0 && (
          <div className="card">
            <div className="card-title">Prediksi Mineral</div>
            {mineralPredictions.slice(0, 5).map((p, i) => (
              <div key={i} className="prediction-item">
                <span>{p.emoji} {p.label}</span>
                <span className={`prob ${p.confidence}`}>{(p.probability * 100).toFixed(0)}%</span>
                {p.thermalMatch && <span className="tag">🔥Termal</span>}
                {p.geoSupport && <span className="tag">🪨Geologi</span>}
              </div>
            ))}
          </div>
        )}
        <div className={`action-guide ${riskLevel}`}>{recommendedAction}</div>
      </div>
    )
  }

  // === RENDER DEPTH TAB ===
  const renderDepthTab = () => {
    if (!depthResult || !depthResult.depth) return <div className="empty-state"><p>Klik peta untuk prediksi kedalaman</p></div>
    const { depth, minDepth, maxDepth, confidence, classification, layers, summary, recommendedExploration } = depthResult

    return (
      <div className="tab-content">
        <h3>📏 Prediksi Kedalaman</h3>
        <div className="card">
          <div className="depth-visual">
            <div className="depth-value">{depth}<span className="depth-unit">m</span></div>
            <div className={`depth-classification ${classification.id}`}>
              {classification.emoji} {classification.label}
            </div>
            <div className="depth-range">Range: {minDepth}m - {maxDepth}m</div>
            <div className="depth-confidence">Confidence: {(confidence * 100).toFixed(0)}%</div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">📊 Profil Kedalaman</div>
          <div className="depth-bar-container">
            {layers.map((l, i) => (
              <div key={i} className="depth-layer" style={{ background: getDepthColor(l.emoji) }}>
                <div className="depth-layer-label">{l.depth}m</div>
                <div className="depth-layer-info">{l.emoji} {l.label}</div>
                {l.alterationMatch && (
                  <div className="depth-alteration-tag">
                    {l.alterationMatch.optimal ? '⭐' : '▫'} {l.alterationMatch.zone}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">🧱 Zona Alterasi vs Kedalaman</div>
          {Object.entries(ALTERATION_DEPTH).map(([key, info]) => {
            const isActive = depth >= info.min && depth <= info.max
            const isOptimal = depth >= info.optimal - 100 && depth <= info.optimal + 100
            return (
              <div key={key} className={`depth-alteration-row ${isActive ? 'active' : ''} ${isOptimal ? 'optimal' : ''}`}>
                <span className="depth-alt-name">{isOptimal ? '⭐' : isActive ? '▫' : ' '} {info.label}</span>
                <span className="depth-alt-range">{info.min}m - {info.max}m</span>
                <span className="depth-alt-optimal">{info.desc}</span>
              </div>
            )
          })}
        </div>

        <div className="card card-text small">{summary}</div>
        <div className={`action-guide ${depth > 800 ? 'high' : depth > 300 ? 'moderate' : 'low'}`}>
          {recommendedExploration}
        </div>
      </div>
    )
  }

  function getDepthColor(emoji) {
    const map = { '🟢': '#1a4731', '🟡': '#4a3d1a', '🟠': '#4a2a1a', '🔴': '#4a1a1a', '🟣': '#2a1a4a' }
    return map[emoji] || '#1c2333'
  }

  // === RENDER GPS TAB ===
  const renderGpsTab = () => (
    <div className="tab-content">
      <h3>📍 GPS Tracking</h3>
      <button className={`btn-${gpsTracking ? 'danger' : 'primary'}`} onClick={toggleGpsTracking}>
        {gpsTracking ? '⏹ Stop Tracking' : '▶ Mulai Tracking'}
      </button>
      {gpsPosition && (
        <div className="card">
          <div className="card-grid">
            <div className="card-item"><span className="label">Lat</span><span className="value">{gpsPosition.lat.toFixed(6)}</span></div>
            <div className="card-item"><span className="label">Lng</span><span className="value">{gpsPosition.lng.toFixed(6)}</span></div>
            <div className="card-item"><span className="label">Akurasi</span><span className="value">{gpsAccuracy ? `${gpsAccuracy.toFixed(0)}m` : '—'}</span></div>
            <div className="card-item"><span className="label">Jejak</span><span className="value">{gpsPath.length} titik</span></div>
          </div>
        </div>
      )}
      {gpsThermal.length > 0 && (
        <div className="card">
          <div className="card-title">🔥 Anomali Sepanjang Rute</div>
          {gpsThermal.filter(t => t.anomalyLevel !== 'normal').slice(-5).reverse().map((t, i) => (
            <div key={i} className="gps-anomaly">
              <span className="gps-coords">{t.lat.toFixed(5)},{t.lng.toFixed(5)}</span>
              <span className="gps-temp">{t.temperature.surface}°C</span>
              <span className="gps-anomaly-label">{t.anomalies[0]?.emoji || '⚠️'}</span>
            </div>
          ))}
        </div>
      )}
      <div className="card-text small">Pastikan GPS aktif di perangkat Anda</div>
    </div>
  )

  // === RENDER PROFILE TAB ===
  const renderProfileTab = () => {
    if (profileMode) return <div className="empty-state"><p>Klik titik awal & akhir di peta</p></div>
    if (!profileResult) return <div className="empty-state"><p>Pilih menu Profil & klik dua titik di peta</p></div>
    return renderProfileChart()
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
                ['spectrum', '🔬 Spektrum'],
                ['thermal', '🌡️ Thermal'],
                ['alteration', '🧱 Alterasi'],
                ['lineament', '🧵 Lineament'],
                ['vegetation', '🌿 Vegetasi'],
                ['depth', '📏 Kedalaman'],
                ['prospectivity', '🎯 Prospek'],
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
            <div className="sidebar-content">
              {loading && <div className="loading">⏳ Menganalisis...</div>}
              {activeTab === 'home' && renderHomeTab()}
              {activeTab === 'spectrum' && renderSpectrumTab()}
              {activeTab === 'thermal' && renderThermalTab()}
              {activeTab === 'alteration' && renderAlterationTab()}
              {activeTab === 'lineament' && renderLineamentTab()}
              {activeTab === 'vegetation' && renderVegetationTab()}
              {activeTab === 'prospectivity' && renderProspectivityTab()}
              {activeTab === 'depth' && renderDepthTab()}
              {activeTab === 'gps' && renderGpsTab()}
              {activeTab === 'profile' && renderProfileTab()}
            </div>
          </>
        )}
      </div>

      <div className="map-container">
        <MapContainer
          center={mapCenter}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
        >
          <LayersControl position="topright">
            {Object.entries(TILE_LAYERS).map(([k, v]) => (
              <LayersControl.BaseLayer key={k} checked={k === 'satellite'} name={v.name}>
                <TileLayer url={v.url} attribution={v.name} />
              </LayersControl.BaseLayer>
            ))}
          </LayersControl>

          <MapClickHandler
            onClick={handleMapClick}
            onMove={(c) => setMapCenter(c)}
          />

          {selectedPoint && (
            <Marker position={selectedPoint}>
              <Popup>
                📍 {selectedPoint.lat.toFixed(5)}, {selectedPoint.lng.toFixed(5)}
                <br />{thermalResult?.temperature?.surface || '?'}°C
              </Popup>
            </Marker>
          )}

          {gpsPosition && (
            <CircleMarker center={[gpsPosition.lat, gpsPosition.lng]} radius={10} color="#3fb950" fillColor="#3fb950" fillOpacity={0.5} />
          )}

          {gpsPath.length > 1 && (
            <Polyline positions={gpsPath.map(p => [p.lat, p.lng])} color="#3fb950" weight={2} opacity={0.6} />
          )}

          {/* Thermal grid overlay */}
          {showThermal && thermalGrid.map((p, i) => (
            <CircleMarker key={i}
              center={[p.lat, p.lng]}
              radius={6}
              color={getThermalColor(p.temperature?.surface || 30, 20, 50)}
              fillColor={getThermalColor(p.temperature?.surface || 30, 20, 50)}
              fillOpacity={0.5}
            >
              <Popup>{p.lat.toFixed(4)},{p.lng.toFixed(4)}<br/>{p.temperature?.surface}°C<br/>{p.lithology?.rockLabel}</Popup>
            </CircleMarker>
          ))}

          {/* Profile mode */}
          {profileMode && <ProfileClickHandler onStartEnd={handleCrossSectionClick} />}
        </MapContainer>
      </div>
    </div>
  )
}

// === PROFILE CLICK HANDLER ===
function ProfileClickHandler({ onStartEnd }) {
  const points = useRef([])
  useMapEvents({
    click: (e) => {
      points.current.push(e.latlng)
      if (points.current.length === 2) {
        onStartEnd(points.current[0], points.current[1])
        points.current = []
      }
    },
  })
  return null
}

// === FETCH TERRAIN GRID FOR LINEAMENT ANALYSIS ===
async function fetchTerrainGrid(lat, lng, radius = 0.5, gridSize = 7) {
  const points = []
  const latStep = (radius * 2) / (gridSize - 1) / 111
  const lngStep = latStep / Math.cos(lat * Math.PI / 180)
  const startLat = lat - radius / 111
  const startLng = lng - (radius / 111) / Math.cos(lat * Math.PI / 180)

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      points.push({
        lat: startLat + i * latStep,
        lng: startLng + j * lngStep,
      })
    }
  }
  const elevations = await fetchElevationBatch(points)
  return points.map((p, i) => ({ ...p, elevation: elevations[i] ?? 0 }))
}