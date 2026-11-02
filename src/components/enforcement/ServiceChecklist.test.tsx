// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ServiceChecklist } from '@/components/enforcement/ServiceChecklist'
import type { ServiceState } from '@/features/enforcement/service'
import { serviceStatus } from '@/features/enforcement/serviceStatus'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

afterEach(cleanup)

const d = (s: string) => s as CivilDate
const rule = (() => {
  const found = ruleByKey(loadPack(), 'nh.enf.cd_zoning')
  if (found.kind !== 'cease_and_desist') throw new Error('rule')
  return found
})()

function recipientRow(id: string, role: ServiceState['recipients'][number]['role'], name: string) {
  return {
    id,
    role,
    name,
    address: '14 Birch Lane',
    source: 'CAMA owner',
    row: {} as ServiceState['recipients'][number]['row'],
  }
}

function eventRow(id: string, recipientId: string | null, servedOn: string) {
  return {
    id,
    recipientId,
    method: 'in_hand' as const,
    servedOn: d(servedOn),
    row: {
      serverName: 'Sheriff Dale',
      serverRole: 'sheriff',
      newspaper: null,
      proofDocumentId: 'doc-1',
    } as ServiceState['events'][number]['row'],
  }
}

const state: ServiceState = {
  checks: [
    { role: 'record_owner', outcome: 'recipients_listed' },
    { role: 'taxpayer', outcome: 'same_as_owner' },
    { role: 'occupying_tenant', outcome: 'recipients_listed' },
    { role: 'mortgagee_of_record', outcome: 'none_exist' },
  ],
  recipients: [
    recipientRow('o', 'record_owner', 'Pat Owner'),
    recipientRow('t', 'occupying_tenant', 'Robin Renter'),
  ],
  events: [eventRow('e1', 'o', '2027-03-01')],
}

describe('ServiceChecklist', () => {
  it('ServiceChecklist marks the unserved tenant with a text label', () => {
    const status = serviceStatus(rule, state)
    const { container } = render(<ServiceChecklist rule={rule} status={status} state={state} />)
    const tenant = Array.from(container.querySelectorAll('li')).find((li) =>
      li.textContent?.includes('Robin Renter'),
    )
    expect(tenant?.textContent).toContain('Not served')
    expect(tenant?.querySelector('.bg-highlight')?.textContent).toBe('Not served')
    expect(container.textContent).toContain('Service is not complete.')
  })

  it('marks a role with no check as not yet checked', () => {
    const status = serviceStatus(rule, state)
    render(<ServiceChecklist rule={rule} status={status} state={state} />)
    expect(screen.getAllByText('Not yet checked').length).toBeGreaterThan(0)
  })

  it('lists service events with long dates, the server, and a proof link', () => {
    const status = serviceStatus(rule, state)
    const { container } = render(<ServiceChecklist rule={rule} status={status} state={state} />)
    expect(container.textContent).toContain(
      'March 1, 2027: Handed to the recipient to Pat Owner, by Sheriff Dale (Sheriff)',
    )
    expect(screen.getAllByRole('link', { name: 'Proof of service' })[0]?.getAttribute('href')).toBe(
      '/api/documents/doc-1',
    )
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(container.textContent).not.toContain('record_owner')
    expect(container.textContent).not.toContain('in_hand')
  })

  it('says service is complete when nothing is missing', () => {
    const complete: ServiceState = {
      ...state,
      checks: [
        { role: 'record_owner', outcome: 'recipients_listed' },
        { role: 'taxpayer', outcome: 'same_as_owner' },
        { role: 'occupying_tenant', outcome: 'none_exist' },
        { role: 'person_in_control', outcome: 'none_exist' },
        { role: 'mortgagee_of_record', outcome: 'none_exist' },
      ],
      recipients: [recipientRow('o', 'record_owner', 'Pat Owner')],
    }
    const { container } = render(
      <ServiceChecklist rule={rule} status={serviceStatus(rule, complete)} state={complete} />,
    )
    expect(container.textContent).toContain('Service is complete.')
  })
})
