import { describe, expect, it } from 'vitest'
import { groupRevisions } from '@/features/documents/revisions'

const row = (documentId: string, supersededBy: string | null = null) => ({
  documentId,
  supersededBy,
})

describe('groupRevisions', () => {
  it('lists earlier permit copies under the current one, newest first', () => {
    const groups = groupRevisions([
      row('snapshot'),
      row('r2'),
      row('r1', 'r2'),
      row('original', 'r1'),
    ])
    expect(groups.map((g) => g.current.documentId)).toEqual(['snapshot', 'r2'])
    expect(groups[1]?.earlier.map((d) => d.documentId)).toEqual(['r1', 'original'])
  })

  it('keeps a superseded copy on its own when its successor is not listed', () => {
    const groups = groupRevisions([row('original', 'missing')])
    expect(groups).toEqual([{ current: row('original', 'missing'), earlier: [] }])
  })
})
