// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { VersionHistory } from '@/components/config/VersionHistory'

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
})
