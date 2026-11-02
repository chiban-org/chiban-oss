// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorContextProvider } from '@/components/config/EditorContextProvider'
import { ReviewRoutesEditor } from '@/components/config/ReviewRoutesEditor'
import { editorContext } from '@/features/config/editorContext'
import type { ReviewRoutesBody } from '@/features/reviews/routesSchema'
import { findUuids } from '@/test/leaks'

afterEach(cleanup)

const REVIEWER = '11111111-1111-4111-8111-111111111111'
const BODY: ReviewRoutesBody = {
  key: 'default',
  departments: [{ key: 'fire', label: 'Fire', reviewerUserIds: [] }],
  routes: [{ applicationTypeKey: 'SPR', departmentKeys: ['fire'], commentDueDaysBeforeMeeting: 7 }],
}

function renderEditor(body: ReviewRoutesBody, onChange = vi.fn()) {
  render(
    <EditorContextProvider value={editorContext([{ id: REVIEWER, name: 'Dana Marsh' }])}>
      <ReviewRoutesEditor body={body} onChange={onChange} />
    </EditorContextProvider>,
  )
  return onChange
}

describe('ReviewRoutesEditor', () => {
  it('lists reviewers by name and never shows their ids', () => {
    renderEditor(BODY)
    expect(screen.getByLabelText('Dana Marsh')).toBeTruthy()
    expect(findUuids(document.body.textContent)).toEqual([])
  })

  it('checking a reviewer adds the id to the department', () => {
    const onChange = renderEditor(BODY)
    fireEvent.click(screen.getByLabelText('Dana Marsh'))
    expect(onChange.mock.calls[0]?.[0].departments[0].reviewerUserIds).toEqual([REVIEWER])
  })

  it('renaming a department derives its key from the name', () => {
    const onChange = renderEditor(BODY)
    fireEvent.change(screen.getByLabelText('Department name'), {
      target: { value: 'Public Works' },
    })
    expect(onChange.mock.calls[0]?.[0].departments[0]).toMatchObject({
      label: 'Public Works',
      key: 'public_works',
    })
  })

  it('unchecking a department on a route removes it', () => {
    const onChange = renderEditor(BODY)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fire' }))
    expect(onChange.mock.calls[0]?.[0].routes[0].departmentKeys).toEqual([])
  })

  it('adds a department and a route', () => {
    const onChange = renderEditor({ ...BODY, departments: [], routes: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Add department' }))
    expect(onChange.mock.calls[0]?.[0].departments).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Add route' }))
    expect(onChange.mock.calls[1]?.[0].routes[0].commentDueDaysBeforeMeeting).toBe(7)
  })
})
