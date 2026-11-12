// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotificationWordingEditor } from '@/components/config/notificationWording/NotificationWordingEditor'
import { DEFAULT_WORDING } from '@/features/notifications/wording/wordingDefaults'
import {
  EMPTY_NOTIFICATION_WORDING,
  type NotificationWordingBody,
} from '@/features/notifications/wording/wordingSchema'

afterEach(cleanup)

const changed: NotificationWordingBody = {
  key: 'default',
  events: {
    fees_due: { subject: 'Pay {{fees.amount}} to {{town.name}}', body: 'Hi {{applicant.name}}.' },
  },
}

describe('NotificationWordingEditor', () => {
  it('previews the selected message with sample details and the town name', () => {
    render(
      <NotificationWordingEditor
        body={changed}
        onChange={vi.fn()}
        errors={{}}
        townName="Town of Birch Hollow"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Fees due/ }))
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(preview.textContent).toContain('Pay $125.00 to Town of Birch Hollow')
    expect(preview.textContent).toContain('Hi Jordan Rivera.')
    expect(preview.textContent).toContain('[link Chiban adds]')
  })

  it('resets a changed message to the standard wording', () => {
    const onChange = vi.fn()
    render(
      <NotificationWordingEditor body={changed} onChange={onChange} errors={{}} townName="T" />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Fees due/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset to the standard wording' }))
    expect(onChange).toHaveBeenCalledWith(EMPTY_NOTIFICATION_WORDING)
  })

  it('keeps reset unavailable while the message uses the standard wording', () => {
    render(
      <NotificationWordingEditor
        body={EMPTY_NOTIFICATION_WORDING}
        onChange={vi.fn()}
        errors={{}}
        townName="T"
      />,
    )
    expect(screen.getByLabelText('Subject')).toHaveProperty(
      'value',
      DEFAULT_WORDING.application_submitted.subject,
    )
    expect(screen.getByRole('button', { name: 'Reset to the standard wording' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('shows the field error for the selected message', () => {
    render(
      <NotificationWordingEditor
        body={changed}
        onChange={vi.fn()}
        errors={{ 'events.fees_due.body': 'Leave web addresses out.' }}
        townName="T"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Fees due/ }))
    expect(screen.getByText('Leave web addresses out.')).toBeDefined()
  })

  it('lists the records requester group and the board messages', () => {
    render(
      <NotificationWordingEditor
        body={EMPTY_NOTIFICATION_WORDING}
        onChange={vi.fn()}
        errors={{}}
        townName="T"
      />,
    )
    const nav = screen.getByRole('navigation', { name: 'Messages' })
    expect(nav.textContent).toContain('To records requesters')
    for (const label of ['Records request received', 'Records attached', 'Added to a board']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeDefined()
    }
  })

  it('says a message without a link has none and offers no link field', () => {
    render(
      <NotificationWordingEditor
        body={EMPTY_NOTIFICATION_WORDING}
        onChange={vi.fn()}
        errors={{}}
        townName="T"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Records attached/ }))
    expect(screen.getByText(/This message has no link\./)).toBeDefined()
    expect(screen.queryByText('{{link}}')).toBeNull()
    expect(screen.getByText('{{request.number}}')).toBeDefined()
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(preview.textContent).not.toContain('[link Chiban adds]')
  })

  it('names the fields a message must keep', () => {
    render(
      <NotificationWordingEditor
        body={EMPTY_NOTIFICATION_WORDING}
        onChange={vi.fn()}
        errors={{}}
        townName="T"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Records request received/ }))
    expect(
      screen.getByText(/It must include \{\{request\.number\}\} and \{\{request\.due\}\}\./),
    ).toBeDefined()
  })
})
