// Anomaly detection algorithms for underground structure estimation

/**
 * Calculate terrain depression anomaly score
 * Compares a point's elevation against its neighbors
 */
export function calculateDepressionAnomaly(point, neighbors) {
  if (!neighbors.length) return 0;
  const avgElevation = neighbors.reduce((sum, n) => sum + n.elevation, 0) / neighbors.length;
  const diff = avgElevation - point.elevation;
  // Positive diff = depression = possible underground structure
  const normalizedScore = Math.min(Math.max(diff / 10, 0), 1);
  return normalizedScore;
}

/**
 * Calculate signal density for heatmap
 * Uses kernel density estimation
 */
export function calculateSignalDensity(points, bandwidth = 0.01) {
  const grid = {};
  const resolution = 0.001; // ~100m grid

  points.forEach(point => {
    const lat = Math.round(point.lat / resolution) * resolution;
    const lng = Math.round(point.lng / resolution) * resolution;
    const key = `${lat},${lng}`;
    grid[key] = (grid[key] || 0) + 1;
  });

  // Apply Gaussian kernel smoothing
  const smoothed = {};
  Object.keys(grid).forEach(key => {
    const [lat, lng] = key.split(',').map(Number);
    let totalWeight = 0;
    let totalValue = 0;

    Object.keys(grid).forEach(otherKey => {
      const [oLat, oLng] = otherKey.split(',').map(Number);
      const dist = Math.sqrt(Math.pow(lat - oLat, 2) + Math.pow(lng - oLng, 2));
      if (dist < bandwidth) {
        const weight = Math.exp(-0.5 * Math.pow(dist / (bandwidth / 3), 2));
        totalWeight += weight;
        totalValue += grid[otherKey] * weight;
      }
    });

    smoothed[key] = totalWeight > 0 ? totalValue / totalWeight : 0;
  });

  return smoothed;
}

/**
 * Detect anomalies from a set of GPS points with elevation data
 */
export function detectAnomalies(points) {
  const anomalies = [];

  points.forEach((point, idx) => {
    const neighbors = points.filter((_, i) => {
      if (i === idx) return false;
      const dist = getDistanceKm(point, points[i]);
      return dist < 0.5; // Within 500m
    });

    if (neighbors.length < 2) return;

    const avgElevation = neighbors.reduce((s, n) => s + n.elevation, 0) / neighbors.length;
    const elevationDiff = avgElevation - point.elevation;
    const elevationStdDev = Math.sqrt(
      neighbors.reduce((s, n) => s + Math.pow(n.elevation - avgElevation, 2), 0) / neighbors.length
    );

    let anomalyScore = 0;
    let anomalyType = 'normal';

    // Depression anomaly (possible tunnel/cavity)
    if (elevationDiff > 2 && elevationDiff > elevationStdDev * 1.5) {
      anomalyScore = Math.min(elevationDiff / 20, 1);
      anomalyType = 'depression';
    }

    // Elevation spike anomaly (possible mound/structure)
    if (elevationDiff < -2 && Math.abs(elevationDiff) > elevationStdDev * 1.5) {
      anomalyScore = Math.min(Math.abs(elevationDiff) / 20, 1);
      anomalyType = 'elevation_spike';
    }

    if (anomalyScore > 0.2) {
      anomalies.push({
        ...point,
        anomalyScore,
        anomalyType,
        elevationDiff: elevationDiff.toFixed(2),
        neighbors: neighbors.length,
      });
    }
  });

  return anomalies;
}

/**
 * Estimate underground structure depth based on surrounding terrain
 */
export function estimateDepth(point, neighbors) {
  if (!neighbors.length) return 0;
  const avgElevation = neighbors.reduce((s, n) => s + n.elevation, 0) / neighbors.length;
  const depth = avgElevation - point.elevation;
  return Math.max(0, depth * 0.7); // Rough estimation factor
}

/**
 * Calculate distance between two points in km using Haversine formula
 */
export function getDistanceKm(p1, p2) {
  const R = 6371;
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLng = (p2.lng - p1.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Generate contour lines from elevation data
 */
export function generateContours(points, levels = 5) {
  if (points.length < 3) return [];

  const elevations = points.map(p => p.elevation);
  const minElev = Math.min(...elevations);
  const maxElev = Math.max(...elevations);
  const interval = (maxElev - minElev) / (levels + 1);

  const contourLines = [];
  for (let i = 1; i <= levels; i++) {
    const threshold = minElev + interval * i;
    const linePoints = [];

    // Simple marching approach - find points near the threshold
    points.forEach(p => {
      if (Math.abs(p.elevation - threshold) < interval * 0.3) {
        linePoints.push([p.lat, p.lng]);
      }
    });

    if (linePoints.length > 0) {
      contourLines.push({
        level: threshold.toFixed(1),
        points: linePoints,
        color: getContourColor(threshold, minElev, maxElev),
      });
    }
  }

  return contourLines;
}

function getContourColor(value, min, max) {
  const ratio = (value - min) / (max - min || 1);
  if (ratio < 0.33) return '#00ff00';
  if (ratio < 0.66) return '#ffff00';
  return '#ff0000';
}

/**
 * Get anomaly zone color based on score
 */
export function getAnomalyColor(score) {
  if (score < 0.3) return '#00ff00'; // Green - normal
  if (score < 0.6) return '#ffff00'; // Yellow - suspicious
  if (score < 0.8) return '#ff8800'; // Orange - likely anomaly
  return '#ff0000'; // Red - high probability
}
