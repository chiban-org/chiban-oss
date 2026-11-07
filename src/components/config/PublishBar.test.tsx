// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfigEditorForm } from '@/components/config/ConfigEditorForm'
import { skeletonBody } from '@/features/config/skeletons'

afterEach(cleanup)

vi.mock('@/features/auth/csrfRefresh', () => ({ ensureCsrfAction: () => Promise.resolve('tok') }))

const context = {
  packRules: [],
  classifications: [],
  mergeFields: [],
  reviewers: [],
  townRules: {},
}

function renderForm(
  kind: 'condition_library' | 'board_settings' | 'inspection_settings' | 'payment_settings',
  initialBody: unknown = skeletonBody(kind, 'default'),
) {
  const publish = vi.fn((_: FormData) =>
    Promise.resolve({ ok: true as const, message: 'Put version 2 into use.' }),
  )
  const save = vi.fn((_: FormData) =>
    Promise.resolve({ ok: true as const, message: 'Draft saved.' }),
  )
  render(
    <ConfigEditorForm
      kind={kind}
      configKey="default"
      initialBody={initialBody}
      resetKey="v1"
      context={context}
      saveAction={save}
      publishAction={publish}
    />,
  )
  return { publish, save }
}

describe('publishing asks first', () => {
  it('opens a confirmation that says open applications keep their version', async () => {
    const { publish } = renderForm('condition_library')
    fireEvent.click(screen.getByRole('button', { name: 'Put into use' }))
    expect(screen.getByRole('dialog').textContent).toContain(
      'Open applications keep the version they started under.',
    )
    expect(publish).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Put into use now' }))
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1))
    expect(publish.mock.calls[0]?.[0].get('intent')).toBe('publish')
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Put version 2 into use.'),
    )
  })

  it('sends nothing when the person keeps editing', () => {
    const { publish, save } = renderForm('condition_library')
    fireEvent.click(screen.getByRole('button', { name: 'Put into use' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(publish).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('says a setting without versions on applications takes effect straight away', () => {
    renderForm('board_settings')
    fireEvent.click(screen.getByRole('button', { name: 'Put into use' }))
    expect(screen.getByRole('dialog').textContent).toContain('as soon as you put it into use')
  })

  it('explains draft and publish once in plain words', () => {
    renderForm('condition_library')
    expect(
      screen.getAllByText(/Save draft keeps your changes without using them yet/),
    ).toHaveLength(1)
  })

  it('names a field the browser refuses instead of closing the confirmation silently', () => {
    const body = { ...(skeletonBody('inspection_settings', 'default') as object), horizonDays: 0 }
    const { publish } = renderForm('inspection_settings', body)
    fireEvent.click(screen.getByRole('button', { name: 'Put into use' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('alert').textContent).toBe(
      'Fix this before putting it into use: Days ahead that can be booked must be 1 or more.',
    )
    expect(publish).not.toHaveBeenCalled()
  })

  it('names an emptied convenience fee amount instead of publishing the old one', () => {
    const body = {
      key: 'default',
      convenienceFee: { basisPoints: 250, fixedCents: 30, appliesTo: ['card_online'] },
      receiptFooter: '',
      checksPayableTo: 'Town of Alder Pond',
    }
    const { publish } = renderForm('payment_settings', body)
    fireEvent.change(screen.getByLabelText(/^Percent of the payment/), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText(/^Plus a set amount/), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Put into use' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('alert').textContent).toBe(
      'Fix these before putting it into use: Percent of the payment is required; Plus a set amount is required.',
    )
    expect(publish).not.toHaveBeenCalled()
  })
})
