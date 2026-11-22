// @vitest-environment jsdom

import { ME_PACK } from '@packs/me'
import { NH_PACK } from '@packs/nh'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setActivePackForTest } from '@/features/packs/registry'
import { expectRefusalBeside, refusal } from '@/test/besideField'
import {
  ALL_CAN,
  fillField,
  labelled,
  openSection,
  renderForm,
  stubDetail,
} from '@/test/enforcementRender'
import { XX_PACK } from '@/test/packs/xx'

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

afterEach(() => {
  cleanup()
  setActivePackForTest(null)
})

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

describe('the appeals heading', () => {
  it('names the New Hampshire board as before', () => {
    setActivePackForTest(NH_PACK)
    renderForm(<AppealsSection detail={detail} can={ALL_CAN} />)
    expect(
      screen.getByRole('heading', { name: 'Appeals to the zoning board of adjustment' }),
    ).toBeTruthy()
  })

  it('names the Maine Board of Appeals', () => {
    setActivePackForTest(ME_PACK)
    renderForm(<AppealsSection detail={detail} can={ALL_CAN} />)
    expect(screen.getByRole('heading', { name: 'Appeals to the board of appeals' })).toBeTruthy()
    expect(screen.queryByText(/zoning board/i)).toBeNull()
  })
})

describe('the stay controls on an appeal', () => {
  const summaries = () =>
    screen.queryAllByText(/./, { selector: 'summary' }).map((s) => s.textContent)

  it('offers peril and restraining order controls where an appeal stays enforcement', () => {
    setActivePackForTest(NH_PACK)
    renderForm(<AppealsSection detail={detail} can={ALL_CAN} />)
    expect(summaries()).toEqual(
      expect.arrayContaining(['Certify imminent peril', 'Record a restraining order']),
    )
  })

  it.each([
    ['Maine', ME_PACK],
    ['a pack with no stay rule', XX_PACK],
  ])('offers neither under %s', (_name, pack) => {
    setActivePackForTest(pack)
    renderForm(<AppealsSection detail={detail} can={ALL_CAN} />)
    expect(summaries()).not.toContain('Certify imminent peril')
    expect(summaries()).not.toContain('Record a restraining order')
    expect(screen.getByRole('button', { name: 'Record decision' })).toBeTruthy()
  })
})

describe('the notice of violation as an appeal target', () => {
  it('names the date, method and provisions of the notice', () => {
    const withNotice = stubDetail({
      findings: [{ id: 'f1', provisionKind: 'zoning_ordinance', provisionRef: 'Section 4.2' }],
      notices: [{ id: 'n1', findingIds: ['f1'], method: 'certified_mail', sentOn: '2027-07-03' }],
    })
    renderForm(<AppealsSection detail={withNotice} can={ALL_CAN} />)
    openSection('Record an appeal')
    expect(screen.getByRole('option', { name: /^Notice of violation/ }).textContent).toBe(
      'Notice of violation sent July 3, 2027 by certified mail, Section 4.2',
    )
  })
})
