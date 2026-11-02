import { randomUUID } from 'node:crypto'
import { inject } from 'vitest'
import {
  createObjectStore,
  ensureBucket,
  type ObjectStore,
  type ObjectStoreConfig,
} from '@/features/storage/objectStore'

export async function makeTestStore(
  overrides: Partial<ObjectStoreConfig> = {},
): Promise<{ store: ObjectStore; config: ObjectStoreConfig }> {
  const base = inject('testMinio')
  const config = { ...base, bucket: `t-${randomUUID().slice(0, 12)}`, ...overrides }
  const store = createObjectStore(config)
  await ensureBucket(store, AbortSignal.timeout(20_000))
  return { store, config }
}

export { startMinio } from './minioContainer'
