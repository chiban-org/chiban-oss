// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BuildingProgramEditor } from '@/components/config/BuildingProgramEditor'
import { EditorContextProvider } from '@/components/config/EditorContextProvider'
import type { EditorContext } from '@/features/config/editorContext'

afterEach(cleanup)

const context: EditorContext = {
  packRules: [],
  classifications: [],
  mergeFields: [],
  boards: [],
  reviewers: [],
  townRules: {},
  buildingCodes: {
    choices: [{ key: 'state_code', label: 'State building code' }],
    defaultChoice: 'state_code',
    requiredAbove: null,
  },
}

function renderEditor(codeChoice: string | null) {
  render(
    <EditorContextProvider value={context}>
      <BuildingProgramEditor
        body={{ key: 'default', permitsEnabled: true, codeChoice, residents: null }}
        onChange={vi.fn()}
        errors={{}}
      />
    </EditorContextProvider>,
  )
}

describe('BuildingProgramEditor with one code choice', () => {
  it('shows the choice label while the town enforces it', () => {
    renderEditor('state_code')
    expect(screen.getByText('State building code')).toBeTruthy()
  })

  it('shows no building code when the choice is null', () => {
    renderEditor(null)
    expect(screen.getByText('No building code')).toBeTruthy()
    expect(screen.queryByText('State building code')).toBeNull()
  })
})
