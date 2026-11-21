import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { varianceValidity } from '@/features/decisions/recording'
import { loadPack } from '@/features/packs/loadPack'

const signal = new AbortController().signal
const unqueryable = new Proxy(
  {},
  {
    get() {
      throw new Error('the database was queried')
    },
  },
) as DbOrTx

describe('varianceValidity', () => {
  it('answers not_required without a query when no classification requires recording', async () => {
    expect(loadPack().classifications.some((c) => c.recordingRequired)).toBe(false)
    expect(await varianceValidity(unqueryable, 'any-application', signal)).toBe('not_required')
  })
})
