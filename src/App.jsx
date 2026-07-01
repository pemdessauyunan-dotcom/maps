import { useState, useCallback, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, CircleMarker, useMap, useMapEvents, LayersControl, WMSTileLayer } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './index.css'
import { fetchElevation, fetchElevationBatch, fetchElevationProfile } from './services/elevationApi'
import { fetchGeologicalInfo, getMineralWMSLayer, getGeologicalWMSLayer } from './services/geologicalApi'
import { analyzeTerrainAnomaly, detectUndergroundStructures, fullTerrainAnalysis, getAnomalyColor, getAnomalyLabel } from './services/anomalyEngine'

// Fix default marker icons
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

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

// Parse GPX/KML/CSV files
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
        points.push({ lat: parseFloat(cols[latIdx]), lng: parseFloat(cols[lngIdx]), elevation: elevIdx >= 0 ? parseFloat(cols[elevIdx]) || 0 : 0, label: labelIdx >= 0 ? cols[labelIdx] : `Point ${i}`, id: Date.now() + i, elevLoading: false })
      }
    }
  } else if (ext === 'gpx') {
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'text/xml')
    const trkpts = doc.querySelectorAll('trkpt, wpt, rtept')
    trkpts.forEach((pt, i) => {
      const ele = pt.querySelector('ele')
      const name = pt.querySelector('name')
      points.push({ lat: parseFloat(pt.getAttribute('lat')), lng: parseFloat(pt.getAttribute('lon')), elevation: ele ? parseFloat(ele.textContent) : 0, label: name ? name.textContent : `Waypoint ${i + 1}`, id: Date.now() + i, elevLoading: false })
    })
  } else if (ext === 'kml') {
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'text/xml')
    const coords = doc.querySelectorAll('coordinates')
    coords.forEach((coord, i) => {
      const tuples = coord.textContent.trim().split(/\s+/)
      tuples.forEach((tuple, j) => {
        const [lng, lat, elev] = tuple.split(',')
        if (lat && lng) {
          points.push({ lat: parseFloat(lat), lng: parseFloat(lng), elevation: elev ? parseFloat(elev) : 0, label: `KML Point ${i * 100 + j + 1}`, id: Date.now() + i * 100 + j, elevLoading: false })
        }
      })
    })
  }
  return points
}

// Generate survey grid (coordinates only, elevation fetched later)
function generateGrid(bounds, spacing) {
  const points = []
  const { north, south, east, west } = bounds
  const latStep = spacing / 111000
  const lngStep = spacing / (111000 * Math.cos(((north + south) / 2) * Math.PI / 180))
  let idx = 0
  for (let lat = south; lat <= north; lat += latStep) {
    for (let lng = west; lng <= east; lng += lngStep) {
      points.push({ lat, lng, elevation: null, label: `Survey`, id: Date.now() + idx, elevLoading: true })
      idx++
    }
  }
  return points
}

// Elevation Profile Chart Component
function ElevationProfileChart({ profile, anomalies }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!profile || profile.length === 0 || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const W = canvas.width = canvas.offsetWidth * 2
    const H = canvas.height = 200
    ctx.scale(2, 2)
    const w = canvas.offsetWidth
    const h = 100
    const pad = { top: 15, bottom: 25, left: 40, right: 10 }

    ctx.clearRect(0, 0, w, h)

    const elevations = profile.map(p => p.elevation)
    const minE = Math.min(...elevations) - 5
    const maxE = Math.max(...elevations) + 5
    const maxD = profile[profile.length - 1].distance
    const plotW = w - pad.left - pad.right
    const plotH = h - pad.top - pad.bottom

    // Background
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, w, h)

    // Grid lines
    ctx.strokeStyle = '#2a2a4a'
    ctx.lineWidth = 0.5
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (plotH / 4) * i
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke()
      const elevLabel = (maxE - (maxE - minE) * (i / 4)).toFixed(0)
      ctx.fillStyle = '#a0a0a0'; ctx.font = '8px sans-serif'; ctx.textAlign = 'right'
      ctx.fillText(`${elevLabel}m`, pad.left - 4, y + 3)
    }

    // Elevation fill
    ctx.beginPath()
    profile.forEach((p, i) => {
      const x = pad.left + (p.distance / maxD) * plotW
      const y = pad.top + plotH - ((p.elevation - minE) / (maxE - minE)) * plotH
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.lineTo(pad.left + plotW, pad.top + plotH)
    ctx.lineTo(pad.left, pad.top + plotH)
    ctx.closePath()
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH)
    grad.addColorStop(0, 'rgba(0, 212, 255, 0.3)')
    grad.addColorStop(1, 'rgba(0, 212, 255, 0.05)')
    ctx.fillStyle = grad
    ctx.fill()

    // Elevation line
    ctx.beginPath()
    profile.forEach((p, i) => {
      const x = pad.left + (p.distance / maxD) * plotW
      const y = pad.top + plotH - ((p.elevation - minE) / (maxE - minE)) * plotH
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = '#00d4ff'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Mark anomalies (depressions)
    if (anomalies && anomalies.length > 0) {
      anomalies.forEach(a => {
        const idx = profile.findIndex(p => Math.abs(p.lat - a.lat) < 0.001 && Math.abs(p.lng - a.lng) < 0.001)
        if (idx >= 0) {
          const x = pad.left + (profile[idx].distance / maxD) * plotW
          const y = pad.top + plotH - ((profile[idx].elevation - minE) / (maxE - minE)) * plotH
          ctx.beginPath()
          ctx.arc(x, y, 4, 0, Math.PI * 2)
          ctx.fillStyle = getAnomalyColor(a.anomalyScore)
          ctx.fill()
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke()
        }
      })
    }

    // Distance labels
    ctx.fillStyle = '#a0a0a0'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'
    for (let i = 0; i <= 4; i++) {
      const d = (maxD / 4) * i
      const x = pad.left + (d / maxD) * plotW
      ctx.fillText(`${(d / 1000).toFixed(1)}km`, x, h - 5)
    }

    // Title
    ctx.fillStyle = '#e0e0e0'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('Profil Elevasi', pad.left, 10)
  }, [profile, anomalies])

  return <canvas ref={canvasRef} style={{ width: '100%', height: 100, borderRadius: 4 }} />
}

// Map click handler
function MapClickHandler({ onMapClick, onMapMove }) {
  useMapEvents({
    click: (e) => onMapClick(e.latlng),
    move: (e) => { const center = e.target.getCenter(); onMapMove(center) },
  })
  return null
}

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
  const [points, setPoints] = useState([])
  const [mineralMarkers, setMineralMarkers] = useState([])
  const [activeTab, setActiveTab] = useState('gps')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mapCenter, setMapCenter] = useState({ lat: -6.2, lng: 106.8 })
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showAnomalies, setShowAnomalies] = useState(false)
  const [gpsTracking, setGpsTracking] = useState(false)
  const [showHelp, setShowHelp] = useState(true)
  const [surveyRunning, setSurveyRunning] = useState(false)
  const [surveyProgress, setSurveyProgress] = useState(0)
  const [surveyPoints, setSurveyPoints] = useState([])
  const [gridSpacing, setGridSpacing] = useState(100)
  const [selectedMineral, setSelectedMineral] = useState('gold')
  const [markerDepth, setMarkerDepth] = useState(5)
  const [markerConfidence, setMarkerConfidence] = useState(70)
  const [markerNotes, setMarkerNotes] = useState('')
  const [polygons, setPolygons] = useState([])
  const [drawingPolygon, setDrawingPolygon] = useState(false)
  const [polygonPoints, setPolygonPoints] = useState([])
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')
  const [manualLabel, setManualLabel] = useState('')
  const [filterTypes, setFilterTypes] = useState(Object.keys(MINERAL_TYPES))
  const [analysisResults, setAnalysisResults] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [showMineralWMS, setShowMineralWMS] = useState(false)
  const [showGeoWMS, setShowGeoWMS] = useState(false)
  const [profileData, setProfileData] = useState(null)
  const [profileMode, setProfileMode] = useState(false)
  const [profilePoints, setProfilePoints] = useState([])
  const [profileLoading, setProfileLoading] = useState(false)
  const [geoInfo, setGeoInfo] = useState(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [fetchingElev, setFetchingElev] = useState(false)
  const [surveyAnomalies, setSurveyAnomalies] = useState([])

  const gpsWatchRef = useRef(null)
  const fileInputRef = useRef(null)
  const mapRef = useRef(null)

  // Auto-fetch elevation for a point
  const fetchAndSetElevation = useCallback(async (pointId, lat, lng) => {
    const elev = await fetchElevation(lat, lng)
    if (elev !== null) {
      setPoints(prev => prev.map(p => p.id === pointId ? { ...p, elevation: elev, elevLoading: false } : p))
      setSurveyPoints(prev => prev.map(p => p.id === pointId ? { ...p, elevation: elev, elevLoading: false } : p))
    }
  }, [])

  // Handle map click
  const handleMapClick = useCallback((latlng) => {
    if (profileMode) {
      setProfilePoints(prev => [...prev, [latlng.lat, latlng.lng]])
      return
    }
    if (drawingPolygon) {
      setPolygonPoints(prev => [...prev, [latlng.lat, latlng.lng]])
      return
    }

    const id = Date.now()
    const newPoint = {
      lat: latlng.lat, lng: latlng.lng, elevation: null,
      label: manualLabel || `Point ${points.length + 1}`, id, elevLoading: true,
    }
    setPoints(prev => [...prev, newPoint])
    fetchAndSetElevation(id, latlng.lat, latlng.lng)

    if (activeTab === 'mineral' && !drawingPolygon) {
      setMineralMarkers(prev => [...prev, {
        lat: latlng.lat, lng: latlng.lng, type: selectedMineral,
        depth: markerDepth, confidence: markerConfidence, notes: markerNotes, id: id + 1,
      }])
    }
  }, [drawingPolygon, manualLabel, points.length, activeTab, selectedMineral, markerDepth, markerConfidence, markerNotes, profileMode, fetchAndSetElevation])

  // Handle file upload with auto elevation fetch
  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const parsed = parseFile(ev.target.result, file.name)
      if (parsed.length > 0) {
        // Mark points that need elevation
        const needsElev = parsed.filter(p => !p.elevation && p.elevation !== 0)
        const hasElev = parsed.filter(p => p.elevation)
        setPoints(prev => [...prev, ...parsed.map(p => ({ ...p, elevLoading: !p.elevation }))])

        // Batch fetch elevations
        if (needsElev.length > 0) {
          setFetchingElev(true)
          const elevations = await fetchElevationBatch(needsElev)
          setPoints(prev => prev.map(p => {
            const idx = needsElev.findIndex(n => n.id === p.id)
            if (idx >= 0 && elevations[idx] !== null) {
              return { ...p, elevation: elevations[idx], elevLoading: false }
            }
            return p.elevLoading ? { ...p, elevLoading: false } : p
          }))
          setFetchingElev(false)
        }
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
      if (!navigator.geolocation) { alert('GPS tidak tersedia'); return }
      setGpsTracking(true)
      gpsWatchRef.current = navigator.geolocation.watchPosition(
        async (pos) => {
          const id = Date.now()
          const newPoint = {
            lat: pos.coords.latitude, lng: pos.coords.longitude,
            elevation: pos.coords.altitude || null,
            label: `GPS ${points.length + 1}`, id, elevLoading: !pos.coords.altitude,
          }
          setPoints(prev => {
            if (prev.length > 0 && id - prev[prev.length - 1].id < 2000) return prev
            return [...prev, newPoint]
          })
          if (!pos.coords.altitude) fetchAndSetElevation(id, newPoint.lat, newPoint.lng)
        },
        (err) => console.error('GPS Error:', err),
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }
  }

  // Add manual point with real elevation
  const addManualPoint = async () => {
    const lat = parseFloat(manualLat)
    const lng = parseFloat(manualLng)
    if (isNaN(lat) || isNaN(lng)) return
    const id = Date.now()
    setPoints(prev => [...prev, { lat, lng, elevation: null, label: manualLabel || `Point ${prev.length + 1}`, id, elevLoading: true }])
    setManualLat(''); setManualLng(''); setManualLabel('')
    fetchAndSetElevation(id, lat, lng)
  }

  // Run auto survey with REAL elevation data
  const runSurvey = async () => {
    if (!mapRef.current) return
    const bounds = mapRef.current.getBounds()
    const grid = generateGrid({
      north: bounds.getNorth(), south: bounds.getSouth(),
      east: bounds.getEast(), west: bounds.getWest(),
    }, gridSpacing)

    if (grid.length === 0) { alert('Zoom in ke area yang lebih kecil') ; return }
    if (grid.length > 500) { alert(`Terlalu banyak titik (${grid.length}). Perbesar zoom atau naikkan jarak grid.`) ; return }

    setSurveyRunning(true)
    setSurveyProgress(0)
    setSurveyPoints(grid)
    setSurveyAnomalies([])

    // Fetch elevations in batches
    const batchSize = 100
    for (let i = 0; i < grid.length; i += batchSize) {
      const batch = grid.slice(i, i + batchSize)
      const elevations = await fetchElevationBatch(batch)

      setSurveyPoints(prev => prev.map(p => {
        const idx = batch.findIndex(b => b.id === p.id)
        if (idx >= 0) return { ...p, elevation: elevations[idx] ?? 0, elevLoading: false }
        return p
      }))

      setSurveyProgress(Math.round(Math.min((i + batchSize) / grid.length * 70, 70)))
    }

    setSurveyProgress(75)

    // Use detectUndergroundStructures for real analysis
    const result = await detectUndergroundStructures(grid.map(p => ({ ...p, elevation: p.elevation ?? 0 })))
    setSurveyAnomalies(result.anomalies || [])
    setSurveyPoints(prev => prev.map(p => {
      const anomaly = result.anomalies?.find(a => a.id === p.id)
      return anomaly ? { ...p, anomalyScore: anomaly.anomalyScore, anomalyType: anomaly.anomalyType } : { ...p, anomalyScore: 0 }
    }))

    setSurveyProgress(100)
    setSurveyRunning(false)
  }

  // Run real anomaly analysis on all points
  const runAnomalyAnalysis = async () => {
    if (points.length < 3) { alert('Minimal 3 titik diperlukan') ; return }
    setAnalyzing(true)
    setShowAnomalies(true)

    const result = await detectUndergroundStructures(points)
    setAnalysisResults(result.anomalies || [])
    setAnalyzing(false)
  }

  // Analyze single point in detail
  const analyzePoint = async (lat, lng) => {
    setGeoLoading(true)
    const result = await fullTerrainAnalysis(lat, lng)
    setGeoInfo(result)
    setGeoLoading(false)
  }

  // Generate elevation profile
  const generateProfile = async () => {
    if (profilePoints.length < 2) { alert('Minimal 2 titik untuk profil. Klik pada peta.') ; return }
    setProfileLoading(true)
    const [start, end] = [profilePoints[0], profilePoints[profilePoints.length - 1]]
    const profile = await fetchElevationProfile(start[0], start[1], end[0], end[1], 60)
    setProfileData(profile)
    setProfileLoading(false)
  }

  // Export functions
  const exportAs = (format) => {
    let content, filename, type
    const allPts = [...points, ...mineralMarkers.map(m => ({ lat: m.lat, lng: m.lng, elevation: m.depth, label: `${m.type} - ${m.notes}` }))]
    if (format === 'geojson') {
      content = JSON.stringify({ type: 'FeatureCollection', features: allPts.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { elevation: p.elevation, label: p.label } })) }, null, 2)
      filename = 'anomaly-map.geojson'; type = 'application/json'
    } else if (format === 'kml') {
      content = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${allPts.map(p => `<Placemark><name>${p.label}</name><Point><coordinates>${p.lng},${p.lat},${p.elevation || 0}</coordinates></Point></Placemark>`).join('')}</Document></kml>`
      filename = 'anomaly-map.kml'; type = 'application/vnd.google-earth.kml+xml'
    } else if (format === 'csv') {
      content = 'lat,lng,elevation,label\n' + allPts.map(p => `${p.lat},${p.lng},${p.elevation || 0},${p.label}`).join('\n')
      filename = 'anomaly-map.csv'; type = 'text/csv'
    } else if (format === 'gpx') {
      content = `<?xml version="1.0"?><gpx version="1.1">${allPts.map(p => `<wpt lat="${p.lat}" lon="${p.lng}"><ele>${p.elevation || 0}</ele><name>${p.label}</name></wpt>`).join('')}</gpx>`
      filename = 'anomaly-map.gpx'; type = 'application/gpx+xml'
    }
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const saveProject = () => {
    localStorage.setItem('anomalyMapperProject', JSON.stringify({ points, mineralMarkers, polygons }))
    alert('Proyek tersimpan!')
  }
  const loadProject = () => {
    const data = localStorage.getItem('anomalyMapperProject')
    if (data) { const p = JSON.parse(data); setPoints(p.points || []); setMineralMarkers(p.mineralMarkers || []); setPolygons(p.polygons || []) }
  }

  const finishPolygon = () => {
    if (polygonPoints.length >= 3) {
      setPolygons(prev => [...prev, { points: polygonPoints, id: Date.now(), label: `Zona ${prev.length + 1}` }])
      setPolygonPoints([]); setDrawingPolygon(false)
    }
  }

  const loadingCount = points.filter(p => p.elevLoading).length

  return (
    <>
      {showHelp && (
        <div className="help-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-content" onClick={e => e.stopPropagation()}>
            <h2>GPS Anomaly Mapper - Data Real</h2>
            <p>Aplikasi pemetaan GPS dengan data elevasi REAL dari Open-Meteo API dan data geologi dari Macrostrat.</p>
            <ul>
              <li><strong>Data Elevasi Real</strong> - Otomatis fetch dari Open-Meteo API</li>
              <li><strong>Deteksi Anomali Real</strong> - Analisis terrain berdasarkan data elevasi sebenarnya</li>
              <li><strong>Data Geologi</strong> - Informasi formasi batuan dan potensi mineral</li>
              <li><strong>Profil Elevasi</strong> - Gambar garis dan lihat penampang melintang terrain</li>
              <li><strong>Auto Survey</strong> - Pemindaian grid dengan data elevasi real</li>
              <li><strong>Overlay Mineral</strong> - Peta deposit mineral dari USGS</li>
            </ul>
            <button className="btn btn-primary btn-block" onClick={() => setShowHelp(false)} style={{ marginTop: 16 }}>Mulai Sekarang</button>
          </div>
        </div>
      )}

      <div className="app-container">
        <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            {sidebarCollapsed ? '▶' : '◀'}
          </button>

          {!sidebarCollapsed && (
            <>
              <div className="tab-bar">
                <button className={`tab-btn ${activeTab === 'gps' ? 'active' : ''}`} onClick={() => setActiveTab('gps')}>GPS</button>
                <button className={`tab-btn ${activeTab === 'anomaly' ? 'active' : ''}`} onClick={() => setActiveTab('anomaly')}>Anomali</button>
                <button className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>Profil</button>
                <button className={`tab-btn ${activeTab === 'mineral' ? 'active' : ''}`} onClick={() => setActiveTab('mineral')}>Mineral</button>
                <button className={`tab-btn ${activeTab === 'survey' ? 'active' : ''}`} onClick={() => setActiveTab('survey')}>Survey</button>
                <button className={`tab-btn ${activeTab === 'export' ? 'active' : ''}`} onClick={() => setActiveTab('export')}>Export</button>
              </div>

              <div className="tab-content">
                {/* GPS Tab */}
                {activeTab === 'gps' && (
                  <>
                    <div className="panel">
                      <div className="panel-title">Input GPS Manual</div>
                      <div className="form-row">
                        <div className="form-group"><label>Latitude</label><input type="number" step="any" value={manualLat} onChange={e => setManualLat(e.target.value)} placeholder="-6.2088" /></div>
                        <div className="form-group"><label>Longitude</label><input type="number" step="any" value={manualLng} onChange={e => setManualLng(e.target.value)} placeholder="106.8456" /></div>
                      </div>
                      <div className="form-group"><label>Label</label><input type="text" value={manualLabel} onChange={e => setManualLabel(e.target.value)} placeholder="Nama titik" /></div>
                      <p style={{ fontSize: 10, color: '#00d4ff', marginBottom: 6 }}>Elevasi otomatis di-fetch dari API Open-Meteo</p>
                      <button className="btn btn-primary btn-block" onClick={addManualPoint}>+ Tambah Titik</button>
                    </div>

                    <div className="panel">
                      <div className="panel-title">Upload File</div>
                      <label className="file-upload">
                        <input ref={fileInputRef} type="file" accept=".gpx,.kml,.csv" onChange={handleFileUpload} />
                        <p>Klik atau seret file GPX/KML/CSV</p>
                        <p style={{ fontSize: 10 }}>Elevasi real akan otomatis di-fetch</p>
                      </label>
                    </div>

                    <div className="panel">
                      <div className="panel-title">GPS Tracking</div>
                      <button className={`btn ${gpsTracking ? 'btn-danger' : 'btn-success'} btn-block`} onClick={toggleGpsTracking}>
                        {gpsTracking ? 'Stop Tracking' : 'Mulai Tracking'}
                      </button>
                      {gpsTracking && <p style={{ fontSize: 11, color: '#00ff88', marginTop: 6 }}>GPS aktif - elevasi real-time</p>}
                    </div>

                    <div className="panel">
                      <div className="panel-title">Daftar Titik ({points.length}) {loadingCount > 0 && <span style={{ color: '#ffdd00', fontSize: 10 }}>({loadingCount} fetching...)</span>}</div>
                      <div className="point-list">
                        {points.slice(-20).reverse().map(p => (
                          <div key={p.id} className="point-item" onClick={() => { mapRef.current?.setView([p.lat, p.lng], 16); analyzePoint(p.lat, p.lng) }}>
                            <div>
                              <div className="label">{p.label}</div>
                              <div className="coords">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</div>
                            </div>
                            <span style={{ fontSize: 10, color: p.elevLoading ? '#ffdd00' : '#a0a0a0' }}>
                              {p.elevLoading ? '...' : `${p.elevation?.toFixed(1) ?? '?'}m`}
                            </span>
                          </div>
                        ))}
                      </div>
                      {points.length > 0 && (
                        <button className="btn btn-danger btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => setPoints([])}>Hapus Semua</button>
                      )}
                    </div>
                  </>
                )}

                {/* Anomaly Tab */}
                {activeTab === 'anomaly' && (
                  <>
                    <div className="panel">
                      <div className="panel-title">Deteksi Anomali (Data Real)</div>
                      <p style={{ fontSize: 11, color: '#a0a0a0', marginBottom: 8 }}>
                        Analisis menggunakan data elevasi REAL dari Open-Meteo. Mendeteksi depresi terrain (terowongan/gua) dan anomali elevasi.
                      </p>
                      <div className="toggle-row"><label>Tampilkan Anomali</label>
                        <label className="toggle-switch"><input type="checkbox" checked={showAnomalies} onChange={() => setShowAnomalies(!showAnomalies)} /><span className="toggle-slider"></span></label>
                      </div>
                      <div className="toggle-row"><label>Heatmap Elevasi</label>
                        <label className="toggle-switch"><input type="checkbox" checked={showHeatmap} onChange={() => setShowHeatmap(!showHeatmap)} /><span className="toggle-slider"></span></label>
                      </div>
                      <button className="btn btn-warning btn-block" style={{ marginTop: 8 }} onClick={runAnomalyAnalysis} disabled={analyzing || points.length < 3}>
                        {analyzing ? 'Menganalisis...' : 'Analisis Anomali (Real Data)'}
                      </button>
                    </div>

                    {/* Geological Info */}
                    <div className="panel">
                      <div className="panel-title">Info Geologi</div>
                      {geoLoading ? <p style={{ fontSize: 11 }}>Mengambil data geologi...</p> : geoInfo ? (
                        <div style={{ fontSize: 11 }}>
                          <p><strong>Formasi:</strong> {geoInfo.formation}</p>
                          <p><strong>Periode:</strong> {geoInfo.period}</p>
                          <p><strong>Tipe Batuan:</strong> {geoInfo.rockType}</p>
                          {geoInfo.lithology && <p><strong>Litologi:</strong> {geoInfo.lithology}</p>}
                          <p style={{ color: '#00d4ff', marginTop: 4 }}><strong>Rekomendasi:</strong></p>
                          <p style={{ color: '#e0e0e0' }}>{geoInfo.recommendation}</p>
                          {geoInfo.geological?.mineralPotential?.length > 0 && (
                            <>
                              <p style={{ color: '#00d4ff', marginTop: 4 }}><strong>Potensi Mineral:</strong></p>
                              {geoInfo.geological.mineralPotential.slice(0, 5).map((m, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                  <span>{MINERAL_TYPES[m.type]?.emoji} {MINERAL_TYPES[m.type]?.label}</span>
                                  <span style={{ color: getAnomalyColor(m.probability) }}>{(m.probability * 100).toFixed(0)}%</span>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      ) : <p style={{ fontSize: 11, color: '#a0a0a0' }}>Klik titik pada peta untuk info geologi</p>}
                    </div>

                    {analysisResults.length > 0 && (
                      <div className="panel">
                        <div className="panel-title">Hasil Analisis ({analysisResults.length} anomali)</div>
                        <div className="point-list">
                          {analysisResults.map((a, i) => (
                            <div key={i} className="point-item" onClick={() => mapRef.current?.setView([a.lat, a.lng], 17)}>
                              <div>
                                <div className="label" style={{ color: getAnomalyColor(a.anomalyScore) }}>
                                  {getAnomalyLabel(a.anomalyScore)} - {a.anomalyType}
                                </div>
                                <div className="coords">{a.lat.toFixed(5)}, {a.lng.toFixed(5)}</div>
                              </div>
                              <span className={`anomaly-badge ${a.anomalyScore > 0.6 ? 'high' : a.anomalyScore > 0.4 ? 'likely' : a.anomalyScore > 0.2 ? 'suspicious' : 'normal'}`}>
                                {(a.anomalyScore * 100).toFixed(0)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="panel">
                      <div className="panel-title">Legenda</div>
                      <div className="legend">
                        <div className="legend-item"><div className="legend-dot" style={{ background: '#00ff88' }}></div>Normal</div>
                        <div className="legend-item"><div className="legend-dot" style={{ background: '#88ff00' }}></div>Rendah</div>
                        <div className="legend-item"><div className="legend-dot" style={{ background: '#ffdd00' }}></div>Moderat</div>
                        <div className="legend-item"><div className="legend-dot" style={{ background: '#ff8800' }}></div>Tinggi</div>
                        <div className="legend-item"><div className="legend-dot" style={{ background: '#ff4444' }}></div>Kritis</div>
                      </div>
                    </div>

                    {points.length >= 3 && (
                      <div className="panel">
                        <div className="panel-title">Statistik Elevasi (Real)</div>
                        <div className="stats-grid">
                          <div className="stat-card"><div className="stat-value">{points.filter(p => p.elevation != null).length}</div><div className="stat-label">Titik Valid</div></div>
                          <div className="stat-card"><div className="stat-value">{points.filter(p => p.elevation != null).length > 0 ? Math.min(...points.filter(p => p.elevation != null).map(p => p.elevation)).toFixed(0) : 0}m</div><div className="stat-label">Min</div></div>
                          <div className="stat-card"><div className="stat-value">{points.filter(p => p.elevation != null).length > 0 ? Math.max(...points.filter(p => p.elevation != null).map(p => p.elevation)).toFixed(0) : 0}m</div><div className="stat-label">Max</div></div>
                          <div className="stat-card"><div className="stat-value" style={{ color: '#ff4444' }}>{analysisResults.length}</div><div className="stat-label">Anomali</div></div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Profile Tab */}
                {activeTab === 'profile' && (
                  <>
                    <div className="panel">
                      <div className="panel-title">Profil Elevasi (Data Real)</div>
                      <p style={{ fontSize: 11, color: '#a0a0a0', marginBottom: 8 }}>
                        Klik 2+ titik pada peta untuk membuat garis profil. Elevasi real di-fetch dari API.
                      </p>
                      <button className={`btn ${profileMode ? 'btn-danger' : 'btn-primary'} btn-block`} onClick={() => { setProfileMode(!profileMode); setProfilePoints([]); setProfileData(null) }}>
                        {profileMode ? 'Batalkan Mode Profil' : 'Mulai Gambar Profil'}
                      </button>
                      {profileMode && <p style={{ fontSize: 11, color: '#ffdd00', marginTop: 4 }}>Klik pada peta untuk menambah titik profil ({profilePoints.length} titik)</p>}
                      {profilePoints.length >= 2 && !profileMode && (
                        <button className="btn btn-success btn-block" style={{ marginTop: 4 }} onClick={generateProfile} disabled={profileLoading}>
                          {profileLoading ? 'Mengambil data elevasi...' : 'Generate Profil Elevasi'}
                        </button>
                      )}
                    </div>

                    {profileData && (
                      <div className="panel">
                        <div className="panel-title">Grafik Profil Elevasi</div>
                        <ElevationProfileChart profile={profileData} anomalies={analysisResults} />
                        <div className="stats-grid" style={{ marginTop: 8 }}>
                          <div className="stat-card"><div className="stat-value">{(profileData[profileData.length - 1].distance / 1000).toFixed(1)}km</div><div className="stat-label">Jarak Total</div></div>
                          <div className="stat-card"><div className="stat-value">{Math.max(...profileData.map(p => p.elevation)).toFixed(0)}m</div><div className="stat-label">Elevasi Max</div></div>
                          <div className="stat-card"><div className="stat-value">{Math.min(...profileData.map(p => p.elevation)).toFixed(0)}m</div><div className="stat-label">Elevasi Min</div></div>
                          <div className="stat-card"><div className="stat-value">{(Math.max(...profileData.map(p => p.elevation)) - Math.min(...profileData.map(p => p.elevation))).toFixed(0)}m</div><div className="stat-label">Relief</div></div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Mineral Tab */}
                {activeTab === 'mineral' && (
                  <>
                    <div className="panel">
                      <div className="panel-title">Pemetaan Mineral & Logam</div>
                      <p style={{ fontSize: 11, color: '#a0a0a0', marginBottom: 8 }}>Klik peta untuk menandai. Data geologi otomatis ditampilkan.</p>
                      <div className="form-group"><label>Jenis Mineral/Logam</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                          {Object.entries(MINERAL_TYPES).map(([key, val]) => (
                            <button key={key} className={`btn btn-sm ${selectedMineral === key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSelectedMineral(key)} style={{ justifyContent: 'flex-start' }}>
                              {val.emoji} {val.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group"><label>Kedalaman (m)</label><input type="number" value={markerDepth} onChange={e => setMarkerDepth(Number(e.target.value))} /></div>
                        <div className="form-group"><label>Kepercayaan (%)</label><input type="number" min="0" max="100" value={markerConfidence} onChange={e => setMarkerConfidence(Number(e.target.value))} /></div>
                      </div>
                      <div className="form-group"><label>Catatan</label><input type="text" value={markerNotes} onChange={e => setMarkerNotes(e.target.value)} placeholder="Deskripsi..." /></div>
                    </div>

                    <div className="panel">
                      <div className="panel-title">Overlay Peta</div>
                      <div className="toggle-row"><label>Deposit Mineral (USGS)</label>
                        <label className="toggle-switch"><input type="checkbox" checked={showMineralWMS} onChange={() => setShowMineralWMS(!showMineralWMS)} /><span className="toggle-slider"></span></label>
                      </div>
                      <div className="toggle-row"><label>Peta Geologi</label>
                        <label className="toggle-switch"><input type="checkbox" checked={showGeoWMS} onChange={() => setShowGeoWMS(!showGeoWMS)} /><span className="toggle-slider"></span></label>
                      </div>
                    </div>

                    <div className="panel">
                      <div className="panel-title">Gambar Zona</div>
                      <button className={`btn ${drawingPolygon ? 'btn-danger' : 'btn-primary'} btn-block`} onClick={() => { drawingPolygon ? finishPolygon() : (setDrawingPolygon(true), setPolygonPoints([])) }}>
                        {drawingPolygon ? 'Selesai Gambar Zona' : 'Gambar Zona Eksplorasi'}
                      </button>
                    </div>

                    <div className="panel">
                      <div className="panel-title">Filter</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {Object.entries(MINERAL_TYPES).map(([key, val]) => (
                          <button key={key} className={`btn btn-sm ${filterTypes.includes(key) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterTypes(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])}>
                            {val.emoji}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="panel">
                      <div className="panel-title">Marker ({mineralMarkers.length})</div>
                      <div className="point-list">
                        {mineralMarkers.slice(-15).reverse().map(m => (
                          <div key={m.id} className="point-item" onClick={() => { mapRef.current?.setView([m.lat, m.lng], 16); analyzePoint(m.lat, m.lng) }}>
                            <div><div className="label">{MINERAL_TYPES[m.type]?.emoji} {MINERAL_TYPES[m.type]?.label}</div><div className="coords">{m.lat.toFixed(5)}, {m.lng.toFixed(5)}</div></div>
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
                      <div className="panel-title">Auto Survey (Data Elevasi Real)</div>
                      <p style={{ fontSize: 11, color: '#a0a0a0', marginBottom: 8 }}>
                        Pemindaian grid otomatis. Setiap titik di-fetch elevasi REAL dari Open-Meteo API, lalu dianalisis untuk anomali.
                      </p>
                      <div className="form-group"><label>Jarak Grid (meter)</label><input type="number" value={gridSpacing} onChange={e => setGridSpacing(Number(e.target.value))} min="50" max="1000" /></div>
                      <button className={`btn ${surveyRunning ? 'btn-danger' : 'btn-success'} btn-block`} onClick={runSurvey} disabled={surveyRunning}>
                        {surveyRunning ? 'Memindai...' : 'Mulai Pemindaian Real'}
                      </button>
                    </div>

                    {surveyRunning && (
                      <div className="panel">
                        <div className="panel-title">Progress</div>
                        <div className="survey-progress">
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span>Progress</span><span>{surveyProgress}%</span></div>
                          <div className="progress-bar"><div className="progress-fill" style={{ width: `${surveyProgress}%` }}></div></div>
                          <p style={{ fontSize: 10, color: '#a0a0a0', marginTop: 4 }}>
                            {surveyPoints.filter(p => !p.elevLoading).length}/{surveyPoints.length} titik ter-fetch | Elevasi dari Open-Meteo API
                          </p>
                        </div>
                      </div>
                    )}

                    {surveyPoints.length > 0 && !surveyRunning && (
                      <div className="panel">
                        <div className="panel-title">Hasil Survey Real</div>
                        <div className="stats-grid">
                          <div className="stat-card"><div className="stat-value">{surveyPoints.length}</div><div className="stat-label">Titik Dipindai</div></div>
                          <div className="stat-card"><div className="stat-value" style={{ color: '#ff4444' }}>{surveyAnomalies.length}</div><div className="stat-label">Anomali</div></div>
                          <div className="stat-card"><div className="stat-value">{surveyPoints.filter(p => p.elevation != null).length > 0 ? Math.min(...surveyPoints.filter(p => p.elevation != null).map(p => p.elevation)).toFixed(0) : 0}m</div><div className="stat-label">Min Elevasi</div></div>
                          <div className="stat-card"><div className="stat-value">{surveyPoints.filter(p => p.elevation != null).length > 0 ? Math.max(...surveyPoints.filter(p => p.elevation != null).map(p => p.elevation)).toFixed(0) : 0}m</div><div className="stat-label">Max Elevasi</div></div>
                        </div>
                        <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={() => { setPoints(prev => [...prev, ...surveyPoints]); setSurveyPoints([]) }}>
                          Tambahkan ke Data
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Export Tab */}
                {activeTab === 'export' && (
                  <>
                    <div className="panel">
                      <div className="panel-title">Export Data</div>
                      <div className="export-grid">
                        <button className="btn btn-primary" onClick={() => exportAs('geojson')}>GeoJSON</button>
                        <button className="btn btn-primary" onClick={() => exportAs('kml')}>KML</button>
                        <button className="btn btn-primary" onClick={() => exportAs('gpx')}>GPX</button>
                        <button className="btn btn-primary" onClick={() => exportAs('csv')}>CSV</button>
                      </div>
                    </div>
                    <div className="panel">
                      <div className="panel-title">Proyek</div>
                      <div className="export-grid">
                        <button className="btn btn-success" onClick={saveProject}>Simpan</button>
                        <button className="btn btn-warning" onClick={loadProject}>Muat</button>
                      </div>
                    </div>
                    <div className="panel">
                      <div className="panel-title">Ringkasan</div>
                      <div className="stats-grid">
                        <div className="stat-card"><div className="stat-value">{points.length}</div><div className="stat-label">Titik GPS</div></div>
                        <div className="stat-card"><div className="stat-value">{mineralMarkers.length}</div><div className="stat-label">Marker</div></div>
                        <div className="stat-card"><div className="stat-value">{analysisResults.length}</div><div className="stat-label">Anomali</div></div>
                        <div className="stat-card"><div className="stat-value">{polygons.length}</div><div className="stat-label">Zona</div></div>
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
          <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={14} zoomControl={true} ref={mapRef} style={{ height: '100%', width: '100%' }}>
            <LayersControl position="topright">
              {Object.entries(TILE_LAYERS).map(([key, layer]) => (
                <LayersControl.BaseLayer key={key} checked={key === 'satellite'} name={layer.name}>
                  <TileLayer url={layer.url} attribution={key === 'street' ? '&copy; OpenStreetMap' : ''} />
                </LayersControl.BaseLayer>
              ))}
            </LayersControl>

            {/* USGS Mineral Deposits WMS */}
            {showMineralWMS && (
              <WMSTileLayer url="https://mrdata.usgs.gov/services/mrds" layers="mrds" format="image/png" transparent={true} opacity={0.7} attribution="USGS MRDS" />
            )}

            {/* Geological WMS */}
            {showGeoWMS && (
              <WMSTileLayer url="https://mrdata.usgs.gov/services/sgmc" layers="sgmc2_c" format="image/png" transparent={true} opacity={0.4} attribution="USGS SGMC" />
            )}

            <MapClickHandler onMapClick={handleMapClick} onMapMove={(center) => setMapCenter({ lat: center.lat, lng: center.lng })} />
            <BoundsFitter points={points} />

            {/* Profile line */}
            {profilePoints.length >= 2 && (
              <Polyline positions={profilePoints} pathOptions={{ color: '#00d4ff', weight: 3, dashArray: '8,4' }} />
            )}
            {profilePoints.map((p, i) => (
              <CircleMarker key={`pp-${i}`} center={p} radius={6} pathOptions={{ color: '#00d4ff', fillColor: '#00d4ff', fillOpacity: 1 }} />
            ))}

            {/* GPS Points */}
            {points.map(p => (
              <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={5}
                pathOptions={{ color: p.elevLoading ? '#ffdd00' : (p.anomalyScore > 0.4 ? getAnomalyColor(p.anomalyScore) : '#00d4ff'), fillColor: p.elevLoading ? '#ffdd00' : (p.anomalyScore > 0.4 ? getAnomalyColor(p.anomalyScore) : '#00d4ff'), fillOpacity: 0.8 }}
              >
                <Popup><div style={{ color: '#333' }}><strong>{p.label}</strong><br />Lat: {p.lat.toFixed(6)}<br />Lng: {p.lng.toFixed(6)}<br />Elevasi: {p.elevation?.toFixed(1) ?? 'Loading...'}m<br /><em style={{ fontSize: 10 }}>Data: Open-Meteo API</em></div></Popup>
              </CircleMarker>
            ))}

            {/* Mineral Markers */}
            {mineralMarkers.filter(m => filterTypes.includes(m.type)).map(m => (
              <Marker key={m.id} position={[m.lat, m.lng]} icon={createIcon(MINERAL_TYPES[m.type]?.color || '#fff', MINERAL_TYPES[m.type]?.emoji || '?')}>
                <Popup><div style={{ color: '#333' }}><strong>{MINERAL_TYPES[m.type]?.emoji} {MINERAL_TYPES[m.type]?.label}</strong><br />Kedalaman: {m.depth}m<br />Kepercayaan: {m.confidence}%<br />{m.notes && <><em>{m.notes}</em><br /></>}Lat: {m.lat.toFixed(6)}, Lng: {m.lng.toFixed(6)}</div></Popup>
              </Marker>
            ))}

            {/* Survey Points */}
            {surveyPoints.map((p, i) => (
              <CircleMarker key={`sp-${i}`} center={[p.lat, p.lng]} radius={4}
                pathOptions={{ color: p.anomalyScore > 0 ? getAnomalyColor(p.anomalyScore) : '#00d4ff', fillColor: p.anomalyScore > 0 ? getAnomalyColor(p.anomalyScore) : '#00d4ff', fillOpacity: 0.7 }}
              >
                <Popup><div style={{ color: '#333' }}><strong>Survey Point</strong><br />Elevasi: {p.elevation?.toFixed(1) ?? '?'}m<br />{p.anomalyScore > 0 && <>Anomali: {(p.anomalyScore * 100).toFixed(0)}%<br />Tipe: {p.anomalyType}<br /></>}<em style={{ fontSize: 10 }}>Data: Open-Meteo API</em></div></Popup>
              </CircleMarker>
            ))}

            {/* Polygons */}
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
            {showAnomalies && analysisResults.map((a, i) => (
              <CircleMarker key={`anom-${i}`} center={[a.lat, a.lng]} radius={a.anomalyScore * 25 + 8}
                pathOptions={{ color: getAnomalyColor(a.anomalyScore), fillColor: getAnomalyColor(a.anomalyScore), fillOpacity: 0.2, weight: 2 }}
              >
                <Popup><div style={{ color: '#333' }}><strong>Anomali: {getAnomalyLabel(a.anomalyScore)}</strong><br />Tipe: {a.anomalyType}<br />Score: {(a.anomalyScore * 100).toFixed(0)}%<br />Elevasi: {a.elevation?.toFixed(1)}m<br />Diff: {a.elevationDiff}m dari rata-rata</div></Popup>
              </CircleMarker>
            ))}

            {/* Heatmap */}
            {showHeatmap && points.filter(p => p.elevation != null).map((p, i) => {
              const allElev = points.filter(pp => pp.elevation != null).map(pp => pp.elevation)
              const minE = Math.min(...allElev)
              const maxE = Math.max(...allElev)
              const ratio = maxE > minE ? (p.elevation - minE) / (maxE - minE) : 0.5
              const color = ratio > 0.7 ? '#ff4444' : ratio > 0.4 ? '#ffdd00' : '#00ff88'
              return (
                <CircleMarker key={`heat-${i}`} center={[p.lat, p.lng]} radius={18}
                  pathOptions={{ color: 'transparent', fillColor: color, fillOpacity: 0.25 }}
                />
              )
            })}
          </MapContainer>

          {/* Map overlay controls */}
          <div className="map-overlay">
            <button className={`btn btn-sm ${showHeatmap ? 'active' : ''}`} onClick={() => setShowHeatmap(!showHeatmap)}>Heatmap</button>
            <button className={`btn btn-sm ${showAnomalies ? 'active' : ''}`} onClick={() => setShowAnomalies(!showAnomalies)}>Anomali</button>
            <button className="btn btn-sm" onClick={() => setShowHelp(true)}>Bantuan</button>
          </div>

          <div className="coord-display">
            {mapCenter.lat.toFixed(5)}, {mapCenter.lng.toFixed(5)} | Data Elevasi: Open-Meteo API | Geologi: Macrostrat/USGS
          </div>
        </div>
      </div>
    </>
  )
}
