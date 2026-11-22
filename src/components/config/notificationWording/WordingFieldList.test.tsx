// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WordingFieldList } from '@/components/config/notificationWording/WordingFieldList'
import { PackTextProvider } from '@/components/PackTextProvider'
import { NEUTRAL_PACK_TEXT } from '@/features/packs/neutralPackText'

afterEach(cleanup)

function dueLabel(recordsAcknowledgement: boolean): string {
  render(
    <PackTextProvider value={{ ...NEUTRAL_PACK_TEXT, recordsAcknowledgement }}>
      <WordingFieldList fieldKey="rtk_request_received" onInsert={() => undefined} />
    </PackTextProvider>,
  )
  return screen.getByText('{{request.due}}').nextElementSibling?.textContent ?? ''
}

describe('the request due field label in the wording editor', () => {
  it('reads as the acknowledgement date where the pack acknowledges requests', () => {
    expect(dueLabel(true)).toBe('Date the town will acknowledge the request by')
  })

  it('keeps the answer date where the pack has no acknowledgement', () => {
    expect(dueLabel(false)).toBe('Date the town will answer by')
  })
})
