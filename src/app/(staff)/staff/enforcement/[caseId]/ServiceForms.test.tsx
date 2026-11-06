// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import type { OrderDetail } from '@/features/enforcement/caseDetail'
import { expectRefusalBeside, refusal } from '@/test/besideField'
import { fillField, labelled, openSection, renderForm, stubDetail } from '@/test/enforcementRender'

vi.mock('../serviceActions', () => ({
  answerAction: vi.fn(),
  listRecipientAction: vi.fn(),
  roleCheckAction: vi.fn(),
  serviceEventAction: vi.fn(),
}))
vi.mock('@/components/address/AddressTextField', async () => {
  const { TextField } = await import('@/components/staff/fields')
  return {
    AddressTextField: ({ label, name }: { label: string; name: string }) => (
      <TextField label={label} name={name} required />
    ),
  }
})

const { ServiceForms } = await import('./ServiceForms')
const { answerAction, listRecipientAction, roleCheckAction, serviceEventAction } = await import(
  '../serviceActions'
)

afterEach(cleanup)

const order = {
  row: { id: 'o1' },
  service: { recipients: [{ id: 'r1', name: 'Pat Owner', role: 'record_owner' }] },
} as unknown as OrderDetail
const detail = stubDetail()

describe('adding a recipient', () => {
  it('shows a refused name beside the name field', async () => {
    const message = 'Enter a name of 200 characters or fewer.'
    vi.mocked(listRecipientAction).mockResolvedValue(refusal('name', message))
    renderForm(<ServiceForms order={order} detail={detail} />)
    openSection('Add a recipient')
    fillField(labelled('Name'), 'Pat')
    fillField(labelled('Address'), '9 Mill Road')
    fillField(/^Where the name came from/, 'CAMA owner')
    fireEvent.click(screen.getByRole('button', { name: 'Add recipient' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Name')), message)
  })
})

describe('recording the check for a role', () => {
  it('shows a refused result beside the result field', async () => {
    const message = 'That result is not allowed for this role.'
    vi.mocked(roleCheckAction).mockResolvedValue(refusal('outcome', message))
    renderForm(<ServiceForms order={order} detail={detail} />)
    openSection('Record the check for a role')
    fillField(labelled('What was searched'), 'Registry')
    fireEvent.click(screen.getByRole('button', { name: 'Record check' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Result')), message)
  })
})

describe('recording service', () => {
  it('shows a refused server role beside the server role field', async () => {
    const message =
      'Hand delivery needs a server who is a sheriff, deputy sheriff, local police officer, or constable.'
    vi.mocked(serviceEventAction).mockResolvedValue(refusal('serverRole', message))
    renderForm(<ServiceForms order={order} detail={detail} />)
    openSection('Record service')
    fireEvent.click(screen.getByRole('button', { name: 'Record service' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Server is a')), message)
  })

  it('shows a refused proof beside the proof field', async () => {
    const message = 'Choose the proof of service.'
    vi.mocked(serviceEventAction).mockResolvedValue(refusal('proofDocumentId', message))
    renderForm(<ServiceForms order={order} detail={detail} />)
    openSection('Record service')
    fireEvent.click(screen.getByRole('button', { name: 'Record service' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Proof of service')), message)
  })
})

describe('recording an answer', () => {
  it('shows a refused document beside the answer document field', async () => {
    const message = 'Choose the answer document. Upload it in the Documents section first.'
    vi.mocked(answerAction).mockResolvedValue(refusal('documentId', message))
    renderForm(<ServiceForms order={order} detail={detail} />)
    openSection('Record an answer')
    fireEvent.click(screen.getByRole('button', { name: 'Record answer' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('The answer document')), message)
  })
})
