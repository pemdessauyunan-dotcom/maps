/**
 * Compression — Data packing for sync
 * Uses JSON.stringify + optional LZ-string compression.
 * Small payloads (< 1KB) are stored as-is.
 */

const COMPRESSION_THRESHOLD = 1024 // 1KB

/**
 * Compress data for sync
 * @param {*} data
 * @returns {string} Compressed string
 */
export function compress(data) {
  const json = JSON.stringify(data)
  if (json.length < COMPRESSION_THRESHOLD) return json

  // Simple run-length compression for spatial data
  try {
    return _compress(json)
  } catch {
    return json
  }
}

/**
 * Decompress synced data
 * @param {string} compressed
 * @returns {*}
 */
export function decompress(compressed) {
  if (!compressed || typeof compressed !== 'string') return compressed

  // Check if compressed (starts with magic prefix)
  if (compressed.startsWith('__C__')) {
    try {
      return JSON.parse(_decompress(compressed.slice(5)))
    } catch {
      return JSON.parse(compressed)
    }
  }

  // Not compressed
  try {
    return JSON.parse(compressed)
  } catch {
    return compressed
  }
}

function _compress(str) {
  // Simple compression: replace repeated patterns
  let result = '__C__'
  let i = 0
  while (i < str.length) {
    let count = 1
    while (i + count < str.length && str[i + count] === str[i] && count < 255) {
      count++
    }
    if (count > 3) {
      result += `\x00${String.fromCharCode(count)}${str[i]}`
      i += count
    } else {
      result += str[i]
      i++
    }
  }
  return result
}

function _decompress(str) {
  let result = ''
  let i = 0
  while (i < str.length) {
    if (str[i] === '\x00' && i + 2 < str.length) {
      const count = str.charCodeAt(i + 1)
      result += str[i + 2].repeat(count)
      i += 3
    } else {
      result += str[i]
      i++
    }
  }
  return result
}

/**
 * Calculate data size for display
 * @param {*} data
 * @returns {string} Human-readable size
 */
export function formatSize(data) {
  const json = JSON.stringify(data)
  const bytes = new Blob([json]).size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}