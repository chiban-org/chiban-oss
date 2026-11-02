// @vitest-environment jsdom
import { NH_STARTERS } from '@packs/nh/starters'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorContextProvider } from '@/components/config/EditorContextProvider'
import { CONFIG_EDITORS } from '@/components/config/editorRegistry'
import { editorContext } from '@/features/config/editorContext'
import { CONFIG_KINDS, type ConfigKind } from '@/features/config/kinds'
import { skeletonBody } from '@/features/config/skeletons'

afterEach(cleanup)

vi.mock('@/features/auth/csrfRefresh', () => ({ ensureCsrfAction: () => Promise.resolve('tok') }))

const STARTER = NH_STARTERS[0]

function starterOrDefaultBody(kind: ConfigKind): unknown {
  if (STARTER === undefined) throw new Error('missing starter')
  switch (kind) {
    case 'form':
      return STARTER.form
    case 'fee_schedule':
      return STARTER.feeSchedule
    case 'condition_library':
      return STARTER.conditionLibrary
    case 'inspection_checklist':
      return STARTER.checklists[0]
    case 'template':
      return STARTER.templates[0]
    case 'application_type':
      return STARTER.applicationType
    case 'town_rule_setting':
      return skeletonBody(kind, 'town.bp.validity')
    case 'local_code_amendment':
    case 'payment_settings':
    case 'inspection_settings':
    case 'board_settings':
    case 'regional_contacts':
      return skeletonBody(kind, 'default')
  }
}

describe('CONFIG_EDITORS', () => {
  it.each(
    CONFIG_KINDS,
  )('every config kind renders its editor with the starter or default body: %s', (kind) => {
    const Editor = CONFIG_EDITORS[kind]
    const { container } = render(
      <EditorContextProvider value={editorContext()}>
        <Editor body={starterOrDefaultBody(kind)} onChange={vi.fn()} issues={[]} />
      </EditorContextProvider>,
    )
    expect(container.querySelector('input, textarea, select, [role="alert"]')).not.toBeNull()
  })
})
