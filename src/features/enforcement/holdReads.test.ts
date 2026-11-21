import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import {
  activeHoldFor,
  holdBlocksApplication,
  holdSuspends,
  holdsEnabled,
} from '@/features/enforcement/holdReads'

const signal = new AbortController().signal
const unqueryable = new Proxy(
  {},
  {
    get() {
      throw new Error('the database was queried')
    },
  },
) as DbOrTx

describe('development hold reads under a pack without holds', () => {
  it('answer without a query', async () => {
    expect(holdsEnabled()).toBe(false)
    expect(await activeHoldFor(unqueryable, 'any-parcel', signal)).toBeNull()
    expect(await holdSuspends(unqueryable, 'any-application', signal)).toBe(false)
    expect(await holdBlocksApplication(unqueryable, 'any-application', signal)).toBe(false)
  })
})
