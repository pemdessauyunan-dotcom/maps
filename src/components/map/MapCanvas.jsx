import { MapContainer, TileLayer, Marker, Popup, LayersControl, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { useGeosat } from '../../context/GeosatContext'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

const TILE_LAYERS = {
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', name: 'Satelit' },
  terrain: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', name: 'Terrain' },
  street: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', name: 'Peta Jalan' },
}

function MapClickHandler({ onClick }) {
  useMapEvents({ click: (e) => onClick?.(e.latlng) })
  return null
}

export default function MapCanvas({ onMapClick, center = { lat: -6.68, lng: 107.73 }, zoom = 14 }) {
  const { state } = useGeosat()
  const { coordinate, analysis } = state

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={zoom} style={{ height: '100%', width: '100%' }}>
      <LayersControl position="topright">
        {Object.entries(TILE_LAYERS).map(([k, v]) => (
          <LayersControl.BaseLayer key={k} checked={k === 'satellite'} name={v.name}>
            <TileLayer url={v.url} attribution={v.name} />
          </LayersControl.BaseLayer>
        ))}
      </LayersControl>

      <MapClickHandler onClick={onMapClick} />

      {/* Click marker */}
      <Marker position={[coordinate.lat, coordinate.lng]}>
        <Popup>
          <div style={{ fontSize: 12, lineHeight: '1.5' }}>
            <strong>📍 {coordinate.lat.toFixed(5)}, {coordinate.lng.toFixed(5)}</strong><br />
            {analysis.thermal ? (
              <>🌡️ {analysis.thermal.temperature.surface}°C | 🎯 {analysis.prospectivity ? (analysis.prospectivity.score * 100).toFixed(0) + '%' : '?'}</>
            ) : (
              <>⏳ Klik untuk analisis...</>
            )}
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  )
}