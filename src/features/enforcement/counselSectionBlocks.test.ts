import { getTableName, type Table } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { exposureBlocks } from '@/features/enforcement/counselSectionBlocks'
import { loadPack } from '@/features/packs/loadPack'
import type { CivilPenaltyRule } from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'

function recordingDb(): { db: DbOrTx; tables: string[] } {
  const tables: string[] = []
  const db = {
    select: () => ({
      from: (table: Table) => {
        tables.push(getTableName(table))
        return { where: () => Promise.resolve([]) }
      },
    }),
  } as unknown as DbOrTx
  return { db, tables }
}

const today = '2027-04-01' as CivilDate

describe('penalty exposure blocks under a pack without cure rules', () => {
  it('reads no case row when the order names its penalty rule', async () => {
    const rule = loadPack().rules.find((r): r is CivilPenaltyRule => r.kind === 'civil_penalty')
    if (rule === undefined) throw new Error('no penalty rule')
    const { db, tables } = recordingDb()
    const blocks = await exposureBlocks(db, {
      caseId: 'any-case',
      penaltyRule: rule,
      convictedOn: null,
      today,
    })
    expect(blocks.length).toBeGreaterThan(0)
    expect(tables).toEqual(['violation_notices'])
  })

  it('reads nothing when no penalty rule is given', async () => {
    const { db, tables } = recordingDb()
    expect(
      await exposureBlocks(db, { caseId: 'any-case', penaltyRule: null, convictedOn: null, today }),
    ).toEqual([])
    expect(tables).toEqual([])
  })
})
