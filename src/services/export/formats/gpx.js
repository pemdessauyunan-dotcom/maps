/**
 * GPX Format Exporter (GPS Exchange Format)
 */

/**
 * Convert array of track points to GPX XML
 * @param {Array<{lat, lng, elevation?, time?, speed?, heading?}>} track
 * @returns {string} GPX XML string
 */
export function exportGPX(track) {
  if (!track || track.length === 0) return ''

  const trackPoints = track.map((p, i) => {
    const lat = p.lat || p.latitude
    const lng = p.lng || p.longitude
    const ele = p.elevation ? `<ele>${p.elevation}</ele>` : ''
    const time = p.time ? `<time>${formatTime(p.time)}</time>` : ''
    const speed = p.speed ? `<speed>${p.speed}</speed>` : ''

    return `      <trkpt lat="${lat}" lon="${lng}">
${ele}${time}${speed}      </trkpt>`
  }).join('\n')

  const now = formatTime(new Date().toISOString())

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GEOSAT-PRO"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <time>${now}</time>
    <name>GEOSAT PRO Survey Track</name>
  </metadata>
  <trk>
    <name>GPS Track</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`
}

/**
 * Convert analysis points to GPX waypoints
 * @param {Array<Object>} points
 * @returns {string}
 */
export function exportWaypoints(points) {
  if (!points || points.length === 0) return ''

  const wpts = points.map(p => {
    const lat = p.lat || p.latitude
    const lng = p.lng || p.longitude
    const name = p.name || `Point ${p.lat?.toFixed(4)},${p.lng?.toFixed(4)}`
    const desc = p.description || p.anomaly_level || ''
    const ele = p.elevation ? `<ele>${p.elevation}</ele>` : ''

    return `  <wpt lat="${lat}" lon="${lng}">
${ele}    <name>${escapeXml(name)}</name>
    <desc>${escapeXml(desc)}</desc>
  </wpt>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GEOSAT-PRO"
  xmlns="http://www.topografix.com/GPX/1/1">
  ${wpts}
</gpx>`
}

function formatTime(iso) {
  try { return new Date(iso).toISOString() } catch { return new Date().toISOString() }
}

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}