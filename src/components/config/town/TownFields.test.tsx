// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LetterheadPreview } from '@/components/config/town/LetterheadPreview'
import { SignersFields } from '@/components/config/town/SignersFields'
import {
  SIGNER_ROLES,
  TOWN_PROFILE_SKELETON,
  type TownProfileBody,
} from '@/features/town/profileSchema'

afterEach(cleanup)

vi.mock('@/features/auth/csrfRefresh', () => ({ ensureCsrfAction: () => Promise.resolve('tok') }))

const BODY: TownProfileBody = {
  ...TOWN_PROFILE_SKELETON,
  addressLines: ['1 Main Street', 'Alder Pond, NH 03000'],
  phone: '603-555-0100',
  website: 'https://alderpond.example',
  letterhead: { ...TOWN_PROFILE_SKELETON.letterhead, footerText: 'Keep for your records.' },
  boardOverrides: { zba: { officeName: 'Zoning Board of Adjustment' } },
}

describe('LetterheadPreview', () => {
  it('shows the lines the letterhead turns on and a board override on request', () => {
    render(<LetterheadPreview townName="Town of Alder Pond" body={BODY} />)
    const preview = screen.getByLabelText('Letterhead preview')
    expect(preview.textContent).toContain('Land Use Office')
    expect(preview.textContent).toContain('1 Main Street, Alder Pond, NH 03000')
    expect(preview.textContent).not.toContain('alderpond.example')
    expect(preview.textContent).toContain('Keep for your records.')
    expect(preview.textContent).toContain('Page 1 of 1')
    fireEvent.change(screen.getByLabelText('Preview for'), { target: { value: 'zba' } })
    expect(preview.textContent).toContain('Zoning Board of Adjustment')
    expect(screen.getByText('Download sample PDF').getAttribute('href')).toBe(
      '/staff/settings/letterhead/sample.pdf?board=zba',
    )
  })
})

describe('SignersFields', () => {
  it('adds a signer for a role nobody holds yet', () => {
    const onChange = vi.fn()
    const signers = [{ role: 'building_official' as const, name: 'A', title: 'B', signature: null }]
    render(<SignersFields body={{ ...BODY, signers }} onChange={onChange} errors={{}} />)
    fireEvent.click(screen.getByText('Add a signer'))
    const next = onChange.mock.calls[0]?.[0] as TownProfileBody | undefined
    expect(next?.signers.map((s) => s.role)).toEqual([
      'building_official',
      'land_use_administrator',
    ])
  })

  it('offers no new signer once every role is held', () => {
    const signers = SIGNER_ROLES.map((role) => ({ role, name: 'A', title: 'B', signature: null }))
    render(<SignersFields body={{ ...BODY, signers }} onChange={vi.fn()} errors={{}} />)
    expect(screen.queryByText('Add a signer')).toBeNull()
  })
})
