import type { CodeEditionEntry } from '@packs/nh/schema'
import { describe, expect, it } from 'vitest'
import { resolveCodeEdition } from '@/features/building/codeEdition'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate
const citation = { label: 'Fixture', url: 'https://example.test' }

const TABLE: CodeEditionEntry[] = [
  {
    key: 'A',
    label: 'Edition A',
    status: 'verified',
    effectiveFrom: d('2020-01-01'),
    enforcementFrom: null,
    components: [],
    amendmentPackages: [],
    electionWindow: null,
    citation,
  },
  {
    key: 'B',
    label: 'Edition B',
    status: 'verified',
    effectiveFrom: d('2027-07-01'),
    enforcementFrom: null,
    components: [],
    amendmentPackages: [],
    electionWindow: { until: d('2027-12-31'), mayElect: ['A'] },
    citation,
  },
  {
    key: 'U',
    label: 'Unverified',
    status: 'unverified',
    effectiveFrom: d('1970-01-01'),
    enforcementFrom: null,
    components: [],
    amendmentPackages: [],
    electionWindow: null,
    citation,
  },
]

describe('resolveCodeEdition', () => {
  it('receipt 2027-06-30 is edition A', () => {
    expect(resolveCodeEdition(TABLE, d('2027-06-30'))).toEqual({
      ok: true,
      value: { editionKey: 'A', label: 'Edition A', status: 'verified', elected: false },
    })
  })

  it('receipt 2027-07-01 is edition B', () => {
    const r = resolveCodeEdition(TABLE, d('2027-07-01'))
    expect(r.ok && r.value.editionKey).toBe('B')
  })

  it('receipt 2027-08-01 electing A is allowed and marked elected', () => {
    expect(resolveCodeEdition(TABLE, d('2027-08-01'), 'A')).toEqual({
      ok: true,
      value: { editionKey: 'A', label: 'Edition A', status: 'verified', elected: true },
    })
  })

  it('receipt 2028-01-02 electing A is election_not_allowed', () => {
    expect(resolveCodeEdition(TABLE, d('2028-01-02'), 'A')).toEqual({
      ok: false,
      error: 'election_not_allowed',
    })
  })

  it('electing an edition that the window does not list is election_not_allowed', () => {
    expect(resolveCodeEdition(TABLE, d('2027-08-01'), 'U')).toEqual({
      ok: false,
      error: 'election_not_allowed',
    })
  })

  it('electing the governing edition is not an election', () => {
    const r = resolveCodeEdition(TABLE, d('2027-08-01'), 'B')
    expect(r.ok && r.value.elected).toBe(false)
  })

  it('a receipt before every entry has no edition', () => {
    const r = resolveCodeEdition(TABLE.slice(0, 2), d('2019-12-31'))
    expect(r).toEqual({ ok: false, error: 'no_edition_for_date' })
  })

  it('an unverified period resolves with its status so the UI can say so', () => {
    const r = resolveCodeEdition([TABLE[2] as CodeEditionEntry], d('2020-05-05'))
    expect(r.ok && r.value.status).toBe('unverified')
  })

  it('does not depend on table order', () => {
    const r = resolveCodeEdition([...TABLE].reverse(), d('2027-08-01'))
    expect(r.ok && r.value.editionKey).toBe('B')
  })
})
