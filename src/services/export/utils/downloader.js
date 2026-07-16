/**
 * File Downloader Utility
 * Triggers browser download for any file content.
 */

/**
 * Download content as a file
 * @param {string} content - File content
 * @param {string} filename - Name with extension
 * @param {string} mimeType - MIME type
 */
export function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 100)
}

/**
 * Download from a URL
 * @param {string} url - File URL
 * @param {string} filename
 */
export function downloadFromURL(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename || url.split('/').pop()
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/**
 * Convert data to base64 download
 * @param {string} data - Raw data
 * @param {string} filename
 * @param {string} mimeType
 */
export function downloadBase64(data, filename, mimeType = 'application/octet-stream') {
  const base64 = btoa(unescape(encodeURIComponent(data)))
  const url = `data:${mimeType};base64,${base64}`
  downloadFromURL(url, filename)
}