// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import type { OrderDetail } from '@/features/enforcement/caseDetail'
import { expectRefusalBeside, refusal } from '@/test/besideField'
import { fillField, labelled, openSection, renderForm, stubDetail } from '@/test/enforcementRender'

vi.mock('../serviceActions', () => ({ courtStepAction: vi.fn() }))

const { CourtForms } = await import('./CourtForms')
const { courtStepAction } = await import('../serviceActions')

afterEach(cleanup)

const order = { row: { id: 'o1' }, steps: [] } as unknown as OrderDetail
const detail = stubDetail({
  documents: [{ docKind: 'court_document', documentId: 'd1', title: 'Filing' }],
})

describe('recording a court step', () => {
  it('shows a refused court beside the court field', async () => {
    const message = 'Enter the court of 200 characters or fewer.'
    vi.mocked(courtStepAction).mockResolvedValue(refusal('court', message))
    renderForm(<CourtForms order={order} detail={detail} />)
    openSection('Record a court step')
    fillField(labelled('Court'), 'District Court')
    fireEvent.click(screen.getByRole('button', { name: 'Record court step' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Court')), message)
  })

  it('shows a refused judgment result beside the judgment result field', async () => {
    const message = 'Choose the judgment result.'
    vi.mocked(courtStepAction).mockResolvedValue(refusal('judgmentOutcome', message))
    renderForm(<CourtForms order={order} detail={detail} />)
    openSection('Record a court step')
    fillField(labelled('Court'), 'District Court')
    fireEvent.click(screen.getByRole('button', { name: 'Record court step' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Judgment result')), message)
  })
})
