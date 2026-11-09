// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { RequestPanel } from './RequestPanel'

vi.mock('./actions', () => ({ portalRequestInspectionAction: vi.fn() }))

afterEach(cleanup)

const props = {
  applicationId: 'a1',
  types: [{ checklistVersionId: 'c1', label: 'Framing inspection' }],
  dates: [],
  phoneHoursText: '',
  contact: { name: 'Alex', phone: '' },
}

function panel(reinspectionOf: string | null) {
  return (
    <CsrfProvider token="t1">
      <RequestPanel
        {...props}
        reinspectionOf={reinspectionOf}
        startOpen={reinspectionOf !== null}
      />
    </CsrfProvider>
  )
}

describe('RequestPanel', () => {
  it('opens when a reinspection is chosen after the page first loaded closed', () => {
    const { rerender, container } = render(panel(null))
    expect(container.querySelector('details')?.open).toBe(false)
    rerender(panel('i1'))
    expect(container.querySelector('details')?.open).toBe(true)
  })
})
