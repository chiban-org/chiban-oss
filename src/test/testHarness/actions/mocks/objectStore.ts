import { vi } from 'vitest'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type * as ObjectStoreModule from '@/features/storage/objectStore'
import { harnessState } from '../state'

const actual = await vi.importActual<typeof ObjectStoreModule>('@/features/storage/objectStore')

export const {
  contentDisposition,
  createObjectStore,
  ensureBucket,
  isPreconditionFailure,
  objectStoreConfigFromEnv,
} = actual

export function getObjectStore(): ObjectStoreModule.ObjectStore {
  if (harnessState.store === null)
    throw new AppError(ErrorIds.DB_INVARIANT, 'call h.useObjectStore() at file scope first')
  return harnessState.store
}

export const everyExportMocked = {
  contentDisposition,
  createObjectStore,
  ensureBucket,
  isPreconditionFailure,
  objectStoreConfigFromEnv,
  getObjectStore,
} satisfies Record<keyof typeof ObjectStoreModule, unknown>
