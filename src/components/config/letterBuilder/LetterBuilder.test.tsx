// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Editor } from '@tiptap/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LetterBuilder } from '@/components/config/letterBuilder/LetterBuilder'
import type { TemplateBuilderData } from '@/features/templates/builderData'
import { defaultDoc } from '@/features/templates/kinds/documentKinds'
import { type DocTemplateBody, TEMPLATE_KINDS } from '@/features/templates/templateSchema'

afterEach(cleanup)

const PREVIEW = {
  values: { 'party.applicant.name': 'Zoë Ngũgĩ', 'town.name': 'Alder Pond' },
  locked: { 'decision.appealRights': 'Appeal to superior court within 30 days.' },
  sections: {},
  conditions: [],
  pdfBase64: '',
}

function data(overrides: Partial<TemplateBuilderData> = {}): TemplateBuilderData {
  return {
    kindLocked: false,
    townName: 'Alder Pond',
    profile: null,
    samplesAction: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        samples: [{ id: 'd1', label: 'ZBA-2027-0001, approved' }],
      }),
    ),
    previewAction: vi.fn(() => Promise.resolve({ ok: true as const, preview: PREVIEW })),
    ...overrides,
  }
}

const LETTER: DocTemplateBody = {
  key: 'zba-letter',
  label: 'Decision letter',
  kind: 'decision_letter',
  format: 'doc',
  doc: defaultDoc('decision_letter'),
}

function Harness({ initial, builder }: { initial: DocTemplateBody; builder: TemplateBuilderData }) {
  const [body, setBody] = useState(initial)
  return (
    <form>
      <LetterBuilder body={body} onChange={setBody} errors={{}} data={builder} />
      <output data-testid="state">{JSON.stringify(body)}</output>
    </form>
  )
}

function state(): DocTemplateBody {
  return JSON.parse(screen.getByTestId('state').textContent) as DocTemplateBody
}

describe('LetterBuilder', () => {
  it('offers every kind of document in the kind picker', () => {
    render(<Harness initial={LETTER} builder={data()} />)
    const picker = screen.getByLabelText('Kind of document')
    expect(within(picker).getAllByRole('option')).toHaveLength(TEMPLATE_KINDS.length)
    expect((picker as HTMLSelectElement).disabled).toBe(false)
  })

  it('locks the kind once a version is in use', () => {
    render(<Harness initial={LETTER} builder={data({ kindLocked: true })} />)
    expect(screen.getByLabelText<HTMLSelectElement>('Kind of document').disabled).toBe(true)
    expect(
      screen.getByText('The kind cannot change once a version has been put into use.'),
    ).toBeTruthy()
  })

  it('swaps in the standard wording when an untouched letter changes kind', async () => {
    render(<Harness initial={LETTER} builder={data()} />)
    fireEvent.change(screen.getByLabelText('Kind of document'), {
      target: { value: 'enforcement_order' },
    })
    await waitFor(() => expect(state().kind).toBe('enforcement_order'))
    expect(state().doc.content.slice(0, -1)).toEqual(defaultDoc('enforcement_order').content)
    fireEvent.change(screen.getByLabelText('Kind of document'), { target: { value: 'receipt' } })
    await waitFor(() => expect(state().kind).toBe('receipt'))
    expect(JSON.stringify(state().doc)).toContain('receipt.lines')
  })

  it('shows merge fields as plain-language chips and the appeal rights as locked', async () => {
    render(<Harness initial={LETTER} builder={data()} />)
    const page = await screen.findByRole('article', { name: 'Letter page' })
    await waitFor(() =>
      expect(within(page).getAllByText('Applicant name').length).toBeGreaterThan(0),
    )
    expect(within(page).getByText(/Appeal rights\. Required by state law/)).toBeTruthy()
    expect(within(page).getByLabelText('Locked')).toBeTruthy()
  })

  it('inserts a merge field from the Insert panel', async () => {
    render(<Harness initial={LETTER} builder={data()} />)
    const insert = await screen.findByRole('navigation', { name: 'Insert' })
    fireEvent.click(within(insert).getByRole('button', { name: 'Meeting location' }))
    await waitFor(() => expect(JSON.stringify(state().doc)).toContain('meeting.location'))
  })

  it('previews with a sample record and shows its values in place of the chips', async () => {
    const builder = data()
    render(<Harness initial={LETTER} builder={builder} />)
    const picker = await screen.findByLabelText(/Preview with/)
    await waitFor(() => expect((picker as HTMLSelectElement).value).toBe('d1'))
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    const page = screen.getByRole('article', { name: 'Letter page' })
    await waitFor(() => expect(within(page).getAllByText('Zoë Ngũgĩ').length).toBeGreaterThan(0))
    expect(within(page).getByText('Appeal to superior court within 30 days.')).toBeTruthy()
    const sent = vi.mocked(builder.previewAction).mock.calls[0]?.[0]
    expect(sent?.get('recordId')).toBe('d1')
  })

  it('keeps the appeal rights block when everything is selected and deleted', async () => {
    render(<Harness initial={LETTER} builder={data()} />)
    const page = await screen.findByRole('article', { name: 'Letter page' })
    const dom = await waitFor(() => {
      const found = page.querySelector('.ProseMirror')
      if (found === null) throw new Error('editor not mounted')
      return found as HTMLElement & { editor: Editor }
    })
    act(() => {
      dom.editor.chain().selectAll().deleteSelection().run()
    })
    expect(JSON.stringify(dom.editor.getJSON())).toContain('decision.appealRights')
    act(() => {
      dom.editor.chain().selectAll().insertContent('Short letter').run()
    })
    expect(JSON.stringify(state().doc)).toContain('decision.appealRights')
  })

  it('keeps locked blocks out of lists', async () => {
    render(<Harness initial={LETTER} builder={data()} />)
    const dom = await mountedEditor()
    act(() => {
      dom.editor.chain().selectAll().toggleBulletList().run()
    })
    const top = dom.editor.getJSON().content.map((n) => n.type)
    expect(top).toContain('lockedBlock')
  })

  it('swaps the locked blocks for the new kind when an edited letter changes kind', async () => {
    render(<Harness initial={LETTER} builder={data()} />)
    const dom = await mountedEditor()
    act(() => {
      dom.editor.chain().focus('start').insertContent('Our own words. ').run()
    })
    fireEvent.change(screen.getByLabelText('Kind of document'), {
      target: { value: 'enforcement_order' },
    })
    await waitFor(() => expect(state().kind).toBe('enforcement_order'))
    const text = JSON.stringify(state().doc)
    expect(text).toContain('Our own words.')
    expect(text).not.toContain('decision.appealRights')
    for (const source of ['order.ceaseSentence', 'order.motionNotice', 'order.lienWarning']) {
      expect(text).toContain(source)
    }
  })
})

async function mountedEditor() {
  const page = await screen.findByRole('article', { name: 'Letter page' })
  return await waitFor(() => {
    const found = page.querySelector('.ProseMirror')
    if (found === null) throw new Error('editor not mounted')
    return found as HTMLElement & { editor: Editor }
  })
}
