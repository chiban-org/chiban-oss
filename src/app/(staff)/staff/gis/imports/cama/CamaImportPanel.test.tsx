// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { DEFAULT_CAMA_MAPPING } from '@/features/cama/mapping'
import { findRawKeys } from '@/test/leaks'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('./actions', () => ({}))

const { CamaImportPanel } = await import('./CamaImportPanel')

afterEach(cleanup)

describe('CamaImportPanel', () => {
  it('shows the parcel ID format by its name, not its key', () => {
    const { container } = render(
      <CsrfProvider token="t">
        <CamaImportPanel
          saved={DEFAULT_CAMA_MAPPING}
          formats={[
            { key: 'cama15', label: 'CAMA number' },
            { key: 'gis12', label: 'Map-lot ID' },
          ]}
        />
      </CsrfProvider>,
    )
    const select = screen.getByLabelText<HTMLSelectElement>('Parcel ID format')
    expect(select.selectedOptions[0]?.textContent).toBe('CAMA number')
    expect(findRawKeys(container.textContent, ['cama15', 'gis12'])).toEqual([])
  })
})
