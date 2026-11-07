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

function renderForm(discard?: { neverPublished: boolean }) {
  const publish = vi.fn((_: FormData) => Promise.resolve({ ok: true as const, message: 'P' }))
  const save = vi.fn((_: FormData) => Promise.resolve({ ok: true as const, message: 'S' }))
  const discardAction = vi.fn((_: FormData) =>
    Promise.resolve({ ok: true as const, message: 'Draft discarded.' }),
  )
  render(
    <ConfigEditorForm
      kind="condition_library"
      configKey="default"
      initialBody={skeletonBody('condition_library', 'default')}
      resetKey="v1"
      context={context}
      saveAction={save}
      publishAction={publish}
      {...(discard === undefined ? {} : { discard: { ...discard, action: discardAction } })}
    />,
  )
  return { publish, save, discardAction }
}

describe('discarding a draft', () => {
  it('offers no discard when there is no draft', () => {
    renderForm()
    expect(screen.queryByRole('button', { name: 'Discard draft' })).toBeNull()
  })

  it('asks first and says the version in use stays in use', async () => {
    const { discardAction } = renderForm({ neverPublished: false })
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
    expect(screen.getByRole('dialog').textContent).toContain('version in use stays in use')
    expect(discardAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Discard now' }))
    await waitFor(() => expect(discardAction).toHaveBeenCalledTimes(1))
    expect(discardAction.mock.calls[0]?.[0].get('intent')).toBe('discard')
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Draft discarded.'))
  })

  it('says a never-published draft is removed entirely', () => {
    renderForm({ neverPublished: true })
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
    expect(screen.getByRole('dialog').textContent).toContain('never been in use')
  })

  it('sends nothing when the person keeps the draft', () => {
    const { discardAction } = renderForm({ neverPublished: false })
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep the draft' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(discardAction).not.toHaveBeenCalled()
  })
})
