// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { AliasOverrideRow } from '@/features/parcels/aliasOverrides'
import type { CivilDate } from '@/types/civilDate'

vi.mock('../../parcels/[parcelId]/actions', () => ({ createAliasOverrideAction: vi.fn() }))

const { EditAliasOverride } = await import('./AliasOverrideForms')

afterEach(cleanup)

const row: AliasOverrideRow = {
  id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  format: 'cama15',
  value: '000210040000000',
  parcelId: '6f5e4d3c-2b1a-4c0d-9e8f-7a6b5c4d3e2f',
  parcelDisplayId: '021-004',
  reason: 'Assessor merged the lots',
  createdBy: 'staff',
  createdAt: new Date('2026-10-01T12:00:00Z'),
  expiresOn: '2027-06-30' as CivilDate,
  status: 'applied',
  replaced: null,
}

describe('changing a parcel ID override', () => {
  it('opens filled in, keeps the ID, and says the old one stays as superseded', () => {
    render(
      <CsrfProvider token="t1">
        <EditAliasOverride row={row} />
      </CsrfProvider>,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit override for cama15: 000210040000000' }),
    )
    const dialog = screen.getByRole('dialog')
    const hidden = (name: string) =>
      dialog.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value
    expect(hidden('format')).toBe('cama15')
    expect(hidden('value')).toBe('000210040000000')
    expect(hidden('parcelId')).toBe(row.parcelId)
    expect(screen.getByLabelText<HTMLInputElement>(/^Reason( \*)?$/).value).toBe(row.reason)
    expect(screen.getByLabelText<HTMLInputElement>('Expires on').value).toBe('2027-06-30')
    expect(dialog.textContent).toContain('Leave blank to keep 021-004.')
    expect(dialog.textContent).toContain('This one stays listed as superseded.')
  })
})
