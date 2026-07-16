/**
 * KML Format Exporter (Google Earth)
 */

/**
 * Convert array of points to KML
 * @param {Array<{lat, lng, name?, description?, elevation?}>} points
 * @returns {string} KML XML
 */
export function exportKML(points) {
  if (!points || points.length === 0) return ''

  const placemarks = points.map((p, i) => {
    const lat = p.lat || p.latitude
    const lng = p.lng || p.longitude
    const name = p.name || `Point ${i + 1}`
    const desc = p.description || `Analysis point at ${lat?.toFixed(4)}, ${lng?.toFixed(4)}`
    const altitude = p.elevation || 0

    return `  <Placemark>
    <name>${escapeXml(name)}</name>
    <description>${escapeXml(desc)}</description>
    <Point>
      <coordinates>${lng},${lat},${altitude}</coordinates>
    </Point>
  </Placemark>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>GEOSAT PRO Survey</name>
    <description>Exported from Geosat Pro Enterprise</description>
${placemarks}
  </Document>
</kml>`
}

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}