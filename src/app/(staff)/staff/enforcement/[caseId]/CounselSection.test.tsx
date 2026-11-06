// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { expectRefusalBeside } from '@/test/besideField'
import {
  ALL_CAN,
  fillField,
  labelled,
  openSection,
  renderForm,
  stubDetail,
} from '@/test/enforcementRender'
import { refusal } from '@/test/refusalBeside'

vi.mock('../moneyActions', () => ({ outcomeAction: vi.fn(), referAction: vi.fn() }))

const { CounselSection } = await import('./CounselSection')
const { outcomeAction, referAction } = await import('../moneyActions')

afterEach(cleanup)

const detail = stubDetail({
  referrals: [
    {
      row: {
        id: 'r1',
        counselName: 'FS-C Counsel Esq',
        referredOn: '2027-07-05',
        purpose: 'motion_to_enforce',
        packetDocumentId: 'd1',
      },
      outcomes: [],
    },
  ],
})

describe('referring a case to counsel', () => {
  it('shows a refused date beside the date field', async () => {
    const message = 'Enter the date referred between January 1, 1900 and July 20, 2027.'
    vi.mocked(referAction).mockResolvedValue(refusal('referredOn', message))
    renderForm(<CounselSection detail={detail} can={ALL_CAN} />)
    openSection('Refer to counsel')
    fillField(labelled('Counsel'), 'FS-C Counsel Esq')
    fireEvent.click(screen.getByRole('button', { name: 'Refer to counsel' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Date referred')), message)
  })

  it('shows a refused counsel name beside the counsel field', async () => {
    const message = 'Enter the counsel of 200 characters or fewer.'
    vi.mocked(referAction).mockResolvedValue(refusal('counselName', message))
    renderForm(<CounselSection detail={detail} can={ALL_CAN} />)
    openSection('Refer to counsel')
    fillField(labelled('Counsel'), 'FS-C Counsel Esq')
    fireEvent.click(screen.getByRole('button', { name: 'Refer to counsel' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Counsel')), message)
  })
})

describe('recording a counsel outcome', () => {
  it('shows a refused court beside the court field', async () => {
    const message = 'Enter the court of 200 characters or fewer.'
    vi.mocked(outcomeAction).mockResolvedValue(refusal('court', message))
    renderForm(<CounselSection detail={detail} can={ALL_CAN} />)
    openSection('Record an outcome')
    fireEvent.click(screen.getByRole('button', { name: 'Record outcome' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Court')), message)
  })

  it('shows a refused document beside the document field', async () => {
    const message = 'Choose a document that belongs to this case.'
    vi.mocked(outcomeAction).mockResolvedValue(refusal('documentId', message))
    renderForm(<CounselSection detail={detail} can={ALL_CAN} />)
    openSection('Record an outcome')
    fireEvent.click(screen.getByRole('button', { name: 'Record outcome' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Document')), message)
  })
})
