import { useState, useCallback, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, CircleMarker, useMap, useMapEvents, LayersControl } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './index.css'

// Fix default marker icons
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

// Custom icon factory
function createIcon(color, emoji) {
  return L.divIcon({
    html: `<div style="background:${color};width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)">${emoji}</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

const MINERAL_TYPES = {
  gold: { emoji: '🥇', color: '#FFD700', label: 'Emas' },
  silver: { emoji: '🥈', color: '#C0C0C0', label: 'Perak' },
  iron: { emoji: '⚙️', color: '#8B4513', label: 'Besi' },
  copper: { emoji: '🔶', color: '#B87333', label: 'Tembaga' },
  diamond: { emoji: '💎', color: '#00FFFF', label: 'Berlian' },
  oil: { emoji: '🛢️', color: '#333333', label: 'Minyak' },
  treasure: { emoji: '💰', color: '#FF8C00', label: 'Harta' },
  artifact: { emoji: '🏺', color: '#CD853F', label: 'Artefak' },
  tunnel: { emoji: '🕳️', color: '#8B0000', label: 'Terowongan' },
  cave: { emoji: '🦇', color: '#4B0082', label: 'Gua' },
}

const TILE_LAYERS = {
  street: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', name: 'Peta Jalan' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', name: 'Satelit' },
  terrain: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', name: 'Terrain' },
  relief: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}', name: 'Shaded Relief' },
}

// Helper: parse GPX/KML/CSV files
function parseFile(content, filename) {
  const ext = filename.split('.').pop().toLowerCase()
  const points = []

  if (ext === 'csv') {
    const lines = content.split('\n').filter(l => l.trim())
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    const latIdx = headers.findIndex(h => h.includes('lat'))
    const lngIdx = headers.findIndex(h => h.includes('lng') || h.includes('lon'))
    const elevIdx = headers.findIndex(h => h.includes('elev') || h.includes('alt'))
    const labelIdx = headers.findIndex(h => h.includes('label') || h.includes('name'))

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',')
      if (cols[latIdx] && cols[lngIdx]) {
        points.push({
          lat: parseFloat(cols[latIdx]),
          lng: parseFloat(cols[lngIdx]),
          elevation: elevIdx >= 0 ? parseFloat(cols[elevIdx]) || 0 : 0,
          label: labelIdx >= 0 ? cols[labelIdx] : `Point ${i}`,
          id: Date.now() + i,
        })
      }
    }
  } else if (ext === 'gpx') {
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'text/xml')
    const trkpts = doc.querySelectorAll('trkpt, wpt, rtept')
    trkpts.forEach((pt, i) => {
      const ele = pt.querySelector('ele')
      const name = pt.querySelector('name')
      points.push({
        lat: parseFloat(pt.getAttribute('lat')),
        lng: parseFloat(pt.getAttribute('lon')),
        elevation: ele ? parseFloat(ele.textContent) : 0,
        label: name ? name.textContent : `Waypoint ${i + 1}`,
        id: Date.now() + i,
      })
    })
  } else if (ext === 'kml') {
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'text/xml')
    const coords = doc.querySelectorAll('coordinates')
    coords.forEach((coord, i) => {
      const text = coord.textContent.trim()
      const tuples = text.split(/\s+/)
      tuples.forEach((tuple, j) => {
        const [lng, lat, elev] = tuple.split(',')
        if (lat && lng) {
          points.push({
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            elevation: elev ? parseFloat(elev) : 0,
            label: `KML Point ${i * 100 + j + 1}`,
            id: Date.now() + i * 100 + j,
          })
        }
      })
    })
  }

  return points
}

// Generate survey grid
function generateGrid(bounds, spacing) {
  const points = []
  const { north, south, east, west } = bounds
  const latStep = spacing / 111000
  const lngStep = spacing / (111000 * Math.cos(((north + south) / 2) * Math.PI / 180))

  for (let lat = south; lat <= north; lat += latStep) {
    for (let lng = west; lng <= east; lng += lngStep) {
      points.push({
        lat: lat + (Math.random() * 0.00001),
        lng: lng + (Math.random() * 0.00001),
        elevation: Math.random() * 50 + 100,
        label: `Survey`,
        id: Date.now() + Math.random(),
      })
    }
  }
  return points
}

// Map click handler component
function MapClickHandler({ onMapClick, onMapMove }) {
  useMapEvents({
    click: (e) => onMapClick(e.latlng),
    move: (e) => {
      const center = e.target.getCenter()
      onMapMove(center)
    },
  })
  return null
}

// Auto-fit bounds component
function BoundsFitter({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length > 1) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]))
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [points.length])
  return null
}

export default function App() {
  // State
  const [points, setPoints] = useState([])
  const [mineralMarkers, setMineralMarkers] = useState([])
  const [activeTab, setActiveTab] = useState('gps')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mapCenter, setMapCenter] = useState({ lat: -6.2, lng: 106.8 })
  const [activeLayer, setActiveLayer] = useState('satellite')
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showContours, setShowContours] = useState(false)
  const [showAnomalies, setShowAnomalies] = useState(false)
  const [gpsTracking, setGpsTracking] = useState(false)
  const [showHelp, setShowHelp] = useState(true)
  const [surveyRunning, setSurveyRunning] = useState(false)
  const [surveyProgress, setSurveyProgress] = useState(0)
  const [surveyPoints, setSurveyPoints] = useState([])
  const [gridSpacing, setGridSpacing] = useState(50)
  const [selectedMineral, setSelectedMineral] = useState('gold')
  const [markerDepth, setMarkerDepth] = useState(5)
  const [markerConfidence, setMarkerConfidence] = useState(70)
  const [markerNotes, setMarkerNotes] = useState('')
  const [polygons, setPolygons] = useState([])
  const [drawingPolygon, setDrawingPolygon] = useState(false)
  const [polygonPoints, setPolygonPoints] = useState([])
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')
  const [manualElev, setManualElev] = useState('0')
  const [manualLabel, setManualLabel] = useState('')
  const [filterTypes, setFilterTypes] = useState(Object.keys(MINERAL_TYPES))
  const [contourLines, setContourLines] = useState([])
  const [anomalies, setAnomalies] = useState([])
  const [heatmapData, setHeatmapData] = useState([])

  const gpsWatchRef = useRef(null)
  const fileInputRef = useRef(null)
  const mapRef = useRef(null)

  // Handle map click
  const handleMapClick = useCallback((latlng) => {
    if (drawingPolygon) {
      setPolygonPoints(prev => [...prev, [latlng.lat, latlng.lng]])
      return
    }

    const newPoint = {
      lat: latlng.lat,
      lng: latlng.lng,
      elevation: parseFloat(manualElev) || 0,
      label: manualLabel || `Point ${points.length + 1}`,
      id: Date.now(),
    }
    setPoints(prev => [...prev, newPoint])
  }, [drawingPolygon, manualElev, manualLabel, points.length])

  // Handle file upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const parsed = parseFile(ev.target.result, file.name)
      if (parsed.length > 0) {
        setPoints(prev => [...prev, ...parsed])
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // GPS tracking
  const toggleGpsTracking = () => {
    if (gpsTracking) {
      if (gpsWatchRef.current) navigator.geolocation.clearWatch(gpsWatchRef.current)
      setGpsTracking(false)
    } else {
      if (!navigator.geolocation) {
        alert('GPS tidak tersedia di perangkat ini')
        return
      }
      setGpsTracking(true)
      gpsWatchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const newPoint = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            elevation: pos.coords.altitude || 0,
            label: `GPS ${points.length + 1}`,
            id: Date.now(),
          }
          setPoints(prev => {
            if (prev.length > 0 && Date.now() - prev[prev.length - 1].id < 2000) return prev
            return [...prev, newPoint]
          })
        },
        (err) => console.error('GPS Error:', err),
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }
  }

  // Add manual point
  const addManualPoint = () => {
    const lat = parseFloat(manualLat)
    const lng = parseFloat(manualLng)
    if (isNaN(lat) || isNaN(lng)) return
    setPoints(prev => [...prev, {
      lat, lng,
      elevation: parseFloat(manualElev) || 0,
      label: manualLabel || `Point ${prev.length + 1}`,
      id: Date.now(),
    }])
    setManualLat('')
    setManualLng('')
    setManualLabel('')
  }

  // Add mineral marker
  const addMineralMarker = (latlng) => {
    setMineralMarkers(prev => [...prev, {
      ...latlng,
      type: selectedMineral,
      depth: markerDepth,
      confidence: markerConfidence,
      notes: markerNotes,
      id: Date.now(),
    }])
  }

  // Run auto survey
  const runSurvey = () => {
    if (!mapRef.current) return
    const bounds = mapRef.current.getBounds()
    const grid = generateGrid({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    }, gridSpacing)

    setSurveyRunning(true)
    setSurveyProgress(0)
    setSurveyPoints([])

    let idx = 0
    const interval = setInterval(() => {
      if (idx >= grid.length) {
        clearInterval(interval)
        setSurveyRunning(false)
        // Detect anomalies from survey
        const detected = detectSurveyAnomalies(grid)
        setSurveyPoints(grid.map((p, i) => ({ ...p, anomalyScore: detected[i] || 0 })))
        return
      }
      setSurveyPoints(prev => [...prev, grid[idx]])
      setSurveyProgress(Math.round(((idx + 1) / grid.length) * 100))
      idx++
    }, 100)
  }

  // Simple anomaly detection for survey points
  const detectSurveyAnomalies = (pts) => {
    return pts.map((p, i) => {
      const neighbors = pts.filter((_, j) => j !== i && Math.abs(j - i) < 5)
      if (neighbors.length < 2) return 0
      const avgElev = neighbors.reduce((s, n) => s + n.elevation, 0) / neighbors.length
      const diff = Math.abs(p.elevation - avgElev)
      return Math.min(diff / 10, 1)
    })
  }

  // Export functions
  const exportAs = (format) => {
    let content, filename, type
    const allPts = [...points, ...mineralMarkers.map(m => ({ lat: m.lat, lng: m.lng, elevation: m.depth, label: `${m.type} - ${m.notes}` }))]

    if (format === 'geojson') {
      content = JSON.stringify({
        type: 'FeatureCollection',
        features: allPts.map(p => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: { elevation: p.elevation, label: p.label },
        })),
      }, null, 2)
      filename = 'anomaly-map.geojson'
      type = 'application/json'
    } else if (format === 'kml') {
      const placemarks = allPts.map(p => `
        <Placemark><name>${p.label}</name>
        <Point><coordinates>${p.lng},${p.lat},${p.elevation || 0}</coordinates></Point>
        </Placemark>`).join('')
      content = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks}</Document></kml>`
      filename = 'anomaly-map.kml'
      type = 'application/vnd.google-earth.kml+xml'
    } else if (format === 'csv') {
      const header = 'lat,lng,elevation,label\n'
      const rows = allPts.map(p => `${p.lat},${p.lng},${p.elevation || 0},${p.label}`).join('\n')
      content = header + rows
      filename = 'anomaly-map.csv'
      type = 'text/csv'
    } else if (format === 'gpx') {
      const wpts = allPts.map(p => `
        <wpt lat="${p.lat}" lon="${p.lng}"><ele>${p.elevation || 0}</ele><name>${p.label}</name></wpt>`).join('')
      content = `<?xml version="1.0"?><gpx version="1.1">${wpts}</gpx>`
      filename = 'anomaly-map.gpx'
      type = 'application/gpx+xml'
    }

    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  // Save/Load project
  const saveProject = () => {
    const project = { points, mineralMarkers, polygons }
    localStorage.setItem('anomalyMapperProject', JSON.stringify(project))
    alert('Proyek tersimpan!')
  }

  const loadProject = () => {
    const data = localStorage.getItem('anomalyMapperProject')
    if (data) {
      const project = JSON.parse(data)
      setPoints(project.points || [])
      setMineralMarkers(project.mineralMarkers || [])
      setPolygons(project.polygons || [])
    }
  }

  // Finish polygon drawing
  const finishPolygon = () => {
    if (polygonPoints.length >= 3) {
      setPolygons(prev => [...prev, { points: polygonPoints, id: Date.now(), label: `Zona ${prev.length + 1}` }])
      setPolygonPoints([])
      setDrawingPolygon(false)
    }
  }

  // Get anomaly color
  const getAnomalyColor = (score) => {
    if (score < 0.3) return '#00ff88'
    if (score < 0.6) return '#ffdd00'
    if (score < 0.8) return '#ff8800'
    return '#ff4444'
  }

  return (
    <>
      {showHelp && (
        <div className="help-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-content" onClick={e => e.stopPropagation()}>
            <h2>🗺️ GPS Anomaly Mapper</h2>
            <p>Aplikasi pemetaan GPS untuk mendeteksi anomali bawah tanah, mineral, dan harta simpanan.</p>
            <ul>
              <li><strong>Klik peta</strong> untuk menambah titik GPS</li>
              <li><strong>Upload file</strong> GPX/KML/CSV untuk import data</li>
              <li><strong>GPS Tracking</strong> untuk pelacakan real-time</li>
              <li><strong>Auto Survey</strong> untuk pemindaian grid otomatis</li>
              <li><strong>Mineral Map</strong> untuk menandai jenis mineral/logam</li>
              <li><strong>Anomaly Detection</strong> untuk mendeteksi terowongan/ruangan bawah tanah</li>
            </ul>
            <button className="btn btn-primary btn-block" onClick={() => setShowHelp(false)} style={{ marginTop: 16 }}>
              Mulai Sekarang
            </button>
          </div>
        </div>
      )}

      <div className="app-container">
        {/* Sidebar */}
        <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            {sidebarCollapsed ? '▶' : '◀'}
          </button>

          {!sidebarCollapsed && (
            <>
              <div className="tab-bar">
                <button className={`tab-btn ${activeTab === 'gps' ? 'active' : ''}`} onClick={() => setActiveTab('gps')}>📍 GPS</button>
                <button className={`tab-btn ${activeTab === 'anomaly' ? 'active' : ''}`} onClick={() => setActiveTab('anomaly')}>🔍 Anomali</button>
                <button className={`tab-btn ${activeTab === 'mineral' ? 'active' : ''}`} onClick={() => setActiveTab('mineral')}>💎 Mineral</button>
                <button className={`tab-btn ${activeTab === 'survey' ? 'active' : ''}`} onClick={() => setActiveTab('survey')}>📡 Survey</button>
                <button className={`tab-btn ${activeTab === 'export' ? 'active' : ''}`} onClick={() => setActiveTab('export')}>💾 Export</button>
              </div>

              <div className="tab-content">
                {/* GPS Tab */}
                {activeTab === 'gps' && (
                  <>
                    <div className="panel">
                      <div className="panel-title">📍 Input GPS Manual</div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Latitude</label>
                          <input type="number" step="any" value={manualLat} onChange={e => setManualLat(e.target.value)} placeholder="-6.2088" />
                        </div>
                        <div className="form-group">
                          <label>Longitude</label>
                          <input type="number" step="any" value={manualLng} onChange={e => setManualLng(e.target.value)} placeholder="106.8456" />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Elevasi (m)</label>
                          <input type="number" value={manualElev} onChange={e => setManualElev(e.target.value)} placeholder="0" />
                        </div>
                        <div className="form-group">
                          <label>Label</label>
                          <input type="text" value={manualLabel} onChange={e => setManualLabel(e.target.value)} placeholder="Nama titik" />
                        </div>
                      </div>
                      <button className="btn btn-primary btn-block" onClick={addManualPoint}>
                        + Tambah Titik
                      </button>
                    </div>

                    <div className="panel">
                      <div className="panel-title">📂 Upload File</div>
                      <label className="file-upload">
                        <input ref={fileInputRef} type="file" accept=".gpx,.kml,.csv" onChange={handleFileUpload} />
                        <p>📁 Klik atau seret file GPX/KML/CSV</p>
                      </label>
                    </div>

                    <div className="panel">
                      <div className="panel-title">📡 GPS Tracking</div>
                      <button className={`btn ${gpsTracking ? 'btn-danger' : 'btn-success'} btn-block`} onClick={toggleGpsTracking}>
                        {gpsTracking ? '⏹ Stop Tracking' : '▶ Mulai Tracking'}
                      </button>
                      {gpsTracking && <p style={{ fontSize: 11, color: '#00ff88', marginTop: 6 }}>🟢 GPS aktif - titik otomatis tercatat</p>}
                    </div>

                    <div className="panel">
                      <div className="panel-title">📋 Daftar Titik ({points.length})</div>
                      <div className="point-list">
                        {points.slice(-20).reverse().map(p => (
                          <div key={p.id} className="point-item" onClick={() => mapRef.current?.setView([p.lat, p.lng], 16)}>
                            <div>
                              <div className="label">{p.label}</div>
                              <div className="coords">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</div>
                            </div>
                            <span style={{ fontSize: 10, color: '#a0a0a0' }}>{p.elevation}m</span>
                          </div>
                        ))}
                      </div>
                      {points.length > 0 && (
                        <button className="btn btn-danger btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => setPoints([])}>
                          Hapus Semua Titik
                        </button>
                      )}
                    </div>
                  </>
                )}

                {/* Anomaly Tab */}
                {activeTab === 'anomaly' && (
                  <>
                    <div className="panel">
                      <div className="panel-title">🔍 Deteksi Anomali</div>
                      <p style={{ fontSize: 11, color: '#a0a0a0', marginBottom: 8 }}>
                        Analisis titik GPS untuk mendeteksi kemungkinan terowongan, gua, atau ruangan bawah tanah.
                      </p>
                      <div className="toggle-row">
                        <label>Tampilkan Anomali</label>
                        <label className="toggle-switch">
                          <input type="checkbox" checked={showAnomalies} onChange={() => setShowAnomalies(!showAnomalies)} />
                          <span className="toggle-slider"></span>
                        </label>
                      </div>
                      <div className="toggle-row">
                        <label>Garis Kontur</label>
                        <label className="toggle-switch">
                          <input type="checkbox" checked={showContours} onChange={() => setShowContours(!showContours)} />
                          <span className="toggle-slider"></span>
                        </label>
                      </div>
                      <div className="toggle-row">
                        <label>Heatmap</label>
                        <label className="toggle-switch">
                          <input type="checkbox" checked={showHeatmap} onChange={() => setShowHeatmap(!showHeatmap)} />
                          <span className="toggle-slider"></span>
                        </label>
                      </div>
                      <button className="btn btn-warning btn-block" style={{ marginTop: 8 }} onClick={() => {
                        if (points.length < 3) { alert('Minimal 3 titik diperlukan') ; return }
                        setShowAnomalies(true)
                      }}>
                        🔍 Analisis Anomali
                      </button>
                    </div>

                    <div className="panel">
                      <div className="panel-title">🎨 Zona Anomali</div>
                      <div className="legend">
                        <div className="legend-item"><div className="legend-dot" style={{ background: '#00ff88' }}></div>Normal</div>
                        <div className="legend-item"><div className="legend-dot" style={{ background: '#ffdd00' }}></div>Mencurigakan</div>
                        <div className="legend-item"><div className="legend-dot" style={{ background: '#ff8800' }}></div>Kemungkinan Anomali</div>
                        <div className="legend-item"><div className="legend-dot" style={{ background: '#ff4444' }}></div>Anomali Tinggi</div>
                      </div>
                    </div>

                    {points.length >= 3 && (
                      <div className="panel">
                        <div className="panel-title">📊 Statistik</div>
                        <div className="stats-grid">
                          <div className="stat-card">
                            <div className="stat-value">{points.length}</div>
                            <div className="stat-label">Total Titik</div>
                          </div>
                          <div className="stat-card">
                            <div className="stat-value">{Math.min(...points.map(p => p.elevation)).toFixed(0)}m</div>
                            <div className="stat-label">Elevasi Min</div>
                          </div>
                          <div className="stat-card">
                            <div className="stat-value">{Math.max(...points.map(p => p.elevation)).toFixed(0)}m</div>
                            <div className="stat-label">Elevasi Max</div>
                          </div>
                          <div className="stat-card">
                            <div className="stat-value">{((Math.max(...points.map(p => p.elevation)) - Math.min(...points.map(p => p.elevation)))).toFixed(0)}m</div>
                            <div className="stat-label">Rentang Elevasi</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Mineral Tab */}
                {activeTab === 'mineral' && (
                  <>
                    <div className="panel">
                      <div className="panel-title">💎 Pemetaan Mineral & Logam</div>
                      <p style={{ fontSize: 11, color: '#a0a0a0', marginBottom: 8 }}>
                        Klik peta untuk menandai lokasi mineral, logam, atau harta simpanan.
                      </p>
                      <div className="form-group">
                        <label>Jenis Mineral/Logam</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                          {Object.entries(MINERAL_TYPES).map(([key, val]) => (
                            <button
                              key={key}
                              className={`btn btn-sm ${selectedMineral === key ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => setSelectedMineral(key)}
                              style={{ justifyContent: 'flex-start' }}
                            >
                              {val.emoji} {val.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Kedalaman (m)</label>
                          <input type="number" value={markerDepth} onChange={e => setMarkerDepth(Number(e.target.value))} />
                        </div>
                        <div className="form-group">
                          <label>Kepercayaan (%)</label>
                          <input type="number" min="0" max="100" value={markerConfidence} onChange={e => setMarkerConfidence(Number(e.target.value))} />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Catatan</label>
                        <input type="text" value={markerNotes} onChange={e => setMarkerNotes(e.target.value)} placeholder="Deskripsi lokasi..." />
                      </div>
                    </div>

                    <div className="panel">
                      <div className="panel-title">🗺️ Gambar Zona</div>
                      <button className={`btn ${drawingPolygon ? 'btn-danger' : 'btn-primary'} btn-block`} onClick={() => {
                        if (drawingPolygon) { finishPolygon() } else { setDrawingPolygon(true); setPolygonPoints([]) }
                      }}>
                        {drawingPolygon ? '✓ Selesai Gambar Zona' : '✏️ Gambar Zona Eksplorasi'}
                      </button>
                      {drawingPolygon && <p style={{ fontSize: 11, color: '#ffdd00', marginTop: 4 }}>Klik pada peta untuk menggambar polygon (min 3 titik)</p>}
                    </div>

                    <div className="panel">
                      <div className="panel-title">👁️ Filter Tampilan</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {Object.entries(MINERAL_TYPES).map(([key, val]) => (
                          <button
                            key={key}
                            className={`btn btn-sm ${filterTypes.includes(key) ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setFilterTypes(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])}
                          >
                            {val.emoji}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="panel">
                      <div className="panel-title">📋 Marker ({mineralMarkers.length})</div>
                      <div className="point-list">
                        {mineralMarkers.slice(-15).reverse().map(m => (
                          <div key={m.id} className="point-item" onClick={() => mapRef.current?.setView([m.lat, m.lng], 16)}>
                            <div>
                              <div className="label">{MINERAL_TYPES[m.type]?.emoji} {MINERAL_TYPES[m.type]?.label}</div>
                              <div className="coords">{m.lat.toFixed(5)}, {m.lng.toFixed(5)}</div>
                            </div>
                            <span style={{ fontSize: 10 }}>{m.depth}m | {m.confidence}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Survey Tab */}
                {activeTab === 'survey' && (
                  <>
                    <div className="panel">
                      <div className="panel-title">📡 Auto Survey (Pemindaian Otomatis)</div>
                      <p style={{ fontSize: 11, color: '#a0a0a0', marginBottom: 8 }}>
                        Pemindaian grid otomatis untuk mendeteksi anomali di area yang terlihat.
                        Zoom peta ke area target sebelum memulai.
                      </p>
                      <div className="form-group">
                        <label>Jarak Grid (meter)</label>
                        <input type="number" value={gridSpacing} onChange={e => setGridSpacing(Number(e.target.value))} min="10" max="500" />
                      </div>
                      <button className={`btn ${surveyRunning ? 'btn-danger' : 'btn-success'} btn-block`} onClick={runSurvey} disabled={surveyRunning}>
                        {surveyRunning ? '⏳ Memindai...' : '📡 Mulai Pemindaian'}
                      </button>
                    </div>

                    {surveyRunning && (
                      <div className="panel">
                        <div className="panel-title">📊 Progress Pemindaian</div>
                        <div className="survey-progress">
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                            <span>Progress</span>
                            <span>{surveyProgress}%</span>
                          </div>
                          <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${surveyProgress}%` }}></div>
                          </div>
                          <p style={{ fontSize: 10, color: '#a0a0a0', marginTop: 4 }}>{surveyPoints.length} titik terpindai</p>
                        </div>
                      </div>
                    )}

                    {surveyPoints.length > 0 && !surveyRunning && (
                      <div className="panel">
                        <div className="panel-title">✅ Hasil Survey</div>
                        <div className="stats-grid">
                          <div className="stat-card">
                            <div className="stat-value">{surveyPoints.length}</div>
                            <div className="stat-label">Titik Dipindai</div>
                          </div>
                          <div className="stat-card">
                            <div className="stat-value" style={{ color: '#ff4444' }}>
                              {surveyPoints.filter(p => p.anomalyScore > 0.6).length}
                            </div>
                            <div className="stat-label">Anomali Ditemukan</div>
                          </div>
                        </div>
                        <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={() => {
                          setPoints(prev => [...prev, ...surveyPoints])
                          setSurveyPoints([])
                        }}>
                          📥 Tambahkan ke Data
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Export Tab */}
                {activeTab === 'export' && (
                  <>
                    <div className="panel">
                      <div className="panel-title">💾 Export Data</div>
                      <div className="export-grid">
                        <button className="btn btn-primary" onClick={() => exportAs('geojson')}>📄 GeoJSON</button>
                        <button className="btn btn-primary" onClick={() => exportAs('kml')}>🌍 KML</button>
                        <button className="btn btn-primary" onClick={() => exportAs('gpx')}>📍 GPX</button>
                        <button className="btn btn-primary" onClick={() => exportAs('csv')}>📊 CSV</button>
                      </div>
                    </div>

                    <div className="panel">
                      <div className="panel-title">💿 Proyek</div>
                      <div className="export-grid">
                        <button className="btn btn-success" onClick={saveProject}>💾 Simpan</button>
                        <button className="btn btn-warning" onClick={loadProject}>📂 Muat</button>
                      </div>
                    </div>

                    <div className="panel">
                      <div className="panel-title">📊 Ringkasan Data</div>
                      <div className="stats-grid">
                        <div className="stat-card">
                          <div className="stat-value">{points.length}</div>
                          <div className="stat-label">Titik GPS</div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-value">{mineralMarkers.length}</div>
                          <div className="stat-label">Marker Mineral</div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-value">{polygons.length}</div>
                          <div className="stat-label">Zona</div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-value">{surveyPoints.length}</div>
                          <div className="stat-label">Titik Survey</div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Map */}
        <div className="map-container">
          <MapContainer
            center={[mapCenter.lat, mapCenter.lng]}
            zoom={14}
            zoomControl={true}
            ref={mapRef}
            style={{ height: '100%', width: '100%' }}
          >
            <LayersControl position="topright">
              {Object.entries(TILE_LAYERS).map(([key, layer]) => (
                <LayersControl.BaseLayer key={key} checked={key === activeLayer} name={layer.name}>
                  <TileLayer url={layer.url} attribution={key === 'street' ? '&copy; OpenStreetMap' : ''} />
                </LayersControl.BaseLayer>
              ))}
            </LayersControl>

            <MapClickHandler
              onMapClick={(latlng) => {
                handleMapClick(latlng)
                if (activeTab === 'mineral' && !drawingPolygon) {
                  addMineralMarker(latlng)
                }
              }}
              onMapMove={(center) => setMapCenter({ lat: center.lat, lng: center.lng })}
            />

            <BoundsFitter points={points} />

            {/* GPS Points */}
            {points.map(p => (
              <CircleMarker
                key={p.id}
                center={[p.lat, p.lng]}
                radius={5}
                pathOptions={{ color: '#00d4ff', fillColor: '#00d4ff', fillOpacity: 0.8 }}
              >
                <Popup>
                  <div style={{ color: '#333' }}>
                    <strong>{p.label}</strong><br />
                    Lat: {p.lat.toFixed(6)}<br />
                    Lng: {p.lng.toFixed(6)}<br />
                    Elevasi: {p.elevation}m
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* Mineral Markers */}
            {mineralMarkers.filter(m => filterTypes.includes(m.type)).map(m => (
              <Marker
                key={m.id}
                position={[m.lat, m.lng]}
                icon={createIcon(MINERAL_TYPES[m.type]?.color || '#fff', MINERAL_TYPES[m.type]?.emoji || '?')}
              >
                <Popup>
                  <div style={{ color: '#333' }}>
                    <strong>{MINERAL_TYPES[m.type]?.emoji} {MINERAL_TYPES[m.type]?.label}</strong><br />
                    Kedalaman: {m.depth}m<br />
                    Kepercayaan: {m.confidence}%<br />
                    {m.notes && <><em>{m.notes}</em><br /></>}
                    Lat: {m.lat.toFixed(6)}, Lng: {m.lng.toFixed(6)}
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Survey Points */}
            {surveyPoints.map((p, i) => (
              <CircleMarker
                key={i}
                center={[p.lat, p.lng]}
                radius={4}
                pathOptions={{
                  color: getAnomalyColor(p.anomalyScore),
                  fillColor: getAnomalyColor(p.anomalyScore),
                  fillOpacity: 0.7,
                }}
              >
                <Popup>
                  <div style={{ color: '#333' }}>
                    <strong>Survey Point</strong><br />
                    Anomali: {(p.anomalyScore * 100).toFixed(0)}%<br />
                    Elevasi: {p.elevation?.toFixed(1)}m
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* Polygons (Zones) */}
            {polygons.map(poly => (
              <Polygon key={poly.id} positions={poly.points} pathOptions={{ color: '#ff8800', fillOpacity: 0.15, weight: 2 }}>
                <Popup><div style={{ color: '#333' }}><strong>{poly.label}</strong></div></Popup>
              </Polygon>
            ))}

            {/* Drawing polygon preview */}
            {drawingPolygon && polygonPoints.length >= 2 && (
              <Polyline positions={polygonPoints} pathOptions={{ color: '#ffdd00', dashArray: '5,5', weight: 2 }} />
            )}

            {/* Anomaly circles */}
            {showAnomalies && points.length >= 3 && points.map((p, i) => {
              const neighbors = points.filter((_, j) => j !== i)
              const avgElev = neighbors.length > 0 ? neighbors.reduce((s, n) => s + n.elevation, 0) / neighbors.length : p.elevation
              const diff = avgElev - p.elevation
              const score = Math.min(Math.max(Math.abs(diff) / 20, 0), 1)
              if (score < 0.2) return null
              return (
                <CircleMarker
                  key={`anomaly-${i}`}
                  center={[p.lat, p.lng]}
                  radius={score * 20 + 5}
                  pathOptions={{
                    color: getAnomalyColor(score),
                    fillColor: getAnomalyColor(score),
                    fillOpacity: 0.25,
                    weight: 2,
                  }}
                />
              )
            })}

            {/* Heatmap simulation with circles */}
            {showHeatmap && points.map((p, i) => (
              <CircleMarker
                key={`heat-${i}`}
                center={[p.lat, p.lng]}
                radius={15}
                pathOptions={{
                  color: 'transparent',
                  fillColor: p.elevation > 100 ? '#ff4444' : p.elevation > 50 ? '#ffdd00' : '#00ff88',
                  fillOpacity: 0.3,
                }}
              />
            ))}
          </MapContainer>

          {/* Map overlay controls */}
          <div className="map-overlay">
            <button className={`btn btn-sm ${showHeatmap ? 'active' : ''}`} onClick={() => setShowHeatmap(!showHeatmap)}>
              🌡️ Heatmap
            </button>
            <button className={`btn btn-sm ${showAnomalies ? 'active' : ''}`} onClick={() => setShowAnomalies(!showAnomalies)}>
              🔍 Anomali
            </button>
            <button className="btn btn-sm" onClick={() => setShowHelp(true)}>
              ❓ Bantuan
            </button>
          </div>

          {/* Coordinate display */}
          <div className="coord-display">
            📍 {mapCenter.lat.toFixed(5)}, {mapCenter.lng.toFixed(5)} | Zoom ke area target
          </div>
        </div>
      </div>
    </>
  )
}
