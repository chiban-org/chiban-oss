import { describe, expect, it } from 'vitest'
import { versionChanges } from '@/features/config/versionChanges'

const BEFORE = {
  title: 'Snow load for roofs',
  codeSection: 'IRC R301.2',
  reviewBoardConfirmedOn: null,
  stateText: 'Roofs shall be designed for the ground snow load shown on the state map.',
}

describe('versionChanges', () => {
  it('lists nothing when the bodies match', () => {
    expect(versionChanges(BEFORE, structuredClone(BEFORE))).toEqual([])
  })

  it('lists a changed short field with its old and new value', () => {
    expect(versionChanges(BEFORE, { ...BEFORE, codeSection: 'IRC R301.3' })).toEqual([
      {
        path: '/codeSection',
        label: 'Code section',
        before: 'IRC R301.2',
        after: 'IRC R301.3',
        inline: false,
      },
    ])
  })

  it('uses the supplied field labels', () => {
    const changes = versionChanges(
      BEFORE,
      { ...BEFORE, title: 'Roof snow load' },
      { '/title': 'Title of the change' },
    )
    expect(changes[0]?.label).toBe('Title of the change')
  })

  it('treats a field that was not there before as nothing and formats a date', () => {
    const changes = versionChanges(
      { title: 'A' },
      { title: 'A', reviewBoardConfirmedOn: '2027-03-02', townText: 'x' },
    )
    expect(changes).toEqual([
      {
        path: '/reviewBoardConfirmedOn',
        label: 'Review board confirmed on',
        before: 'nothing',
        after: 'March 2, 2027',
        inline: false,
      },
      { path: '/townText', label: 'Town text', before: 'nothing', after: 'x', inline: false },
    ])
  })

  it('shows a cleared date as nothing', () => {
    const changes = versionChanges(
      { reviewBoardConfirmedOn: '2027-03-02' },
      { reviewBoardConfirmedOn: null },
    )
    expect(changes[0]).toMatchObject({ before: 'March 2, 2027', after: 'nothing' })
  })

  it('marks long or multi-line text for an inline diff', () => {
    const next = { ...BEFORE, stateText: `${BEFORE.stateText} Use 70 psf in the north.` }
    expect(versionChanges(BEFORE, next)[0]).toMatchObject({ path: '/stateText', inline: true })
    expect(versionChanges({ a: 'one' }, { a: 'one\ntwo' })[0]).toMatchObject({ inline: true })
  })

  it('works for any config body, not only amendments', () => {
    expect(
      versionChanges({ rate: 5, lines: [{ n: 1 }] }, { rate: 6, lines: [{ n: 1 }, { n: 2 }] }),
    ).toEqual([
      {
        path: '/lines/1',
        label: 'Lines, item 2',
        before: 'nothing',
        after: '{"n":2}',
        inline: false,
      },
      { path: '/rate', label: 'Rate', before: '5', after: '6', inline: false },
    ])
  })
})
