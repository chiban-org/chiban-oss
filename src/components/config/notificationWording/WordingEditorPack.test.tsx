// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotificationWordingEditor } from '@/components/config/notificationWording/NotificationWordingEditor'
import { PackTextProvider } from '@/components/PackTextProvider'
import { EMPTY_NOTIFICATION_WORDING } from '@/features/notifications/wording/wordingSchema'
import { NEUTRAL_PACK_TEXT } from '@/features/packs/neutralPackText'
import { activePack } from '@/features/packs/registry'

afterEach(cleanup)

function showReceipt(recordsAcknowledgement: boolean, onChange = vi.fn()) {
  render(
    <PackTextProvider value={{ ...NEUTRAL_PACK_TEXT, recordsAcknowledgement }}>
      <NotificationWordingEditor
        body={EMPTY_NOTIFICATION_WORDING}
        onChange={onChange}
        errors={{}}
        townName="Town of Fernhollow"
      />
    </PackTextProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: /Records request received/ }))
  return onChange
}

describe('the records receipt wording in the editor', () => {
  it('shows the acknowledgement promise from the pack text even when the registry is New Hampshire', () => {
    expect(activePack().recordsRequests.acknowledgement).toBe(false)
    showReceipt(true)
    const body = screen.getByLabelText<HTMLTextAreaElement>('Message')
    expect(body.value).toContain('The town will acknowledge your request by {{request.due}}.')
    expect(body.value).not.toContain('The town will answer by')
  })

  it('keeps the acknowledgement body when only the subject is edited', () => {
    const onChange = showReceipt(true)
    const subject = screen.getByLabelText<HTMLInputElement>('Subject')
    const standard = subject.value
    fireEvent.change(subject, { target: { value: `${standard} today` } })
    const edited = onChange.mock.calls.at(-1)?.[0]
    expect(JSON.stringify(edited)).toContain('acknowledge your request')
  })

  it('keeps the answer promise without acknowledgement', () => {
    showReceipt(false)
    const body = screen.getByLabelText<HTMLTextAreaElement>('Message')
    expect(body.value).toContain('The town will answer by {{request.due}}.')
  })
})
