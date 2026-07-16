/**
 * SyncManager — Cloud Synchronization Engine
 * Orchestrates offline queue, retry, compression, and conflict resolution.
 * 
 * Architecture:
 *   SyncManager
 *   ├── Queue (offline + priority)
 *   ├── Retry (exponential backoff)
 *   ├── Compression (data packing)
 *   └── Conflict Resolver (timestamp + priority)
 */

import { Queue } from './queue'
import { RetryHandler } from './retry'
import { compress, decompress } from './compression'
import { ConflictResolver } from './conflict'

const STORAGE_KEY = 'geosat_sync_queue'

export class SyncManager {
  constructor(options = {}) {
    this.apiUrl = options.apiUrl || '/api/sync'
    this.maxRetries = options.maxRetries || 5
    this.batchSize = options.batchSize || 50
    this.queue = new Queue(STORAGE_KEY)
    this.retry = new RetryHandler(this.maxRetries)
    this.conflictResolver = new ConflictResolver()
    this._listeners = new Set()
  }

  // ===== PUBLIC API =====

  /**
   * Queue a sync operation
   * @param {string} type - Operation type: 'survey', 'point', 'track', 'export'
   * @param {Object} data - Data to sync
   * @param {number} priority - 1 (high) to 5 (low)
   * @returns {string} Operation ID
   */
  async enqueue(type, data, priority = 3) {
    const operation = {
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      data: compress(data),
      priority,
      timestamp: new Date().toISOString(),
      retries: 0,
      status: 'pending',
    }
    this.queue.add(operation, priority)
    this._notify('enqueue', operation)
    this._processQueue()
    return operation.id
  }

  /**
   * Sync immediately (bypass queue)
   * @param {string} type
   * @param {Object} data
   * @returns {Promise<Object>} Server response
   */
  async syncNow(type, data) {
    const compressed = compress(data)
    try {
      const response = await this._send(type, compressed)
      this._notify('sync', { type, status: 'success' })
      return response
    } catch (err) {
      this._notify('sync', { type, status: 'error', error: err.message })
      throw err
    }
  }

  /**
   * Get queue status
   * @returns {{ pending: number, processing: number, failed: number, total: number }}
   */
  getStatus() {
    const items = this.queue.getAll()
    return {
      pending: items.filter(i => i.status === 'pending').length,
      processing: items.filter(i => i.status === 'processing').length,
      failed: items.filter(i => i.status === 'failed').length,
      total: items.length,
    }
  }

  /**
   * Clear all queued operations
   */
  clearQueue() {
    this.queue.clear()
    this._notify('clear')
  }

  /**
   * Retry all failed operations
   */
  retryFailed() {
    const failed = this.queue.getAll().filter(i => i.status === 'failed')
    failed.forEach(item => {
      item.status = 'pending'
      item.retries = 0
      this.queue.update(item)
    })
    this._processQueue()
  }

  /**
   * Listen for sync events
   * @param {Function} callback
   * @returns {Function} Unsubscribe
   */
  onEvent(callback) {
    this._listeners.add(callback)
    return () => this._listeners.delete(callback)
  }

  // ===== INTERNAL =====

  async _processQueue() {
    if (this._processing) return
    this._processing = true

    try {
      const items = this.queue.getByPriority(this.batchSize)
      for (const item of items) {
        if (item.status === 'processing' || item.status === 'synced') continue
        item.status = 'processing'
        this.queue.update(item)

        try {
          const data = decompress(item.data)
          await this.retry.execute(() => this._send(item.type, data))
          item.status = 'synced'
          this.queue.update(item)
          this._notify('sync', { id: item.id, type: item.type, status: 'success' })
        } catch (err) {
          item.retries++
          item.status = item.retries >= this.maxRetries ? 'failed' : 'pending'
          item.lastError = err.message
          this.queue.update(item)
          this._notify('sync', { id: item.id, type: item.type, status: 'error', error: err.message })
        }
      }
    } finally {
      this._processing = false
    }
  }

  async _send(type, data) {
    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data, timestamp: new Date().toISOString() }),
    })
    if (!res.ok) throw new Error(`Sync failed: ${res.status} ${res.statusText}`)
    return res.json()
  }

  _notify(event, payload) {
    this._listeners.forEach(cb => {
      try { cb({ event, ...payload }) } catch {}
    })
  }
}

// Singleton
let _instance = null
export function getSyncManager(options = {}) {
  if (!_instance) _instance = new SyncManager(options)
  return _instance
}