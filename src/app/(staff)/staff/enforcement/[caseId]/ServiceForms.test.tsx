// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

vi.mock('./CaseFileUpload', () => ({
  CaseFileUpload: ({ label }: { label: string }) => <p>{`Uploader for ${label}`}</p>,
}))

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

describe('the service form fields', () => {
  it('marks the server fields for hand, abode or summons service and the newspaper for publication', () => {
    renderForm(<ServiceForms order={order} detail={detail} />)
    openSection('Record service')
    const shownFor = (label: string) =>
      screen
        .getByLabelText(labelled(label))
        .closest('[data-shown-for]')
        ?.getAttribute('data-shown-for')
    expect(shownFor('Server is a')).toBe('in_hand abode other_civil_summons_method')
    expect(shownFor('Served by (name)')).toBe(
      'in_hand abode other_civil_summons_method posting_on_property',
    )
    expect(shownFor('Newspaper')).toBe('newspaper_publication')
    expect(
      screen.getByLabelText(labelled('Method')).closest('[data-service-method]'),
    ).not.toBeNull()
  })

  it('goes back to the default method when the form resets', () => {
    renderForm(<ServiceForms order={order} detail={detail} />)
    openSection('Record service')
    const method = screen.getByLabelText<HTMLSelectElement>(labelled('Method'))
    fireEvent.change(method, { target: { value: 'newspaper_publication' } })
    method.form?.reset()
    expect(method.value).toBe('in_hand')
  })

  it('offers the answer document upload inside the answer form', () => {
    renderForm(<ServiceForms order={order} detail={detail} />)
    const answer = screen.getByText('Record an answer', { selector: 'summary' }).closest('details')
    expect(answer?.textContent).toContain('Upload the answer')
    expect(answer?.textContent).toContain('Uploader for Letter or other case document')
  })

  it('offers the proof upload inside the service form instead of sending the officer to Documents', () => {
    renderForm(<ServiceForms order={order} detail={detail} />)
    const service = screen.getByText('Record service', { selector: 'summary' }).closest('details')
    expect(service?.textContent).toContain('Upload the proof of service')
    expect(service?.textContent).toContain('Uploader for Proof of service')
    expect(service?.textContent).not.toContain('Documents section')
  })
})

describe('recording an answer', () => {
  it('shows a refused document beside the answer document field', async () => {
    const message = 'Choose the answer document. Upload it above the form if it is not listed.'
    vi.mocked(answerAction).mockResolvedValue(refusal('documentId', message))
    renderForm(<ServiceForms order={order} detail={detail} />)
    openSection('Record an answer')
    fireEvent.click(screen.getByRole('button', { name: 'Record answer' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('The answer document')), message)
  })
})
