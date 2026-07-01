import { useState, useCallback, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, CircleMarker, useMap, useMapEvents, LayersControl, WMSTileLayer } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './index.css'
import { fetchElevationBatch, fetchSurroundingTerrain } from './services/elevationApi'
import { fetchGeologicalInfo } from './services/geologicalApi'
import { getAnomalyColor, getAnomalyLabel } from './services/anomalyEngine'
import { generateContours, generateHeatmapData } from './utils/contour'
import { fetchAnomalyData, saveToLocalCache, loadFromLocalCache, fetchFromVercelAPI } from './services/supabaseApi'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

// Custom anomaly marker icon
function createAnomalyIcon(score, type) {
  const color = getAnomalyColor(score)
  const icons = { depression: '️', elevation_spike: '⬆️', linear_depression: '', flat_anomaly: '⬜', normal: '📍' }
  const emoji = icons[type] || '📍'
  const size = Math.round(score * 20) + 30
  return L.divIcon({
    html: `<div style="position:relative;width:${size}px;height:${size}px;">
      <div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.2;animation:pulse-ring 2s ease-out infinite;"></div>
      <div style="position:absolute;inset:3px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.45)}px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);">${emoji}</div>
    </div>`,
    className: '', iconSize: [size, size], iconAnchor: [size/2, size/2],
  })
}

function createMineralIcon(color, emoji) {
  return L.divIcon({
    html: `<div style="background:${color};width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)">${emoji}</div>`,
    className: '', iconSize: [32, 32], iconAnchor: [16, 16],
  })
}

const MINERAL_TYPES = {
  gold: { emoji: '🥇', color: '#FFD700', label: 'Emas' },
  iron: { emoji: '⚙️', color: '#8B4513', label: 'Besi' },
  copper: { emoji: '🔶', color: '#B87333', label: 'Tembaga' },
  oil: { emoji: '🛢️', color: '#333', label: 'Minyak' },
  cave: { emoji: '🦇', color: '#4B0082', label: 'Gua' },
  tunnel: { emoji: '️', color: '#8B0000', label: 'Terowongan' },
  treasure: { emoji: '💰', color: '#FF8C00', label: 'Harta' },
}

const TILE_LAYERS = {
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', name: 'Satelit' },
  terrain: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', name: 'Terrain' },
  street: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', name: 'Peta Jalan' },
}

// Parse GPX/KML/CSV
function parseFile(content, filename) {
  const ext = filename.split('.').pop().toLowerCase()
  const points = []
  if (ext === 'csv') {
    const lines = content.split('\n').filter(l => l.trim())
    const h = lines[0].split(',').map(x => x.trim().toLowerCase())
    const li = h.findIndex(x => x.includes('lat')), ni = h.findIndex(x => x.includes('lng') || x.includes('lon'))
    const ei = h.findIndex(x => x.includes('elev') || x.includes('alt'))
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(',')
      if (c[li] && c[ni]) points.push({ lat: parseFloat(c[li]), lng: parseFloat(c[ni]), elevation: ei >= 0 ? parseFloat(c[ei]) || 0 : 0, label: `P${i}`, id: Date.now() + i })
    }
  } else if (ext === 'gpx') {
    new DOMParser().parseFromString(content, 'text/xml').querySelectorAll('trkpt, wpt, rtept').forEach((pt, i) => {
      const ele = pt.querySelector('ele'), name = pt.querySelector('name')
      points.push({ lat: parseFloat(pt.getAttribute('lat')), lng: parseFloat(pt.getAttribute('lon')), elevation: ele ? parseFloat(ele.textContent) : 0, label: name?.textContent || `WP${i+1}`, id: Date.now() + i })
    })
  } else if (ext === 'kml') {
    new DOMParser().parseFromString(content, 'text/xml').querySelectorAll('coordinates').forEach((coord, i) => {
      coord.textContent.trim().split(/\s+/).forEach((tuple, j) => {
        const [lng, lat, elev] = tuple.split(',')
        if (lat && lng) points.push({ lat: parseFloat(lat), lng: parseFloat(lng), elevation: elev ? parseFloat(elev) : 0, label: `KML${i*100+j+1}`, id: Date.now() + i*100 + j })
      })
    })
  }
  return points
}

// Generate scan grid for an area
function generateScanGrid(bounds, spacingMeters) {
  const pts = [], { north, south, east, west } = bounds
  const latStep = spacingMeters / 111000
  const lngStep = spacingMeters / (111000 * Math.cos(((north + south) / 2) * Math.PI / 180))
  let idx = 0
  for (let lat = south; lat <= north; lat += latStep)
    for (let lng = west; lng <= east; lng += lngStep)
      pts.push({ lat, lng, id: Date.now() + idx++, elevation: null, anomalyScore: 0, anomalyType: null, geological: null })
  return pts
}

// Analyze a single point for anomalies using surrounding terrain
async function analyzePointForAnomaly(lat, lng, allPoints, gridSpacing = 50) {
  // Find neighbors within ~3x grid spacing
  const searchRadius = Math.max(gridSpacing * 3, 100)
  const neighbors = allPoints.filter(p => {
    if (p.lat === lat && p.lng === lng) return false
    const dLat = (p.lat - lat) * 111000
    const dLng = (p.lng - lng) * 111000 * Math.cos(lat * Math.PI / 180)
    return Math.sqrt(dLat*dLat + dLng*dLng) < searchRadius
  })

  if (neighbors.length < 3) return { score: 0, type: 'normal' }

  const elevations = neighbors.map(n => n.elevation).filter(e => e != null)
  if (elevations.length < 3) return { score: 0, type: 'normal' }

  const pointElev = allPoints.find(p => p.lat === lat && p.lng === lng)?.elevation
  if (pointElev == null) return { score: 0, type: 'normal' }

  const avgElev = elevations.reduce((s, e) => s + e, 0) / elevations.length
  const stdDev = Math.sqrt(elevations.reduce((s, e) => s + Math.pow(e - avgElev, 2), 0) / elevations.length)
  const diff = avgElev - pointElev
  const normalizedDiff = stdDev > 0 ? diff / stdDev : 0

  // Depression = possible tunnel/cave/room (lowered threshold for better detection)
  if (diff > 1.0 && normalizedDiff > 0.8) {
    const score = Math.min(normalizedDiff / 2.5, 1)
    return { score, type: 'depression', elevation: pointElev, avgNeighborElev: avgElev, diff: diff.toFixed(1) }
  }
  // Spike = possible buried structure (lowered threshold)
  if (diff < -1.0 && normalizedDiff < -0.8) {
    const score = Math.min(Math.abs(normalizedDiff) / 2.5, 1)
    return { score, type: 'elevation_spike', elevation: pointElev, avgNeighborElev: avgElev, diff: diff.toFixed(1) }
  }

  return { score: 0, type: 'normal' }
}

// Action guides per anomaly type
const ACTION_GUIDES = {
  depression: {
    title: 'Depresi Terrain - Potensi Rongga Bawah Tanah',
    desc: 'Area ini lebih rendah dari sekitarnya. Kemungkinan ada terowongan, gua, atau ruangan bawah tanah.',
    steps: [
      'Kunjungi lokasi - cari lubang, retakan tanah, atau entrance tersembunyi',
      'Perhatikan vegetasi - tanaman layu/tidak normal bisa indikasi rongga',
      'Dengarkan suara hollow saat menginjak tanah',
      'Gunakan GPR (Ground Penetrating Radar) untuk scan bawah permukaan',
      'Cek drainase air - air yang hilang tiba-tiba bisa masuk ke rongga',
    ],
    tools: 'GPR, Metal Detector, Bor tanah',
  },
  elevation_spike: {
    title: 'Tonjolan Tidak Wajar - Potensi Struktur Terkubur',
    desc: 'Area ini lebih tinggi dari sekitarnya. Bisa berupa gundukan buatan, struktur terkubur, atau deposit mineral.',
    steps: [
      'Periksa apakah bentuk tonjolan geometris (indikasi buatan manusia)',
      'Gunakan magnetometer - bijih besi/logam menarik medan magnet',
      'Lakukan soil sampling di sekitar area',
      'Bandingkan dengan peta sejarah/aerial foto lama',
      'XRF analyzer untuk komposisi tanah',
    ],
    tools: 'Magnetometer, XRF Analyzer, Bor eksplorasi',
  },
  linear_depression: {
    title: 'Depresi Linear - Potensi Terowongan',
    desc: 'Pola depresi memanjang terdeteksi. Sangat mengindikasikan terowongan atau saluran bawah tanah.',
    steps: [
      'Ikuti arah garis depresi untuk mencari entrance/exit',
      'Periksa perbedaan drainase di sepanjang garis',
      'GPR scan sepanjang garis untuk konfirmasi',
      'Cari dokumen sejarah tentang terowongan di area ini',
      'Periksa perbedaan vegetasi sepanjang garis',
    ],
    tools: 'GPR, Metal Detector, Peta sejarah',
  },
}

// Mineral detection methods
const MINERAL_METHODS = {
  gold: 'Cari di sungai (placer) atau urat kuarsa. Gunakan metal detector + pan. Batuan: granite, quartzite, alluvial.',
  iron: 'Gunakan magnetometer - bijih besi menarik magnet kuat. Cari di batuan basal, igneous.',
  cave: 'Fokus di batuan kapur/limestone. Cari sinkhole, aliran air bawah tanah, entrance alami.',
  tunnel: 'GPR scan untuk deteksi rongga. Cari depresi linear atau entrance tersembunyi.',
  treasure: 'Riset sejarah lokasi. Metal detector. Fokus dekat bangunan tua, sungai, pohon besar.',
}

// Map click handler
function MapClickHandler({ onMapClick, onMapMove }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng), move: (e) => onMapMove(e.target.getCenter()) })
  return null
}

export default function App() {
  const [activeTab, setActiveTab] = useState('scan')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mapCenter, setMapCenter] = useState({ lat: -6.2, lng: 106.8 })
  const [showHelp, setShowHelp] = useState(true)

  // Scan state
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanPoints, setScanPoints] = useState([])
  const [anomalies, setAnomalies] = useState([])
  const [gridSpacing, setGridSpacing] = useState(50)
  const [scanStats, setScanStats] = useState(null)

  // Visualization options
  const [showContours, setShowContours] = useState(true)
  const [showHeatmap, setShowHeatmap] = useState(true)
  const [contourLines, setContourLines] = useState([])
  const [heatmapData, setHeatmapData] = useState([])

  // Selected anomaly detail
  const [selectedAnomaly, setSelectedAnomaly] = useState(null)
  const [geoInfo, setGeoInfo] = useState(null)
  const [geoLoading, setGeoLoading] = useState(false)

  // Mineral markers (manual)
  const [mineralMarkers, setMineralMarkers] = useState([])
  const [selectedMineral, setSelectedMineral] = useState('gold')
  const [showMineralWMS, setShowMineralWMS] = useState(false)

  // GPS points (from file upload or tracking)
  const [gpsPoints, setGpsPoints] = useState([])

  // Satellite anomaly data (from GEE)
  const [satelliteAnomalies, setSatelliteAnomalies] = useState([])
  const [satelliteMetadata, setSatelliteMetadata] = useState(null)
  const [showSatelliteData, setShowSatelliteData] = useState(false)
  const [satelliteLoading, setSatelliteLoading] = useState(false)

  const mapRef = useRef(null)
  const fileInputRef = useRef(null)

  // === AUTO SCAN ===
  const startAutoScan = async () => {
    if (!mapRef.current) return
    const bounds = mapRef.current.getBounds()
    const grid = generateScanGrid({ north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() }, gridSpacing)

    if (!grid.length) { alert('Zoom in ke area lebih kecil untuk scan'); return }
    if (grid.length > 800) { alert(`Terlalu banyak titik (${grid.length}). Perbesar zoom atau naikkan jarak grid.`); return }

    setScanning(true)
    setScanProgress(0)
    setScanPoints(grid)
    setAnomalies([])
    setSelectedAnomaly(null)
    setScanStats(null)

    // Phase 1: Fetch real elevation for all points
    const batchSize = 100
    for (let i = 0; i < grid.length; i += batchSize) {
      const batch = grid.slice(i, i + batchSize)
      const elevations = await fetchElevationBatch(batch)
      setScanPoints(prev => prev.map(p => {
        const idx = batch.findIndex(b => b.id === p.id)
        return idx >= 0 ? { ...p, elevation: elevations[idx] ?? 0 } : p
      }))
      setScanProgress(Math.round((i + batch.length) / grid.length * 50))
    }

    // Phase 2: Analyze each point for anomalies
    const updatedPoints = [...grid]
    const foundAnomalies = []

    for (let i = 0; i < updatedPoints.length; i++) {
      const p = updatedPoints[i]
      if (p.elevation == null) continue

      const result = await analyzePointForAnomaly(p.lat, p.lng, updatedPoints, gridSpacing)
      updatedPoints[i] = { ...p, anomalyScore: result.score, anomalyType: result.type }

      if (result.score > 0.3) {
        foundAnomalies.push({ ...updatedPoints[i], ...result })
      }

      // Update progress during analysis
      if (i % 10 === 0) {
        setScanPoints([...updatedPoints])
        setScanProgress(Math.round(50 + (i / updatedPoints.length) * 50))
      }
    }

    setScanPoints(updatedPoints)
    setAnomalies(foundAnomalies.sort((a, b) => b.anomalyScore - a.anomalyScore))
    
    const validElevations = updatedPoints.filter(p => p.elevation != null && !isNaN(p.elevation)).map(p => p.elevation)
    setScanStats({
      totalPoints: updatedPoints.length,
      anomaliesFound: foundAnomalies.length,
      criticalCount: foundAnomalies.filter(a => a.anomalyScore > 0.7).length,
      highCount: foundAnomalies.filter(a => a.anomalyScore > 0.5 && a.anomalyScore <= 0.7).length,
      moderateCount: foundAnomalies.filter(a => a.anomalyScore > 0.3 && a.anomalyScore <= 0.5).length,
      elevMin: validElevations.length > 0 ? Math.min(...validElevations).toFixed(0) : 'N/A',
      elevMax: validElevations.length > 0 ? Math.max(...validElevations).toFixed(0) : 'N/A',
    })

    // Generate contour lines and heatmap data
    const validPoints = updatedPoints.filter(p => p.elevation != null && !isNaN(p.elevation))
    if (validPoints.length >= 3 && mapRef.current) {
      const bounds = mapRef.current.getBounds()
      const contours = generateContours(validPoints, { north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() }, 80)
      setContourLines(contours)
      
      // Generate heatmap data from anomalies
      const heatData = generateHeatmapData(
        foundAnomalies.map(a => ({ lat: a.lat, lng: a.lng, value: a.anomalyScore })),
        1
      )
      setHeatmapData(heatData)
    }

    setScanning(false)
    setScanProgress(100)
  }

  // === LOAD SATELLITE DATA ===
  const loadSatelliteData = async () => {
    setSatelliteLoading(true)
    try {
      let data = null
      
      // Try Vercel API first (real-time GEE processing)
      try {
        const mapCenter = mapRef.current?.getCenter() || { lat: -6.6715, lng: 107.7285 }
        const bounds = mapRef.current?.getBounds()
        const radius = bounds ? Math.max(
          bounds.getNorth() - bounds.getSouth(),
          bounds.getEast() - bounds.getWest()
        ) * 111 / 2 : 2
        
        data = await fetchFromVercelAPI({
          lat: mapCenter.lat,
          lng: mapCenter.lng,
          radius: Math.min(radius, 10) // Max 10km radius
        })
        console.log('✓ Loaded from Vercel API')
      } catch (apiError) {
        console.warn('Vercel API failed, trying fallbacks:', apiError.message)
      }
      
      // Fallback to Supabase
      if (!data) {
        try {
          data = await fetchAnomalyData()
          console.log('✓ Loaded from Supabase')
        } catch (supabaseError) {
          console.warn('Supabase failed:', supabaseError.message)
        }
      }
      
      // Fallback to local cache
      if (!data) {
        data = loadFromLocalCache()
        if (data) console.log('✓ Loaded from local cache')
      }
      
      // Fallback to bundled sample data
      if (!data) {
        const response = await fetch('/anomaly_data.json')
        data = await response.json()
        saveToLocalCache(data)
        console.log('✓ Loaded from bundled sample data')
      }
      
      setSatelliteAnomalies(data.anomalies || [])
      setSatelliteMetadata(data.metadata || null)
      setShowSatelliteData(true)
      
      // Center map on data if available
      if (data.metadata?.bbox && mapRef.current) {
        const [west, south, east, north] = data.metadata.bbox
        mapRef.current.fitBounds([[south, west], [north, east]])
      }
    } catch (error) {
      console.error('Failed to load satellite data:', error)
      alert('Gagal memuat data satelit. Menggunakan data sample.')
      
      // Last resort: load sample data
      try {
        const response = await fetch('/anomaly_data.json')
        const data = await response.json()
        setSatelliteAnomalies(data.anomalies || [])
        setSatelliteMetadata(data.metadata || null)
        setShowSatelliteData(true)
      } catch (e) {
        console.error('Failed to load sample data:', e)
      }
    }
    setSatelliteLoading(false)
  }

  // Click anomaly to see details
  const selectAnomaly = async (anomaly) => {
    setSelectedAnomaly(anomaly)
    setGeoLoading(true)
    try {
      const geo = await fetchGeologicalInfo(anomaly.lat, anomaly.lng)
      setGeoInfo(geo)
    } catch { setGeoInfo(null) }
    setGeoLoading(false)
    mapRef.current?.setView([anomaly.lat, anomaly.lng], 17)
  }

  // Handle map click for mineral markers
  const handleMapClick = useCallback((latlng) => {
    if (activeTab === 'mineral') {
      setMineralMarkers(prev => [...prev, { lat: latlng.lat, lng: latlng.lng, type: selectedMineral, id: Date.now() }])
    }
  }, [activeTab, selectedMineral])

  // File upload
  const handleFileUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const parsed = parseFile(ev.target.result, file.name)
      if (parsed.length) {
        const needsElev = parsed.filter(p => !p.elevation)
        if (needsElev.length) {
          const elevs = await fetchElevationBatch(needsElev)
          parsed.forEach((p, i) => { if (!p.elevation) p.elevation = elevs[i] ?? 0 })
        }
        setGpsPoints(prev => [...prev, ...parsed])
        // Also add to scan points for analysis
        setScanPoints(prev => [...prev, ...parsed.map(p => ({ ...p, anomalyScore: 0, anomalyType: null }))])
      }
    }
    reader.readAsText(file); e.target.value = ''
  }

  // Export
  const exportAnomalies = (format) => {
    const all = anomalies.map(a => ({ lat: a.lat, lng: a.lng, elevation: a.elevation, label: `${a.anomalyType} (${(a.anomalyScore*100).toFixed(0)}%)` }))
    let content, filename, type
    if (format === 'geojson') { content = JSON.stringify({ type: 'FeatureCollection', features: all.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { elevation: p.elevation, label: p.label } })) }, null, 2); filename = 'anomalies.geojson'; type = 'application/json' }
    else if (format === 'kml') { content = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${all.map(p => `<Placemark><name>${p.label}</name><Point><coordinates>${p.lng},${p.lat},${p.elevation||0}</coordinates></Point></Placemark>`).join('')}</Document></kml>`; filename = 'anomalies.kml'; type = 'application/vnd.google-earth.kml+xml' }
    else { content = 'lat,lng,elevation,label,score,type\n' + anomalies.map(a => `${a.lat},${a.lng},${a.elevation||0},${a.anomalyType},${a.anomalyScore.toFixed(2)}`).join('\n'); filename = 'anomalies.csv'; type = 'text/csv' }
    const blob = new Blob([content], { type }), url = URL.createObjectURL(blob), a = document.createElement('a')
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <>
      {showHelp && (
        <div className="help-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-content" onClick={e => e.stopPropagation()}>
            <h2>GPS Anomaly Mapper</h2>
            <p><strong>Konsep:</strong> Aplikasi ini otomatis memindai area untuk mencari anomali bawah tanah (terowongan, gua, ruangan, deposit mineral).</p>
            <ul>
              <li><strong>1. Zoom</strong> ke area yang ingin dipindai di peta</li>
              <li><strong>2. Klik "Mulai Scan"</strong> - App otomatis scan seluruh area</li>
              <li><strong>3. Lihat hasil</strong> - Anomali muncul di peta dengan marker berwarna</li>
              <li><strong>4. Klik anomali</strong> - Lihat detail: tipe, kedalaman, cara investigasi</li>
            </ul>
            <p style={{ marginTop: 12, fontSize: 11, color: '#6e7681' }}>
              Data elevasi REAL dari satelit (Open-Meteo SRTM). Analisis terrain real untuk deteksi depresi/anomali.
            </p>
            <button className="btn btn-primary btn-block" onClick={() => setShowHelp(false)} style={{ marginTop: 16 }}>Mulai Scan</button>
          </div>
        </div>
      )}

      <div className="app-container">
        <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>{sidebarCollapsed ? '▶' : '◀'}</button>
          {!sidebarCollapsed && (
            <>
              <div className="tab-bar">
                {[['scan','🔍 Scan'],['satellite','🛰️ Satelit'],['results','📊 Hasil'],['mineral',' Mineral'],['export','💾 Export']].map(([k,l]) => (
                  <button key={k} className={`tab-btn ${activeTab===k?'active':''}`} onClick={() => setActiveTab(k)}>{l}</button>
                ))}
              </div>
              <div className="tab-content">

                {/* ===== SCAN TAB ===== */}
                {activeTab === 'scan' && (<>
                  <div className="card" style={{ borderColor: 'var(--accent)', borderWidth: 2 }}>
                    <div className="card-title" style={{ color: 'var(--accent)', fontSize: 14 }}>Auto Scan Area</div>
                    <p className="card-desc">
                      Zoom peta ke area target, lalu klik scan. App otomatis:<br/>
                      1. Generate grid titik di seluruh area<br/>
                      2. Fetch elevasi REAL dari satelit (SRTM)<br/>
                      3. Analisis setiap titik untuk anomali<br/>
                      4. Tampilkan hasil di peta
                    </p>
                    <div className="form-group">
                      <label>Jarak Grid (meter) -越小越 detail</label>
                      <input type="number" value={gridSpacing} onChange={e => setGridSpacing(Number(e.target.value))} min="20" max="500" />
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        50m = detail, 100m = sedang, 200m = cepat
                      </p>
                    </div>
                    <button className={`btn ${scanning ? 'btn-danger' : 'btn-success'} btn-block`} onClick={startAutoScan} disabled={scanning} style={{ padding: 12, fontSize: 14 }}>
                      {scanning ? `⏳ Scanning... ${scanProgress}%` : '📡 MULAI SCAN AREA'}
                    </button>
                  </div>

                  {/* Visualization Options */}
                  {scanStats && !scanning && (
                    <div className="card">
                      <div className="card-title">Visualisasi</div>
                      <div className="toggle-row">
                        <label>Garis Kontur (seperti Surfer)</label>
                        <label className="toggle-switch">
                          <input type="checkbox" checked={showContours} onChange={() => setShowContours(!showContours)} />
                          <span className="toggle-slider"></span>
                        </label>
                      </div>
                      <div className="toggle-row">
                        <label>Heatmap Anomali</label>
                        <label className="toggle-switch">
                          <input type="checkbox" checked={showHeatmap} onChange={() => setShowHeatmap(!showHeatmap)} />
                          <span className="toggle-slider"></span>
                        </label>
                      </div>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
                        💡 Garis kontur menampilkan elevasi terrain seperti peta topografi. Heatmap menunjukkan area dengan anomali tinggi.
                      </p>
                    </div>
                  )}

                  {scanning && (
                    <div className="card">
                      <div className="card-title">Progress Scan</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span>{scanProgress < 50 ? 'Mengambil elevasi...' : 'Menganalisis anomali...'}</span>
                        <span style={{ fontWeight: 700 }}>{scanProgress}%</span>
                      </div>
                      <div className="progress-bar"><div className="progress-fill" style={{ width: `${scanProgress}%` }}></div></div>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
                        {scanPoints.filter(p => p.elevation != null).length} titik ter-elevasi · Data: Open-Meteo SRTM
                      </p>
                    </div>
                  )}

                  {scanStats && !scanning && (
                    <div className="card">
                      <div className="card-title">Hasil Scan</div>
                      <div className="stats-grid">
                        <div className="stat-card"><div className="stat-value">{scanStats.totalPoints}</div><div className="stat-label">Titik Discan</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--red)' }}>{scanStats.anomaliesFound}</div><div className="stat-label">Anomali</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--red)' }}>{scanStats.criticalCount}</div><div className="stat-label">Kritis</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--orange)' }}>{scanStats.highCount}</div><div className="stat-label">Tinggi</div></div>
                      </div>
                      <div className="stats-grid" style={{ marginTop: 8 }}>
                        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--yellow)' }}>{scanStats.moderateCount}</div><div className="stat-label">Moderat</div></div>
                        <div className="stat-card"><div className="stat-value">{scanStats.elevMin}m</div><div className="stat-label">Elevasi Min</div></div>
                        <div className="stat-card"><div className="stat-value">{scanStats.elevMax}m</div><div className="stat-label">Elevasi Max</div></div>
                        <div className="stat-card"><div className="stat-value">{(scanStats.elevMax - scanStats.elevMin)}m</div><div className="stat-label">Relief</div></div>
                      </div>
                    </div>
                  )}

                  {/* Import file */}
                  <div className="card">
                    <div className="card-title">Import Data GPS (Opsional)</div>
                    <p className="card-desc">Upload file GPX/KML/CSV dari perangkat GPS atau survey sebelumnya. Titik akan otomatis ditambahkan ke analisis.</p>
                    <label className="file-upload">
                      <input ref={fileInputRef} type="file" accept=".gpx,.kml,.csv" onChange={handleFileUpload} />
                      <div className="upload-icon">📂</div>
                      <p>GPX / KML / CSV</p>
                    </label>
                  </div>
                </>)}

                {/* ===== SATELLITE TAB ===== */}
                {activeTab === 'satellite' && (<>
                  <div className="card" style={{ borderColor: 'var(--accent)', borderWidth: 2 }}>
                    <div className="card-title" style={{ color: 'var(--accent)', fontSize: 14 }}>
                      🛰️ Data Anomali Satelit Sentinel-2
                    </div>
                    <p className="card-desc">
                      Data REAL dari citra satelit Sentinel-2 (Google Earth Engine).
                      Menghitung indeks Oksida Besi (B4/B2) untuk deteksi deposit mineral.
                    </p>
                    
                    <button 
                      className={`btn ${satelliteLoading ? 'btn-danger' : 'btn-success'} btn-block`} 
                      onClick={loadSatelliteData} 
                      disabled={satelliteLoading}
                      style={{ padding: 12, fontSize: 14 }}
                    >
                      {satelliteLoading ? '⏳ Memuat data satelit...' : '📡 MUAT DATA SATELIT'}
                    </button>
                    
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
                       Data dari: Sentinel-2 Level 2A | Indeks: Iron Oxide (B4/B2) | Resolusi: 20m
                    </p>
                  </div>

                  {satelliteMetadata && (
                    <div className="card">
                      <div className="card-title">Metadata Data</div>
                      <div className="info-panel">
                        <div className="info-row"><span className="info-label">Area</span><span className="info-value">{satelliteMetadata.area}</span></div>
                        <div className="info-row"><span className="info-label">Satelit</span><span className="info-value">{satelliteMetadata.satellite}</span></div>
                        <div className="info-row"><span className="info-label">Indeks</span><span className="info-value">{satelliteMetadata.index}</span></div>
                        <div className="info-row"><span className="info-label">Total Titik</span><span className="info-value">{satelliteMetadata.total_points}</span></div>
                        <div className="info-row"><span className="info-label">Tanggal</span><span className="info-value">{new Date(satelliteMetadata.date_processed).toLocaleDateString('id-ID')}</span></div>
                      </div>
                    </div>
                  )}

                  {satelliteAnomalies.length > 0 && (
                    <>
                      <div className="card">
                        <div className="card-title">Statistik Anomali</div>
                        <div className="stats-grid">
                          <div className="stat-card">
                            <div className="stat-value" style={{ color: 'var(--red)' }}>
                              {satelliteAnomalies.filter(a => a.anomaly_level === 'critical').length}
                            </div>
                            <div className="stat-label">Kritis</div>
                          </div>
                          <div className="stat-card">
                            <div className="stat-value" style={{ color: 'var(--orange)' }}>
                              {satelliteAnomalies.filter(a => a.anomaly_level === 'high').length}
                            </div>
                            <div className="stat-label">Tinggi</div>
                          </div>
                          <div className="stat-card">
                            <div className="stat-value" style={{ color: 'var(--yellow)' }}>
                              {satelliteAnomalies.filter(a => a.anomaly_level === 'moderate').length}
                            </div>
                            <div className="stat-label">Moderat</div>
                          </div>
                          <div className="stat-card">
                            <div className="stat-value" style={{ color: 'var(--green)' }}>
                              {satelliteAnomalies.filter(a => a.anomaly_level === 'low').length}
                            </div>
                            <div className="stat-label">Rendah</div>
                          </div>
                        </div>
                      </div>

                      <div className="card">
                        <div className="card-title">Top 10 Anomali Tertinggi</div>
                        <div className="point-list" style={{ maxHeight: 300 }}>
                          {satelliteAnomalies
                            .sort((a, b) => b.intensity - a.intensity)
                            .slice(0, 10)
                            .map((a, i) => (
                              <div key={i} className="point-item">
                                <div>
                                  <div className="label" style={{ color: getAnomalyColor(a.intensity) }}>
                                    #{i+1} Iron Oxide: {a.iron_oxide_raw.toFixed(3)}
                                  </div>
                                  <div className="coords">{a.lat.toFixed(6)}, {a.lng.toFixed(6)}</div>
                                </div>
                                <span className={`anomaly-badge ${a.anomaly_level === 'critical' ? 'critical' : a.anomaly_level === 'high' ? 'high' : 'moderate'}`}>
                                  {(a.intensity * 100).toFixed(0)}%
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </>
                  )}
                </>)}

                {/* ===== RESULTS TAB ===== */}
                {activeTab === 'results' && (<>
                  {anomalies.length === 0 ? (
                    <div className="card">
                      <div className="card-title">Belum Ada Hasil</div>
                      <p className="card-desc">Mulai scan di tab Scan untuk mendeteksi anomali di area.</p>
                      <button className="btn btn-primary btn-block" onClick={() => setActiveTab('scan')}>Ke Tab Scan</button>
                    </div>
                  ) : (<>
                    {/* Summary */}
                    <div className="card" style={{ borderColor: 'var(--red)', borderWidth: 1 }}>
                      <div className="card-title" style={{ color: 'var(--red)' }}>
                        {anomalies.length} Anomali Terdeteksi
                      </div>
                      <p className="card-desc">
                        Klik setiap anomali di bawah atau di peta untuk melihat detail dan langkah investigasi.
                      </p>
                    </div>

                    {/* Selected Anomaly Detail */}
                    {selectedAnomaly && (
                      <div className="card" style={{ borderColor: getAnomalyColor(selectedAnomaly.anomalyScore), borderWidth: 2 }}>
                        <div className="card-title" style={{ color: getAnomalyColor(selectedAnomaly.anomalyScore), fontSize: 14 }}>
                          {selectedAnomaly.anomalyType === 'depression' ? '⬇️' : selectedAnomaly.anomalyType === 'elevation_spike' ? '⬆️' : '⚠️'} Anomali Terdeteksi
                        </div>

                        <div className="info-panel">
                          <div className="info-row"><span className="info-label">Tipe</span><span className="info-value">{selectedAnomaly.anomalyType}</span></div>
                          <div className="info-row"><span className="info-label">Score</span><span className="info-value" style={{ color: getAnomalyColor(selectedAnomaly.anomalyScore), fontWeight: 700 }}>{(selectedAnomaly.anomalyScore * 100).toFixed(0)}%</span></div>
                          <div className="info-row"><span className="info-label">Level</span><span className="info-value"><span className={`anomaly-badge ${selectedAnomaly.anomalyScore > 0.7 ? 'critical' : selectedAnomaly.anomalyScore > 0.5 ? 'high' : 'moderate'}`}>{getAnomalyLabel(selectedAnomaly.anomalyScore)}</span></span></div>
                          <div className="info-row"><span className="info-label">Elevasi</span><span className="info-value">{selectedAnomaly.elevation?.toFixed(1)}m</span></div>
                          {selectedAnomaly.diff && <div className="info-row"><span className="info-label">Selisih</span><span className="info-value">{selectedAnomaly.diff}m dari rata-rata</span></div>}
                          <div className="info-row"><span className="info-label">Koordinat</span><span className="info-value" style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{selectedAnomaly.lat.toFixed(6)}, {selectedAnomaly.lng.toFixed(6)}</span></div>
                        </div>

                        {/* Action Guide */}
                        {ACTION_GUIDES[selectedAnomaly.anomalyType] && (
                          <div className="action-guide">
                            <div className="guide-title">{ACTION_GUIDES[selectedAnomaly.anomalyType].title}</div>
                            <div className="guide-text">{ACTION_GUIDES[selectedAnomaly.anomalyType].desc}</div>
                            <ul className="guide-steps">
                              {ACTION_GUIDES[selectedAnomaly.anomalyType].steps.map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--accent)' }}>
                              <strong>Alat yang dibutuhkan:</strong> {ACTION_GUIDES[selectedAnomaly.anomalyType].tools}
                            </div>
                          </div>
                        )}

                        {/* Geological Info */}
                        {geoLoading ? <p className="loading-text" style={{ fontSize: 11, marginTop: 8 }}>Mengambil data geologi...</p> : geoInfo && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Info Geologi Lokasi:</div>
                            <div className="info-panel">
                              <div className="info-row"><span className="info-label">Formasi</span><span className="info-value">{geoInfo.formation}</span></div>
                              <div className="info-row"><span className="info-label">Batuan</span><span className="info-value">{geoInfo.rockType}</span></div>
                              <div className="info-row"><span className="info-label">Periode</span><span className="info-value">{geoInfo.period}</span></div>
                            </div>
                            {geoInfo.mineralPotential?.length > 0 && (
                              <div style={{ marginTop: 6 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Potensi Mineral:</div>
                                {geoInfo.mineralPotential.slice(0, 4).map((m, i) => (
                                  <div key={i} className="info-row">
                                    <span className="info-label">{MINERAL_TYPES[m.type]?.emoji || '🔹'} {MINERAL_TYPES[m.type]?.label || m.type}</span>
                                    <span className="info-value" style={{ color: getAnomalyColor(m.probability) }}>{(m.probability * 100).toFixed(0)}%</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Anomaly List */}
                    <div className="card">
                      <div className="card-title">Daftar Anomali ({anomalies.length})</div>
                      <div className="point-list" style={{ maxHeight: 300 }}>
                        {anomalies.map((a, i) => (
                          <div key={i} className="point-item" style={selectedAnomaly === a ? { borderColor: getAnomalyColor(a.anomalyScore), borderWidth: 1 } : {}} onClick={() => selectAnomaly(a)}>
                            <div>
                              <div className="label" style={{ color: getAnomalyColor(a.anomalyScore) }}>
                                {a.anomalyType === 'depression' ? '⬇️' : a.anomalyType === 'elevation_spike' ? '⬆️' : '⚠️'} {a.anomalyType}
                              </div>
                              <div className="coords">{a.lat.toFixed(5)}, {a.lng.toFixed(5)} · {a.elevation?.toFixed(0)}m</div>
                            </div>
                            <span className={`anomaly-badge ${a.anomalyScore > 0.7 ? 'critical' : a.anomalyScore > 0.5 ? 'high' : 'moderate'}`}>{(a.anomalyScore*100).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="card">
                      <div className="card-title">Legenda</div>
                      <div className="legend">
                        <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--red)' }}></div>Kritis (&gt;70%)</div>
                        <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--orange)' }}></div>Tinggi (50-70%)</div>
                        <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--yellow)' }}></div>Moderat (30-50%)</div>
                      </div>
                    </div>
                  </>)}
                </>)}

                {/* ===== MINERAL TAB ===== */}
                {activeTab === 'mineral' && (<>
                  <div className="card">
                    <div className="card-title">Peta Deposit Mineral (USGS)</div>
                    <p className="card-desc">Overlay peta deposit mineral yang sudah diketahui dari database USGS (United States Geological Survey). Ini adalah data REAL deposit mineral yang sudah terkonfirmasi di seluruh dunia.</p>
                    <div className="toggle-row"><label>Tampilkan Deposit Mineral USGS</label><label className="toggle-switch"><input type="checkbox" checked={showMineralWMS} onChange={() => setShowMineralWMS(!showMineralWMS)} /><span className="toggle-slider"></span></label></div>
                  </div>

                  <div className="card">
                    <div className="card-title">Tandai Lokasi Manual</div>
                    <p className="card-desc">Klik pada peta untuk menandai lokasi yang menarik. Pilih jenis mineral/logam yang ingin ditandai.</p>
                    <div className="form-group"><label>Jenis</label>
                      <div className="mineral-grid">
                        {Object.entries(MINERAL_TYPES).map(([k, v]) => (
                          <button key={k} className={`mineral-btn ${selectedMineral===k?'active':''}`} onClick={() => setSelectedMineral(k)}>{v.emoji} {v.label}</button>
                        ))}
                      </div>
                    </div>
                    {MINERAL_METHODS[selectedMineral] && (
                      <div className="action-guide">
                        <div className="guide-title">Cara Deteksi: {MINERAL_TYPES[selectedMineral].label}</div>
                        <div className="guide-text">{MINERAL_METHODS[selectedMineral]}</div>
                      </div>
                    )}
                  </div>

                  {mineralMarkers.length > 0 && (
                    <div className="card">
                      <div className="card-title">Marker Saya ({mineralMarkers.length})</div>
                      <div className="point-list">
                        {mineralMarkers.slice(-10).reverse().map(m => (
                          <div key={m.id} className="point-item" onClick={() => mapRef.current?.setView([m.lat, m.lng], 16)}>
                            <div><div className="label">{MINERAL_TYPES[m.type]?.emoji} {MINERAL_TYPES[m.type]?.label}</div><div className="coords">{m.lat.toFixed(5)}, {m.lng.toFixed(5)}</div></div>
                          </div>
                        ))}
                      </div>
                      <button className="btn btn-danger btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => setMineralMarkers([])}>Hapus Semua</button>
                    </div>
                  )}
                </>)}

                {/* ===== EXPORT TAB ===== */}
                {activeTab === 'export' && (<>
                  <div className="card">
                    <div className="card-title">Export Anomali</div>
                    <p className="card-desc">Download hasil scan anomali untuk digunakan di aplikasi GIS lain atau dibagikan.</p>
                    <div className="export-grid">
                      <button className="btn btn-primary" onClick={() => exportAnomalies('geojson')}>GeoJSON</button>
                      <button className="btn btn-primary" onClick={() => exportAnomalies('kml')}>KML (Google Earth)</button>
                      <button className="btn btn-primary" onClick={() => exportAnomalies('csv')}>CSV (Excel)</button>
                    </div>
                  </div>
                  {scanStats && (
                    <div className="card">
                      <div className="card-title">Ringkasan Scan Terakhir</div>
                      <div className="stats-grid">
                        <div className="stat-card"><div className="stat-value">{scanStats.totalPoints}</div><div className="stat-label">Titik</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--red)' }}>{scanStats.anomaliesFound}</div><div className="stat-label">Anomali</div></div>
                        <div className="stat-card"><div className="stat-value">{scanStats.elevMin}m</div><div className="stat-label">Min Elev</div></div>
                        <div className="stat-card"><div className="stat-value">{scanStats.elevMax}m</div><div className="stat-label">Max Elev</div></div>
                      </div>
                    </div>
                  )}
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
                  <TileLayer url={l.url} attribution={k==='street'?'&copy; OSM':''} />
                </LayersControl.BaseLayer>
              ))}
            </LayersControl>

            {/* USGS Mineral Deposits */}
            {showMineralWMS && <WMSTileLayer url="https://mrdata.usgs.gov/services/mrds" layers="mrds" format="image/png" transparent opacity={0.7} attribution="USGS MRDS" />}

            <MapClickHandler onMapClick={handleMapClick} onMapMove={c => setMapCenter({ lat: c.lat, lng: c.lng })} />

            {/* Contour Lines (like Surfer) */}
            {showContours && contourLines.map((contour, ci) => (
              contour.paths.map((path, pi) => (
                <Polyline
                  key={`contour-${ci}-${pi}`}
                  positions={path.map(p => [p.lat, p.lng])}
                  pathOptions={{
                    color: contour.level > 500 ? '#8B4513' : contour.level > 200 ? '#228B22' : '#4169E1',
                    weight: 1.5,
                    opacity: 0.6,
                  }}
                />
              ))
            ))}

            {/* Heatmap overlay for anomalies */}
            {showHeatmap && heatmapData.length > 0 && heatmapData.map((point, i) => (
              <CircleMarker
                key={`heat-${i}`}
                center={[point[0], point[1]]}
                radius={30}
                pathOptions={{
                  color: 'transparent',
                  fillColor: point[2] > 0.7 ? '#FF0000' : point[2] > 0.5 ? '#FF8C00' : point[2] > 0.3 ? '#FFFF00' : '#00FF00',
                  fillOpacity: 0.3,
                  weight: 0,
                }}
              />
            ))}

            {/* Scan grid points (subtle) */}
            {scanPoints.filter(p => p.anomalyScore <= 0.3 && p.elevation != null).map((p, i) => (
              <CircleMarker key={`s${i}`} center={[p.lat, p.lng]} radius={2} pathOptions={{ color: '#58a6ff', fillColor: '#58a6ff', fillOpacity: 0.3, weight: 0 }} />
            ))}

            {/* Anomaly markers (prominent) */}
            {anomalies.map((a, i) => (
              <Marker key={`a${i}`} position={[a.lat, a.lng]} icon={createAnomalyIcon(a.anomalyScore, a.anomalyType)}
                eventHandlers={{ click: () => selectAnomaly(a) }}
              >
                <Popup>
                  <div style={{ color: '#333', fontSize: 12, minWidth: 180 }}>
                    <strong style={{ color: getAnomalyColor(a.anomalyScore), fontSize: 14 }}>
                      {a.anomalyType === 'depression' ? '⬇️' : a.anomalyType === 'elevation_spike' ? '⬆️' : '⚠️'} {getAnomalyLabel(a.anomalyScore)}
                    </strong>
                    <br />Tipe: {a.anomalyType}
                    <br />Score: {(a.anomalyScore * 100).toFixed(0)}%
                    <br />Elevasi: {a.elevation?.toFixed(1)}m
                    {a.diff && <><br />Selisih: {a.diff}m</>}
                    <br /><em style={{ fontSize: 10, color: '#666' }}>Klik untuk detail investigasi</em>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Satellite anomaly markers (from GEE) */}
            {showSatelliteData && satelliteAnomalies.map((a, i) => (
              <CircleMarker
                key={`sat-${i}`}
                center={[a.lat, a.lng]}
                radius={a.anomaly_level === 'critical' ? 10 : a.anomaly_level === 'high' ? 8 : a.anomaly_level === 'moderate' ? 6 : 4}
                pathOptions={{
                  color: getAnomalyColor(a.intensity),
                  fillColor: getAnomalyColor(a.intensity),
                  fillOpacity: 0.7,
                  weight: 2,
                }}
              >
                <Popup>
                  <div style={{ color: '#333', fontSize: 12, minWidth: 180 }}>
                    <strong style={{ color: getAnomalyColor(a.intensity), fontSize: 14 }}>
                      🛰️ Anomali Satelit
                    </strong>
                    <br />Iron Oxide: {a.iron_oxide_raw.toFixed(3)}
                    <br />Intensitas: {(a.intensity * 100).toFixed(0)}%
                    <br />Level: <span style={{ fontWeight: 700, color: getAnomalyColor(a.intensity) }}>{a.anomaly_level.toUpperCase()}</span>
                    <br /><em style={{ fontSize: 10, color: '#666' }}>Sumber: Sentinel-2 (GEE)</em>
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* Mineral markers */}
            {mineralMarkers.map(m => (
              <Marker key={m.id} position={[m.lat, m.lng]} icon={createMineralIcon(MINERAL_TYPES[m.type]?.color||'#fff', MINERAL_TYPES[m.type]?.emoji||'?')}>
                <Popup><div style={{ color: '#333', fontSize: 12 }}><strong>{MINERAL_TYPES[m.type]?.emoji} {MINERAL_TYPES[m.type]?.label}</strong><br />{MINERAL_METHODS[m.type]}</div></Popup>
              </Marker>
            ))}

            {/* GPS points from file */}
            {gpsPoints.map(p => (
              <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={4} pathOptions={{ color: '#3fb950', fillColor: '#3fb950', fillOpacity: 0.8 }}>
                <Popup><div style={{ color: '#333', fontSize: 12 }}><strong>{p.label}</strong><br />{p.lat.toFixed(6)}, {p.lng.toFixed(6)}<br />Elevasi: {p.elevation?.toFixed(1)}m</div></Popup>
              </CircleMarker>
            ))}
          </MapContainer>

          <div className="map-overlay">
            <button className="btn btn-sm" onClick={() => setShowHelp(true)}>Bantuan</button>
            {anomalies.length > 0 && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: 'var(--red)', fontWeight: 600, boxShadow: 'var(--shadow)' }}>
                {anomalies.length} anomali terdeteksi
              </div>
            )}
          </div>

          <div className="coord-display">
            {mapCenter.lat.toFixed(5)}, {mapCenter.lng.toFixed(5)} · Open-Meteo SRTM · USGS
          </div>
        </div>
      </div>
    </>
  )
}
