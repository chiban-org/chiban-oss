// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LetterheadFields } from '@/components/config/town/LetterheadFields'
import { LetterheadPreview } from '@/components/config/town/LetterheadPreview'
import { SignersFields } from '@/components/config/town/SignersFields'
import {
  SIGNER_ROLES,
  TOWN_PROFILE_SKELETON,
  type TownProfileBody,
} from '@/features/town/profileSchema'

afterEach(cleanup)

vi.mock('@/features/auth/csrfRefresh', () => ({ ensureCsrfAction: () => Promise.resolve('tok') }))

const ZBA_ID = '22222222-2222-4222-8222-222222222222'
const BOARDS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'planning_board' as const,
    name: 'Alder Pond Planning Board',
    shortName: 'Planning Board',
  },
  {
    id: ZBA_ID,
    kind: 'zba' as const,
    name: 'Alder Pond Zoning Board of Adjustment',
    shortName: 'Zoning Board of Adjustment',
  },
]

const BODY: TownProfileBody = {
  ...TOWN_PROFILE_SKELETON,
  addressLines: ['1 Main Street', 'Alder Pond, NH 03000'],
  phone: '603-555-0100',
  website: 'https://alderpond.example',
  letterhead: { ...TOWN_PROFILE_SKELETON.letterhead, footerText: 'Keep for your records.' },
  boardOverrides: { [ZBA_ID]: { officeName: 'Zoning Board of Adjustment' } },
}

describe('LetterheadFields', () => {
  it('says the contact lines come from the town profile and keeps the footer hint off contact details', () => {
    const { container } = render(
      <LetterheadFields body={BODY} boards={BOARDS} onChange={() => undefined} />,
    )
    expect(container.textContent).toContain('office hours come from the Town profile')
    expect(screen.getByRole('link', { name: 'Town profile' }).getAttribute('href')).toBe(
      '/staff/settings/town-profile',
    )
    expect(screen.getByLabelText('Footer text').closest('div')?.textContent).not.toMatch(
      /mailing address/,
    )
  })
})

describe('LetterheadPreview', () => {
  it('shows the lines the letterhead turns on and a board override on request', () => {
    render(<LetterheadPreview townName="Town of Alder Pond" body={BODY} boards={BOARDS} />)
    const preview = screen.getByLabelText('Letterhead preview')
    expect(preview.textContent).toContain('Land Use Office')
    expect(preview.textContent).toContain('1 Main Street, Alder Pond, NH 03000')
    expect(preview.textContent).not.toContain('alderpond.example')
    expect(preview.textContent).toContain('Keep for your records.')
    expect(preview.textContent).toContain('Page 1 of 1')
    fireEvent.change(screen.getByLabelText('Preview for'), { target: { value: ZBA_ID } })
    expect(preview.textContent).toContain('Zoning Board of Adjustment')
    expect(screen.getByText('Download sample PDF').getAttribute('href')).toBe(
      `/staff/settings/letterhead/sample.pdf?board=${ZBA_ID}`,
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
