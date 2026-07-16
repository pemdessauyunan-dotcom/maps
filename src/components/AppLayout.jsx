import { useState, useCallback } from 'react'
import { GeosatProvider, useGeosat } from '../context/GeosatContext'
import Sidebar from './layout/Sidebar'
import MapPanel from './layout/MapPanel'
import { analyzePoint } from '../services/analysisOrchestrator'

// ===== APP CONTENT (uses context) =====
function AppContent() {
  const { state, setUI, setAnalysis, setCoordinate, setTelemetry, notify } = useGeosat()
  const { ui, coordinate } = state

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

  const handleGPSToggle = useCallback(() => {
    setTelemetry({ tracking: !state.telemetry.tracking })
    notify({ type: 'info', message: state.telemetry.tracking ? 'GPS stopped' : 'GPS started' })
  }, [state.telemetry.tracking, setTelemetry, notify])

  return (
    <div className="geosat-layout">
      <Sidebar
        activeTab={ui.activeTab}
        onTabChange={handleTabChange}
        collapsed={ui.sidebarCollapsed}
        onToggle={() => setUI({ sidebarCollapsed: !ui.sidebarCollapsed })}
      />
      <MapPanel
        onMapClick={handleMapClick}
        onGPSToggle={handleGPSToggle}
      />
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