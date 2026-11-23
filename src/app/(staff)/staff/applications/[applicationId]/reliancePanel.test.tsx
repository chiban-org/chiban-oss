// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { CHECK_ONLY_FIELD } from '@/constants/formCheck'
import type { RelianceView } from '@/features/decisions/relianceView'

vi.mock('./relianceActions', () => ({
  linkRelianceAction: vi.fn(),
  unlinkRelianceAction: vi.fn(),
}))

const { ReliancePanel } = await import('./reliancePanel')
const { unlinkRelianceAction } = await import('./relianceActions')

const RELIANCE: RelianceView = {
  choices: [],
  linked: [{ id: 'v1', number: 'ZB-2027-0001', validity: 'void' }],
}

function sentForms(): FormData[] {
  return vi
    .mocked(unlinkRelianceAction)
    .mock.calls.map(([formData]) => formData)
    .filter((f) => !f.has(CHECK_ONLY_FIELD))
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function show(canLink: boolean) {
  render(
    <CsrfProvider token="tok">
      <ReliancePanel
        applicationId="p1"
        validity="not_required"
        reliance={RELIANCE}
        canLink={canLink}
      />
    </CsrfProvider>,
  )
}

describe('the reliance panel', () => {
  it('removes a link through its action', async () => {
    vi.mocked(unlinkRelianceAction).mockResolvedValue({ ok: true, message: 'Removed.' })
    show(true)
    fireEvent.click(screen.getByRole('button', { name: 'Remove this link' }))
    await screen.findByRole('dialog')
    expect(sentForms()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Remove the link' }))
    await waitFor(() => expect(sentForms()).toHaveLength(1))
    const sent = sentForms()[0]
    expect(sent?.get('applicationId')).toBe('p1')
    expect(sent?.get('varianceApplicationId')).toBe('v1')
  })

  it('offers no removal to a person who cannot record board actions', () => {
    show(false)
    expect(screen.queryByRole('button', { name: 'Remove this link' })).toBeNull()
  })
})
