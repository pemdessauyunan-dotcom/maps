/**
 * Contour line generation using Marching Squares algorithm
 * Generates isolines from a grid of elevation values
 */

/**
 * Generate contour lines from scattered points using IDW interpolation + marching squares
 * @param {Array<{lat: number, lng: number, elevation: number}>} points - Data points
 * @param {Object} bounds - {north, south, east, west}
 * @param {number} gridSize - Grid resolution in pixels
 * @param {Array<number>} levels - Contour levels (elevations) to draw
 * @returns {Array<{level: number, paths: Array<Array<{lat: number, lng: number}>>}>} Contour lines
 */
export function generateContours(points, bounds, gridSize = 100, levels = null) {
  if (points.length < 3) return []

  const { north, south, east, west } = bounds
  const cols = gridSize
  const rows = Math.round(gridSize * (north - south) / (east - west) * Math.cos((north + south) / 2 * Math.PI / 180))
  
  // Create grid using IDW interpolation
  const grid = []
  for (let row = 0; row < rows; row++) {
    grid[row] = []
    for (let col = 0; col < cols; col++) {
      const lat = north - (row / rows) * (north - south)
      const lng = west + (col / cols) * (east - west)
      grid[row][col] = idwInterpolate(lat, lng, points)
    }
  }

  // Auto-generate contour levels if not provided
  if (!levels) {
    const allElevs = points.map(p => p.elevation).filter(e => e != null)
    if (allElevs.length === 0) return []
    const minElev = Math.min(...allElevs)
    const maxElev = Math.max(...allElevs)
    const range = maxElev - minElev
    const interval = range / 10 // 10 contour levels
    levels = []
    for (let i = 1; i < 10; i++) {
      levels.push(minElev + interval * i)
    }
  }

  // Generate contour lines for each level
  const contours = []
  for (const level of levels) {
    const paths = marchingSquares(grid, level, bounds, rows, cols)
    if (paths.length > 0) {
      contours.push({ level, paths })
    }
  }

  return contours
}

/**
 * Inverse Distance Weighting interpolation
 */
function idwInterpolate(lat, lng, points, power = 2) {
  let numerator = 0
  let denominator = 0
  
  for (const point of points) {
    if (point.elevation == null) continue
    const dLat = (point.lat - lat) * 111000
    const dLng = (point.lng - lng) * 111000 * Math.cos(lat * Math.PI / 180)
    const distance = Math.sqrt(dLat * dLat + dLng * dLng)
    
    if (distance < 0.001) return point.elevation // Very close to a point
    
    const weight = 1 / Math.pow(distance, power)
    numerator += weight * point.elevation
    denominator += weight
  }
  
  return denominator > 0 ? numerator / denominator : 0
}

/**
 * Marching Squares algorithm for contour line generation
 */
function marchingSquares(grid, level, bounds, rows, cols) {
  const { north, south, east, west } = bounds
  const paths = []
  
  const cellWidth = (east - west) / cols
  const cellHeight = (north - south) / rows
  
  // For each cell in the grid
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      // Get values at 4 corners
      const tl = grid[row][col]
      const tr = grid[row][col + 1]
      const bl = grid[row + 1][col]
      const br = grid[row + 1][col + 1]
      
      // Determine case (which corners are above/below level)
      let caseIndex = 0
      if (tl >= level) caseIndex |= 8
      if (tr >= level) caseIndex |= 4
      if (br >= level) caseIndex |= 2
      if (bl >= level) caseIndex |= 1
      
      if (caseIndex === 0 || caseIndex === 15) continue // All same side
      
      // Calculate interpolation points on edges
      const top = interpolate(tl, tr, level)
      const right = interpolate(tr, br, level)
      const bottom = interpolate(bl, br, level)
      const left = interpolate(tl, bl, level)
      
      // Convert grid coordinates to lat/lng
      const toLatLng = (rowFrac, colFrac) => ({
        lat: north - (row + rowFrac) * cellHeight,
        lng: west + (col + colFrac) * cellWidth
      })
      
      const topPt = toLatLng(0, top)
      const rightPt = toLatLng(right, 1)
      const bottomPt = toLatLng(1, bottom)
      const leftPt = toLatLng(left, 0)
      
      // Draw lines based on case
      const segments = getCaseSegments(caseIndex, topPt, rightPt, bottomPt, leftPt)
      paths.push(...segments)
    }
  }
  
  return paths
}

/**
 * Linear interpolation between two values
 */
function interpolate(v1, v2, level) {
  if (v1 === v2) return 0.5
  return (level - v1) / (v2 - v1)
}

/**
 * Get line segments for each marching squares case
 */
function getCaseSegments(caseIndex, top, right, bottom, left) {
  const segments = []
  
  switch (caseIndex) {
    case 1: case 14: segments.push([left, bottom]); break
    case 2: case 13: segments.push([bottom, right]); break
    case 3: case 12: segments.push([left, right]); break
    case 4: case 11: segments.push([top, right]); break
    case 5:
      segments.push([left, top]);
      segments.push([bottom, right]);
      break
    case 6: case 9: segments.push([top, bottom]); break
    case 7: case 8: segments.push([left, top]); break
    case 10:
      segments.push([top, right]);
      segments.push([left, bottom]);
      break
  }
  
  return segments
}

/**
 * Generate heatmap data for Leaflet.heat
 * @param {Array<{lat: number, lng: number, value: number}>} points
 * @returns {Array<[number, number, number]>} [lat, lng, intensity]
 */
export function generateHeatmapData(points, maxValue = null) {
  if (!maxValue) {
    maxValue = Math.max(...points.map(p => p.value).filter(v => v != null))
  }
  
  return points
    .filter(p => p.value != null && p.value > 0)
    .map(p => [p.lat, p.lng, p.value / maxValue])
}

/**
 * Color scale for elevation/anomaly visualization
 */
export const ELEVATION_COLORS = {
  low: '#0000FF',      // Blue - low elevation
  mid: '#00FF00',      // Green - medium
  high: '#FFFF00',     // Yellow - high
  peak: '#FF0000',     // Red - peaks
}

export const ANOMALY_COLORS = {
  low: '#00FF00',      // Green - low anomaly
  moderate: '#FFFF00', // Yellow - moderate
  high: '#FF8C00',     // Orange - high
  critical: '#FF0000', // Red - critical
}

/**
 * Interpolate color between two hex colors
 */
export function interpolateColor(color1, color2, factor) {
  const r1 = parseInt(color1.slice(1, 3), 16)
  const g1 = parseInt(color1.slice(3, 5), 16)
  const b1 = parseInt(color1.slice(5, 7), 16)
  
  const r2 = parseInt(color2.slice(1, 3), 16)
  const g2 = parseInt(color2.slice(3, 5), 16)
  const b2 = parseInt(color2.slice(5, 7), 16)
  
  const r = Math.round(r1 + (r2 - r1) * factor)
  const g = Math.round(g1 + (g2 - g1) * factor)
  const b = Math.round(b1 + (b2 - b1) * factor)
  
  return `rgb(${r}, ${g}, ${b})`
}
