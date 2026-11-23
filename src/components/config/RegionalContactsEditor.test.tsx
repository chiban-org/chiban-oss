// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RegionalContactsEditor } from '@/components/config/RegionalContactsEditor'
import { PackTextProvider } from '@/components/PackTextProvider'
import {
  EMPTY_REGIONAL_CONTACTS,
  type RegionalContactsBody,
  type StoredRegionalContacts,
} from '@/features/boards/regionalContactsSchema'
import { NEUTRAL_PACK_TEXT } from '@/features/packs/neutralPackText'

afterEach(cleanup)

const body = {
  ...EMPTY_REGIONAL_CONTACTS,
  municipalities: [
    { key: 'pine_river', name: 'Town of Pine River', mailingAddress: '4 Hall Road' },
  ],
}

function show(receiptNotices: boolean, value: StoredRegionalContacts = body) {
  return render(
    <PackTextProvider value={{ ...NEUTRAL_PACK_TEXT, receiptNotices }}>
      <RegionalContactsEditor body={value} onChange={vi.fn()} />
    </PackTextProvider>,
  )
}

describe('RegionalContactsEditor', () => {
  it('renders as before when the pack has no receipt notices and no receipt contacts exist', () => {
    show(false)
    expect(screen.queryByText('Public water suppliers')).toBeNull()
    expect(screen.queryByText('Municipal clerk')).toBeNull()
    expect(screen.queryByText('Municipal reviewing authority')).toBeNull()
  })

  it('offers water suppliers and the two municipal offices when the pack sends receipt notices', () => {
    show(true)
    expect(screen.getByText('Public water suppliers')).toBeTruthy()
    expect(screen.getAllByText('Municipal clerk')).toHaveLength(1)
    expect(screen.getAllByText('Municipal reviewing authority')).toHaveLength(1)
  })

  it('shows receipt contacts already saved even when the pack asks for none', () => {
    show(false, {
      ...body,
      waterSuppliers: [
        { key: 'lakeside', name: 'Lakeside Water District', mailingAddress: '2 Pump Road' },
      ],
    })
    expect(screen.getByText('Public water suppliers')).toBeTruthy()
  })

  it('renaming a water supplier keeps its key', () => {
    const onChange = vi.fn()
    render(
      <PackTextProvider value={{ ...NEUTRAL_PACK_TEXT, receiptNotices: true }}>
        <RegionalContactsEditor
          body={{
            ...body,
            waterSuppliers: [
              { key: 'water_supplier_1', name: 'Lakeside Water', mailingAddress: '2 Pump Road' },
            ],
          }}
          onChange={onChange}
        />
      </PackTextProvider>,
    )
    fireEvent.change(screen.getByLabelText('Supplier'), {
      target: { value: 'Lakeside Water District' },
    })
    expect(onChange.mock.calls[0]?.[0].waterSuppliers[0]).toMatchObject({
      key: 'water_supplier_1',
      name: 'Lakeside Water District',
    })
  })

  it('a new supplier gets a key no existing supplier has', () => {
    const onChange = vi.fn()
    render(
      <PackTextProvider value={{ ...NEUTRAL_PACK_TEXT, receiptNotices: true }}>
        <RegionalContactsEditor
          body={{
            ...body,
            waterSuppliers: [
              { key: 'water_supplier_2', name: 'Lakeside Water', mailingAddress: '2 Pump Road' },
            ],
          }}
          onChange={onChange}
        />
      </PackTextProvider>,
    )
    fireEvent.click(screen.getByText('Add a public water supplier'))
    const added = onChange.mock.calls[0]?.[0].waterSuppliers[0].key
    expect(added).toMatch(/^water_supplier_[0-9a-f]{8}$/)
    expect(added).not.toBe('water_supplier_2')
  })

  it('opens a contacts setting saved before water suppliers existed', () => {
    const { commission, municipalities, nhDes, key } = body
    const saved: StoredRegionalContacts = { key, commission, municipalities, nhDes }
    const onChange = vi.fn()
    render(
      <PackTextProvider value={{ ...NEUTRAL_PACK_TEXT, receiptNotices: true }}>
        <RegionalContactsEditor body={saved} onChange={onChange} />
      </PackTextProvider>,
    )
    expect(screen.getByText('Public water suppliers')).toBeTruthy()
    fireEvent.click(screen.getByText('Add a public water supplier'))
    expect(onChange.mock.calls[0]?.[0].waterSuppliers).toHaveLength(1)
    cleanup()
    show(false, saved)
    expect(screen.getByText('Neighboring towns')).toBeTruthy()
    expect(screen.queryByText('Public water suppliers')).toBeNull()
  })

  it('never reuses the key of a supplier that was removed', () => {
    const seen: RegionalContactsBody[] = []
    function Harness() {
      const [value, setValue] = useState<RegionalContactsBody>({
        ...body,
        waterSuppliers: [
          { key: 'water_supplier_1', name: 'Lakeside Water', mailingAddress: '2 Pump Road' },
          { key: 'water_supplier_2', name: 'Hilltop Water', mailingAddress: '9 Tank Lane' },
        ],
      })
      return (
        <PackTextProvider value={{ ...NEUTRAL_PACK_TEXT, receiptNotices: true }}>
          <RegionalContactsEditor
            body={value}
            onChange={(next) => {
              seen.push(next)
              setValue(next)
            }}
          />
        </PackTextProvider>
      )
    }
    render(<Harness />)
    const removeHilltop = screen.getAllByText('Remove').at(-1)
    if (removeHilltop === undefined) throw new Error('supplier row not found')
    fireEvent.click(removeHilltop)
    expect(seen.at(-1)?.waterSuppliers.map((w) => w.key)).toEqual(['water_supplier_1'])
    fireEvent.click(screen.getByText('Add a public water supplier'))
    fireEvent.click(screen.getByText('Add a public water supplier'))
    const keys = seen.at(-1)?.waterSuppliers.map((w) => w.key) ?? []
    expect(keys).toHaveLength(3)
    expect(keys).toContain('water_supplier_1')
    expect(keys).not.toContain('water_supplier_2')
    expect(new Set(keys).size).toBe(3)
  })
})
