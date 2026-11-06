import { randomUUID } from 'node:crypto'
import { inject } from 'vitest'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { GarageAdminConfig } from '@/features/storage/garageAdmin'
import {
  createObjectStore,
  type ObjectStore,
  type ObjectStoreConfig,
} from '@/features/storage/objectStore'
import { prepareBucket } from '@/features/storage/prepareBucket'
import { TEST_BROWSER_ORIGIN } from './objectStoreContainer'

export function testObjectStoreSettings(bucket: string): {
  config: ObjectStoreConfig
  admin: GarageAdminConfig
} {
  const { adminEndpoint, adminToken, ...base } = inject('testObjectStore')
  return { config: { ...base, bucket }, admin: { endpoint: adminEndpoint, token: adminToken } }
}

export async function makeTestStore(
  overrides: Partial<ObjectStoreConfig> = {},
): Promise<{ store: ObjectStore; config: ObjectStoreConfig }> {
  const settings = testObjectStoreSettings(`t-${randomUUID().slice(0, 12)}`)
  const config = { ...settings.config, ...overrides }
  const prepared = await prepareBucket(
    config,
    settings.admin,
    [TEST_BROWSER_ORIGIN],
    AbortSignal.timeout(20_000),
  )
  if (!prepared.ok)
    throw new AppError(ErrorIds.CFG_MISSING, 'test bucket setup failed', {
      ...prepared.error,
    })
  return { store: createObjectStore(config), config }
}

export { startObjectStore, TEST_BROWSER_ORIGIN } from './objectStoreContainer'
