/**
 * Real-Time GPS Tracking Service
 * Uses browser Geolocation API for live position tracking
 * Combined with real-time anomaly detection as you walk
 */

const TRACKING_CACHE_KEY = 'gps_tracking_session'

/**
 * Start GPS tracking with real-time anomaly detection
 * @param {Function} onPosition - Callback with {lat, lng, accuracy, elevation, speed, heading}
 * @param {Function} onError - Error callback
 * @param {Object} options - { enableHighAccuracy, timeout, maxAge }
 * @returns {number} Watch ID for cleanup
 */
export function startGpsTracking(onPosition, onError, options = {}) {
  if (!navigator.geolocation) {
    onError?.({ message: 'Geolocation tidak didukung browser ini' })
    return null
  }

  const opts = {
    enableHighAccuracy: options.enableHighAccuracy ?? true,
    timeout: options.timeout ?? 10000,
    maximumAge: options.maximumAge ?? 0,
  }

  // Use persistent watch for continuous tracking
  const watchId = navigator.geolocation.watchPosition(
    async (position) => {
      const { latitude, longitude, accuracy, speed, heading } = position.coords
      
      const pos = {
        lat: latitude,
        lng: longitude,
        accuracy: Math.round(accuracy),
        speed: speed != null ? Math.round(speed * 3.6) : null, // m/s to km/h
        heading: heading ?? null,
        timestamp: new Date().toISOString(),
        elevation: null, // Will be fetched
      }

      // Fetch elevation for current position in background
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`
        )
        if (res.ok) {
          const data = await res.json()
          pos.elevation = data.elevation?.[0] ?? null
        }
      } catch { /* ignore elevation fetch errors */ }

      // Save to session cache
      saveTrackingPoint(pos)
      
      onPosition?.(pos)
    },
    (err) => {
      const messages = {
        1: 'Izin lokasi ditolak. Aktifkan GPS di pengaturan browser.',
        2: 'Posisi tidak tersedia. Coba di area terbuka.',
        3: 'Timeout mengambil lokasi. Coba lagi.',
      }
      onError?.({ code: err.code, message: messages[err.code] || err.message })
    },
    opts
  )

  return watchId
}

/**
 * Stop GPS tracking
 * @param {number} watchId
 */
export function stopGpsTracking(watchId) {
  if (watchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId)
  }
}

/**
 * Get current position once (one-shot)
 * @returns {Promise<{lat, lng, accuracy}>}
 */
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation tidak didukung'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  })
}

/**
 * Check if two GPS points are close (within radius meters)
 */
export function isWithinRadius(p1, p2, radiusMeters = 10) {
  const dLat = (p2.lat - p1.lat) * 111000
  const dLng = (p2.lng - p1.lng) * 111000 * Math.cos((p1.lat + p2.lat) / 2 * Math.PI / 180)
  return Math.sqrt(dLat * dLat + dLng * dLng) < radiusMeters
}

/**
 * Calculate distance between two GPS points in meters
 */
export function distanceBetween(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Save tracking point to session storage
 */
export function saveTrackingPoint(point) {
  try {
    const stored = sessionStorage.getItem(TRACKING_CACHE_KEY)
    const history = stored ? JSON.parse(stored) : []
    history.push(point)
    // Keep last 10000 points
    if (history.length > 10000) history.splice(0, history.length - 10000)
    sessionStorage.setItem(TRACKING_CACHE_KEY, JSON.stringify(history))
  } catch { /* ignore storage errors */ }
}

/**
 * Get tracking history from session storage
 * @returns {Array} Tracking points
 */
export function getTrackingHistory() {
  try {
    const stored = sessionStorage.getItem(TRACKING_CACHE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch { return [] }
}

/**
 * Clear tracking history
 */
export function clearTrackingHistory() {
  sessionStorage.removeItem(TRACKING_CACHE_KEY)
}