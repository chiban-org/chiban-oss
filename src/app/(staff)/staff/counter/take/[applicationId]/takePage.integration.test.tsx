import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { startCounterIntake } from '@/features/counter/intake/startIntake'
import { submitCounterIntake } from '@/features/counter/intake/submitIntake'
import { saveDraftValues } from '@/features/portal/drafts'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const state = vi.hoisted((): { db: unknown; actor: Actor | null } => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined }),
  headers: () => Promise.resolve(new Headers()),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))
vi.mock('@/app/(staff)/staff/counter/intakeActions', () => ({
  discardIntakeAction: vi.fn(),
  saveIntakeAction: vi.fn(),
  sendApplicantClaimAction: vi.fn(),
  startIntakeAction: vi.fn(),
  submitIntakeAction: vi.fn(),
}))

const { default: TakePage } = await import('./page')
const { default: ApplicationPage } = await import(
  '@/app/(staff)/staff/applications/[applicationId]/page'
)

const signal = new AbortController().signal
const WALK_IN = { name: 'Morgan Reyes', email: 'morgan.reyes@alderpond.example' }
let handle: TestDb
let world: BoardWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db)
  state.actor = world.staff
})
afterAll(async () => {
  await handle.drop()
})

async function take(): Promise<string> {
  const started = await startCounterIntake(
    handle.db,
    world.staff,
    { parcelId: world.parcelId, applicationTypeKey: world.zbaTypeKey, applicant: WALK_IN },
    signal,
  )
  if (!started.ok) throw new Error('start failed')
  return started.value.applicationId
}

async function render(applicationId: string, step?: string): Promise<string> {
  return renderToStaticMarkup(
    await TakePage({
      params: Promise.resolve({ applicationId }),
      searchParams: Promise.resolve(step === undefined ? {} : { step }),
    }),
  )
}

async function submitted(): Promise<string> {
  const applicationId = await take()
  await saveDraftValues(
    handle.db,
    world.staff,
    { applicationId, values: { classification: 'residential' } },
    signal,
  )
  const done = await submitCounterIntake(
    handle.db,
    world.staff,
    { applicationId, signedOnPaper: true },
    signal,
  )
  if (!done.ok) throw new Error('submit failed')
  return applicationId
}

describe('taking an application at the counter, step by step', () => {
  it('opens on the application form with the applicant and clerk in the summary', async () => {
    const html = await render(await take())
    expect(html).toContain('Classification')
    expect(html).toContain('Save and continue')
    expect(html).toContain('Save and finish later')
    expect(html).toContain('Morgan Reyes, morgan.reyes@alderpond.example, no account')
    expect(html).toContain('aria-current="step"')
  })

  it('takes scans on the documents step', async () => {
    const html = await render(await take(), 'documents')
    expect(html).toContain(
      'Scan or upload the plans, letters and other papers the applicant brought.',
    )
    expect(html).toContain('Nothing scanned or uploaded yet.')
    expect(html).toContain('Continue to attestation and submit')
  })

  it('asks the clerk to confirm the paper attestation instead of an online click', async () => {
    const html = await render(await take(), 'submit')
    expect(html).toContain('The applicant signs this statement on the paper form:')
    expect(html).toContain('The applicant signed the attestation on paper')
    expect(html).toContain('Submit the application')
    expect(html).toContain('You take it on the next step, after submitting.')
  })

  it('takes the intake fee after submitting', async () => {
    const html = await render(await submitted())
    expect(html).toContain('is submitted. The fee due now is $100.00.')
    expect(html).toContain('Record payment')
    expect(html).toContain('Finish without taking payment.')
  })

  it('finishes with the record link and a claim link for an applicant without an account', async () => {
    const applicationId = await submitted()
    const html = await render(applicationId, 'done')
    expect(html).toContain('is submitted for review.')
    expect(html).toContain('Send claim link to the applicant')
    expect(html).toContain(`href="/staff/applications/${applicationId}"`)
  })

  it('shows on the staff record that the application was taken at the counter', async () => {
    const applicationId = await submitted()
    const html = renderToStaticMarkup(
      await ApplicationPage({ params: Promise.resolve({ applicationId }) }),
    )
    expect(html).toContain('Taken at the counter by')
  })

  it('refuses a user without the counter capabilities', async () => {
    const applicationId = await take()
    state.actor = world.reviewer
    try {
      expect(await render(applicationId)).toContain(
        'You do not have permission to take applications at the counter.',
      )
    } finally {
      state.actor = world.staff
    }
  })
})
