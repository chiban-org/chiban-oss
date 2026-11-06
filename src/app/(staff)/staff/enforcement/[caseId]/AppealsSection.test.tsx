// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { expectRefusalBeside, refusal } from '@/test/besideField'
import {
  ALL_CAN,
  fillField,
  labelled,
  openSection,
  renderForm,
  stubDetail,
} from '@/test/enforcementRender'

vi.mock('../appealActions', () => ({
  appealAction: vi.fn(),
  certifyPerilAction: vi.fn(),
  dissolveRestrainingOrderAction: vi.fn(),
  resolveAppealAction: vi.fn(),
  restrainingOrderAction: vi.fn(),
}))

const { AppealsSection } = await import('./AppealsSection')
const {
  appealAction,
  certifyPerilAction,
  dissolveRestrainingOrderAction,
  resolveAppealAction,
  restrainingOrderAction,
} = await import('../appealActions')

afterEach(cleanup)

const detail = stubDetail({
  orders: [{ row: { id: 'o1', number: 'CD-2027-0001', status: 'issued' } }],
  appeals: [
    {
      row: {
        id: 'a1',
        targetKind: 'order',
        appellantName: 'Pat Owner',
        filedOn: '2027-03-05',
        resolvedOn: null,
        outcome: null,
      },
      certification: null,
      restraints: [{ id: 'rs1', issuedBy: 'zba', issuedOn: '2027-03-12', dissolvedOn: null }],
    },
  ],
  documents: [{ docKind: 'court_document', documentId: 'd1', title: 'Filing' }],
})

describe('recording an appeal', () => {
  it('shows a refused target beside the target field', async () => {
    const message = 'That order or notice does not belong to this case.'
    vi.mocked(appealAction).mockResolvedValue(refusal('target', message))
    renderForm(<AppealsSection detail={detail} can={ALL_CAN} />)
    openSection('Record an appeal')
    fillField(labelled('Appellant'), 'Pat Owner')
    fireEvent.click(screen.getByRole('button', { name: 'Record appeal' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('What is appealed')), message)
  })

  it('shows a refused date beside the date filed field', async () => {
    const message = 'The date cannot be in the future.'
    vi.mocked(appealAction).mockResolvedValue(refusal('filedOn', message))
    renderForm(<AppealsSection detail={detail} can={ALL_CAN} />)
    openSection('Record an appeal')
    fillField(labelled('Appellant'), 'Pat Owner')
    fireEvent.click(screen.getByRole('button', { name: 'Record appeal' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Date filed')), message)
  })
})

describe('recording the decision on an appeal', () => {
  it('shows a refused date beside the date decided field', async () => {
    const message = 'The decision cannot be dated before the appeal was filed.'
    vi.mocked(resolveAppealAction).mockResolvedValue(refusal('resolvedOn', message))
    renderForm(<AppealsSection detail={detail} can={ALL_CAN} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record decision' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Date decided')), message)
  })
})

describe('certifying imminent peril', () => {
  it('shows a refused statement beside the statement field', async () => {
    const message = 'Enter a statement of 3000 characters or fewer.'
    vi.mocked(certifyPerilAction).mockResolvedValue(refusal('statement', message))
    renderForm(<AppealsSection detail={detail} can={ALL_CAN} />)
    openSection('Certify imminent peril')
    fillField(labelled('Statement'), 'The wall is leaning.')
    fireEvent.click(screen.getByRole('button', { name: 'Certify' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Statement')), message)
  })
})

describe('recording a restraining order', () => {
  it('shows a refused document beside the court document field', async () => {
    const message =
      'Choose the court document. Upload it in the Documents section first, as a court document.'
    vi.mocked(restrainingOrderAction).mockResolvedValue(refusal('documentId', message))
    renderForm(<AppealsSection detail={detail} can={ALL_CAN} />)
    openSection('Record a restraining order')
    fireEvent.click(screen.getByRole('button', { name: 'Record restraining order' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Court document')), message)
  })
})

describe('marking a restraining order dissolved', () => {
  it('shows a refused date beside the date dissolved field', async () => {
    const message = 'Enter the date dissolved between January 1, 1900 and July 20, 2027.'
    vi.mocked(dissolveRestrainingOrderAction).mockResolvedValue(refusal('dissolvedOn', message))
    renderForm(<AppealsSection detail={detail} can={ALL_CAN} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark dissolved' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Date dissolved')), message)
  })
})
