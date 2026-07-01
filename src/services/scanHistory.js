/**
 * Scan History - Persistent storage for scan results
 * Enables multi-area comparison and temporal tracking
 */

const STORAGE_KEY = 'scan_history_v2'
const MAX_HISTORY = 20

/**
 * Save a scan result to history
 * @param {Object} scanResult - { id, areaName, lat, lng, timestamp, stats, anomalies, gridSpacing, contourLines, curvature }
 */
export function saveScanToHistory(scanResult) {
  try {
    const history = getScanHistory()
    const entry = {
      id: `scan_${Date.now()}`,
      timestamp: new Date().toISOString(),
      areaName: scanResult.areaName || `Area ${history.length + 1}`,
      lat: scanResult.lat,
      lng: scanResult.lng,
      zoom: scanResult.zoom || 14,
      stats: scanResult.stats,
      anomalyCount: scanResult.anomalies?.length || 0,
      gridSpacing: scanResult.gridSpacing,
      // Store only compact anomaly data to save space
      anomalySummary: scanResult.anomalies?.slice(0, 50).map(a => ({
        lat: a.lat, lng: a.lng,
        score: a.anomalyScore, type: a.anomalyType,
      })) || [],
      criticalCount: scanResult.stats?.criticalCount || 0,
      highCount: scanResult.stats?.highCount || 0,
      totalPoints: scanResult.stats?.totalPoints || 0,
      // Curvature summary
      curvatureStats: scanResult.curvatureStats || null,
      tunnelLineCount: scanResult.tunnelLineCount || 0,
    }

    history.unshift(entry)
    // Keep max history
    while (history.length > MAX_HISTORY) history.pop()

    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
    console.log('✓ Scan saved to history:', entry.areaName)
    return entry
  } catch (error) {
    console.error('Failed to save scan history:', error)
    return null
  }
}

/**
 * Get all scan history
 * @returns {Array} Scan history entries
 */
export function getScanHistory() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

/**
 * Delete a scan from history
 * @param {string} scanId
 */
export function deleteScanFromHistory(scanId) {
  try {
    const history = getScanHistory().filter(e => e.id !== scanId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  } catch (e) {
    console.error('Failed to delete scan:', e)
  }
}

/**
 * Load a specific scan from history
 * @param {string} scanId
 * @returns {Object|null}
 */
export function getScanById(scanId) {
  return getScanHistory().find(e => e.id === scanId) || null
}

/**
 * Export full scan history as JSON
 */
export function exportScanHistory() {
  const history = getScanHistory()
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), scans: history }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'scan_history.json'; a.click()
  URL.revokeObjectURL(url)
}

/**
 * Compare two scans stats side by side
 * @param {string} scanId1
 * @param {string} scanId2
 * @returns {Object} Comparison result
 */
export function compareScans(scanId1, scanId2) {
  const s1 = getScanById(scanId1)
  const s2 = getScanById(scanId2)
  if (!s1 || !s2) return null

  return {
    scan1: s1,
    scan2: s2,
    differences: {
      anomalyCountDiff: s2.anomalyCount - s1.anomalyCount,
      criticalDiff: (s2.criticalCount || 0) - (s1.criticalCount || 0),
      highDiff: (s2.highCount || 0) - (s1.highCount || 0),
      totalPointsDiff: s2.totalPoints - s1.totalPoints,
    },
    summary: s1.anomalyCount === 0 && s2.anomalyCount === 0
      ? 'Tidak ada anomali di kedua scan'
      : `Scan ${s2.areaName} memiliki ${s2.anomalyCount - s1.anomalyCount > 0 ? 'lebih banyak' : 'lebih sedikit'} anomali (+${Math.abs(s2.anomalyCount - s1.anomalyCount)})`,
  }
}