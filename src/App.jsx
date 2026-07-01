import { useState, useCallback, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, CircleMarker, useMap, useMapEvents, LayersControl, WMSTileLayer } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './index.css'
import { fetchElevation, fetchElevationBatch, fetchElevationProfile } from './services/elevationApi'
import { fetchGeologicalInfo } from './services/geologicalApi'
import { detectUndergroundStructures, fullTerrainAnalysis, getAnomalyColor, getAnomalyLabel } from './services/anomalyEngine'

// Fix default marker icons
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

function createIcon(color, emoji) {
  return L.divIcon({
    html: `<div style="background:${color};width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)">${emoji}</div>`,
    className: '', iconSize: [30, 30], iconAnchor: [15, 15],
  })
}

const MINERAL_TYPES = {
  gold: { emoji: '🥇', color: '#FFD700', label: 'Emas', method: 'Metal detector + panning di sungai' },
  silver: { emoji: '', color: '#C0C0C0', label: 'Perak', method: 'Metal detector frekuensi tinggi' },
  iron: { emoji: '⚙️', color: '#8B4513', label: 'Besi', method: 'Magnetometer - besi menarik medan magnet' },
  copper: { emoji: '🔶', color: '#B87333', label: 'Tembaga', method: 'Soil sampling + XRF analyzer' },
  diamond: { emoji: '💎', color: '#00FFFF', label: 'Berlian', method: 'Cari di pipa kimberlite (batuan vulkanik)' },
  oil: { emoji: '️', color: '#333333', label: 'Minyak', method: 'Seismic survey + bor eksplorasi' },
  treasure: { emoji: '💰', color: '#FF8C00', label: 'Harta', method: 'Metal detector + riset sejarah lokasi' },
  artifact: { emoji: '🏺', color: '#CD853F', label: 'Artefak', method: 'Ground survey + metal detector' },
  tunnel: { emoji: '️', color: '#8B0000', label: 'Terowongan', method: 'GPR (Ground Penetrating Radar)' },
  cave: { emoji: '🦇', color: '#4B0082', label: 'Gua', method: 'Cari di area batuan kapur/limestone' },
}

const TILE_LAYERS = {
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', name: 'Satelit' },
  street: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', name: 'Peta Jalan' },
  terrain: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', name: 'Terrain' },
  relief: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}', name: 'Shaded Relief' },
}

function parseFile(content, filename) {
  const ext = filename.split('.').pop().toLowerCase()
  const points = []
  if (ext === 'csv') {
    const lines = content.split('\n').filter(l => l.trim())
    const h = lines[0].split(',').map(x => x.trim().toLowerCase())
    const li = h.findIndex(x => x.includes('lat')), ni = h.findIndex(x => x.includes('lng') || x.includes('lon'))
    const ei = h.findIndex(x => x.includes('elev') || x.includes('alt')), lb = h.findIndex(x => x.includes('label') || x.includes('name'))
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(',')
      if (c[li] && c[ni]) points.push({ lat: parseFloat(c[li]), lng: parseFloat(c[ni]), elevation: ei >= 0 ? parseFloat(c[ei]) || 0 : 0, label: lb >= 0 ? c[lb] : `P${i}`, id: Date.now() + i, elevLoading: false })
    }
  } else if (ext === 'gpx') {
    const doc = new DOMParser().parseFromString(content, 'text/xml')
    doc.querySelectorAll('trkpt, wpt, rtept').forEach((pt, i) => {
      const ele = pt.querySelector('ele'), name = pt.querySelector('name')
      points.push({ lat: parseFloat(pt.getAttribute('lat')), lng: parseFloat(pt.getAttribute('lon')), elevation: ele ? parseFloat(ele.textContent) : 0, label: name ? name.textContent : `WP${i+1}`, id: Date.now() + i, elevLoading: false })
    })
  } else if (ext === 'kml') {
    const doc = new DOMParser().parseFromString(content, 'text/xml')
    doc.querySelectorAll('coordinates').forEach((coord, i) => {
      coord.textContent.trim().split(/\s+/).forEach((tuple, j) => {
        const [lng, lat, elev] = tuple.split(',')
        if (lat && lng) points.push({ lat: parseFloat(lat), lng: parseFloat(lng), elevation: elev ? parseFloat(elev) : 0, label: `KML${i*100+j+1}`, id: Date.now() + i*100 + j, elevLoading: false })
      })
    })
  }
  return points
}

function generateGrid(bounds, spacing) {
  const pts = [], { north, south, east, west } = bounds
  const latStep = spacing / 111000, lngStep = spacing / (111000 * Math.cos(((north + south) / 2) * Math.PI / 180))
  let idx = 0
  for (let lat = south; lat <= north; lat += latStep)
    for (let lng = west; lng <= east; lng += lngStep)
      pts.push({ lat, lng, elevation: null, label: 'Survey', id: Date.now() + idx++, elevLoading: true })
  return pts
}

// Elevation Profile Chart
function ElevationProfileChart({ profile, anomalies }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    if (!profile?.length || !canvasRef.current) return
    const canvas = canvasRef.current, ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth, H = 120
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.scale(dpr, dpr)
    const pad = { t: 12, b: 20, l: 38, r: 8 }, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b
    const elevs = profile.map(p => p.elevation), minE = Math.min(...elevs) - 3, maxE = Math.max(...elevs) + 3, maxD = profile[profile.length - 1].distance
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, W, H)
    // Grid
    ctx.strokeStyle = '#21262d'; ctx.lineWidth = 0.5
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ph / 4) * i
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke()
      ctx.fillStyle = '#6e7681'; ctx.font = '9px system-ui'; ctx.textAlign = 'right'
      ctx.fillText(`${(maxE - (maxE - minE) * (i / 4)).toFixed(0)}m`, pad.l - 4, y + 3)
    }
    // Fill
    ctx.beginPath()
    profile.forEach((p, i) => { const x = pad.l + (p.distance / maxD) * pw, y = pad.t + ph - ((p.elevation - minE) / (maxE - minE)) * ph; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) })
    ctx.lineTo(pad.l + pw, pad.t + ph); ctx.lineTo(pad.l, pad.t + ph); ctx.closePath()
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ph)
    grad.addColorStop(0, 'rgba(88,166,255,0.25)'); grad.addColorStop(1, 'rgba(88,166,255,0.02)')
    ctx.fillStyle = grad; ctx.fill()
    // Line
    ctx.beginPath()
    profile.forEach((p, i) => { const x = pad.l + (p.distance / maxD) * pw, y = pad.t + ph - ((p.elevation - minE) / (maxE - minE)) * ph; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) })
    ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 1.5; ctx.stroke()
    // Anomaly dots
    if (anomalies?.length) anomalies.forEach(a => {
      const idx = profile.findIndex(p => Math.abs(p.lat - a.lat) < 0.001 && Math.abs(p.lng - a.lng) < 0.001)
      if (idx >= 0) {
        const x = pad.l + (profile[idx].distance / maxD) * pw, y = pad.t + ph - ((profile[idx].elevation - minE) / (maxE - minE)) * ph
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = getAnomalyColor(a.anomalyScore); ctx.fill()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke()
      }
    })
    // Distance labels
    ctx.fillStyle = '#6e7681'; ctx.font = '9px system-ui'; ctx.textAlign = 'center'
    for (let i = 0; i <= 4; i++) ctx.fillText(`${((maxD / 4) * i / 1000).toFixed(1)}km`, pad.l + (pw / 4) * i, H - 4)
  }, [profile, anomalies])
  return <canvas ref={canvasRef} style={{ width: '100%', height: 120, borderRadius: 6 }} />
}

function MapClickHandler({ onMapClick, onMapMove }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng), move: (e) => onMapMove(e.target.getCenter()) })
  return null
}

function BoundsFitter({ points }) {
  const map = useMap()
  useEffect(() => { if (points.length > 1) map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])), { padding: [50, 50] }) }, [points.length])
  return null
}

// Action guide content per anomaly type
const ACTION_GUIDES = {
  depression: {
    title: 'Depresi Terrain Terdeteksi',
    text: 'Area ini lebih rendah dari sekitarnya. Kemungkinan ada rongga/terowongan di bawah permukaan.',
    steps: ['Periksa vegetasi - tanaman layu bisa indikasi rongga bawah tanah', 'Dengarkan suara hollow saat menginjak tanah', 'Gunakan GPR (Ground Penetrating Radar) untuk konfirmasi', 'Cari tanda-tanda entrance: lubang, retakan, atau perbedaan warna tanah'],
  },
  elevation_spike: {
    title: 'Tonjolan Tidak Wajar',
    text: 'Area ini lebih tinggi dari sekitarnya. Bisa berupa struktur terkubur atau gundukan buatan.',
    steps: ['Periksa apakah tonjolan berbentuk geometris (buatan manusia)', 'Lakukan soil sampling di sekitar area', 'Gunakan magnetometer untuk deteksi logam terkubur', 'Bandingkan dengan peta sejarah/aerial foto lama'],
  },
  linear_depression: {
    title: 'Depresi Linear (Pola Garis)',
    text: 'Pola depresi memanjang terdeteksi. Sangat mengindikasikan terowongan atau saluran bawah tanah.',
    steps: ['Ikuti arah garis depresi untuk mencari entrance/exit', 'Periksa perbedaan drainase air di sepanjang garis', 'GPR scan sepanjang garis untuk konfirmasi', 'Cari dokumen sejarah tentang terowongan di area ini'],
  },
  flat_anomaly: {
    title: 'Area Terlalu Datar',
    text: 'Area ini tidak wajar datar dibandingkan terrain sekitarnya. Bisa jadi struktur terkubur.',
    steps: ['Bandingkan dengan peta topografi resmi', 'Cari perbedaan tekstur tanah/vegetasi', 'Metal detector survey di area datar', 'Ground probing dengan batang besi panjang'],
  },
}

const MINERAL_METHODS = {
  gold: 'Cari di sungai (placer deposit) atau urat kuarsa di batuan keras. Gunakan metal detector + pan.',
  iron: 'Gunakan magnetometer - bijih besi menarik medan magnet kuat. Cari di area batuan basal.',
  cave: 'Fokus di area batuan kapur (limestone). Cari sinkhole, aliran air bawah tanah, atau entrance alami.',
  tunnel: 'Gunakan GPR untuk scan bawah permukaan. Cari depresi linear atau entrance tersembunyi.',
  treasure: 'Riset sejarah lokasi. Gunakan metal detector. Fokus di area dekat bangunan tua/sungai.',
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
  const [surveyAnomalies, setSurveyAnomalies] = useState([])
  const [selectedAnomaly, setSelectedAnomaly] = useState(null)

  const gpsWatchRef = useRef(null)
  const fileInputRef = useRef(null)
  const mapRef = useRef(null)

  const fetchAndSetElevation = useCallback(async (pointId, lat, lng) => {
    const elev = await fetchElevation(lat, lng)
    if (elev !== null) {
      setPoints(prev => prev.map(p => p.id === pointId ? { ...p, elevation: elev, elevLoading: false } : p))
      setSurveyPoints(prev => prev.map(p => p.id === pointId ? { ...p, elevation: elev, elevLoading: false } : p))
    }
  }, [])

  const handleMapClick = useCallback((latlng) => {
    if (profileMode) { setProfilePoints(prev => [...prev, [latlng.lat, latlng.lng]]); return }
    if (drawingPolygon) { setPolygonPoints(prev => [...prev, [latlng.lat, latlng.lng]]); return }
    const id = Date.now()
    const newPoint = { lat: latlng.lat, lng: latlng.lng, elevation: null, label: manualLabel || `Titik ${points.length + 1}`, id, elevLoading: true }
    setPoints(prev => [...prev, newPoint])
    fetchAndSetElevation(id, latlng.lat, latlng.lng)
    if (activeTab === 'mineral') {
      setMineralMarkers(prev => [...prev, { lat: latlng.lat, lng: latlng.lng, type: selectedMineral, depth: markerDepth, confidence: markerConfidence, notes: markerNotes, id: id + 1 }])
    }
  }, [drawingPolygon, manualLabel, points.length, activeTab, selectedMineral, markerDepth, markerConfidence, markerNotes, profileMode, fetchAndSetElevation])

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const parsed = parseFile(ev.target.result, file.name)
      if (!parsed.length) return
      const needsElev = parsed.filter(p => !p.elevation)
      setPoints(prev => [...prev, ...parsed.map(p => ({ ...p, elevLoading: !p.elevation }))])
      if (needsElev.length) {
        const elevations = await fetchElevationBatch(needsElev)
        setPoints(prev => prev.map(p => { const idx = needsElev.findIndex(n => n.id === p.id); return idx >= 0 && elevations[idx] !== null ? { ...p, elevation: elevations[idx], elevLoading: false } : p.elevLoading ? { ...p, elevLoading: false } : p }))
      }
    }
    reader.readAsText(file); e.target.value = ''
  }

  const toggleGpsTracking = () => {
    if (gpsTracking) { if (gpsWatchRef.current) navigator.geolocation.clearWatch(gpsWatchRef.current); setGpsTracking(false) }
    else {
      if (!navigator.geolocation) { alert('GPS tidak tersedia'); return }
      setGpsTracking(true)
      gpsWatchRef.current = navigator.geolocation.watchPosition(async (pos) => {
        const id = Date.now()
        const np = { lat: pos.coords.latitude, lng: pos.coords.longitude, elevation: pos.coords.altitude || null, label: `GPS ${points.length + 1}`, id, elevLoading: !pos.coords.altitude }
        setPoints(prev => prev.length > 0 && id - prev[prev.length - 1].id < 2000 ? prev : [...prev, np])
        if (!pos.coords.altitude) fetchAndSetElevation(id, np.lat, np.lng)
      }, (err) => console.error('GPS:', err), { enableHighAccuracy: true, timeout: 10000 })
    }
  }

  const addManualPoint = () => {
    const lat = parseFloat(manualLat), lng = parseFloat(manualLng)
    if (isNaN(lat) || isNaN(lng)) return
    const id = Date.now()
    setPoints(prev => [...prev, { lat, lng, elevation: null, label: manualLabel || `Titik ${prev.length + 1}`, id, elevLoading: true }])
    setManualLat(''); setManualLng(''); setManualLabel('')
    fetchAndSetElevation(id, lat, lng)
  }

  const runSurvey = async () => {
    if (!mapRef.current) return
    const bounds = mapRef.current.getBounds()
    const grid = generateGrid({ north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() }, gridSpacing)
    if (!grid.length) { alert('Zoom in ke area lebih kecil'); return }
    if (grid.length > 500) { alert(`Terlalu banyak titik (${grid.length}). Perbesar zoom.`); return }
    setSurveyRunning(true); setSurveyProgress(0); setSurveyPoints(grid); setSurveyAnomalies([])
    for (let i = 0; i < grid.length; i += 100) {
      const batch = grid.slice(i, i + 100)
      const elevations = await fetchElevationBatch(batch)
      setSurveyPoints(prev => prev.map(p => { const idx = batch.findIndex(b => b.id === p.id); return idx >= 0 ? { ...p, elevation: elevations[idx] ?? 0, elevLoading: false } : p }))
      setSurveyProgress(Math.round(Math.min((i + batch.length) / grid.length * 70, 70)))
    }
    setSurveyProgress(75)
    const result = await detectUndergroundStructures(grid.map(p => ({ ...p, elevation: p.elevation ?? 0 })))
    setSurveyAnomalies(result.anomalies || [])
    setSurveyPoints(prev => prev.map(p => { const a = result.anomalies?.find(x => x.id === p.id); return a ? { ...p, anomalyScore: a.anomalyScore, anomalyType: a.anomalyType } : { ...p, anomalyScore: 0 } }))
    setSurveyProgress(100); setSurveyRunning(false)
  }

  const runAnomalyAnalysis = async () => {
    if (points.length < 3) { alert('Minimal 3 titik diperlukan'); return }
    setAnalyzing(true); setShowAnomalies(true); setSelectedAnomaly(null)
    const result = await detectUndergroundStructures(points)
    setAnalysisResults(result.anomalies || [])
    setAnalyzing(false)
  }

  const analyzePoint = async (lat, lng) => {
    setGeoLoading(true); setSelectedAnomaly(null)
    const result = await fullTerrainAnalysis(lat, lng)
    setGeoInfo(result); setGeoLoading(false)
  }

  const generateProfile = async () => {
    if (profilePoints.length < 2) { alert('Minimal 2 titik. Klik pada peta.'); return }
    setProfileLoading(true)
    const [s, e] = [profilePoints[0], profilePoints[profilePoints.length - 1]]
    const profile = await fetchElevationProfile(s[0], s[1], e[0], e[1], 60)
    setProfileData(profile); setProfileLoading(false)
  }

  const exportAs = (format) => {
    const all = [...points, ...mineralMarkers.map(m => ({ lat: m.lat, lng: m.lng, elevation: m.depth, label: `${m.type} - ${m.notes}` }))]
    let content, filename, type
    if (format === 'geojson') { content = JSON.stringify({ type: 'FeatureCollection', features: all.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { elevation: p.elevation, label: p.label } })) }, null, 2); filename = 'map.geojson'; type = 'application/json' }
    else if (format === 'kml') { content = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${all.map(p => `<Placemark><name>${p.label}</name><Point><coordinates>${p.lng},${p.lat},${p.elevation||0}</coordinates></Point></Placemark>`).join('')}</Document></kml>`; filename = 'map.kml'; type = 'application/vnd.google-earth.kml+xml' }
    else if (format === 'csv') { content = 'lat,lng,elevation,label\n' + all.map(p => `${p.lat},${p.lng},${p.elevation||0},${p.label}`).join('\n'); filename = 'map.csv'; type = 'text/csv' }
    else { content = `<?xml version="1.0"?><gpx version="1.1">${all.map(p => `<wpt lat="${p.lat}" lon="${p.lng}"><ele>${p.elevation||0}</ele><name>${p.label}</name></wpt>`).join('')}</gpx>`; filename = 'map.gpx'; type = 'application/gpx+xml' }
    const blob = new Blob([content], { type }), url = URL.createObjectURL(blob), a = document.createElement('a')
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
  }

  const saveProject = () => { localStorage.setItem('amp', JSON.stringify({ points, mineralMarkers, polygons })); alert('Tersimpan!') }
  const loadProject = () => { const d = localStorage.getItem('amp'); if (d) { const p = JSON.parse(d); setPoints(p.points||[]); setMineralMarkers(p.mineralMarkers||[]); setPolygons(p.polygons||[]) } }
  const finishPolygon = () => { if (polygonPoints.length >= 3) { setPolygons(prev => [...prev, { points: polygonPoints, id: Date.now(), label: `Zona ${prev.length+1}` }]); setPolygonPoints([]); setDrawingPolygon(false) } }

  const validPoints = points.filter(p => p.elevation != null)
  const loadingCount = points.filter(p => p.elevLoading).length
  const elevations = validPoints.map(p => p.elevation)
  const minElev = elevations.length ? Math.min(...elevations) : 0
  const maxElev = elevations.length ? Math.max(...elevations) : 0

  return (
    <>
      {showHelp && (
        <div className="help-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-content" onClick={e => e.stopPropagation()}>
            <h2>GPS Anomaly Mapper</h2>
            <p>Aplikasi pemetaan GPS dengan data elevasi REAL dari satelit (Open-Meteo/SRTM) dan data geologi dari Macrostrat/USGS.</p>
            <ul>
              <li><strong>1. Tambah Titik</strong> - Klik peta atau input koordinat. Elevasi real otomatis di-fetch.</li>
              <li><strong>2. Analisis Anomali</strong> - Deteksi depresi terrain (terowongan/gua) dari data elevasi real.</li>
              <li><strong>3. Profil Elevasi</strong> - Gambar garis di peta, lihat penampang melintang terrain.</li>
              <li><strong>4. Peta Mineral</strong> - Tandai lokasi mineral. Info batuan & metode deteksi otomatis.</li>
              <li><strong>5. Auto Survey</strong> - Scan grid otomatis dengan elevasi real dari API.</li>
              <li><strong>6. Export</strong> - Simpan sebagai GeoJSON, KML, GPX, atau CSV.</li>
            </ul>
            <p style={{ marginTop: 12, fontSize: 11, color: '#6e7681' }}>
              Semua data elevasi berasal dari SRTM/DEM satellite data via Open-Meteo API. Data geologi dari Macrostrat & USGS.
            </p>
            <button className="btn btn-primary btn-block" onClick={() => setShowHelp(false)} style={{ marginTop: 16 }}>Mulai</button>
          </div>
        </div>
      )}

      <div className="app-container">
        <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>{sidebarCollapsed ? '▶' : '◀'}</button>
          {!sidebarCollapsed && (
            <>
              <div className="tab-bar">
                {[['gps','GPS'],['anomaly','Anomali'],['profile','Profil'],['mineral','Mineral'],['survey','Survey'],['export','Export']].map(([k,l]) => (
                  <button key={k} className={`tab-btn ${activeTab===k?'active':''}`} onClick={() => setActiveTab(k)}>{l}</button>
                ))}
              </div>
              <div className="tab-content">

                {/* ===== GPS TAB ===== */}
                {activeTab === 'gps' && (<>
                  {/* Workflow */}
                  <div className="card">
                    <div className="card-title">Alur Kerja</div>
                    <div className="workflow-steps">
                      {[['1','Tambah titik GPS','Klik peta atau input koordinat', points.length > 0],
                        ['2','Analisis anomali','Deteksi terrain tidak wajar', analysisResults.length > 0],
                        ['3','Investigasi lapangan','Verifikasi dengan alat fisik', false]
                      ].map(([n, t, d, done]) => (
                        <div key={n} className="workflow-step">
                          <div className={`step-number ${done?'done':''}`}>{done?'✓':n}</div>
                          <div className="step-content"><div className="step-title">{t}</div><div className="step-desc">{d}</div></div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-title">Input Koordinat</div>
                    <div className="form-row">
                      <div className="form-group"><label>Latitude</label><input type="number" step="any" value={manualLat} onChange={e => setManualLat(e.target.value)} placeholder="-6.2088" /></div>
                      <div className="form-group"><label>Longitude</label><input type="number" step="any" value={manualLng} onChange={e => setManualLng(e.target.value)} placeholder="106.8456" /></div>
                    </div>
                    <div className="form-group"><label>Label (opsional)</label><input type="text" value={manualLabel} onChange={e => setManualLabel(e.target.value)} placeholder="Nama lokasi" /></div>
                    <button className="btn btn-primary btn-block" onClick={addManualPoint}>+ Tambah Titik</button>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>Elevasi otomatis dari Open-Meteo API (SRTM)</p>
                  </div>

                  <div className="card">
                    <div className="card-title">Import File</div>
                    <label className="file-upload">
                      <input ref={fileInputRef} type="file" accept=".gpx,.kml,.csv" onChange={handleFileUpload} />
                      <div className="upload-icon">📂</div>
                      <p>GPX / KML / CSV</p>
                    </label>
                  </div>

                  <div className="card">
                    <div className="card-title">GPS Live Tracking</div>
                    <button className={`btn ${gpsTracking?'btn-danger':'btn-success'} btn-block`} onClick={toggleGpsTracking}>
                      {gpsTracking ? '⏹ Stop' : '▶ Mulai Tracking'}
                    </button>
                    {gpsTracking && <p style={{ fontSize: 10, color: 'var(--green)', marginTop: 6 }}>● Aktif - elevasi real-time</p>}
                  </div>

                  <div className="card">
                    <div className="card-title">Titik ({points.length}) {loadingCount > 0 && <span className="loading-text" style={{ color: 'var(--yellow)', fontSize: 10 }}>· {loadingCount} loading...</span>}</div>
                    <div className="point-list">
                      {points.slice(-20).reverse().map(p => (
                        <div key={p.id} className="point-item" onClick={() => { mapRef.current?.setView([p.lat, p.lng], 16); analyzePoint(p.lat, p.lng) }}>
                          <div><div className="label">{p.label}</div><div className="coords">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</div></div>
                          <span style={{ fontSize: 10, color: p.elevLoading ? 'var(--yellow)' : 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                            {p.elevLoading ? '...' : `${p.elevation?.toFixed(0)}m`}
                          </span>
                        </div>
                      ))}
                    </div>
                    {points.length > 0 && <button className="btn btn-danger btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => { setPoints([]); setAnalysisResults([]) }}>Hapus Semua</button>}
                  </div>
                </>)}

                {/* ===== ANOMALY TAB ===== */}
                {activeTab === 'anomaly' && (<>
                  <div className="card">
                    <div className="card-title">Deteksi Anomali</div>
                    <p className="card-desc">Analisis data elevasi REAL untuk menemukan depresi terrain (terowongan/gua) dan anomali elevasi.</p>
                    <div className="toggle-row"><label>Tampilkan Anomali</label><label className="toggle-switch"><input type="checkbox" checked={showAnomalies} onChange={() => setShowAnomalies(!showAnomalies)} /><span className="toggle-slider"></span></label></div>
                    <div className="toggle-row"><label>Heatmap Elevasi</label><label className="toggle-switch"><input type="checkbox" checked={showHeatmap} onChange={() => setShowHeatmap(!showHeatmap)} /><span className="toggle-slider"></span></label></div>
                    <button className="btn btn-warning btn-block" style={{ marginTop: 8 }} onClick={runAnomalyAnalysis} disabled={analyzing || points.length < 3}>
                      {analyzing ? '⏳ Menganalisis...' : '🔍 Analisis Anomali'}
                    </button>
                  </div>

                  {/* Selected Anomaly Detail */}
                  {selectedAnomaly && (
                    <div className="card" style={{ borderColor: getAnomalyColor(selectedAnomaly.anomalyScore) }}>
                      <div className="card-title" style={{ color: getAnomalyColor(selectedAnomaly.anomalyScore) }}>
                        Detail Anomali
                      </div>
                      <div className="info-panel" style={{ background: 'transparent', border: 'none', padding: 0 }}>
                        <div className="info-row"><span className="info-label">Tipe</span><span className="info-value">{selectedAnomaly.anomalyType}</span></div>
                        <div className="info-row"><span className="info-label">Score</span><span className="info-value" style={{ color: getAnomalyColor(selectedAnomaly.anomalyScore) }}>{(selectedAnomaly.anomalyScore * 100).toFixed(0)}%</span></div>
                        <div className="info-row"><span className="info-label">Elevasi</span><span className="info-value">{selectedAnomaly.elevation?.toFixed(1)}m</span></div>
                        <div className="info-row"><span className="info-label">Selisih</span><span className="info-value">{selectedAnomaly.elevationDiff}m</span></div>
                      </div>
                      {ACTION_GUIDES[selectedAnomaly.anomalyType] && (
                        <div className="action-guide">
                          <div className="guide-title">{ACTION_GUIDES[selectedAnomaly.anomalyType].title}</div>
                          <div className="guide-text">{ACTION_GUIDES[selectedAnomaly.anomalyType].text}</div>
                          <ul className="guide-steps">
                            {ACTION_GUIDES[selectedAnomaly.anomalyType].steps.map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Geological Info */}
                  <div className="card">
                    <div className="card-title">Info Geologi Lokasi</div>
                    {geoLoading ? <p className="loading-text" style={{ fontSize: 11 }}>Mengambil data...</p> : geoInfo ? (
                      <div>
                        <div className="info-panel">
                          <div className="info-row"><span className="info-label">Formasi</span><span className="info-value">{geoInfo.formation}</span></div>
                          <div className="info-row"><span className="info-label">Periode</span><span className="info-value">{geoInfo.period}</span></div>
                          <div className="info-row"><span className="info-label">Batuan</span><span className="info-value">{geoInfo.rockType}</span></div>
                          {geoInfo.lithology && <div className="info-row"><span className="info-label">Litologi</span><span className="info-value">{geoInfo.lithology}</span></div>}
                        </div>
                        <div className="action-guide" style={{ marginTop: 10 }}>
                          <div className="guide-title">Rekomendasi</div>
                          <div className="guide-text">{geoInfo.recommendation}</div>
                        </div>
                        {geoInfo.geological?.mineralPotential?.length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Potensi Mineral di Area Ini:</div>
                            {geoInfo.geological.mineralPotential.slice(0, 5).map((m, i) => (
                              <div key={i} className="info-row">
                                <span className="info-label">{MINERAL_TYPES[m.type]?.emoji} {MINERAL_TYPES[m.type]?.label}</span>
                                <span className="info-value" style={{ color: getAnomalyColor(m.probability) }}>{(m.probability * 100).toFixed(0)}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Klik titik pada peta untuk info geologi</p>}
                  </div>

                  {/* Results List */}
                  {analysisResults.length > 0 && (
                    <div className="card">
                      <div className="card-title">Hasil Analisis ({analysisResults.length} anomali)</div>
                      <div className="point-list">
                        {analysisResults.sort((a,b) => b.anomalyScore - a.anomalyScore).map((a, i) => (
                          <div key={i} className={`point-item ${selectedAnomaly === a ? 'selected' : ''}`} style={selectedAnomaly === a ? { borderColor: getAnomalyColor(a.anomalyScore) } : {}} onClick={() => { mapRef.current?.setView([a.lat, a.lng], 17); setSelectedAnomaly(a) }}>
                            <div>
                              <div className="label" style={{ color: getAnomalyColor(a.anomalyScore) }}>{getAnomalyLabel(a.anomalyScore)} · {a.anomalyType}</div>
                              <div className="coords">{a.lat.toFixed(5)}, {a.lng.toFixed(5)}</div>
                            </div>
                            <span className={`anomaly-badge ${a.anomalyScore > 0.8 ? 'critical' : a.anomalyScore > 0.6 ? 'high' : a.anomalyScore > 0.4 ? 'moderate' : 'low'}`}>{(a.anomalyScore*100).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="card">
                    <div className="card-title">Legenda</div>
                    <div className="legend">
                      <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--green)' }}></div>Normal</div>
                      <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--yellow)' }}></div>Moderat</div>
                      <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--orange)' }}></div>Tinggi</div>
                      <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--red)' }}></div>Kritis</div>
                    </div>
                  </div>

                  {validPoints.length >= 3 && (
                    <div className="card">
                      <div className="card-title">Statistik Elevasi Real</div>
                      <div className="stats-grid">
                        <div className="stat-card"><div className="stat-value">{validPoints.length}</div><div className="stat-label">Titik Valid</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--green)' }}>{minElev.toFixed(0)}m</div><div className="stat-label">Min</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--red)' }}>{maxElev.toFixed(0)}m</div><div className="stat-label">Max</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--orange)' }}>{analysisResults.length}</div><div className="stat-label">Anomali</div></div>
                      </div>
                    </div>
                  )}
                </>)}

                {/* ===== PROFILE TAB ===== */}
                {activeTab === 'profile' && (<>
                  <div className="card">
                    <div className="card-title">Profil Elevasi</div>
                    <p className="card-desc">Klik 2 titik pada peta untuk membuat garis profil. Elevasi real di-fetch dari API.</p>
                    <button className={`btn ${profileMode ? 'btn-danger' : 'btn-primary'} btn-block`} onClick={() => { setProfileMode(!profileMode); setProfilePoints([]); setProfileData(null) }}>
                      {profileMode ? '✕ Batalkan' : ' Mulai Gambar Profil'}
                    </button>
                    {profileMode && <p style={{ fontSize: 10, color: 'var(--yellow)', marginTop: 6 }}>Klik {2 - profilePoints.length} titik lagi di peta</p>}
                    {profilePoints.length >= 2 && !profileMode && (
                      <button className="btn btn-success btn-block" style={{ marginTop: 6 }} onClick={generateProfile} disabled={profileLoading}>
                        {profileLoading ? '⏳ Mengambil data...' : '📊 Generate Profil'}
                      </button>
                    )}
                  </div>
                  {profileData && (
                    <div className="card">
                      <div className="card-title">Grafik Elevasi</div>
                      <ElevationProfileChart profile={profileData} anomalies={analysisResults} />
                      <div className="stats-grid" style={{ marginTop: 8 }}>
                        <div className="stat-card"><div className="stat-value">{(profileData[profileData.length-1].distance/1000).toFixed(1)}km</div><div className="stat-label">Jarak</div></div>
                        <div className="stat-card"><div className="stat-value">{Math.max(...profileData.map(p=>p.elevation)).toFixed(0)}m</div><div className="stat-label">Tertinggi</div></div>
                        <div className="stat-card"><div className="stat-value">{Math.min(...profileData.map(p=>p.elevation)).toFixed(0)}m</div><div className="stat-label">Terendah</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--orange)' }}>{(Math.max(...profileData.map(p=>p.elevation))-Math.min(...profileData.map(p=>p.elevation))).toFixed(0)}m</div><div className="stat-label">Relief</div></div>
                      </div>
                    </div>
                  )}
                </>)}

                {/* ===== MINERAL TAB ===== */}
                {activeTab === 'mineral' && (<>
                  <div className="card">
                    <div className="card-title">Tandai Mineral / Logam</div>
                    <p className="card-desc">Klik peta untuk menandai. Info batuan & metode deteksi otomatis muncul.</p>
                    <div className="form-group"><label>Jenis</label>
                      <div className="mineral-grid">
                        {Object.entries(MINERAL_TYPES).map(([k, v]) => (
                          <button key={k} className={`mineral-btn ${selectedMineral===k?'active':''}`} onClick={() => setSelectedMineral(k)}>{v.emoji} {v.label}</button>
                        ))}
                      </div>
                    </div>
                    {MINERAL_METHODS[selectedMineral] && (
                      <div className="action-guide">
                        <div className="guide-title">Metode Deteksi: {MINERAL_TYPES[selectedMineral].label}</div>
                        <div className="guide-text">{MINERAL_METHODS[selectedMineral]}</div>
                      </div>
                    )}
                    <div className="form-row" style={{ marginTop: 10 }}>
                      <div className="form-group"><label>Kedalaman (m)</label><input type="number" value={markerDepth} onChange={e => setMarkerDepth(Number(e.target.value))} /></div>
                      <div className="form-group"><label>Confidence (%)</label><input type="number" min="0" max="100" value={markerConfidence} onChange={e => setMarkerConfidence(Number(e.target.value))} /></div>
                    </div>
                    <div className="form-group"><label>Catatan</label><input type="text" value={markerNotes} onChange={e => setMarkerNotes(e.target.value)} placeholder="Deskripsi..." /></div>
                  </div>

                  <div className="card">
                    <div className="card-title">Overlay Peta</div>
                    <div className="toggle-row"><label>Deposit Mineral (USGS)</label><label className="toggle-switch"><input type="checkbox" checked={showMineralWMS} onChange={() => setShowMineralWMS(!showMineralWMS)} /><span className="toggle-slider"></span></label></div>
                    <div className="toggle-row"><label>Peta Geologi</label><label className="toggle-switch"><input type="checkbox" checked={showGeoWMS} onChange={() => setShowGeoWMS(!showGeoWMS)} /><span className="toggle-slider"></span></label></div>
                  </div>

                  <div className="card">
                    <div className="card-title">Gambar Zona Eksplorasi</div>
                    <button className={`btn ${drawingPolygon ? 'btn-danger' : 'btn-primary'} btn-block`} onClick={() => { drawingPolygon ? finishPolygon() : (setDrawingPolygon(true), setPolygonPoints([])) }}>
                      {drawingPolygon ? '✓ Selesai' : '✏️ Gambar Zona'}
                    </button>
                  </div>

                  <div className="card">
                    <div className="card-title">Filter Tampilan</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {Object.entries(MINERAL_TYPES).map(([k, v]) => (
                        <button key={k} className={`btn btn-sm ${filterTypes.includes(k)?'btn-primary':'btn-ghost'}`} onClick={() => setFilterTypes(prev => prev.includes(k)?prev.filter(x=>x!==k):[...prev,k])}>{v.emoji}</button>
                      ))}
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-title">Marker ({mineralMarkers.length})</div>
                    <div className="point-list">
                      {mineralMarkers.slice(-15).reverse().map(m => (
                        <div key={m.id} className="point-item" onClick={() => { mapRef.current?.setView([m.lat, m.lng], 16); analyzePoint(m.lat, m.lng) }}>
                          <div><div className="label">{MINERAL_TYPES[m.type]?.emoji} {MINERAL_TYPES[m.type]?.label}</div><div className="coords">{m.lat.toFixed(5)}, {m.lng.toFixed(5)}</div></div>
                          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{m.depth}m · {m.confidence}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>)}

                {/* ===== SURVEY TAB ===== */}
                {activeTab === 'survey' && (<>
                  <div className="card">
                    <div className="card-title">Auto Survey</div>
                    <p className="card-desc">Pemindaian grid otomatis. Setiap titik di-fetch elevasi REAL dari Open-Meteo, lalu dianalisis anomali.</p>
                    <div className="form-group"><label>Jarak Grid (meter)</label><input type="number" value={gridSpacing} onChange={e => setGridSpacing(Number(e.target.value))} min="50" max="1000" /></div>
                    <button className={`btn ${surveyRunning?'btn-danger':'btn-success'} btn-block`} onClick={runSurvey} disabled={surveyRunning}>
                      {surveyRunning ? ' Memindai...' : '📡 Mulai Survey'}
                    </button>
                  </div>

                  {surveyRunning && (
                    <div className="card">
                      <div className="card-title">Progress</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span>Scanning...</span><span>{surveyProgress}%</span></div>
                      <div className="progress-bar"><div className="progress-fill" style={{ width: `${surveyProgress}%` }}></div></div>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>{surveyPoints.filter(p=>!p.elevLoading).length}/{surveyPoints.length} titik · Data: Open-Meteo API</p>
                    </div>
                  )}

                  {surveyPoints.length > 0 && !surveyRunning && (
                    <div className="card">
                      <div className="card-title">Hasil Survey</div>
                      <div className="stats-grid">
                        <div className="stat-card"><div className="stat-value">{surveyPoints.length}</div><div className="stat-label">Titik</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--red)' }}>{surveyAnomalies.length}</div><div className="stat-label">Anomali</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--green)' }}>{surveyPoints.filter(p=>p.elevation!=null).length>0?Math.min(...surveyPoints.filter(p=>p.elevation!=null).map(p=>p.elevation)).toFixed(0):0}m</div><div className="stat-label">Min</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--red)' }}>{surveyPoints.filter(p=>p.elevation!=null).length>0?Math.max(...surveyPoints.filter(p=>p.elevation!=null).map(p=>p.elevation)).toFixed(0):0}m</div><div className="stat-label">Max</div></div>
                      </div>
                      {surveyAnomalies.length > 0 && (
                        <div className="action-guide" style={{ marginTop: 10 }}>
                          <div className="guide-title">{surveyAnomalies.length} Anomali Ditemukan</div>
                          <div className="guide-text">Titik dengan skor tinggi menunjukkan depresi atau anomali terrain. Klik pada peta untuk detail.</div>
                        </div>
                      )}
                      <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={() => { setPoints(prev => [...prev, ...surveyPoints]); setSurveyPoints([]) }}>📥 Tambahkan ke Data</button>
                    </div>
                  )}
                </>)}

                {/* ===== EXPORT TAB ===== */}
                {activeTab === 'export' && (<>
                  <div className="card">
                    <div className="card-title">Export Data</div>
                    <div className="export-grid">
                      <button className="btn btn-primary" onClick={() => exportAs('geojson')}>📄 GeoJSON</button>
                      <button className="btn btn-primary" onClick={() => exportAs('kml')}> KML</button>
                      <button className="btn btn-primary" onClick={() => exportAs('gpx')}>📍 GPX</button>
                      <button className="btn btn-primary" onClick={() => exportAs('csv')}>📊 CSV</button>
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-title">Proyek</div>
                    <div className="export-grid">
                      <button className="btn btn-success" onClick={saveProject}>💾 Simpan</button>
                      <button className="btn btn-warning" onClick={loadProject}>📂 Muat</button>
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-title">Ringkasan</div>
                    <div className="stats-grid">
                      <div className="stat-card"><div className="stat-value">{points.length}</div><div className="stat-label">Titik GPS</div></div>
                      <div className="stat-card"><div className="stat-value">{mineralMarkers.length}</div><div className="stat-label">Marker</div></div>
                      <div className="stat-card"><div className="stat-value">{analysisResults.length}</div><div className="stat-label">Anomali</div></div>
                      <div className="stat-card"><div className="stat-value">{polygons.length}</div><div className="stat-label">Zona</div></div>
                    </div>
                  </div>
                </>)}
              </div>
            </>
          )}
        </div>

        {/* ===== MAP ===== */}
        <div className="map-container">
          <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={14} zoomControl ref={mapRef} style={{ height: '100%', width: '100%' }}>
            <LayersControl position="topright">
              {Object.entries(TILE_LAYERS).map(([k, l]) => (
                <LayersControl.BaseLayer key={k} checked={k==='satellite'} name={l.name}>
                  <TileLayer url={l.url} attribution={k==='street'?'&copy; OpenStreetMap':''} />
                </LayersControl.BaseLayer>
              ))}
            </LayersControl>
            {showMineralWMS && <WMSTileLayer url="https://mrdata.usgs.gov/services/mrds" layers="mrds" format="image/png" transparent opacity={0.7} attribution="USGS MRDS" />}
            {showGeoWMS && <WMSTileLayer url="https://mrdata.usgs.gov/services/sgmc" layers="sgmc2_c" format="image/png" transparent opacity={0.4} attribution="USGS SGMC" />}
            <MapClickHandler onMapClick={handleMapClick} onMapMove={c => setMapCenter({ lat: c.lat, lng: c.lng })} />
            <BoundsFitter points={points} />

            {profilePoints.length >= 2 && <Polyline positions={profilePoints} pathOptions={{ color: '#58a6ff', weight: 3, dashArray: '8,4' }} />}
            {profilePoints.map((p, i) => <CircleMarker key={`pp${i}`} center={p} radius={6} pathOptions={{ color: '#58a6ff', fillColor: '#58a6ff', fillOpacity: 1 }} />)}

            {points.map(p => (
              <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={5}
                pathOptions={{ color: p.elevLoading ? 'var(--yellow)' : (p.anomalyScore > 0.4 ? getAnomalyColor(p.anomalyScore) : '#58a6ff'), fillColor: p.elevLoading ? 'var(--yellow)' : (p.anomalyScore > 0.4 ? getAnomalyColor(p.anomalyScore) : '#58a6ff'), fillOpacity: 0.85, weight: p.anomalyScore > 0.6 ? 2 : 1 }}
              >
                <Popup><div style={{ color: '#333', fontSize: 12 }}><strong>{p.label}</strong><br />{p.lat.toFixed(6)}, {p.lng.toFixed(6)}<br />Elevasi: {p.elevation?.toFixed(1) ?? 'Loading...'}m<br /><em style={{ fontSize: 10, color: '#666' }}>Open-Meteo SRTM</em></div></Popup>
              </CircleMarker>
            ))}

            {mineralMarkers.filter(m => filterTypes.includes(m.type)).map(m => (
              <Marker key={m.id} position={[m.lat, m.lng]} icon={createIcon(MINERAL_TYPES[m.type]?.color||'#fff', MINERAL_TYPES[m.type]?.emoji||'?')}>
                <Popup><div style={{ color: '#333', fontSize: 12 }}><strong>{MINERAL_TYPES[m.type]?.emoji} {MINERAL_TYPES[m.type]?.label}</strong><br />Kedalaman: {m.depth}m · Confidence: {m.confidence}%<br />{m.notes && <><em>{m.notes}</em><br /></>}{MINERAL_METHODS[m.type] && <><br /><strong>Metode:</strong> {MINERAL_METHODS[m.type]}</>}</div></Popup>
              </Marker>
            ))}

            {surveyPoints.map((p, i) => (
              <CircleMarker key={`sp${i}`} center={[p.lat, p.lng]} radius={4}
                pathOptions={{ color: p.anomalyScore > 0 ? getAnomalyColor(p.anomalyScore) : '#58a6ff', fillColor: p.anomalyScore > 0 ? getAnomalyColor(p.anomalyScore) : '#58a6ff', fillOpacity: 0.7 }}
              >
                <Popup><div style={{ color: '#333', fontSize: 12 }}><strong>Survey</strong><br />Elevasi: {p.elevation?.toFixed(1) ?? '?'}m<br />{p.anomalyScore > 0 && <>Anomali: {(p.anomalyScore*100).toFixed(0)}% · {p.anomalyType}<br /></>}<em style={{ fontSize: 10 }}>Open-Meteo SRTM</em></div></Popup>
              </CircleMarker>
            ))}

            {polygons.map(poly => <Polygon key={poly.id} positions={poly.points} pathOptions={{ color: '#f0883e', fillOpacity: 0.12, weight: 2 }}><Popup><strong>{poly.label}</strong></Popup></Polygon>)}
            {drawingPolygon && polygonPoints.length >= 2 && <Polyline positions={polygonPoints} pathOptions={{ color: '#d29922', dashArray: '5,5', weight: 2 }} />}

            {showAnomalies && analysisResults.map((a, i) => (
              <CircleMarker key={`an${i}`} center={[a.lat, a.lng]} radius={a.anomalyScore * 25 + 8}
                pathOptions={{ color: getAnomalyColor(a.anomalyScore), fillColor: getAnomalyColor(a.anomalyScore), fillOpacity: 0.15, weight: 2 }}
              >
                <Popup><div style={{ color: '#333', fontSize: 12 }}><strong>Anomali: {getAnomalyLabel(a.anomalyScore)}</strong><br />Tipe: {a.anomalyType}<br />Score: {(a.anomalyScore*100).toFixed(0)}%<br />Elevasi: {a.elevation?.toFixed(1)}m · Diff: {a.elevationDiff}m</div></Popup>
              </CircleMarker>
            ))}

            {showHeatmap && validPoints.map((p, i) => {
              const ratio = maxElev > minElev ? (p.elevation - minElev) / (maxElev - minElev) : 0.5
              const color = ratio > 0.7 ? 'var(--red)' : ratio > 0.4 ? 'var(--yellow)' : 'var(--green)'
              return <CircleMarker key={`h${i}`} center={[p.lat, p.lng]} radius={18} pathOptions={{ color: 'transparent', fillColor: color, fillOpacity: 0.2 }} />
            })}
          </MapContainer>

          <div className="map-overlay">
            <button className={`btn btn-sm ${showHeatmap?'active':''}`} onClick={() => setShowHeatmap(!showHeatmap)}>Heatmap</button>
            <button className={`btn btn-sm ${showAnomalies?'active':''}`} onClick={() => setShowAnomalies(!showAnomalies)}>Anomali</button>
            <button className="btn btn-sm" onClick={() => setShowHelp(true)}>Bantuan</button>
          </div>

          <div className="coord-display">
            {mapCenter.lat.toFixed(5)}, {mapCenter.lng.toFixed(5)} · Elevasi: Open-Meteo SRTM · Geologi: Macrostrat/USGS
          </div>
        </div>
      </div>
    </>
  )
}
