/**
 * Retry Handler — Exponential Backoff
 */

export class RetryHandler {
  constructor(maxRetries = 5, baseDelay = 1000, maxDelay = 30000) {
    this.maxRetries = maxRetries
    this.baseDelay = baseDelay
    this.maxDelay = maxDelay
  }

  /**
   * Execute a function with retry logic
   * @param {Function} fn - Async function to execute
   * @param {Object} options
   * @returns {Promise<any>}
   */
  async execute(fn, options = {}) {
    const maxRetries = options.maxRetries ?? this.maxRetries
    let lastError

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastError = err
        if (attempt < maxRetries) {
          await this._delay(attempt)
        }
      }
    }

    throw lastError
  }

  /**
   * Calculate delay with exponential backoff + jitter
   * @param {number} attempt - 0-based
   * @returns {number} ms
   */
  getDelay(attempt) {
    const exponential = Math.min(this.baseDelay * Math.pow(2, attempt), this.maxDelay)
    const jitter = Math.random() * exponential * 0.1
    return exponential + jitter
  }

  _delay(attempt) {
    const ms = this.getDelay(attempt)
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Check if error is retryable
 * @param {Error} err
 * @returns {boolean}
 */
export function isRetryable(err) {
  if (!err) return false
  const msg = err.message || ''
  // Network errors, rate limits, 5xx
  const retryable = [
    'Failed to fetch', 'NetworkError', 'network',
    '429', '500', '502', '503', '504',
    'timeout', 'Timeout',
  ]
  return retryable.some(r => msg.includes(r))
}