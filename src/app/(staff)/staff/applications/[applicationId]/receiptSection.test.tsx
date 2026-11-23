// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { ReceiptPanel } from '@/features/boards/receiptPanel'

vi.mock('../../boards/receiptActions', () => ({
  prepareReceiptNoticesAction: vi.fn(),
  sourceWaterDeterminationAction: vi.fn(),
  applicationMunicipalitiesAction: vi.fn(),
}))
vi.mock('../../boards/hearings/actions', () => ({ recordProofAction: vi.fn() }))
vi.mock('@/app/(staff)/staff/records/uploadActions', () => ({
  createStaffUploadIntentAction: vi.fn(),
  finalizeStaffUploadAction: vi.fn(),
}))
vi.mock('@/components/documents/ApplicationFileUploader', () => ({
  ApplicationFileUploader: () => null,
}))
vi.mock('@/components/notices/NoticeChecklist', () => ({
  NoticeChecklist: () => <p>Checklist shown</p>,
}))

const { ReceiptSection } = await import('./receiptSection')
const {
  prepareReceiptNoticesAction,
  sourceWaterDeterminationAction,
  applicationMunicipalitiesAction,
} = await import('../../boards/receiptActions')

const ACCEPTED = { ok: true as const, message: 'Done.' }

beforeEach(() => {
  vi.mocked(prepareReceiptNoticesAction).mockResolvedValue(ACCEPTED)
  vi.mocked(sourceWaterDeterminationAction).mockResolvedValue(ACCEPTED)
  vi.mocked(applicationMunicipalitiesAction).mockResolvedValue(ACCEPTED)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function panel(overrides: Partial<ReceiptPanel> = {}): ReceiptPanel {
  return {
    applicationId: 'a1',
    canPrepare: true,
    prepared: false,
    outOfDate: false,
    checklist: [],
    itemChoices: [],
    proofChoices: [],
    canDetermine: true,
    sourceWater: {
      text: 'The source water protection area determination has not been recorded.',
      determination: '',
      supplierKey: '',
      suppliers: [{ key: 'lakeside_water', name: 'Lakeside Water District' }],
    },
    municipalities: {
      text: 'No abutting or included municipalities are recorded.',
      options: [
        { key: 'pine_river', name: 'Town of Pine River' },
        { key: 'dunmore', name: 'Town of Dunmore' },
      ],
      abutting: [],
      included: [],
    },
    ...overrides,
  }
}

function show(data: ReceiptPanel) {
  render(
    <CsrfProvider token="t">
      <ReceiptSection data={data} today="2027-03-02" />
    </CsrfProvider>,
  )
}

describe('the receipt notices section', () => {
  it('prepares the notices through its action', async () => {
    show(panel())
    fireEvent.click(screen.getByRole('button', { name: 'Prepare receipt notices' }))
    await waitFor(() => expect(prepareReceiptNoticesAction).toHaveBeenCalledTimes(1))
  })

  it('offers no prepare button once the notices exist, and lists them', () => {
    show(panel({ canPrepare: false, prepared: true }))
    expect(screen.queryByRole('button', { name: 'Prepare receipt notices' })).toBeNull()
    expect(screen.getByText('Checklist shown')).toBeTruthy()
    expect(screen.getByText('Record proof of notice')).toBeTruthy()
  })

  it('records the source water determination with the chosen supplier', async () => {
    show(panel())
    fireEvent.click(screen.getByText('Record the source water protection area determination'))
    fireEvent.change(screen.getByLabelText(/^Source water protection area( \*)?$/), {
      target: { value: 'within' },
    })
    fireEvent.change(screen.getByLabelText(/^Water supplier( \*)?$/), {
      target: { value: 'lakeside_water' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Record determination' }))
    await waitFor(() => expect(sourceWaterDeterminationAction).toHaveBeenCalledTimes(1))
    const sent = vi.mocked(sourceWaterDeterminationAction).mock.calls[0]?.[0] as FormData
    expect(sent.get('determination')).toBe('within')
    expect(sent.get('supplierKey')).toBe('lakeside_water')
    expect(sent.get('applicationId')).toBe('a1')
  })

  it('records the municipalities with their relation', async () => {
    show(panel())
    fireEvent.click(screen.getByText('Record the abutting or included municipalities'))
    fireEvent.click(screen.getAllByLabelText('Town of Pine River')[0] as HTMLElement)
    fireEvent.click(screen.getAllByLabelText('Town of Dunmore')[1] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Record municipalities' }))
    await waitFor(() => expect(applicationMunicipalitiesAction).toHaveBeenCalledTimes(1))
    const sent = vi.mocked(applicationMunicipalitiesAction).mock.calls[0]?.[0] as FormData
    expect(sent.getAll('abuttingKeys')).toEqual(['pine_river'])
    expect(sent.getAll('includedKeys')).toEqual(['dunmore'])
  })

  it('offers no recording forms to a person who cannot determine', () => {
    show(panel({ canDetermine: false }))
    expect(screen.queryByText('Record the source water protection area determination')).toBeNull()
    expect(screen.queryByText('Record the abutting or included municipalities')).toBeNull()
  })
})
