import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ConfigKind } from '@/features/config/kinds'
import { publishConfig } from '@/features/config/publish'
import { fieldErrorsFor } from '@/features/config/publishErrors'
import { saveDraft } from '@/features/config/store'
import { CONDITIONS_BODY, FEE_BODY, FORM_BODY } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function attempt(kind: ConfigKind, key: string, body: unknown) {
  const admin = await staffActor(handle.db, 'admin')
  const saved = await saveDraft(handle.db, admin, { kind, key, body }, signal)
  if (!saved.ok) return { stage: 'save', errors: fieldErrorsFor(saved.error) }
  const published = await publishConfig(handle.db, admin, saved.value.versionId, signal)
  if (published.ok) return { stage: 'published', errors: {} as Record<string, string> }
  return { stage: 'publish', errors: fieldErrorsFor(published.error) }
}

const TOWN_RULE = {
  ruleKey: 'town.bp.validity',
  adoptingAuthority: 'Town Meeting',
  adoptedOn: '2025-03-01',
}

describe('town rule value bounds (FS-A-11)', () => {
  it.each([
    -3, 0, 121, 1.5,
  ])('refuses %s months for the building permit validity', async (value) => {
    const r = await attempt('town_rule_setting', 'town.bp.validity', { ...TOWN_RULE, value })
    expect(r).toEqual({
      stage: 'publish',
      errors: { value: 'Enter a whole number of months from 1 to 120.' },
    })
  })

  it.each([1, 12, 120])('publishes %s months', async (value) => {
    const r = await attempt('town_rule_setting', 'town.bp.validity', { ...TOWN_RULE, value })
    expect(r.stage).toBe('published')
  })

  it.each([0, 366])('refuses %s days for the temporary structure validity', async (value) => {
    const r = await attempt('town_rule_setting', 'town.temporary.validity', {
      ...TOWN_RULE,
      ruleKey: 'town.temporary.validity',
      value,
    })
    expect(r.errors).toEqual({ value: 'Enter a whole number of days from 1 to 365.' })
  })
})

describe('whitespace-only names (FS-A-02)', () => {
  it('refuses a fee line with a blank name', async () => {
    const lines = [{ ...FEE_BODY.lines[1], label: '   ' }]
    const r = await attempt('fee_schedule', 'blank-fee', { ...FEE_BODY, lines })
    expect(r).toEqual({
      stage: 'save',
      errors: { lines: 'Fee 1: Enter the name of the fee as it shows on the bill.' },
    })
  })

  it('refuses a condition with blank text', async () => {
    const conditions = [{ ...CONDITIONS_BODY.conditions[0], text: '   ' }]
    const r = await attempt('condition_library', 'blank-cond', { ...CONDITIONS_BODY, conditions })
    expect(r).toEqual({
      stage: 'save',
      errors: { conditions: 'Condition 1: Enter the text of the condition.' },
    })
  })

  it('stores a padded fee name trimmed', async () => {
    const lines = [{ ...FEE_BODY.lines[1], label: '  Renewal  ' }]
    const r = await attempt('fee_schedule', 'padded-fee', { ...FEE_BODY, lines })
    expect(r.stage).toBe('published')
  })
})

describe('fee amount bounds (FS-A-08)', () => {
  it('refuses a flat fee of $99,999,999,999', async () => {
    const lines = [{ ...FEE_BODY.lines[1], expr: { op: 'flat', cents: 9_999_999_999_900 } }]
    const r = await attempt('fee_schedule', 'huge-fee', { ...FEE_BODY, lines })
    expect(r).toEqual({
      stage: 'save',
      errors: { lines: 'Fee 1: Enter an amount of $1,000,000.00 or less.' },
    })
  })

  it('publishes a flat fee of exactly $1,000,000', async () => {
    const lines = [{ ...FEE_BODY.lines[1], expr: { op: 'flat', cents: 100_000_000 } }]
    const r = await attempt('fee_schedule', 'cap-fee', { ...FEE_BODY, lines })
    expect(r.stage).toBe('published')
  })
})

describe('placeholders on a form (FS-A-10)', () => {
  it('refuses untitled questions and starting choices', async () => {
    const fields = [
      ...FORM_BODY.fields,
      { key: 'untitled_question', label: 'Untitled question', type: 'money', required: false },
      {
        key: 'pick',
        label: 'Pick one',
        type: 'select',
        required: false,
        options: [
          { value: 'choice_1', label: 'Choice 1' },
          { value: 'choice_2', label: 'Choice 2' },
        ],
      },
    ]
    const r = await attempt('form', 'placeholder-form', { ...FORM_BODY, fields })
    expect(r).toEqual({
      stage: 'publish',
      errors: {
        fields:
          'Question 3: Replace the placeholder wording. Question 4: Replace the placeholder choices with the real ones.',
      },
    })
  })

  it('refuses a dropdown choice with a blank name', async () => {
    const fields = [
      {
        key: 'pick',
        label: 'Pick one',
        type: 'select',
        required: false,
        options: [{ value: 'a', label: '   ' }],
      },
    ]
    const r = await attempt('form', 'blank-choice-form', { ...FORM_BODY, fields })
    expect(r).toEqual({
      stage: 'save',
      errors: { fields: 'Question 1, Choice 1: Enter the wording of the choice.' },
    })
  })
})

describe('placeholders on a local code amendment (FS-A-12)', () => {
  const AMENDMENT = {
    title: 'Snow load',
    codeSection: 'Section',
    adoptingAuthority: 'Governing body',
    adoptedOn: '2099-12-31',
    reviewBoardConfirmedOn: null,
  }

  it('refuses the unchanged starter text and date', async () => {
    const r = await attempt('local_code_amendment', 'snow', AMENDMENT)
    expect(r).toEqual({
      stage: 'publish',
      errors: {
        codeSection: 'Enter the code section this change amends.',
        adoptingAuthority: 'Enter who adopted this change.',
        adoptedOn: 'Enter the date it was adopted.',
      },
    })
  })

  it('publishes once the placeholders are replaced', async () => {
    const r = await attempt('local_code_amendment', 'snow2', {
      ...AMENDMENT,
      codeSection: 'IRC R301.2',
      adoptingAuthority: 'Town Meeting',
      adoptedOn: '2025-03-09',
    })
    expect(r.stage).toBe('published')
  })
})

describe('plain copy for schema refusals (FS-A-09)', () => {
  const INSPECTION = {
    key: 'default',
    schedulingDays: [1, 3],
    windowStartMinute: 480,
    windowEndMinute: 960,
    slotMinutes: 60,
    minNoticeDays: 1,
    horizonDays: 30,
    maxPerInspectorPerDay: 6,
    phoneRequestHours: { days: [1], startMinute: 480, endMinute: 720 },
    portalRequestsEnabled: true,
  }

  it('words a booking horizon above the maximum', async () => {
    const r = await attempt('inspection_settings', 'default', { ...INSPECTION, horizonDays: 181 })
    expect(r.errors).toEqual({
      horizonDays: 'Enter the days ahead that can be booked of 180 or less.',
    })
  })

  it('words a convenience fee percent above 100', async () => {
    const body = {
      key: 'default',
      convenienceFee: { basisPoints: 15000, fixedCents: 0, appliesTo: [] },
      receiptFooter: '',
      checksPayableTo: 'the Town',
    }
    const r = await attempt('payment_settings', 'default', body)
    expect(r.errors).toEqual({ convenienceFee: 'Enter the percent of the payment as 100 or less.' })
  })

  it('words an empty inspection type and an empty checklist', async () => {
    const r = await attempt('inspection_checklist', 'empty-check', {
      key: 'empty-check',
      inspectionType: '',
      label: 'Empty',
      items: [],
    })
    expect(r.errors).toEqual({
      inspectionType: 'Enter the inspection type.',
      items: 'Add a check.',
    })
  })

  it('words an invalid notice web address', async () => {
    const r = await attempt('board_settings', 'default', {
      key: 'default',
      boards: [
        {
          board: 'zba',
          label: 'ZBA',
          publicNotice: {
            posting: true,
            publication: false,
            newspaper: null,
            bulletinBoards: [],
            websiteUrl: 'not a url',
          },
          filingLeadDays: null,
          filingLeadAdoption: null,
        },
      ],
      abutters: {
        projectionEnabled: false,
        layersConfirmedBy: null,
        layersConfirmedOn: null,
        assumedRightOfWayFt: 50,
      },
    })
    expect(r.errors).toEqual({
      boards: 'Board 1: Enter the notice web address as a web address starting with https://.',
    })
  })
})
