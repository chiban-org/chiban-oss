// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfigEditorForm } from '@/components/config/ConfigEditorForm'
import type { BoardSettingsBody } from '@/features/boards/boardSettings'
import { skeletonBody } from '@/features/config/skeletons'
import type { ActionResult } from '@/server/actionRunner'

afterEach(cleanup)

vi.mock('@/features/auth/csrfRefresh', () => ({ ensureCsrfAction: () => Promise.resolve('tok') }))

const context = {
  packRules: [],
  classifications: [],
  mergeFields: [],
  reviewers: [],
  townRules: {},
}

function renderBoardSettings(publish: (formData: FormData) => Promise<ActionResult>) {
  render(
    <ConfigEditorForm
      kind="board_settings"
      configKey="default"
      initialBody={skeletonBody('board_settings', 'default')}
      resetKey="v1"
      context={context}
      saveAction={publish}
      publishAction={publish}
    />,
  )
  return screen.getByRole('group', { name: 'Alder Pond Planning Board' })
}

function publishNow() {
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
  fireEvent.click(screen.getByRole('button', { name: 'Publish now' }))
}

describe('board settings filing deadline', () => {
  it('collects who adopted a changed filing deadline and when, and sends it on publish', async () => {
    const publish = vi.fn((_: FormData) =>
      Promise.resolve({ ok: true as const, message: 'Published version 2.' }),
    )
    const planning = renderBoardSettings(publish)
    fireEvent.change(within(planning).getByLabelText('Filing deadline, days before the meeting'), {
      target: { value: '14' },
    })
    fireEvent.change(within(planning).getByLabelText('Adopted by'), {
      target: { value: 'Planning Board' },
    })
    fireEvent.change(within(planning).getByLabelText('Adopted on'), {
      target: { value: '2027-01-12' },
    })
    publishNow()
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1))
    const raw = publish.mock.calls[0]?.[0].get('body')
    const sent = JSON.parse(typeof raw === 'string' ? raw : '{}') as BoardSettingsBody
    expect(sent.boards.find((b) => b.board === 'planning_board')).toMatchObject({
      filingLeadDays: 14,
      filingLeadAdoption: { adoptingAuthority: 'Planning Board', adoptedOn: '2027-01-12' },
    })
  })

  it('shows a refusal of the filing deadline or its adoption record beside the fields', async () => {
    const refuse = () =>
      Promise.resolve({
        ok: false as const,
        error: 'This version cannot be published yet.',
        fieldErrors: {
          filingLeadDays: 'Too long.',
          filingLeadAdoption: 'Enter who adopted it.',
        },
      })
    const planning = renderBoardSettings(refuse)
    fireEvent.change(within(planning).getByLabelText('Filing deadline, days before the meeting'), {
      target: { value: '14' },
    })
    publishNow()
    await waitFor(() => expect(within(planning).getByText('Too long.')).toBeTruthy())
    expect(within(planning).getByText('Enter who adopted it.')).toBeTruthy()
    expect(screen.getAllByText('Too long.')).toHaveLength(2)
  })
})
