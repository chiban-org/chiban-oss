import { and, eq, like } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { documents, documentVersions, rtkRequests } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { approveRendition } from '@/features/renditions/approvals'
import { logRequest } from '@/features/rtk/requests'
import { recordFirstResponse } from '@/features/rtk/responses'
import { townToday } from '@/features/town/today'
import { makeTestDb, type TestDb } from '@/test/db'
import { useDemoStoryClock } from '@/test/demoSeedDeps'
import { visibleText } from '@/test/leaks'
import { makeTestStore } from '@/test/objectStore'

const state = vi.hoisted((): { db: unknown; actor: unknown } => ({ db: null, actor: null }))

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

const { default: RequestPage } = await import(
  '@/app/(staff)/staff/records/requests/[requestId]/page'
)

const signal = new AbortController().signal
let handle: TestDb
let custodian: Actor

async function page(requestId: string, find?: string): Promise<string> {
  const element = await RequestPage({
    params: Promise.resolve({ requestId }),
    searchParams: Promise.resolve(find === undefined ? {} : { find }),
  })
  return renderToStaticMarkup(element as never)
}

async function requestFor(description: string): Promise<string> {
  const [row] = await handle.db
    .select({ id: rtkRequests.id })
    .from(rtkRequests)
    .where(like(rtkRequests.description, `${description}%`))
  if (row === undefined) throw new Error(`no seeded request ${description}`)
  return row.id
}

function card(markup: string): string {
  const start = markup.indexOf('aria-label="Do this now"')
  const end = markup.indexOf('aria-label="Requirements"')
  return start === -1 ? '' : markup.slice(start, end)
}

function filledOutsideCard(markup: string): number {
  const inCard = card(markup)
  return markup.replace(inCard, '').split('data-variant="default"').length - 1
}

async function respondedWithApproval(): Promise<string> {
  const { store } = await makeTestStore()
  const today = await townToday(handle.db, new Date(), signal)
  const logged = await logRequest(
    handle.db,
    custodian,
    { receivedOn: today, receivedVia: 'email', description: 'Birch Lane permit letters again' },
    signal,
  )
  if (!logged.ok) throw new Error(logged.error)
  const requestId = logged.value.requestId
  await recordFirstResponse(
    handle.db,
    store,
    custodian,
    {
      requestId,
      kind: 'website_reference',
      respondedOn: today,
      websiteUrl: 'https://alderpond.example/minutes',
    },
    signal,
  )
  const [version] = await handle.db
    .select({ id: documentVersions.id })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(
      and(
        eq(documents.title, 'Permit correspondence for the Birch Lane renovation'),
        eq(documentVersions.role, 'original'),
      ),
    )
  const approved = await approveRendition(
    handle.db,
    custodian,
    {
      versionId: version?.id ?? '',
      purpose: 'rtk_release',
      rtkRequestId: requestId,
      reviewStatement: 'Nothing exempt.',
    },
    signal,
  )
  if (!approved.ok) throw new Error(approved.error)
  return requestId
}

beforeAll(async () => {
  useDemoStoryClock()
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq: is }) => is(u.email, 'records@alderpond.example'),
  })
  custodian = (await loadActor(handle.db, user?.id ?? '', signal)) as Actor
  state.actor = custodian
})
afterAll(async () => {
  vi.useRealTimers()
  await handle.drop()
})

describe('the request page per state', () => {
  it('an open request asks for the first response in the card with radios and no default', async () => {
    const markup = await page(await requestFor('Minutes and recordings'))
    const text = visibleText(markup)
    expect(text).toMatch(
      /Waiting on: Town\. Send the first response\. First response due [A-Z][a-z]+ \d{1,2}, \d{4}, \d+ days? left\./,
    )
    const work = card(markup)
    expect(visibleText(work)).toContain('Send the first response')
    expect(work).toContain('type="radio"')
    expect(work).not.toMatch(/type="radio"[^>]*checked/)
    expect(work).toMatch(/data-variant="default"[^>]*>Record response</)
    expect(filledOutsideCard(markup)).toBe(0)
    expect(text).toContain('Before a denial')
    expect(text).toContain('Before records are released')
    expect(markup).toContain('aria-current="step"')
    expect(text).toContain('How it is counted')
    expect(text).toContain('5 business days after')
    expect(text).toContain('RSA 91-A:4 IV(b)')
    expect(text).not.toContain('Try')
  })

  it('an overdue request says now and warns in the card', async () => {
    const markup = await page(await requestFor('All building permit applications for Birch Lane'))
    const text = visibleText(markup)
    expect(text).toMatch(/Send the first response now\. First response due .*, \d+ days overdue\./)
    expect(visibleText(card(markup))).toMatch(/The first response is late\. It was due /)
    expect(markup).toContain('(overdue)')
  })

  it('a time-stated request offers release and the deny step with its withholding rule', async () => {
    const markup = await page(await requestFor('Correspondence between the town'))
    const text = visibleText(markup)
    expect(text).toMatch(
      /Waiting on: Town\. Release the records or deny the request\. Date the town stated: .*, \d+ days left\./,
    )
    const work = visibleText(card(markup))
    expect(work).toContain('Release the records')
    expect(work).toContain('Or deny the request')
    expect(card(markup)).toMatch(/data-variant="destructive"[^>]*>Deny the request</)
    expect(text).toContain('Time stated')
    expect(filledOutsideCard(markup)).toBe(0)
  })

  it('find results are rows with an Approve button per version, a count and a redact link', async () => {
    const requestId = await requestFor('Correspondence between the town')
    const markup = await page(requestId, 'Birch Lane renovation')
    expect(visibleText(markup)).toMatch(/Found \d+ documents? for Birch Lane renovation\./)
    expect(markup).toMatch(
      /aria-label="Approve Permit correspondence for the Birch Lane renovation:/,
    )
    const redact =
      /href="\/staff\/records\/redact\/[0-9a-f-]{36}\?request=([0-9a-f-]{36})"[^>]*>Redact for this request</.exec(
        markup,
      )
    expect(redact?.[1]).toBe(requestId)
    expect(visibleText(markup)).not.toContain('UTC')
  })

  it('a responded request with an approval waiting asks for the release in the card', async () => {
    const markup = await page(await respondedWithApproval())
    expect(visibleText(markup)).toContain(
      'Waiting on: Town. Release the approved records, then close the request.',
    )
    const work = card(markup)
    expect(visibleText(work)).toContain('Approved, not yet released')
    expect(work).toMatch(/data-variant="default"[^>]*>Release 1 record</)
    expect(filledOutsideCard(markup)).toBe(0)
    expect(visibleText(markup)).toContain('Waiting')
  })

  it('a closed request reads its outcome, has no card, and folds the history', async () => {
    const markup = await page(await requestFor('Letters and permits for the Birch Lane'))
    const text = visibleText(markup)
    expect(text).toContain('This request is closed.')
    expect(card(markup)).toBe('')
    expect(markup).not.toContain('data-variant="default"')
    expect(text).toContain('Letter for release 1')
    expect(text).toContain('Released in release 2')
    expect(markup).toContain('Record and history')
    expect(text).toContain('Revoke approval')
    expect(text).not.toContain('More actions')
  })
})
