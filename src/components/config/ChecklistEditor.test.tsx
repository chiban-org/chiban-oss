// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChecklistEditor } from '@/components/config/ChecklistEditor'
import type { ChecklistBody } from '@/features/inspections/checklistSchema'

afterEach(cleanup)

const BASE: ChecklistBody = {
  key: 'start',
  inspectionType: 'start',
  label: 'Start of work',
  items: [{ key: 'site', label: 'Site is staked', required: true }],
}

function show(body: ChecklistBody) {
  render(<ChecklistEditor body={body} onChange={() => undefined} errors={{}} />)
}

describe('ChecklistEditor provenance', () => {
  it('shows the source line when the checklist has one', () => {
    show({ ...BASE, provenance: 'Chiban starting checklist. The town can edit it.' })
    expect(
      screen.getByText('Source: Chiban starting checklist. The town can edit it.'),
    ).toBeTruthy()
  })

  it('shows no source line when the checklist has none', () => {
    show(BASE)
    expect(screen.queryByText(/^Source:/)).toBeNull()
  })
})
