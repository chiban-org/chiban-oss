import { describe, expect, it } from 'vitest'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { moveConfirm } from './nextStepCard'

function viewOf(classification: string): StaffApplicationView {
  return { number: 'BP-2027-0004', classification } as StaffApplicationView
}

describe('the confirm step on a staff move', () => {
  it('says a staff denial makes the decision letter', () => {
    expect(moveConfirm(viewOf('nh.building_permit'), 'denied')).toEqual({
      title: 'Deny BP-2027-0004?',
      body: 'This ends the application and makes the decision letter for the people on the project. It cannot be undone.',
      confirmLabel: 'Deny the application',
    })
  })

  it('says a staff approval makes the decision letter', () => {
    expect(moveConfirm(viewOf('nh.building_permit'), 'decided')).toMatchObject({
      title: 'Approve BP-2027-0004?',
      body: "This records the town's approval and makes the decision letter.",
    })
  })

  it('keeps the plain ending copy on a board application', () => {
    expect(moveConfirm(viewOf('nh.zba_variance'), 'withdrawn')).toMatchObject({
      body: 'This ends the application. It cannot be undone.',
    })
    expect(moveConfirm(viewOf('nh.zba_variance'), 'decided')).toBeUndefined()
  })
})
