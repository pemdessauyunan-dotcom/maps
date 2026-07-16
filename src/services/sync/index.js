/**
 * Sync Engine — Offline-first Cloud Synchronization
 * 
 * Architecture:
 *   SyncManager (orchestrator)
 *   ├── Queue (persisted offline queue)
 *   ├── RetryHandler (exponential backoff)
 *   ├── Compression (data packing)
 *   └── ConflictResolver (LWW strategy)
 * 
 * Usage:
 *   import { getSyncManager } from './services/sync'
 *   const sync = getSyncManager()
 *   await sync.enqueue('survey', { lat, lng, data })
 *   sync.onEvent((event) => console.log(event))
 */

export { SyncManager, getSyncManager } from './SyncManager'
export { Queue } from './queue'
export { RetryHandler, isRetryable } from './retry'
export { ConflictResolver } from './conflict'
export { compress, decompress, formatSize } from './compression'