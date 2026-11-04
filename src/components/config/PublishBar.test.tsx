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

function renderForm(kind: 'condition_library' | 'board_settings') {
  const publish = vi.fn((_: FormData) =>
    Promise.resolve({ ok: true as const, message: 'Published version 2.' }),
  )
  const save = vi.fn((_: FormData) =>
    Promise.resolve({ ok: true as const, message: 'Draft saved.' }),
  )
  render(
    <ConfigEditorForm
      kind={kind}
      configKey="default"
      initialBody={skeletonBody(kind, 'default')}
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
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(screen.getByRole('dialog').textContent).toContain(
      'Open applications keep the version they started under.',
    )
    expect(publish).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Publish now' }))
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1))
    expect(publish.mock.calls[0]?.[0].get('intent')).toBe('publish')
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Published version 2.'))
  })

  it('sends nothing when the person keeps editing', () => {
    const { publish, save } = renderForm('condition_library')
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(publish).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('says a setting without versions on applications takes effect straight away', () => {
    renderForm('board_settings')
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(screen.getByRole('dialog').textContent).toContain('as soon as you publish')
  })

  it('explains draft and publish once in plain words', () => {
    renderForm('condition_library')
    expect(
      screen.getAllByText(/Save draft keeps your changes without using them yet/),
    ).toHaveLength(1)
  })
})
