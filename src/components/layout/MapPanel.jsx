import MapCanvas from '../map/MapCanvas'
import StatusBar from './StatusBar'
import { useGeosat } from '../../context/GeosatContext'

export default function MapPanel({ onMapClick }) {
  const { state, setCoordinate } = useGeosat()
  const { coordinate, telemetry } = state

  const handleMapClick = (latlng) => {
    setCoordinate({ lat: latlng.lat, lng: latlng.lng })
    if (onMapClick) onMapClick(latlng)
  }

  return (
    <div className="map-container">
      <MapCanvas onMapClick={handleMapClick} center={coordinate} />
      <StatusBar />
    </div>
  )
}