import { describe, expect, it } from 'vitest'
import { DEFAULT_WORDING } from '@/features/notifications/wording/wordingDefaults'
import {
  currentWording,
  insertField,
  isChanged,
  withDefault,
  withWording,
} from '@/features/notifications/wording/wordingEdits'
import { EMPTY_NOTIFICATION_WORDING } from '@/features/notifications/wording/wordingSchema'

describe('notification wording edits', () => {
  it('starts from the code default and stores only what staff change', () => {
    const body = EMPTY_NOTIFICATION_WORDING
    expect(currentWording(body, 'fees_due')).toEqual(DEFAULT_WORDING.fees_due)
    const edited = withWording(body, 'fees_due', { subject: 'Please pay' })
    expect(edited.events.fees_due).toEqual({
      subject: 'Please pay',
      body: DEFAULT_WORDING.fees_due.body,
    })
    expect(isChanged(edited, 'fees_due')).toBe(true)
    expect(isChanged(edited, 'payment_received')).toBe(false)
  })

  it('drops the change when staff type the default back or reset it', () => {
    const edited = withWording(EMPTY_NOTIFICATION_WORDING, 'fees_due', { subject: 'Please pay' })
    expect(withWording(edited, 'fees_due', DEFAULT_WORDING.fees_due).events).toEqual({})
    expect(withDefault(edited, 'fees_due').events).toEqual({})
  })

  it('inserts a field at the caret', () => {
    expect(insertField('Dear ,', 5, 'applicant.name')).toEqual({
      text: 'Dear {{applicant.name}},',
      caret: 23,
    })
  })
})
