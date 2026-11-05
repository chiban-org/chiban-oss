// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { VersionHistory } from '@/components/config/VersionHistory'
import { versionChanges } from '@/features/config/versionChanges'

afterEach(cleanup)

const ROWS = [
  {
    id: 'v3',
    version: 3,
    status: 'published' as const,
    publishedBy: 'Alex Admin',
    publishedAt: new Date('2027-03-02T15:00:00Z'),
    upstream: null,
    rolledBackFrom: 1,
  },
  {
    id: 'v2',
    version: 2,
    status: 'superseded' as const,
    publishedBy: 'Alex Admin',
    publishedAt: new Date('2027-02-02T15:00:00Z'),
    upstream: null,
    rolledBackFrom: null,
  },
  {
    id: 'v1',
    version: 1,
    status: 'superseded' as const,
    publishedBy: 'Alex Admin',
    publishedAt: new Date('2027-01-02T15:00:00Z'),
    upstream: { id: 'nh.starter.building', version: 1 },
    rolledBackFrom: null,
  },
  {
    id: 'v4',
    version: 4,
    status: 'draft' as const,
    publishedBy: null,
    publishedAt: null,
    upstream: null,
    rolledBackFrom: null,
  },
]

describe('VersionHistory', () => {
  it('lists version, status, who published and when, and the upstream template', () => {
    render(<VersionHistory rows={ROWS} timeZone="America/New_York" />)
    const row1 = screen.getByText('Version 1').closest('tr') as HTMLElement
    expect(within(row1).getByText('Replaced')).toBeTruthy()
    expect(within(row1).getByText('Building or demolition permit starter, version 1')).toBeTruthy()
    expect(within(row1).getByText(/Alex Admin/)).toBeTruthy()
    const row4 = screen.getByText('Version 4').closest('tr') as HTMLElement
    expect(within(row4).getByText('Draft')).toBeTruthy()
    expect(within(row4).getByText('Not published')).toBeTruthy()
  })

  it('says when a version was restored from an older one', () => {
    render(<VersionHistory rows={ROWS} timeZone="America/New_York" />)
    expect(screen.getByText('Restored from version 1')).toBeTruthy()
  })

  it('shows the publish time in the town time zone and offers a restore slot per older version', () => {
    render(
      <VersionHistory
        rows={ROWS}
        timeZone="America/New_York"
        rollbackSlot={(row) => <button type="button">{`Restore ${row.version}`}</button>}
      />,
    )
    expect(screen.getByText(/March 2, 2027, 10:00 AM/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Restore 3' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restore 4' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Restore 2' })).toBeTruthy()
  })

  it('says so when nothing has been saved', () => {
    render(<VersionHistory rows={[]} timeZone="America/New_York" />)
    expect(screen.getByText(/Nothing is saved yet/)).toBeTruthy()
  })

  describe('what changed between versions', () => {
    const LABELS = { '/codeSection': 'Code section', '/townText': "Town's amended text" }
    const rowWith = (
      version: number,
      body: unknown,
      older?: { version: number; body: unknown },
    ) => ({
      id: `b${version}`,
      version,
      status: version === 2 ? ('published' as const) : ('superseded' as const),
      publishedBy: 'Alex Admin',
      publishedAt: new Date('2027-03-02T15:00:00Z'),
      upstream: null,
      rolledBackFrom: null,
      ...(older === undefined
        ? {}
        : { changes: { from: older.version, items: versionChanges(older.body, body, LABELS) } }),
    })
    const v1 = {
      title: 'Snow load',
      codeSection: 'IRC R301.2',
      townText: 'Roofs in the northern zone shall be designed to carry 30 psf of ground snow load.',
    }
    const v2 = {
      title: 'Snow load',
      codeSection: 'IRC R301.3',
      townText: 'Roofs in the northern zone shall be designed to carry 60 psf of ground snow load.',
    }
    const rows = [rowWith(2, v2, { version: 1, body: v1 }), rowWith(1, v1)]

    it('lists each changed field against the previous version with its old and new value', () => {
      render(<VersionHistory rows={rows} timeZone="America/New_York" />)
      const changes = screen.getByRole('group', { name: 'Changes from version 1' })
      expect(within(changes).getByText('Code section')).toBeTruthy()
      expect(within(changes).getByText('IRC R301.2')).toBeTruthy()
      expect(within(changes).getByText('IRC R301.3')).toBeTruthy()
      expect(within(changes).queryByText('Title')).toBeNull()
    })

    it('shows long text as an inline word diff', () => {
      render(<VersionHistory rows={rows} timeZone="America/New_York" />)
      const changes = screen.getByRole('group', { name: 'Changes from version 1' })
      const text = within(changes).getByText("Town's amended text").parentElement as HTMLElement
      expect(text.querySelector('del')?.textContent).toBe('30')
      expect(text.querySelector('ins')?.textContent).toBe('60')
    })

    it('shows no changes for the first version and for rows without a change list', () => {
      render(<VersionHistory rows={ROWS} timeZone="America/New_York" />)
      expect(screen.queryByRole('group', { name: /Changes from version/ })).toBeNull()
    })

    it('says nothing changed when two versions match', () => {
      render(
        <VersionHistory
          rows={[rowWith(2, { a: 1 }, { version: 1, body: { a: 1 } }), rowWith(1, { a: 1 })]}
          timeZone="America/New_York"
        />,
      )
      expect(screen.getByText('No fields changed.')).toBeTruthy()
    })
  })
})
