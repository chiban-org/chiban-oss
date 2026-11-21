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

function firstResponseIn(region: HTMLElement): string {
  const term = within(region).getByText('First response')
  return term.nextElementSibling?.textContent ?? ''
}

function shownResponses(patch: Partial<RtkRequestView>): string[] {
  const data = railData(patch)
  render(<RequestRail data={data} />)
  const rail = firstResponseIn(screen.getByRole('region', { name: 'Key facts' }))
  cleanup()
  render(<RequestStrip data={data} />)
  const strip = firstResponseIn(screen.getByRole('region', { name: 'Status' }))
  return [rail, strip]
}

describe('the first response fact on the rail and the compact strip', () => {
  it('pairs the response with its own date when nothing was acknowledged', () => {
    expect(shownResponses({})).toEqual([
      'Records made available, November 5, 2026',
      'Records made available, November 5, 2026',
    ])
  })

  it('dates a response after an acknowledgement from the follow-up', () => {
    expect(
      shownResponses({
        acknowledgedOn: '2026-11-05' as CivilDate,
        followUpOn: '2026-11-12' as CivilDate,
      }),
    ).toEqual([
      'Records made available, November 12, 2026',
      'Records made available, November 12, 2026',
    ])
  })

  it('dates a denial after an acknowledgement from the follow-up', () => {
    expect(
      shownResponses({
        firstResponseKind: 'denied',
        acknowledgedOn: '2026-11-05' as CivilDate,
        followUpOn: '2026-11-09' as CivilDate,
      })[0],
    ).toBe('Denied, with the exemption cited, November 9, 2026')
  })

  it('shows the acknowledgement date while no follow-up is recorded', () => {
    expect(
      shownResponses({
        firstResponseKind: 'acknowledged',
        acknowledgedOn: '2026-11-05' as CivilDate,
      }),
    ).toEqual(['Receipt acknowledged, November 5, 2026', 'Receipt acknowledged, November 5, 2026'])
  })
})
