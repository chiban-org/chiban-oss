// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ParcelMultiPickerView } from '@/components/parcels/picker/ParcelMultiPickerView'
import type { PickedParcel } from '@/features/parcels/parcelPick'

afterEach(cleanup)

const HERON: PickedParcel = {
  parcelId: '11111111-1111-4111-8111-111111111111',
  displayId: '007001000000',
  status: 'active',
  siteAddress: '12 Heron Cove Road',
  ownerName: 'Pennywhistle Land Company',
}

function renderMulti(hits: PickedParcel[]) {
  const search = vi.fn((_q: string, _signal: AbortSignal) => Promise.resolve(hits))
  const view = render(
    <form>
      <ParcelMultiPickerView
        name="children"
        label="Child parcels"
        required
        allowUnknown
        initial={[{ kind: 'raw', value: '007001009000' }]}
        search={search}
      />
    </form>,
  )
  const hidden = () =>
    view.container.querySelector<HTMLInputElement>('input[type="hidden"][name="children"]')
      ?.value ?? null
  return { hidden }
}

function box(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>('combobox', { name: 'Child parcels' })
}

describe('ParcelMultiPickerView', () => {
  it('collects chosen parcels and raw IDs into one value the lineage form reads', async () => {
    const { hidden } = renderMulti([HERON])
    expect(hidden()).toBe('007001009000')
    expect(box().required).toBe(false)
    fireEvent.change(box(), { target: { value: 'Heron' } })
    fireEvent.click((await screen.findAllByRole('option'))[0] as HTMLElement)
    fireEvent.change(box(), { target: { value: '007001008000' } })
    await screen.findAllByRole('option')
    fireEvent.click(screen.getByRole('option', { name: /Use this ID anyway/ }))
    expect(hidden()).toBe(`007001009000 ${HERON.parcelId} 007001008000`)
  })

  it('removes a chosen parcel and asks for one again when the list is empty', () => {
    const { hidden } = renderMulti([])
    fireEvent.click(screen.getByRole('button', { name: 'Remove 007001009000' }))
    expect(hidden()).toBe('')
    expect(box().required).toBe(true)
  })
})
