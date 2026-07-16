/**
 * Export Engine — Facade
 * Entry point for all export formats.
 * 
 * Usage:
 *   import ExportEngine from './services/export'
 *   ExportEngine.exportCSV(analysisData, 'survey-1')
 *   ExportEngine.exportGeoJSON(points, 'survey-1')
 *   ExportEngine.exportGPX(track, 'track-1')
 */

import { exportCSV } from './formats/csv'
import { exportGeoJSON } from './formats/geojson'
import { exportGPX } from './formats/gpx'
import { exportKML } from './formats/kml'
import { downloadFile } from './utils/downloader'

class ExportEngine {
  /**
   * Export analysis data as CSV
   * @param {Array<Object>} data - Array of analysis points
   * @param {string} filename - Without extension
   */
  static exportCSV(data, filename = 'survey-data') {
    const csv = exportCSV(data)
    downloadFile(csv, `${filename}.csv`, 'text/csv')
  }

  /**
   * Export points as GeoJSON
   * @param {Array<Object>} features - GeoJSON features or raw points
   * @param {string} filename
   */
  static exportGeoJSON(features, filename = 'survey-points') {
    const geojson = exportGeoJSON(features)
    downloadFile(geojson, `${filename}.geojson`, 'application/geo+json')
  }

  /**
   * Export GPS track as GPX
   * @param {Array<{lat, lng, elevation?, time?}>} track
   * @param {string} filename
   */
  static exportGPX(track, filename = 'gps-track') {
    const gpx = exportGPX(track)
    downloadFile(gpx, `${filename}.gpx`, 'application/gpx+xml')
  }

  /**
   * Export points as KML
   * @param {Array<Object>} points
   * @param {string} filename
   */
  static exportKML(points, filename = 'survey-points') {
    const kml = exportKML(points)
    downloadFile(kml, `${filename}.kml`, 'application/vnd.google-earth.kml+xml')
  }

  /**
   * Get all available export formats
   * @returns {Array<{id: string, label: string, extension: string, mime: string}>}
   */
  static getFormats() {
    return [
      { id: 'csv', label: 'CSV (Spreadsheet)', extension: '.csv', mime: 'text/csv' },
      { id: 'geojson', label: 'GeoJSON', extension: '.geojson', mime: 'application/geo+json' },
      { id: 'gpx', label: 'GPX (GPS Exchange)', extension: '.gpx', mime: 'application/gpx+xml' },
      { id: 'kml', label: 'KML (Google Earth)', extension: '.kml', mime: 'application/vnd.google-earth.kml+xml' },
    ]
  }
}

export default ExportEngine
export { ExportEngine }
export { downloadFile } from './utils/downloader'