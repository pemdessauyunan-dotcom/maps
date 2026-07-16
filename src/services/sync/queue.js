/**
 * Sync Queue — Offline + Priority Queue
 * Persisted to localStorage with IndexedDB fallback.
 */

const DEFAULT_STORAGE_KEY = 'geosat_sync_queue'

export class Queue {
  constructor(storageKey = DEFAULT_STORAGE_KEY) {
    this._key = storageKey
    this._items = this._load()
  }

  /**
   * Add item to queue
   * @param {Object} item
   * @param {number} priority - 1 (highest) to 5 (lowest)
   */
  add(item, priority = 3) {
    item.priority = Math.max(1, Math.min(5, priority))
    this._items.push(item)
    this._save()
  }

  /**
   * Get items sorted by priority, then timestamp
   * @param {number} limit
   * @returns {Array}
   */
  getByPriority(limit = 50) {
    return this._items
      .filter(i => i.status === 'pending')
      .sort((a, b) => a.priority - b.priority || a.timestamp.localeCompare(b.timestamp))
      .slice(0, limit)
  }

  /**
   * Get all items
   */
  getAll() {
    return [...this._items]
  }

  /**
   * Update an item
   */
  update(item) {
    const idx = this._items.findIndex(i => i.id === item.id)
    if (idx !== -1) {
      this._items[idx] = item
      this._save()
    }
  }

  /**
   * Remove an item
   */
  remove(id) {
    this._items = this._items.filter(i => i.id !== id)
    this._save()
  }

  /**
   * Clear all items
   */
  clear() {
    this._items = []
    this._save()
  }

  /**
   * Get queue size
   */
  get size() {
    return this._items.length
  }

  _load() {
    try {
      const data = localStorage.getItem(this._key)
      return data ? JSON.parse(data) : []
    } catch {
      return []
    }
  }

  _save() {
    try {
      localStorage.setItem(this._key, JSON.stringify(this._items))
    } catch {
      // Storage full or unavailable — silently fail
    }
  }
}