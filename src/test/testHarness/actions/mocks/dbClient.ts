import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { harnessState } from '../state'

function currentDb(): Db {
  if (harnessState.db === null)
    throw new AppError(ErrorIds.DB_INVARIANT, 'actionHarness() has not created its database yet')
  return harnessState.db
}

export const db = new Proxy({} as Db, {
  get: (_target, key): unknown => Reflect.get(currentDb(), key) as unknown,
})
