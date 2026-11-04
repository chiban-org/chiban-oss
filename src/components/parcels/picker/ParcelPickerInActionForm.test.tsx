// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionForm } from '@/components/ActionForm'
import { CsrfProvider } from '@/components/CsrfProvider'
import { ParcelPickerView } from '@/components/parcels/picker/ParcelPickerView'
import type { PickedParcel } from '@/features/parcels/parcelPick'
import type { ActionResult } from '@/server/actionRunner'

afterEach(cleanup)

const HERON: PickedParcel = {
  parcelId: '11111111-1111-4111-8111-111111111111',
  displayId: '007001000000',
  status: 'active',
  siteAddress: '12 Heron Cove Road',
  ownerName: 'Pennywhistle Land Company',
}

async function saveWith(result: ActionResult) {
  const action = vi.fn((_data: FormData) => Promise.resolve(result))
  render(
    <CsrfProvider token="t1">
      <ActionForm action={action} submitLabel="Add holder">
        <ParcelPickerView
          name="parcelRef"
          label="Parcel"
          required
          search={() => Promise.resolve([HERON])}
        />
      </ActionForm>
    </CsrfProvider>,
  )
  fireEvent.change(screen.getByRole('combobox', { name: 'Parcel' }), {
    target: { value: 'Heron' },
  })
  fireEvent.click((await screen.findAllByRole('option'))[0] as HTMLElement)
  await waitFor(() =>
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add holder' }).disabled).toBe(
      false,
    ),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Add holder' }))
  await screen.findByText(result.ok ? result.message : result.error)
  await new Promise((resolve) => setTimeout(resolve, 20))
  return action.mock.calls[0]?.[0].get('parcelRef')
}

describe('ParcelPickerView inside ActionForm', () => {
  it('sends the chosen parcel and keeps it after the action refuses', async () => {
    expect(await saveWith({ ok: false, error: 'That parcel is retired.' })).toBe(HERON.parcelId)
    expect(screen.getByRole('button', { name: 'Change parcel' })).toBeTruthy()
  })

  it('clears the chosen parcel after the action succeeds', async () => {
    expect(await saveWith({ ok: true, message: 'Restriction holder added.' })).toBe(HERON.parcelId)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Change parcel' })).toBeNull())
  })
})
