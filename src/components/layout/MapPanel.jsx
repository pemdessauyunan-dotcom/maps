import MapCanvas from '../map/MapCanvas'
import StatusBar from './StatusBar'
import { useGeosat } from '../../context/GeosatContext'

export default function MapPanel() {
  const { state, setCoordinate, setTelemetry, setUI } = useGeosat()
  const { coordinate, telemetry } = state

  const handleMapClick = (latlng) => {
    setCoordinate({ lat: latlng.lat, lng: latlng.lng })
  }

  return (
    <div className="map-container">
      <MapCanvas onMapClick={handleMapClick} center={coordinate} />
      <StatusBar />
    </div>
  )
}