// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RtkRequestView } from '@/features/rtk/requests'
import type { RequestWorkPlan } from '@/features/rtk/workPlanTypes'
import type { CivilDate } from '@/types/civilDate'
import { type RailData, RequestRail, RequestStrip } from './RequestRail'

vi.mock('../actions', () => ({ closeRequestAction: vi.fn() }))

afterEach(cleanup)

function railData(patch: Partial<RtkRequestView>): RailData {
  const request = {
    id: '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d',
    status: 'responded',
    receivedOn: '2026-11-02',
    receivedVia: 'email',
    requesterName: null,
    requesterContact: null,
    firstResponseKind: 'made_available',
    firstResponseOn: '2026-11-05',
    acknowledgedOn: null,
    followUpOn: null,
    deniedOn: null,
    ...patch,
  } as unknown as RtkRequestView
  const plan = { now: null, due: null } as unknown as RequestWorkPlan
  return { request, plan, today: '2026-11-20' as CivilDate, canManage: false }
}

function factIn(region: HTMLElement, label: string): string {
  const term = within(region).getByText(label)
  return term.nextElementSibling?.textContent ?? ''
}

function shownFact(patch: Partial<RtkRequestView>, label: string): string[] {
  const data = railData(patch)
  render(<RequestRail data={data} />)
  const rail = factIn(screen.getByRole('region', { name: 'Key facts' }), label)
  cleanup()
  render(<RequestStrip data={data} />)
  const strip = factIn(screen.getByRole('region', { name: 'Status' }), label)
  cleanup()
  return [rail, strip]
}

const shownResponses = (patch: Partial<RtkRequestView>) => shownFact(patch, 'First response')

describe('the first response fact on the rail and the compact strip', () => {
  it('pairs the response with its own date when nothing was acknowledged', () => {
    expect(shownResponses({})).toEqual([
      'Records made available, November 5, 2026',
      'Records made available, November 5, 2026',
    ])
  })

  it('shows the acknowledgement and the later response as two facts', () => {
    const patch = {
      acknowledgedOn: '2026-11-05' as CivilDate,
      followUpOn: '2026-11-12' as CivilDate,
    }
    expect(shownFact(patch, 'Acknowledged')).toEqual(['November 5, 2026', 'November 5, 2026'])
    expect(shownFact(patch, 'Response')).toEqual([
      'Records made available, November 12, 2026',
      'Records made available, November 12, 2026',
    ])
  })

  it('dates a denial after an acknowledgement from the follow-up', () => {
    expect(
      shownFact(
        {
          firstResponseKind: 'denied',
          acknowledgedOn: '2026-11-05' as CivilDate,
          followUpOn: '2026-11-09' as CivilDate,
        },
        'Response',
      )[0],
    ).toBe('Denied, with the exemption cited, November 9, 2026')
  })

  it('shows only the acknowledgement while no follow-up is recorded', () => {
    const patch = { firstResponseKind: 'acknowledged', acknowledgedOn: '2026-11-05' as CivilDate }
    expect(shownFact(patch, 'Acknowledged')).toEqual(['November 5, 2026', 'November 5, 2026'])
    render(<RequestRail data={railData(patch)} />)
    expect(screen.queryByText('Response')).toBeNull()
    expect(screen.queryByText('First response')).toBeNull()
  })
})
