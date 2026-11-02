// @vitest-environment jsdom
import { NH_CODE_EDITIONS } from '@packs/nh/codeEditions'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { describeCodeEdition } from '@/features/building/codeEdition'
import { humanizeIsoDates } from '@/lib/formatDate'
import { findIsoDates } from '@/test/leaks'
import type { CivilDate } from '@/types/civilDate'

vi.mock('./actions', () => ({ recordCodeEditionAction: () => Promise.resolve({ ok: true }) }))
vi.mock('./buildingActions', () => ({
  regionalImpactAction: () => Promise.resolve({ ok: true }),
  regionalNoticeAction: () => Promise.resolve({ ok: true }),
}))

const { CodeEditionPanel, RegionalImpactPanel } = await import('./buildingPanels')

afterEach(cleanup)

const verified = NH_CODE_EDITIONS.find((e) => e.status === 'verified' && e.components.length > 0)

function view(): StaffApplicationView {
  if (verified === undefined) throw new Error('fixture edition missing')
  return {
    id: 'app-1',
    state: 'submitted',
    classification: 'nh.building_permit',
    permissions: { canIssue: true },
    codeEdition: {
      record: {},
      description: describeCodeEdition(verified, '2027-05-20' as CivilDate),
      rows: [{ field: 'Application received', value: 'May 20, 2027' }],
    },
  } as unknown as StaffApplicationView
}

describe('CodeEditionPanel', () => {
  it('states the edition once instead of repeating its code list', () => {
    render(
      <CsrfProvider token="t">
        <CodeEditionPanel view={view()} />
      </CsrfProvider>,
    )
    const label = humanizeIsoDates(verified?.label ?? '')
    const headline = screen.getByRole('region', { name: 'Code edition' }).querySelectorAll('strong')
    expect(Array.from(headline).map((e) => e.textContent)).toEqual([label])
    const list = (verified?.components ?? []).map((c) => `${c.code} ${c.edition}`).join(', ')
    expect(screen.queryByText(list)).toBeNull()
  })

  it('prints no ISO date in the headline or the election options', () => {
    const { container } = render(
      <CsrfProvider token="t">
        <CodeEditionPanel view={view()} />
      </CsrfProvider>,
    )
    expect(findIsoDates(container.textContent)).toEqual([])
  })

  it('labels the applicant election field in words', () => {
    render(
      <CsrfProvider token="t">
        <CodeEditionPanel view={view()} />
      </CsrfProvider>,
    )
    expect(screen.getByLabelText(/Applicant election/)).toBeTruthy()
    expect(screen.queryByLabelText(/edition key/)).toBeNull()
  })
})

function regionalView(state: string): StaffApplicationView {
  return {
    id: 'app-1',
    state,
    today: '2027-05-20',
    permissions: { canDetermineRegionalImpact: true },
    regionalImpact: {
      applies: true,
      determination: { determination: 'yes', determinedOn: '2027-05-01', previousBoardRef: null },
      notices: [],
    },
  } as unknown as StaffApplicationView
}

describe('RegionalImpactPanel', () => {
  it('offers the determination and notice forms before issuance', () => {
    render(
      <CsrfProvider token="t">
        <RegionalImpactPanel view={regionalView('under_review')} />
      </CsrfProvider>,
    )
    expect(screen.getByRole('button', { name: 'Record determination' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Record notice' })).toBeTruthy()
  })

  it('shows the record without forms once the permit is issued or closed', () => {
    for (const state of ['issued', 'closed']) {
      render(
        <CsrfProvider token="t">
          <RegionalImpactPanel view={regionalView(state)} />
        </CsrfProvider>,
      )
      expect(screen.queryByRole('button', { name: 'Record determination' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Record notice' })).toBeNull()
      expect(screen.getByText(/Determination:/)).toBeTruthy()
      cleanup()
    }
  })
})
