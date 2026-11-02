// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfigEditorForm } from '@/components/config/ConfigEditorForm'
import { ApplicationTypeBodySchema } from '@/features/applications/applicationTypeSchema'
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

describe('ConfigEditorForm errors', () => {
  it('lists every refused field, including ones the editor has no slot for', async () => {
    const refuse = () =>
      Promise.resolve({
        ok: false as const,
        error: 'The draft has errors.',
        fieldErrors: {
          prefix: 'Use one to four capital letters.',
          checklistKeys: 'Leave no checklist key blank.',
        },
      })
    render(
      <ConfigEditorForm
        kind="application_type"
        configKey="CRIT5"
        initialBody={skeletonBody('application_type', 'CRIT5')}
        resetKey="v1"
        context={context}
        saveAction={refuse}
        publishAction={refuse}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(screen.getByText('The draft has errors.')).toBeTruthy())
    expect(screen.getByText('Prefix: Use one to four capital letters.')).toBeTruthy()
    expect(screen.getByText('Checklist keys: Leave no checklist key blank.')).toBeTruthy()
  })
})

describe('application type prefix', () => {
  it('explains the allowed prefix in words', () => {
    const body = { ...(skeletonBody('application_type', 'CRIT5') as object), prefix: 'CRIT5' }
    const parsed = ApplicationTypeBodySchema.safeParse(body)
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map((i) => i.message)).toContain(
      'Use one to four capital letters, such as BP.',
    )
  })
})
