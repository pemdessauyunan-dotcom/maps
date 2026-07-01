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
import {
  calculateCombinedMineralScore,
  classifyAnomalyAI,
  analyzeTerrainCurvature,
  calculateCrossSection,
  SATELLITE_INDICES,
} from './services/anomalyEngine_v2'
import {
  saveScanToHistory,
  getScanHistory,
  deleteScanFromHistory,
  exportScanHistory,
  getScanById,
} from './services/scanHistory'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

// Custom anomaly marker icon
function createAnomalyIcon(score, type) {
  const color = getAnomalyColor(score)
  const icons = {
    depression: '⬇️', elevation_spike: '⬆️', linear_depression: '🔄',
    flat_anomaly: '⬜', normal: '📍',
    tunnel: '🚇', gold_deposit: '🥇', iron_deposit: '⚙️',
    cave: '🕳️', cave_karst: '🦇', tunnel_potential: '🚇',
    buried_structure: '🏛️',
  }
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
  tunnel: { emoji: '🚇', color: '#8B0000', label: 'Terowongan' },
  treasure: { emoji: '💰', color: '#FF8C00', label: 'Harta' },
}

const TILE_LAYERS = {
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', name: 'Satelit' },
  terrain: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', name: 'Terrain' },
  street: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', name: 'Peta Jalan' },
}

const CLASSIFICATION_COLORS = {
  gold_deposit: '#FFD700', iron_deposit: '#8B4513', tunnel_potential: '#FF4444',
  cave_karst: '#4B0082', buried_structure: '#FF8C00', unknown: '#666',
}

const CLASSIFICATION_EMOJI = {
  gold_deposit: '🥇', iron_deposit: '⚙️', tunnel_potential: '🚇',
  cave_karst: '🦇', buried_structure: '🏛️', unknown: '❓',
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

  if (diff > 1.0 && normalizedDiff > 0.8) {
    const score = Math.min(normalizedDiff / 2.5, 1)
    return { score, type: 'depression', elevation: pointElev, avgNeighborElev: avgElev, diff: diff.toFixed(1) }
  }
  if (diff < -1.0 && normalizedDiff < -0.8) {
    const score = Math.min(Math.abs(normalizedDiff) / 2.5, 1)
    return { score, type: 'elevation_spike', elevation: pointElev, avgNeighborElev: avgElev, diff: diff.toFixed(1) }
  }

  return { score: 0, type: 'normal' }
}

// Action guides
const ACTION_GUIDES = {
  depression: {
    title: 'Depresi Terrain - Potensi Rongga Bawah Tanah',
    desc: 'Area ini lebih rendah dari sekitarnya. Kemungkinan ada terowongan, gua, atau ruangan bawah tanah.',
    steps: ['Kunjungi lokasi - cari lubang, retakan tanah, atau entrance tersembunyi','Perhatikan vegetasi - tanaman layu/tidak normal bisa indikasi rongga','Dengarkan suara hollow saat menginjak tanah','Gunakan GPR (Ground Penetrating Radar) untuk scan bawah permukaan','Cek drainase air - air yang hilang tiba-tiba bisa masuk ke rongga'],
    tools: 'GPR, Metal Detector, Bor tanah',
  },
  elevation_spike: {
    title: 'Tonjolan Tidak Wajar - Potensi Struktur Terkubur',
    desc: 'Area ini lebih tinggi dari sekitarnya. Bisa berupa gundukan buatan, struktur terkubur, atau deposit mineral.',
    steps: ['Periksa apakah bentuk tonjolan geometris (indikasi buatan manusia)','Gunakan magnetometer - bijih besi/logam menarik medan magnet','Lakukan soil sampling di sekitar area','Bandingkan dengan peta sejarah/aerial foto lama','XRF analyzer untuk komposisi tanah'],
    tools: 'Magnetometer, XRF Analyzer, Bor eksplorasi',
  },
  linear_depression: {
    title: 'Depresi Linear - Potensi Terowongan',
    desc: 'Pola depresi memanjang terdeteksi. Sangat mengindikasikan terowongan atau saluran bawah tanah.',
    steps: ['Ikuti arah garis depresi untuk mencari entrance/exit','Periksa perbedaan drainase di sepanjang garis','GPR scan sepanjang garis untuk konfirmasi','Cari dokumen sejarah tentang terowongan di area ini','Periksa perbedaan vegetasi sepanjang garis'],
    tools: 'GPR, Metal Detector, Peta sejarah',
  },
  tunnel: {
    title: '🚇 TEROWONGAN TERDETEKSI - AI Classification',
    desc: 'Pola linear + vegetasi stress + anomali tanah = probabilitas terowongan tinggi.',
    steps: ['Cari entrance/exit di kedua ujung depresi','GPR scan sepanjang sumbu terowongan','Cek sejarah area - tambang tua, bunker, tunnel','Ukur dengan laser distance meter','Bor verifikasi 2-3m di titik tengah'],
    tools: 'GPR, Metal Detector, Bor tanah, Laser Distance Meter',
  },
  gold_deposit: {
    title: '🥇 DEPOSIT EMAS TERINDIKASI - AI Classification',
    desc: 'Alterasi hidrotermal (clay + iron oxide) tinggi. Zona potensial emas.',
    steps: ['Soil sampling di grid 20x20m','XRF analysis untuk Au, Ag, Cu','Cek urat kuarsa di sekitar','Panning di sungai terdekat','Konsultasi dengan geologis'],
    tools: 'XRF Analyzer, Gold Pan, Soil Auger',
  },
  iron_deposit: {
    title: '⚙️ DEPOSIT BESI TERINDIKASI - AI Classification',
    desc: 'Konsentrasi iron oxide & ferrous minerals tinggi.',
    steps: ['Magnetometer survey di grid 10x10m','Bor tangan 2-5m untuk sample','XRF analysis Fe grade','Estimasi tonase dari luas anomali'],
    tools: 'Magnetometer, Bor tangan, XRF Analyzer',
  },
  cave_karst: {
    title: '🦇 GUA/KARST TERDETEKSI - AI Classification',
    desc: 'Pola circular depression + clay soil = potensi gua karst.',
    steps: ['Cek entrance alami di sekitar','Uji kedalaman dengan batu','Ukur dimensi dengan laser','Cek aliran air bawah tanah','Safety first - gas detector sebelum masuk'],
    tools: 'Laser Distance Meter, Gas Detector, Headlamp, Tali',
  },
}

const MINERAL_METHODS = {
  gold: 'Cari di sungai (placer) atau urat kuarsa. Gunakan metal detector + pan. Batuan: granite, quartzite, alluvial.',
  iron: 'Gunakan magnetometer - bijih besi menarik magnet kuat. Cari di batuan basal, igneous.',
  cave: 'Fokus di batuan kapur/limestone. Cari sinkhole, aliran air bawah tanah, entrance alami.',
  tunnel: 'GPR scan untuk deteksi rongga. Cari depresi linear atau entrance tersembunyi.',
  treasure: 'Riset sejarah lokasi. Metal detector. Fokus dekat bangunan tua, sungai, pohon besar.',
}

// Map click handler
function MapClickHandler({ onMapClick, onMapMove, onCrossSectionClick, profileMode }) {
  const clickCountRef = useRef(0)
  const firstPointRef = useRef(null)
  useMapEvents({
    click: (e) => {
      if (profileMode) {
        clickCountRef.current++
        if (clickCountRef.current === 1) {
          firstPointRef.current = e.latlng
        } else if (clickCountRef.current === 2) {
          onCrossSectionClick(firstPointRef.current, e.latlng)
          clickCountRef.current = 0
          firstPointRef.current = null
        }
      } else {
        onMapClick(e.latlng)
      }
    },
    move: (e) => onMapMove(e.target.getCenter()),
  })
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

  // Visualization
  const [showContours, setShowContours] = useState(true)
  const [showHeatmap, setShowHeatmap] = useState(true)
  const [showCurvature, setShowCurvature] = useState(true)
  const [contourLines, setContourLines] = useState([])
  const [heatmapData, setHeatmapData] = useState([])
  const [curvatureData, setCurvatureData] = useState(null)

  // AI classification
  const [aiClassifications, setAiClassifications] = useState([])
  const [showClassifications, setShowClassifications] = useState(true)

  // Selected anomaly
  const [selectedAnomaly, setSelectedAnomaly] = useState(null)
  const [geoInfo, setGeoInfo] = useState(null)
  const [geoLoading, setGeoLoading] = useState(false)

  // Mineral markers
  const [mineralMarkers, setMineralMarkers] = useState([])
  const [selectedMineral, setSelectedMineral] = useState('gold')
  const [showMineralWMS, setShowMineralWMS] = useState(false)

  // GPS points
  const [gpsPoints, setGpsPoints] = useState([])

  // Satellite anomaly data (v2 multi-index)
  const [satelliteAnomalies, setSatelliteAnomalies] = useState([])
  const [satelliteMetadata, setSatelliteMetadata] = useState(null)
  const [showSatelliteData, setShowSatelliteData] = useState(false)
  const [satelliteLoading, setSatelliteLoading] = useState(false)
  const [showV2Data, setShowV2Data] = useState(false)

  // Profile / Cross-section
  const [profileMode, setProfileMode] = useState(false)
  const [profileStart, setProfileStart] = useState(null)
  const [profileEnd, setProfileEnd] = useState(null)
  const [profileResult, setProfileResult] = useState(null)
  const [selectedIndex, setSelectedIndex] = useState('combined')

  // Scan history
  const [scanHistory, setScanHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)

  const mapRef = useRef(null)
  const fileInputRef = useRef(null)

  // Load scan history on mount
  useEffect(() => {
    setScanHistory(getScanHistory())
  }, [])

  // === AUTO SCAN ===
  const startAutoScan = async () => {
    if (!mapRef.current) return
    const bounds = mapRef.current.getBounds()
    const grid = generateScanGrid({ north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() }, gridSpacing)
    if (!grid.length) { alert('Zoom in ke area lebih kecil untuk scan'); return }
    if (grid.length > 800) { alert(`Terlalu banyak titik (${grid.length}). Perbesar zoom atau naikkan jarak grid.`); return }

    setScanning(true); setScanProgress(0); setScanPoints(grid); setAnomalies([])
    setSelectedAnomaly(null); setScanStats(null); setCurvatureData(null); setAiClassifications([])

    // Phase 1: Fetch elevations
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

    // Phase 2: Analyze anomalies
    const updatedPoints = [...grid]
    const foundAnomalies = []
    for (let i = 0; i < updatedPoints.length; i++) {
      const p = updatedPoints[i]
      if (p.elevation == null) continue
      const result = await analyzePointForAnomaly(p.lat, p.lng, updatedPoints, gridSpacing)
      updatedPoints[i] = { ...p, anomalyScore: result.score, anomalyType: result.type }
      if (result.score > 0.3) foundAnomalies.push({ ...updatedPoints[i], ...result })
      if (i % 10 === 0) {
        setScanPoints([...updatedPoints])
        setScanProgress(Math.round(50 + (i / updatedPoints.length) * 50))
      }
    }

    setScanPoints(updatedPoints)
    setAnomalies(foundAnomalies.sort((a, b) => b.anomalyScore - a.anomalyScore))

    const validElevations = updatedPoints.filter(p => p.elevation != null && !isNaN(p.elevation)).map(p => p.elevation)
    const stats = {
      totalPoints: updatedPoints.length,
      anomaliesFound: foundAnomalies.length,
      criticalCount: foundAnomalies.filter(a => a.anomalyScore > 0.7).length,
      highCount: foundAnomalies.filter(a => a.anomalyScore > 0.5 && a.anomalyScore <= 0.7).length,
      moderateCount: foundAnomalies.filter(a => a.anomalyScore > 0.3 && a.anomalyScore <= 0.5).length,
      elevMin: validElevations.length > 0 ? Math.min(...validElevations).toFixed(0) : 'N/A',
      elevMax: validElevations.length > 0 ? Math.max(...validElevations).toFixed(0) : 'N/A',
    }
    setScanStats(stats)

    // Phase 3: Generate visualizations
    const validPoints = updatedPoints.filter(p => p.elevation != null && !isNaN(p.elevation))
    if (validPoints.length >= 3 && mapRef.current) {
      const b = mapRef.current.getBounds()
      const bb = { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() }
      const contours = generateContours(validPoints, bb, 80)
      setContourLines(contours)
      const heatData = generateHeatmapData(foundAnomalies.map(a => ({ lat: a.lat, lng: a.lng, value: a.anomalyScore })), 1)
      setHeatmapData(heatData)

      // Terrain curvature analysis
      const curvature = analyzeTerrainCurvature(validPoints, bb)
      setCurvatureData(curvature)

      // AI Classification for each anomaly — real terrain-based
            const classifications = foundAnomalies.map(a => {
              // Build real terrain feature from curvature data & elevation neighbors
              const neighbors = validPoints.filter(p => {
                if (p.lat === a.lat && p.lng === a.lng) return false
                const dLat = (p.lat - a.lat) * 111000
                const dLng = (p.lng - a.lng) * 111000 * Math.cos(a.lat * Math.PI / 180)
                return Math.sqrt(dLat*dLat + dLng*dLng) < 200
              })
              const elevs = neighbors.map(n => n.elevation).filter(e => e != null)
              const avgElev = elevs.length > 0 ? elevs.reduce((s, e) => s + e, 0) / elevs.length : 0
              const diffFromAvg = avgElev - (a.elevation || 0)
              const stdDev = elevs.length > 1
                ? Math.sqrt(elevs.reduce((s, e) => s + Math.pow(e - avgElev, 2), 0) / elevs.length)
                : 1

              const terrainFeature = {
                elevations: null,
                slope: a.anomalyScore * 15,
                curvature: curvature?.stats?.avgCurvature || 0.5,
                linearityIndex: diffFromAvg > 2 ? a.anomalyScore * 0.6 : 0,
                circularityIndex: diffFromAvg < -2 ? a.anomalyScore * 0.4 : 0,
                varianceRatio: stdDev > 0 ? Math.min(diffFromAvg / stdDev, 2) : 0,
              }
              // Real satellite data not available for this area — use terrain-only classification
              return classifyAnomalyAI(terrainFeature, {
                combined: a.anomalyScore,
                breakdown: {
                  ironOxide: { normalized: Math.min(Math.max(diffFromAvg / 10, 0), 1) * 0.6 },
                  clayMinerals: { normalized: Math.min(Math.max(a.anomalyScore * 0.8, 0), 1) },
                  ndvi: { normalized: Math.min(Math.max((avgElev - (a.elevation || 0)) / 15, 0), 1) * 0.5 },
                },
              })
            })
      setAiClassifications(classifications)
    }

    setScanning(false)
    setScanProgress(100)

    // Save to history
    const center = mapRef.current.getCenter()
    saveScanToHistory({
      lat: center.lat,
      lng: center.lng,
      zoom: mapRef.current.getZoom(),
      areaName: `${center.lat.toFixed(3)}, ${center.lng.toFixed(3)}`,
      stats,
      anomalies: foundAnomalies,
      gridSpacing,
      curvatureStats: { /* summary */ },
      tunnelLineCount: 0,
    })
    setScanHistory(getScanHistory())
  }

  // === CROSS-SECTION PROFILE ===
  const handleCrossSectionClick = async (start, end) => {
    setProfileStart(start)
    setProfileEnd(end)
    setProfileMode(false)

    // Use scan points for profile
    const validPoints = scanPoints.filter(p => p.elevation != null && !isNaN(p.elevation))
    if (validPoints.length < 3) {
      alert('Lakukan scan area terlebih dahulu untuk membuat profil elevasi.')
      return
    }

    const result = calculateCrossSection(start.lat, start.lng, end.lat, end.lng, validPoints, 60)
    setProfileResult(result)
    setActiveTab('profile')
  }

  // === LOAD SATELLITE DATA (v2) ===
  const loadSatelliteData = async () => {
    setSatelliteLoading(true)
    try {
      // Try loading v2 data first
      const resp = await fetch('/anomaly_data_v2.json')
      if (resp.ok) {
        const data = await resp.json()
        setSatelliteAnomalies(data.anomalies || [])
        setSatelliteMetadata(data.metadata || null)
        setShowSatelliteData(true)
        setShowV2Data(true)
        saveToLocalCache(data)
        console.log('✓ Loaded v2 multi-index satellite data')
      } else {
        // Fallback to v1
        const resp2 = await fetch('/anomaly_data.json')
        const data = await resp2.json()
        setSatelliteAnomalies(data.anomalies || [])
        setSatelliteMetadata(data.metadata || null)
        setShowSatelliteData(true)
        setShowV2Data(false)
      }
    } catch (error) {
      console.error('Failed to load satellite data:', error)
      alert('Gagal memuat data satelit.')
    }
    setSatelliteLoading(false)
  }

  // === SELECT ANOMALY ===
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

  // Map click
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
        setScanPoints(prev => [...prev, ...parsed.map(p => ({ ...p, anomalyScore: 0, anomalyType: null }))])
      }
    }
    reader.readAsText(file); e.target.value = ''
  }

  // Export
  const exportAnomalies = (format) => {
    const all = anomalies.map(a => ({ lat: a.lat, lng: a.lng, elevation: a.elevation, label: `${a.anomalyType} (${(a.anomalyScore*100).toFixed(0)}%)` }))
    let content, filename, type
    if (format === 'geojson') {
      content = JSON.stringify({ type: 'FeatureCollection', features: all.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { elevation: p.elevation, label: p.label } })) }, null, 2)
      filename = 'anomalies.geojson'; type = 'application/json'
    } else if (format === 'kml') {
      content = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${all.map(p => `<Placemark><name>${p.label}</name><Point><coordinates>${p.lng},${p.lat},${p.elevation||0}</coordinates></Point></Placemark>`).join('')}</Document></kml>`
      filename = 'anomalies.kml'; type = 'application/vnd.google-earth.kml+xml'
    } else if (format === 'v2json') {
      content = JSON.stringify({ metadata: { exportedAt: new Date().toISOString(), scanStats, gridSpacing }, anomalies: anomalies.map(a => ({ lat: a.lat, lng: a.lng, anomalyScore: a.anomalyScore, anomalyType: a.anomalyType, elevation: a.elevation })) }, null, 2)
      filename = 'anomalies_v2.json'; type = 'application/json'
    } else {
      content = 'lat,lng,elevation,label,score,type\n' + anomalies.map(a => `${a.lat},${a.lng},${a.elevation||0},${a.anomalyType},${a.anomalyScore.toFixed(2)}`).join('\n')
      filename = 'anomalies.csv'; type = 'text/csv'
    }
    const blob = new Blob([content], { type }), url = URL.createObjectURL(blob), a = document.createElement('a')
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
  }

  // === RENDER: Cross Section Chart (SVG) ===
  const renderProfileChart = () => {
    if (!profileResult) return null
    const { profile, troughs, stats } = profileResult
    const width = 560, height = 200, pad = { top: 20, right: 20, bottom: 35, left: 45 }
    const chartW = width - pad.left - pad.right
    const chartH = height - pad.top - pad.bottom

    const minE = Math.min(...profile.map(p => p.elevation))
    const maxE = Math.max(...profile.map(p => p.elevation))
    const range = maxE - minE || 1
    const maxDist = Math.max(...profile.map(p => p.distance))

    const points = profile.map(p => ({
      x: pad.left + (p.distance / maxDist) * chartW,
      y: pad.top + chartH - ((p.elevation - minE) / range) * chartH,
    }))

    const polyline = points.map(p => `${p.x},${p.y}`).join(' ')

    return (
      <div className="card">
        <div className="card-title">📈 Profil Elevasi Cross-Section</div>
        <div className="info-panel" style={{ fontSize: 11 }}>
          <div className="info-row"><span className="info-label">Start</span><span className="info-value">{profile[0].lat.toFixed(5)}, {profile[0].lng.toFixed(5)}</span></div>
          <div className="info-row"><span className="info-label">End</span><span className="info-value">{profile[profile.length-1].lat.toFixed(5)}, {profile[profile.length-1].lng.toFixed(5)}</span></div>
          <div className="info-row"><span className="info-label">Jarak</span><span className="info-value">{stats.totalDistance}m</span></div>
          <div className="info-row"><span className="info-label">Elevasi</span><span className="info-value">{stats.minElev}m - {stats.maxElev}m (range: {stats.elevRange}m)</span></div>
          <div className="info-row"><span className="info-label">Cekungan</span><span className="info-value">{stats.troughCount} titik (terdalam: {stats.maxDepth}m)</span></div>
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', marginTop: 8, background: '#0d1117', borderRadius: 6 }}>
          {/* Y axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map(t => {
            const y = pad.top + chartH - t * chartH
            const elev = Math.round(minE + t * range)
            return <g key={t}>
              <text x={pad.left - 8} y={y + 3} textAnchor="end" fill="#6e7681" fontSize={9}>{elev}m</text>
              <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#30363d" strokeWidth={0.5} />
            </g>
          })}
          {/* X axis */}
          {[0, 0.25, 0.5, 0.75, 1].map(t => {
            const x = pad.left + t * chartW
            const dist = Math.round(t * maxDist)
            return <text key={t} x={x} y={height - 8} textAnchor="middle" fill="#6e7681" fontSize={9}>{dist}m</text>
          })}
          {/* Labels */}
          <text x={15} y={height/2} textAnchor="middle" fill="#8b949e" fontSize={9} transform={`rotate(-90, 15, ${height/2})`}>Elevasi</text>
          <text x={width/2} y={height - 2} textAnchor="middle" fill="#8b949e" fontSize={9}>Jarak (m)</text>
          {/* Profile line */}
          <polyline points={polyline} fill="none" stroke="#58a6ff" strokeWidth={2} />
          {/* Trough markers */}
          {troughs.map((t, i) => {
            const px = pad.left + (t.distance / maxDist) * chartW
            const py = pad.top + chartH - ((t.elevation - minE) / range) * chartH
            return <g key={i}>
              <circle cx={px} cy={py} r={4} fill="#f85149" stroke="#fff" strokeWidth={1} />
              <text x={px} y={py - 8} textAnchor="middle" fill="#f85149" fontSize={9}>▼ {t.depth.toFixed(0)}m</text>
            </g>
          })}
          {/* Start/End markers */}
          <circle cx={points[0].x} cy={points[0].y} r={3} fill="#3fb950" />
          <circle cx={points[points.length-1].x} cy={points[points.length-1].y} r={3} fill="#f0883e" />
        </svg>

        {troughs.length > 0 && (
          <div className="action-guide" style={{ marginTop: 8 }}>
            <div className="guide-title">🚨 Potensi Terowongan/Gua Terdeteksi</div>
            <div className="guide-text">
              {troughs.length} cekungan signifikan ditemukan pada profil ini. Cekungan terdalam {stats.maxDepth}m di bawah rata-rata terrain. Ini bisa menjadi indikasi:
            </div>
            <ul className="guide-steps">
              <li>Terowongan atau saluran bawah tanah yang runtuh sebagian</li>
              <li>Sinkhole atau entrance gua karst</li>
              <li>Bekas tambang bawah tanah</li>
              <li>Pipa atau infrastruktur bawah tanah besar</li>
            </ul>
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--accent)' }}>
              <strong>Rekomendasi:</strong> GPR scan di titik cekungan terdalam ({troughs[0].lat.toFixed(5)}, {troughs[0].lng.toFixed(5)})
            </div>
          </div>
        )}
      </div>
    )
  }

  // === RENDER: Curvature Map Legend ===
  const renderCurvatureLegend = () => {
    if (!curvatureData) return null
    const { stats, tunnelLines, linearDepressions } = curvatureData
    return (
      <div className="card">
        <div className="card-title">📐 Analisis Kelengkungan Terrain</div>
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-value" style={{ color: 'var(--red)' }}>{stats.linearDepressionCount}</div><div className="stat-label">Depresi Linear</div></div>
          <div className="stat-card"><div className="stat-value" style={{ color: 'var(--orange)' }}>{stats.tunnelLineCount}</div><div className="stat-label">Garis Terowongan</div></div>
          <div className="stat-card"><div className="stat-value">{stats.maxCurvature.toFixed(1)}</div><div className="stat-label">Kelengkungan Max</div></div>
        </div>
        {linearDepressions.slice(0, 5).map((d, i) => (
          <div key={i} className="point-item" onClick={() => mapRef.current?.setView([d.lat, d.lng], 17)}>
            <div>
              <div className="label" style={{ color: 'var(--red)' }}>🚇 Depresi Linear #{i+1}</div>
              <div className="coords">{d.lat.toFixed(5)}, {d.lng.toFixed(5)} · {d.direction}</div>
            </div>
            <span className="anomaly-badge critical">{(d.intensity*100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      {showHelp && (<>
        {(profileMode || null)}
        <div className="help-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-content" onClick={e => e.stopPropagation()}>
            <h2>GPS Anomaly Mapper v2 🚀</h2>
            <p><strong>Deteksi Terowongan, Gua, Deposit Mineral & Logam</strong></p>
                        <ul>
                          <li><strong>Scan Area</strong> - Auto scan dengan elevasi SRTM <strong>GLOBAL & REAL</strong> (bisa dimana aja di dunia)</li>
                          <li><strong>Multi-Index Satelit</strong> - Iron Oxide, Clay Minerals, Ferrous, Silica, NDVI stress (data statis Kasomalang Kulon sample)</li>
                          <li><strong>AI Classification</strong> - Klasifikasi otomatis: tunnel, gold, iron, cave, structure (pake data terrain real)</li>
              <li><strong>Profil Elevasi</strong> - Gambar garis di peta untuk cross-section (klik 2 titik)</li>
              <li><strong>Scan History</strong> - Riwayat scan tersimpan, bisa dibandingkan</li>
              <li><strong>Kelengkungan Terrain</strong> - Deteksi depresi linear khusus terowongan</li>
            </ul>
            <p style={{ marginTop: 12, fontSize: 11, color: '#6e7681' }}>
              Data: Open-Meteo SRTM · Sentinel-2 GEE · Macrostrat · USGS
            </p>
            <button className="btn btn-primary btn-block" onClick={() => setShowHelp(false)} style={{ marginTop: 16 }}>Mulai Eksplorasi</button>
          </div>
        </div>
      </>)}

      <div className="app-container">
        <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>{sidebarCollapsed ? '▶' : '◀'}</button>
          {!sidebarCollapsed && (
            <>
              <div className="tab-bar">
                {[['scan','🔍 Scan'],['satellite','🛰️ Sat'],['profile','📈 Profil'],['results','📊 Hasil'],['mineral','⛏️ Min'],['history','📜 Hist'],['export','💾 Eks']].map(([k,l]) => (
                  <button key={k} className={`tab-btn ${activeTab===k?'active':''}`} onClick={() => { setActiveTab(k); if (k === 'satellite' && !showSatelliteData) loadSatelliteData(); }}>{l}</button>
                ))}
              </div>
              <div className="tab-content">

                {/* ===== SCAN TAB ===== */}
                {activeTab === 'scan' && (<>
                  <div className="card" style={{ borderColor: 'var(--accent)', borderWidth: 2 }}>
                    <div className="card-title" style={{ color: 'var(--accent)', fontSize: 14 }}>Auto Scan Area</div>
                    <p className="card-desc">
                      Zoom peta ke area target, lalu klik scan. App akan:<br/>
                      1. Generate grid titik di seluruh area<br/>
                      2. Fetch elevasi REAL dari satelit (SRTM)<br/>
                      3. Analisis anomali + curvature terrain<br/>
                      4. AI classification tiap anomali<br/>
                      5. Tampilkan hasil di peta
                    </p>
                    <div className="form-group">
                      <label>Jarak Grid (meter)</label>
                      <input type="number" value={gridSpacing} onChange={e => setGridSpacing(Number(e.target.value))} min="20" max="500" />
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>30m = sangat detail, 50m = detail, 100m = sedang, 200m = cepat</p>
                    </div>
                    <button className={`btn ${scanning ? 'btn-danger' : 'btn-success'} btn-block`} onClick={startAutoScan} disabled={scanning} style={{ padding: 12, fontSize: 14 }}>
                      {scanning ? `⏳ Scanning... ${scanProgress}%` : '📡 MULAI SCAN AREA'}
                    </button>
                  </div>

                  {/* Profile Mode Toggle */}
                  <div className="card">
                    <div className="card-title">📐 Cross-Section Profil</div>
                    <p className="card-desc">Klik 2 titik di peta untuk membuat profil elevasi dan deteksi cekungan (terowongan).</p>
                    <button
                      className={`btn ${profileMode ? 'btn-danger' : 'btn-primary'} btn-block`}
                      onClick={() => setProfileMode(!profileMode)}
                      style={{ padding: 10, fontSize: 13 }}
                    >
                      {profileMode ? '⛔ BATAL (klik 2 titik di peta)' : '📏 GAMBAR PROFIL (klik 2 titik)'}
                    </button>
                  </div>

                  {scanning && (
                    <div className="card">
                      <div className="card-title">Progress Scan</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span>{scanProgress < 50 ? 'Mengambil elevasi...' : 'Menganalisis anomali...'}</span>
                        <span style={{ fontWeight: 700 }}>{scanProgress}%</span>
                      </div>
                      <div className="progress-bar"><div className="progress-fill" style={{ width: `${scanProgress}%` }}></div></div>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>{scanPoints.filter(p => p.elevation != null).length} titik ter-elevasi</p>
                    </div>
                  )}

                  {scanStats && !scanning && (
                    <div className="card">
                      <div className="card-title">Hasil Scan</div>
                      <div className="stats-grid">
                        <div className="stat-card"><div className="stat-value">{scanStats.totalPoints}</div><div className="stat-label">Titik</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--red)' }}>{scanStats.anomaliesFound}</div><div className="stat-label">Anomali</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--red)' }}>{scanStats.criticalCount}</div><div className="stat-label">Kritis</div></div>
                        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--orange)' }}>{scanStats.highCount}</div><div className="stat-label">Tinggi</div></div>
                      </div>
                      <div className="stats-grid" style={{ marginTop: 4 }}>
                        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--yellow)' }}>{scanStats.moderateCount}</div><div className="stat-label">Moderat</div></div>
                        <div className="stat-card"><div className="stat-value">{scanStats.elevMin}m</div><div className="stat-label">Min Elev</div></div>
                        <div className="stat-card"><div className="stat-value">{scanStats.elevMax}m</div><div className="stat-label">Max Elev</div></div>
                        <div className="stat-card"><div className="stat-value">{(scanStats.elevMax - scanStats.elevMin)}m</div><div className="stat-label">Relief</div></div>
                      </div>
                    </div>
                  )}

                  {/* Visualization toggles */}
                  {scanStats && !scanning && (
                    <div className="card">
                      <div className="card-title">Visualisasi</div>
                      <div className="toggle-row"><label>Garis Kontur (Surfer-style)</label>
                        <label className="toggle-switch"><input type="checkbox" checked={showContours} onChange={() => setShowContours(!showContours)} /><span className="toggle-slider"></span></label></div>
                      <div className="toggle-row"><label>Heatmap Anomali</label>
                        <label className="toggle-switch"><input type="checkbox" checked={showHeatmap} onChange={() => setShowHeatmap(!showHeatmap)} /><span className="toggle-slider"></span></label></div>
                      <div className="toggle-row"><label>🔴 Kelengkungan Terrain (Tunnel)</label>
                        <label className="toggle-switch"><input type="checkbox" checked={showCurvature} onChange={() => setShowCurvature(!showCurvature)} /><span className="toggle-slider"></span></label></div>
                      <div className="toggle-row"><label>🤖 AI Classification</label>
                        <label className="toggle-switch"><input type="checkbox" checked={showClassifications} onChange={() => setShowClassifications(!showClassifications)} /><span className="toggle-slider"></span></label></div>
                    </div>
                  )}

                  {/* Curvature results */}
                  {curvatureData && !scanning && renderCurvatureLegend()}

                  {/* Import file */}
                  <div className="card">
                    <div className="card-title">Import Data GPS</div>
                    <p className="card-desc">Upload GPX/KML/CSV dari perangkat GPS atau survey sebelumnya.</p>
                    <label className="file-upload">
                      <input ref={fileInputRef} type="file" accept=".gpx,.kml,.csv" onChange={handleFileUpload} />
                      <div className="upload-icon">📂</div><p>GPX / KML / CSV</p>
                    </label>
                  </div>
                </>)}

                {/* ===== SATELLITE TAB ===== */}
                {activeTab === 'satellite' && (<>
                  <div className="card" style={{ borderColor: 'var(--accent)', borderWidth: 2 }}>
                    <div className="card-title" style={{ color: 'var(--accent)', fontSize: 14 }}>
                      🛰️ Data Multispektral Sentinel-2 v2
                                          </div>
                                          <p className="card-desc">
                                            ⚠️ <strong>Data statis untuk area Kasomalang Kulon</strong> (107.715, -6.685).<br/>
                                            Indeks yang dideteksi (multi-index):<br/>
                                            🟤 Iron Oxide (B4/B2) - mineral logam<br/>
                                            🟠 Clay Minerals (B7/B11) - alterasi hidrotermal (emas)<br/>
                                            🔵 Ferrous Minerals (B11/B12) - besi dalam<br/>
                                            ⚪ Silica/Quartz Index - zona mineral<br/>
                                            🟢 NDVI Vegetation Stress - indikasi rongga bawah tanah
                                          </p>
                                          <p className="card-desc" style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 10, fontSize: 11 }}>
                                            🔧 <strong>Untuk area lain:</strong> Scan area dulu di tab Scan (pake elevasi SRTM global REAL),
                                            atau generate data satelit sendiri via GEE (script di <code>scripts/gee_code_editor_v2.js</code>).
                                          </p>
                    <button className={`btn ${satelliteLoading ? 'btn-danger' : 'btn-success'} btn-block`} onClick={loadSatelliteData} disabled={satelliteLoading} style={{ padding: 12, fontSize: 14 }}>
                      {satelliteLoading ? '⏳ Memuat...' : '📡 MUAT DATA SATELIT v2'}
                    </button>
                  </div>

                  {satelliteMetadata && (
                    <div className="card">
                      <div className="card-title">Metadata Data Satelit</div>
                      <div className="info-panel">
                        <div className="info-row"><span className="info-label">Source</span><span className="info-value" style={{color: 'var(--green)', fontWeight: 700}}>{showV2Data ? 'REAL v2 MULTI-INDEX' : 'REAL v1'}</span></div>
                        <div className="info-row"><span className="info-label">Area</span><span className="info-value">{satelliteMetadata.area}</span></div>
                        <div className="info-row"><span className="info-label">Satellite</span><span className="info-value">{satelliteMetadata.satellite}</span></div>
                        <div className="info-row"><span className="info-label">Total Titik</span><span className="info-value">{satelliteMetadata.total_points}</span></div>
                        {showV2Data && satelliteMetadata.avg_combined_score && (
                          <div className="info-row"><span className="info-label">Avg Score</span><span className="info-value">{satelliteMetadata.avg_combined_score}</span></div>
                        )}
                        {showV2Data && satelliteMetadata.classification_stats && (
                          <div className="info-row">
                            <span className="info-label">Klasifikasi</span>
                            <span className="info-value">
                              {Object.entries(satelliteMetadata.classification_stats).map(([k, v]) => (
                                <span key={k} style={{ marginRight: 6 }}>{CLASSIFICATION_EMOJI[k] || '❓'} {k}: {v}</span>
                              ))}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {satelliteAnomalies.length > 0 && (
                    <>
                      {/* Index selector for v2 */}
                      {showV2Data && (
                        <div className="card">
                          <div className="card-title">Pilih Indeks</div>
                          <div className="form-group">
                            <select value={selectedIndex} onChange={e => setSelectedIndex(e.target.value)}>
                              <option value="combined">🎯 Combined Score (All Indices)</option>
                              <option value="iron_oxide">🟤 Iron Oxide</option>
                              <option value="clay_minerals">🟠 Clay Minerals</option>
                              <option value="ndvi">🟢 NDVI Stress</option>
                              <option value="ferrous_minerals">🔵 Ferrous Minerals</option>
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Stats */}
                      <div className="card">
                        <div className="card-title">Statistik Anomali</div>
                        <div className="stats-grid">
                          {['critical','high','moderate','low'].map(level => {
                            const count = showV2Data
                              ? satelliteAnomalies.filter(a => a.anomaly_level === level).length
                              : satelliteAnomalies.filter(a => a.anomaly_level === level).length
                            const color = level === 'critical' ? 'var(--red)' : level === 'high' ? 'var(--orange)' : level === 'moderate' ? 'var(--yellow)' : 'var(--green)'
                            return <div key={level} className="stat-card">
                              <div className="stat-value" style={{ color }}>{count}</div>
                              <div className="stat-label">{level.charAt(0).toUpperCase() + level.slice(1)}</div>
                            </div>
                          })}
                        </div>
                      </div>

                      {/* Classification breakdown (v2) */}
                      {showV2Data && satelliteMetadata.classification_stats && (
                        <div className="card">
                          <div className="card-title">🤖 Klasifikasi AI</div>
                          {Object.entries(satelliteMetadata.classification_stats).map(([type, count]) => {
                            const pct = ((count / satelliteMetadata.total_points) * 100).toFixed(1)
                            const color = CLASSIFICATION_COLORS[type] || '#666'
                            return <div key={type} className="info-row">
                              <span className="info-label">{CLASSIFICATION_EMOJI[type] || '❓'} {type.replace(/_/g, ' ')}</span>
                              <span className="info-value" style={{ color, fontWeight: 600 }}>{count} ({pct}%)</span>
                            </div>
                          })}
                        </div>
                      )}

                      {/* Top anomalies */}
                      <div className="card">
                        <div className="card-title">Top 10 Anomali Tertinggi</div>
                        <div className="point-list" style={{ maxHeight: 300 }}>
                          {satelliteAnomalies
                            .sort((a, b) => {
                              const av = showV2Data ? a.combined_score : a.intensity || 0
                              const bv = showV2Data ? b.combined_score : b.intensity || 0
                              return bv - av
                            })
                            .slice(0, 10)
                            .map((a, i) => {
                              const score = showV2Data ? a.combined_score : (a.intensity || 0)
                              const level = showV2Data ? a.anomaly_level : (a.anomaly_level || 'low')
                              const clsType = showV2Data ? a.classification?.primary_type : null
                              return (
                                <div key={i} className="point-item" onClick={() => mapRef.current?.setView([a.lat, a.lng], 16)}>
                                  <div>
                                    <div className="label" style={{ color: getAnomalyColor(score) }}>
                                      #{i+1} {showV2Data ? `Score: ${score.toFixed(3)}` : `IO: ${a.iron_oxide_raw?.toFixed(3) || 'N/A'}`}
                                      {clsType && ` ${CLASSIFICATION_EMOJI[clsType] || ''}`}
                                    </div>
                                    <div className="coords">{a.lat.toFixed(6)}, {a.lng.toFixed(6)} · {clsType ? clsType.replace(/_/g, ' ') : level}</div>
                                  </div>
                                  <span className={`anomaly-badge ${level === 'critical' ? 'critical' : level === 'high' ? 'high' : 'moderate'}`}>
                                    {(score * 100).toFixed(0)}%
                                  </span>
                                </div>
                              )
                            })}
                        </div>
                      </div>
                    </>
                  )}
                </>)}

                {/* ===== PROFILE TAB ===== */}
                {activeTab === 'profile' && (<>
                  {!profileResult ? (
                    <div className="card">
                      <div className="card-title">📐 Cross-Section Profil</div>
                      <p className="card-desc">
                        Klik tombol di tab Scan, lalu klik 2 titik di peta untuk membuat profil elevasi.<br/>
                        Atau klik titik di history scan untuk memuat profil sebelumnya.
                      </p>
                      <button className="btn btn-primary btn-block" onClick={() => { setActiveTab('scan'); setProfileMode(true) }}>
                        📏 Aktifkan Mode Profil
                      </button>
                    </div>
                  ) : (
                    <>
                      {renderProfileChart()}
                      <div className="card">
                        <div className="card-title">Informasi Profil</div>
                        <p className="card-desc">
                          Cross-section menunjukkan perubahan elevasi antara 2 titik. Cekungan (▼) adalah
                          area yang lebih rendah dari sekitarnya — potensi terowongan atau gua.
                        </p>
                        <button className="btn btn-primary btn-block" onClick={() => { setProfileResult(null); setProfileStart(null); setProfileEnd(null) }}>
                          Hapus Profil
                        </button>
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
                    <div className="card" style={{ borderColor: 'var(--red)', borderWidth: 1 }}>
                      <div className="card-title" style={{ color: 'var(--red)' }}>{anomalies.length} Anomali Terdeteksi</div>
                      <p className="card-desc">Klik setiap anomali untuk melihat detail, AI classification, dan langkah investigasi.</p>
                    </div>

                    {/* AI Classification Summary */}
                    {aiClassifications.length > 0 && (
                      <div className="card">
                        <div className="card-title">🤖 AI Classification Summary</div>
                        <div className="stats-grid">
                          {['tunnel','gold_deposit','iron_deposit','cave_karst','buried_structure'].map(type => {
                            const count = aiClassifications.filter(c => c.primaryType === type && c.primaryScore > 0.4).length
                            if (!count) return null
                            return <div key={type} className="stat-card">
                              <div className="stat-value" style={{ color: CLASSIFICATION_COLORS[type] || '#666', fontSize: 18 }}>
                                {CLASSIFICATION_EMOJI[type]} {count}
                              </div>
                              <div className="stat-label">{type.replace(/_/g, ' ')}</div>
                            </div>
                          })}
                        </div>
                      </div>
                    )}

                    {/* Selected Anomaly Detail */}
                    {selectedAnomaly && (
                      <div className="card" style={{ borderColor: getAnomalyColor(selectedAnomaly.anomalyScore), borderWidth: 2 }}>
                        <div className="card-title" style={{ color: getAnomalyColor(selectedAnomaly.anomalyScore), fontSize: 14 }}>
                          {selectedAnomaly.anomalyType === 'depression' ? '⬇️' : selectedAnomaly.anomalyType === 'elevation_spike' ? '⬆️' : '⚠️'} Anomali
                        </div>
                        <div className="info-panel">
                          <div className="info-row"><span className="info-label">Tipe</span><span className="info-value">{selectedAnomaly.anomalyType}</span></div>
                          <div className="info-row"><span className="info-label">Score</span><span className="info-value" style={{ color: getAnomalyColor(selectedAnomaly.anomalyScore), fontWeight: 700 }}>{(selectedAnomaly.anomalyScore * 100).toFixed(0)}%</span></div>
                          <div className="info-row"><span className="info-label">Elevasi</span><span className="info-value">{selectedAnomaly.elevation?.toFixed(1)}m</span></div>
                          {selectedAnomaly.diff && <div className="info-row"><span className="info-label">Selisih</span><span className="info-value">{selectedAnomaly.diff}m dari rata-rata</span></div>}
                          <div className="info-row"><span className="info-label">Koordinat</span><span className="info-value" style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{selectedAnomaly.lat.toFixed(6)}, {selectedAnomaly.lng.toFixed(6)}</span></div>
                        </div>

                        {/* AI Classification for this anomaly */}
                        {(() => {
                          const idx = anomalies.findIndex(a => a.lat === selectedAnomaly.lat && a.lng === selectedAnomaly.lng)
                          const cls = aiClassifications[idx]
                          if (cls && cls.primaryScore > 0.3) {
                            const guide = ACTION_GUIDES[cls.primaryType]
                            return (
                              <div className="action-guide">
                                <div className="guide-title" style={{ color: CLASSIFICATION_COLORS[cls.primaryType] || 'var(--accent)' }}>
                                  {CLASSIFICATION_EMOJI[cls.primaryType]} AI: {cls.primaryType.replace(/_/g, ' ').toUpperCase()} (confidence: {(cls.confidence * 100).toFixed(0)}%)
                                </div>
                                <div className="guide-text">{guide?.desc || 'Anomali terdeteksi dengan pola spesifik.'}</div>
                                <ul className="guide-steps">
                                  {(guide?.steps || ['Kunjungi lokasi untuk verifikasi']).map((s, i) => <li key={i}>{s}</li>)}
                                </ul>
                                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--accent)' }}>
                                  <strong>Alat:</strong> {guide?.tools || 'GPR, Metal Detector'}
                                </div>
                              </div>
                            )
                          }
                          return null
                        })()}

                        {/* Fallback guides */}
                        {ACTION_GUIDES[selectedAnomaly.anomalyType] && !aiClassifications.find(c => c.primaryScore > 0.3) && (
                          <div className="action-guide">
                            <div className="guide-title">{ACTION_GUIDES[selectedAnomaly.anomalyType].title}</div>
                            <div className="guide-text">{ACTION_GUIDES[selectedAnomaly.anomalyType].desc}</div>
                            <ul className="guide-steps">{ACTION_GUIDES[selectedAnomaly.anomalyType].steps.map((s, i) => <li key={i}>{s}</li>)}</ul>
                            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--accent)' }}><strong>Alat:</strong> {ACTION_GUIDES[selectedAnomaly.anomalyType].tools}</div>
                          </div>
                        )}

                        {/* Geological info */}
                        {geoLoading ? <p className="loading-text" style={{ fontSize: 11, marginTop: 8 }}>Mengambil data geologi...</p> : geoInfo && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Info Geologi:</div>
                            <div className="info-panel">
                              <div className="info-row"><span className="info-label">Formasi</span><span className="info-value">{geoInfo.formation}</span></div>
                              <div className="info-row"><span className="info-label">Batuan</span><span className="info-value">{geoInfo.rockType}</span></div>
                              <div className="info-row"><span className="info-label">Periode</span><span className="info-value">{geoInfo.period}</span></div>
                            </div>
                            {geoInfo.mineralPotential?.length > 0 && (
                              <div style={{ marginTop: 6 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Potensi Mineral:</div>
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
                                {aiClassifications[i]?.primaryScore > 0.4 && ` ${CLASSIFICATION_EMOJI[aiClassifications[i].primaryType] || ''}`}
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
                      <div className="card-title">Legenda Anomali</div>
                      <div className="legend">
                        <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--red)' }}></div>Kritis (&gt;70%)</div>
                        <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--orange)' }}></div>Tinggi (50-70%)</div>
                        <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--yellow)' }}></div>Moderat (30-50%)</div>
                      </div>
                      <div className="card-title" style={{ marginTop: 10 }}>Legenda Klasifikasi AI</div>
                      <div className="legend">
                        <div className="legend-item"><span>🥇</span> Gold Deposit</div>
                        <div className="legend-item"><span>⚙️</span> Iron Deposit</div>
                        <div className="legend-item"><span>🚇</span> Tunnel Potential</div>
                        <div className="legend-item"><span>🦇</span> Cave/Karst</div>
                        <div className="legend-item"><span>🏛️</span> Buried Structure</div>
                      </div>
                    </div>
                  </>)}
                </>)}

                {/* ===== MINERAL TAB ===== */}
                {activeTab === 'mineral' && (<>
                  <div className="card">
                    <div className="card-title">Peta Deposit Mineral (USGS)</div>
                    <p className="card-desc">Overlay deposit mineral real dari USGS (United States Geological Survey).</p>
                    <div className="toggle-row"><label>Tampilkan Deposit Mineral USGS</label>
                      <label className="toggle-switch"><input type="checkbox" checked={showMineralWMS} onChange={() => setShowMineralWMS(!showMineralWMS)} /><span className="toggle-slider"></span></label></div>
                  </div>

                  <div className="card">
                    <div className="card-title">Tandai Lokasi Manual</div>
                    <p className="card-desc">Klik pada peta untuk menandai lokasi yang menarik.</p>
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

                {/* ===== HISTORY TAB ===== */}
                {activeTab === 'history' && (<>
                  <div className="card" style={{ borderColor: 'var(--accent)', borderWidth: 2 }}>
                    <div className="card-title" style={{ color: 'var(--accent)', fontSize: 14 }}>📜 Riwayat Scan</div>
                    <p className="card-desc">
                      Setiap scan otomatis tersimpan. Klik untuk melihat hasil atau bandingkan antar scan.
                      Maksimal 20 scan terakhir tersimpan.
                    </p>
                    {scanHistory.length > 0 && (
                      <button className="btn btn-primary btn-sm" onClick={() => { exportScanHistory(); setScanHistory(getScanHistory()) }} style={{ marginBottom: 8 }}>
                        💾 Export Riwayat
                      </button>
                    )}
                  </div>

                  {scanHistory.length === 0 ? (
                    <div className="card">
                      <div className="card-title">Belum Ada Riwayat</div>
                      <p className="card-desc">Lakukan scan area untuk menyimpan hasil.</p>
                    </div>
                  ) : (
                    scanHistory.map((entry, idx) => (
                      <div key={entry.id} className="card" style={{ borderLeft: `3px solid ${entry.criticalCount > 0 ? 'var(--red)' : 'var(--green)'}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div className="card-title" style={{ fontSize: 12, marginBottom: 4 }}>
                              #{entry.areaName}
                            </div>
                            <div className="info-panel" style={{ fontSize: 10 }}>
                              <div className="info-row"><span className="info-label">Waktu</span><span className="info-value">{new Date(entry.timestamp).toLocaleString('id-ID')}</span></div>
                              <div className="info-row"><span className="info-label">Titik</span><span className="info-value">{entry.totalPoints}</span></div>
                              <div className="info-row"><span className="info-label">Anomali</span><span className="info-value" style={{ color: 'var(--red)' }}>{entry.anomalyCount} (Kritis: {entry.criticalCount})</span></div>
                              <div className="info-row"><span className="info-label">Grid</span><span className="info-value">{entry.gridSpacing}m</span></div>
                            </div>
                          </div>
                          <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px', fontSize: 10 }}
                            onClick={(e) => { e.stopPropagation(); deleteScanFromHistory(entry.id); setScanHistory(getScanHistory()) }}>
                            ✕
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                          <button className="btn btn-primary btn-sm" style={{ flex: 1, fontSize: 10, padding: '4px 8px' }}
                            onClick={() => { mapRef.current?.setView([entry.lat, entry.lng], entry.zoom || 14); setActiveTab('scan') }}>
                            📍 Fokus Peta
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>)}

                {/* ===== EXPORT TAB ===== */}
                {activeTab === 'export' && (<>
                  <div className="card">
                    <div className="card-title">Export Anomali</div>
                    <p className="card-desc">Download hasil scan untuk GIS lain atau dibagikan.</p>
                    <div className="export-grid">
                      <button className="btn btn-primary" onClick={() => exportAnomalies('geojson')}>GeoJSON</button>
                      <button className="btn btn-primary" onClick={() => exportAnomalies('kml')}>KML (Google Earth)</button>
                      <button className="btn btn-primary" onClick={() => exportAnomalies('csv')}>CSV (Excel)</button>
                      <button className="btn btn-primary" onClick={() => exportAnomalies('v2json')}>JSON v2 (Full)</button>
                    </div>
                  </div>
                  {curvatureData && (
                    <div className="card">
                      <div className="card-title">Export Data Curvature</div>
                      <p className="card-desc">Data depresi linear untuk deteksi terowongan.</p>
                      <button className="btn btn-primary btn-block"
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(curvatureData.linearDepressions.slice(0, 100), null, 2)], { type: 'application/json' })
                          const url = URL.createObjectURL(blob), a = document.createElement('a')
                          a.href = url; a.download = 'linear_depressions.json'; a.click(); URL.revokeObjectURL(url)
                        }}>
                        💾 Export Depresi Linear
                      </button>
                    </div>
                  )}
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

            {showMineralWMS && <WMSTileLayer url="https://mrdata.usgs.gov/services/mrds" layers="mrds" format="image/png" transparent opacity={0.7} attribution="USGS MRDS" />}

            <MapClickHandler onMapClick={handleMapClick} onMapMove={c => setMapCenter({ lat: c.lat, lng: c.lng })} onCrossSectionClick={handleCrossSectionClick} profileMode={profileMode} />

            {/* Contour lines */}
            {showContours && contourLines.map((contour, ci) => (
              contour.paths.map((path, pi) => (
                <Polyline key={`c-${ci}-${pi}`} positions={path.map(p => [p.lat, p.lng])}
                  pathOptions={{ color: contour.level > 500 ? '#8B4513' : contour.level > 200 ? '#228B22' : '#4169E1', weight: 1.5, opacity: 0.6 }} />
              ))
            ))}

            {/* Heatmap */}
            {showHeatmap && heatmapData.map((point, i) => (
              <CircleMarker key={`h-${i}`} center={[point[0], point[1]]} radius={30}
                pathOptions={{ color: 'transparent', fillColor: point[2] > 0.7 ? '#FF0000' : point[2] > 0.5 ? '#FF8C00' : point[2] > 0.3 ? '#FFFF00' : '#00FF00', fillOpacity: 0.3, weight: 0 }} />
            ))}

            {/* Curvature linear depressions */}
            {showCurvature && curvatureData?.linearDepressions?.slice(0, 30).map((d, i) => (
              <CircleMarker key={`curv-${i}`} center={[d.lat, d.lng]} radius={d.intensity * 12 + 3}
                pathOptions={{ color: '#FF4444', fillColor: '#FF4444', fillOpacity: 0.4, weight: 1, dashArray: '3,3' }}>
                <Popup><div style={{ color: '#333', fontSize: 12 }}><strong>🚇 Depresi Linear</strong><br/>Intensitas: {(d.intensity*100).toFixed(0)}%<br/>Arah: {d.direction}<br/>Klik untuk detail</div></Popup>
              </CircleMarker>
            ))}

            {/* Tunnel line markers (clustered) */}
            {showCurvature && curvatureData?.tunnelLines?.map((line, i) => (
              <CircleMarker key={`tl-${i}`} center={[line.centerLat, line.centerLng]} radius={15}
                pathOptions={{ color: '#FF0000', fillColor: '#FF0000', fillOpacity: 0.2, weight: 2 }}>
                <Popup><div style={{ color: '#333', fontSize: 12 }}><strong>🚇 Terowongan Terindikasi #{i+1}</strong><br/>Panjang: ~{line.length * 20}m<br/>Orientasi: {line.orientation}<br/>Intensitas: {(line.avgIntensity*100).toFixed(0)}%</div></Popup>
              </CircleMarker>
            ))}

            {/* Profile markers */}
            {profileStart && (
              <CircleMarker center={[profileStart.lat, profileStart.lng]} radius={6}
                pathOptions={{ color: '#3fb950', fillColor: '#3fb950', fillOpacity: 0.8 }} />
            )}
            {profileEnd && (
              <CircleMarker center={[profileEnd.lat, profileEnd.lng]} radius={6}
                pathOptions={{ color: '#f0883e', fillColor: '#f0883e', fillOpacity: 0.8 }} />
            )}
            {profileStart && profileEnd && (
              <Polyline positions={[[profileStart.lat, profileStart.lng], [profileEnd.lat, profileEnd.lng]]}
                pathOptions={{ color: '#58a6ff', weight: 2, opacity: 0.7, dashArray: '5,5' }}>
                <Popup><div style={{ color: '#333', fontSize: 12 }}><strong>📐 Cross-Section Profile</strong><br/>Klik tab Profil untuk detail</div></Popup>
              </Polyline>
            )}

            {/* Scan grid points */}
            {scanPoints.filter(p => p.anomalyScore <= 0.3 && p.elevation != null).map((p, i) => (
              <CircleMarker key={`s${i}`} center={[p.lat, p.lng]} radius={2} pathOptions={{ color: '#58a6ff', fillColor: '#58a6ff', fillOpacity: 0.3, weight: 0 }} />
            ))}

            {/* Anomaly markers */}
            {anomalies.map((a, i) => (
              <Marker key={`a${i}`} position={[a.lat, a.lng]} icon={createAnomalyIcon(a.anomalyScore, a.anomalyType)}
                eventHandlers={{ click: () => selectAnomaly(a) }}>
                <Popup>
                  <div style={{ color: '#333', fontSize: 12, minWidth: 180 }}>
                    <strong style={{ color: getAnomalyColor(a.anomalyScore), fontSize: 14 }}>
                      {a.anomalyType === 'depression' ? '⬇️' : a.anomalyType === 'elevation_spike' ? '⬆️' : '⚠️'} {getAnomalyLabel(a.anomalyScore)}
                    </strong>
                    <br />Tipe: {a.anomalyType}
                    <br />Score: {(a.anomalyScore * 100).toFixed(0)}%
                    <br />Elevasi: {a.elevation?.toFixed(1)}m
                    {a.diff && <><br />Selisih: {a.diff}m</>}
                    {(() => {
                      const idx = anomalies.findIndex(x => x.lat === a.lat && x.lng === a.lng)
                      const cls = aiClassifications[idx]
                      return cls?.primaryScore > 0.4
                        ? <><br />🤖 AI: {cls.primaryType.replace(/_/g, ' ')}</>
                        : null
                    })()}
                    <br /><em style={{ fontSize: 10, color: '#666' }}>Klik untuk detail investigasi</em>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Satellite anomaly markers */}
            {showSatelliteData && satelliteAnomalies.map((a, i) => {
              const score = showV2Data ? a.combined_score : (a.intensity || 0)
              const level = a.anomaly_level || 'low'
              const clsType = showV2Data ? a.classification?.primary_type : null
              const color = showV2Data && clsType ? (CLASSIFICATION_COLORS[clsType] || getAnomalyColor(score)) : getAnomalyColor(score)
              return (
                <CircleMarker key={`sat-${i}`} center={[a.lat, a.lng]}
                  radius={level === 'critical' ? 10 : level === 'high' ? 8 : level === 'moderate' ? 6 : 4}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.6, weight: 2 }}>
                  <Popup>
                    <div style={{ color: '#333', fontSize: 12, minWidth: 200 }}>
                      <strong style={{ color, fontSize: 14 }}>🛰️ {showV2Data ? `Score: ${score.toFixed(3)}` : `Iron Oxide: ${a.iron_oxide_raw?.toFixed(3)}`}</strong>
                      {clsType && <><br />🤖 {CLASSIFICATION_EMOJI[clsType]} {clsType.replace(/_/g, ' ')}</>}
                      <br />Level: <span style={{ fontWeight: 700, color }}>{level.toUpperCase()}</span>
                      {showV2Data && a.classification?.confidence > 0 && <><br />Confidence: {(a.classification.confidence * 100).toFixed(0)}%</>}
                      {showV2Data && a.indices && (<>
                        <br />Iron Ox: {a.indices.iron_oxide.toFixed(2)} | Clay: {a.indices.clay_minerals.toFixed(2)}
                        <br />NDVI: {a.indices.ndvi.toFixed(2)} | Silica: {a.indices.silica_index.toFixed(2)}
                      </>)}
                      <br /><em style={{ fontSize: 10, color: '#666' }}>Sumber: Sentinel-2 (GEE)</em>
                    </div>
                  </Popup>
                </CircleMarker>
              )
            })}

            {/* Mineral markers */}
            {mineralMarkers.map(m => (
              <Marker key={m.id} position={[m.lat, m.lng]} icon={createMineralIcon(MINERAL_TYPES[m.type]?.color||'#fff', MINERAL_TYPES[m.type]?.emoji||'?')}>
                <Popup><div style={{ color: '#333', fontSize: 12 }}><strong>{MINERAL_TYPES[m.type]?.emoji} {MINERAL_TYPES[m.type]?.label}</strong><br/>{MINERAL_METHODS[m.type]}</div></Popup>
              </Marker>
            ))}

            {/* GPS points */}
            {gpsPoints.map(p => (
              <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={4} pathOptions={{ color: '#3fb950', fillColor: '#3fb950', fillOpacity: 0.8 }}>
                <Popup><div style={{ color: '#333', fontSize: 12 }}><strong>{p.label}</strong><br/>{p.lat.toFixed(6)}, {p.lng.toFixed(6)}<br/>Elevasi: {p.elevation?.toFixed(1)}m</div></Popup>
              </CircleMarker>
            ))}
          </MapContainer>

          <div className="map-overlay">
            <button className="btn btn-sm" onClick={() => setShowHelp(true)}>Bantuan</button>
            {profileMode && (
              <div style={{ background: '#f85149', border: '1px solid #ff6b6b', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#fff', fontWeight: 600, boxShadow: 'var(--shadow)' }}>
                📏 Mode Profil: klik 2 titik di peta
              </div>
            )}
            {anomalies.length > 0 && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: 'var(--red)', fontWeight: 600, boxShadow: 'var(--shadow)' }}>
                {anomalies.length} anomali · {aiClassifications.filter(c => c.primaryScore > 0.4).length} AI klasifikasi
              </div>
            )}
          </div>

          <div className="coord-display">
            {mapCenter.lat.toFixed(5)}, {mapCenter.lng.toFixed(5)} · SRTM · GEE · USGS · Macrostrat
          </div>
        </div>
      </div>
    </>
  )
}