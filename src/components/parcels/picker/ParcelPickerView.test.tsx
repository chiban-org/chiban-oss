// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ParcelPickerView } from '@/components/parcels/picker/ParcelPickerView'
import { restoreSubmittedValues } from '@/components/useFormAction'
import type { PickedParcel } from '@/features/parcels/parcelPick'

afterEach(cleanup)

const scrolled = vi.fn()
beforeAll(() => {
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled(this.textContent)
  }
})

const HERON: PickedParcel = {
  parcelId: '11111111-1111-4111-8111-111111111111',
  displayId: '007001000000',
  status: 'active',
  siteAddress: '12 Heron Cove Road',
  ownerName: 'Pennywhistle Land Company',
}
const MILL: PickedParcel = {
  parcelId: '22222222-2222-4222-8222-222222222222',
  displayId: '007020000000',
  status: 'retired',
  siteAddress: '3 Old Mill Lane',
  ownerName: 'Quillfeather Trust',
}

function fakeSearch(hits: PickedParcel[]) {
  return vi.fn((_q: string, _signal: AbortSignal) => Promise.resolve(hits))
}

function renderPicker(
  search: ReturnType<typeof fakeSearch>,
  extra: { allowUnknown?: boolean; required?: boolean } = {},
) {
  const submitted = vi.fn()
  const view = render(
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submitted()
      }}
    >
      <ParcelPickerView name="parcelRef" label="Parcel ID" search={search} {...extra} />
    </form>,
  )
  const hidden = () => view.container.querySelector('input[name="parcelRef"]') as HTMLInputElement
  return { submitted, hidden, form: view.container.querySelector('form') as HTMLFormElement }
}

function box(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>('combobox', { name: 'Parcel ID' })
}

describe('ParcelPickerView', () => {
  it('shows each match with its display ID, site address and owner after a pause', async () => {
    const search = fakeSearch([HERON, MILL])
    renderPicker(search)
    fireEvent.change(box(), { target: { value: 'He' } })
    fireEvent.change(box(), { target: { value: 'Heron' } })
    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[0]?.textContent).toContain('007001000000')
    expect(options[0]?.textContent).toContain('12 Heron Cove Road')
    expect(options[0]?.textContent).toContain('Pennywhistle Land Company')
    expect(search).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0]?.[0]).toBe('Heron')
  })

  it('labels a retired parcel', async () => {
    renderPicker(fakeSearch([MILL]))
    fireEvent.change(box(), { target: { value: 'Old Mill' } })
    const [option] = await screen.findAllByRole('option')
    expect(option?.textContent).toContain('Retired')
  })

  it('picks with the arrow keys and Enter without submitting the form', async () => {
    const { submitted, hidden } = renderPicker(fakeSearch([HERON, MILL]))
    fireEvent.change(box(), { target: { value: 'Lane' } })
    await screen.findAllByRole('option')
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(submitted).not.toHaveBeenCalled()
    expect(hidden().value).toBe(MILL.parcelId)
    expect(screen.getByText('3 Old Mill Lane, Quillfeather Trust')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change parcel' })).toBeTruthy()
  })

  it('scrolls the option the arrow keys reach into view', async () => {
    scrolled.mockClear()
    renderPicker(fakeSearch([HERON, MILL]))
    fireEvent.change(box(), { target: { value: 'Lane' } })
    await screen.findAllByRole('option')
    fireEvent.keyDown(box(), { key: 'ArrowUp' })
    await waitFor(() =>
      expect(scrolled).toHaveBeenLastCalledWith(expect.stringContaining('007020000000')),
    )
  })

  it('closes the list on Escape', async () => {
    renderPicker(fakeSearch([HERON]))
    fireEvent.change(box(), { target: { value: 'Heron' } })
    await screen.findAllByRole('option')
    fireEvent.keyDown(box(), { key: 'Escape' })
    await waitFor(() => expect(screen.queryAllByRole('option')).toHaveLength(0))
    expect(box().getAttribute('aria-expanded')).toBe('false')
  })

  it('Change clears the choice and returns to the search box', async () => {
    const { hidden } = renderPicker(fakeSearch([HERON]))
    fireEvent.change(box(), { target: { value: 'Heron' } })
    fireEvent.click((await screen.findAllByRole('option'))[0] as HTMLElement)
    expect(hidden().value).toBe(HERON.parcelId)
    fireEvent.click(screen.getByRole('button', { name: 'Change parcel' }))
    expect(hidden().value).toBe('')
    expect(document.activeElement).toBe(box())
  })

  it('says when no parcel matches and offers no raw entry where unknown IDs are refused', async () => {
    renderPicker(fakeSearch([]))
    fireEvent.change(box(), { target: { value: '999999999999' } })
    expect(await screen.findByText('No parcel matches')).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Use this ID anyway/ })).toBeNull()
  })

  it('keeps a raw ID through "Use this ID anyway" where unknown IDs are allowed', async () => {
    const { hidden } = renderPicker(fakeSearch([]), { allowUnknown: true })
    fireEvent.change(box(), { target: { value: '007020001000' } })
    expect(await screen.findByText('No parcel matches')).toBeTruthy()
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(hidden().value).toBe('007020001000')
    expect(screen.getByText('Not in the parcel layer')).toBeTruthy()
  })

  it('blocks a required form until a parcel is chosen, and a typed but unchosen query', async () => {
    renderPicker(fakeSearch([HERON]), { required: true })
    expect(box().required).toBe(true)
    fireEvent.change(box(), { target: { value: 'Heron' } })
    await screen.findAllByRole('option')
    expect(box().validationMessage).toBe('Choose a parcel from the list.')
  })

  it('clears the choice when the form resets after a successful save', async () => {
    const { hidden, form } = renderPicker(fakeSearch([HERON]))
    fireEvent.change(box(), { target: { value: 'Heron' } })
    fireEvent.click((await screen.findAllByRole('option'))[0] as HTMLElement)
    act(() => form.reset())
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Change parcel' })).toBeNull())
    expect(hidden().value).toBe('')
    expect(box().value).toBe('')
  })

  it('keeps the choice when a failed save resets the form and restores what was sent', async () => {
    const { hidden, form } = renderPicker(fakeSearch([HERON]))
    fireEvent.change(box(), { target: { value: 'Heron' } })
    fireEvent.click((await screen.findAllByRole('option'))[0] as HTMLElement)
    const sent = Array.from(new FormData(form).entries())
    act(() => {
      form.reset()
      restoreSubmittedValues(form, sent)
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(hidden().value).toBe(HERON.parcelId)
    expect(screen.getByRole('button', { name: 'Change parcel' })).toBeTruthy()
  })
})
