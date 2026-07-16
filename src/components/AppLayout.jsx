import { useState, useCallback } from 'react'
import { GeosatProvider, useGeosat } from '../context/GeosatContext'
import Sidebar from './layout/Sidebar'
import MapPanel from './layout/MapPanel'
import { analyzePoint } from '../services/analysisOrchestrator'
import AnalysisPanel from './panels/AnalysisPanel'

// ===== APP CONTENT (uses context) =====
function AppContent() {
  const { state, setUI, setAnalysis, setCoordinate, setTelemetry, notify } = useGeosat()
  const { ui } = state

  const handleTabChange = useCallback((tab) => {
    setUI({ activeTab: tab })
  }, [setUI])

  const handleMapClick = useCallback(async (latlng) => {
    setCoordinate({ lat: latlng.lat, lng: latlng.lng })
    setUI({ loading: true })
    try {
      const result = await analyzePoint(latlng.lat, latlng.lng)
      setAnalysis(result)
      setUI({ activeTab: 'home' })
    } catch (err) {
      notify({ type: 'error', message: 'Analysis failed: ' + err.message })
    } finally {
      setUI({ loading: false })
    }
  }, [setCoordinate, setUI, setAnalysis, notify])

  return (
    <div className="geosat-layout">
      <Sidebar
        activeTab={ui.activeTab}
        onTabChange={handleTabChange}
        collapsed={ui.sidebarCollapsed}
        onToggle={() => setUI({ sidebarCollapsed: !ui.sidebarCollapsed })}
      >
        <AnalysisPanel />
      </Sidebar>
      <MapPanel onMapClick={handleMapClick} />
    </div>
  )
}

// ===== APP ROOT =====
export default function AppLayout() {
  return (
    <GeosatProvider>
      <AppContent />
    </GeosatProvider>
  )
}