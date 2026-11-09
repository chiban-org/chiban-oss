import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applications, licenseChecks } from '@/db/schema'
import { recordLicenseCheck } from '@/features/licenseChecks/recordLicenseCheck'
import { makeTestDb, type TestDb } from '@/test/db'
import { sectionOf } from '@/test/htmlSections'
import { setupTradeWorld, submittedTrade, type TradeFixture } from '@/test/ledgerFixtures'

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

const { default: ApplicationPage } = await import(
  '@/app/(staff)/staff/applications/[applicationId]/page'
)

const signal = new AbortController().signal
let handle: TestDb
let trade: TradeFixture

beforeEach(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  trade = await submittedTrade(handle.db, (await setupTradeWorld(handle.db)).world)
  await handle.db.delete(licenseChecks)
})
afterEach(async () => {
  await handle.drop()
})

async function page(): Promise<string> {
  state.actor = trade.world.staff
  return renderToStaticMarkup(
    (await ApplicationPage({
      params: Promise.resolve({ applicationId: trade.applicationId }),
    })) as never,
  )
}

describe('the license check on a trade permit record', () => {
  it('lists the check as a requirement before issuance, with the lookup and a form', async () => {
    const html = await page()
    const requirements = sectionOf(html, 'Requirements')
    expect(requirements).toContain('State license checked')
    expect(requirements).toContain('No state license check is recorded.')
    const panel = sectionOf(html, 'State license check')
    expect(panel).toContain('The applicant entered license number EL-1.')
    expect(panel).toContain('No state license check is recorded.')
    expect(panel).toMatch(
      /<a[^>]*href="https:\/\/forms\.nh\.gov\/licenseverification\/Search\.aspx"[^>]*target="_blank"/,
    )
    expect(html).toContain('name="licenseNumber"')
    expect(html).toContain('value="EL-1"')
    expect(html).toContain('Record the license check')
  })

  it('shows who checked, when, and what they found', async () => {
    await recordLicenseCheck(
      handle.db,
      trade.world.staff,
      {
        applicationId: trade.applicationId,
        licenseNumber: 'EL-1',
        licenseType: 'Master electrician',
        result: 'expired',
        note: 'Lapsed in June',
        checkedAt: new Date('2027-03-03T15:00:00Z'),
      },
      signal,
    )
    const panel = sectionOf(await page(), 'State license check')
    expect(panel).toContain('Expired: license EL-1, Master electrician.')
    expect(panel).toMatch(/Checked by [^<]+ on March 3, 2027/)
    expect(panel).toContain('Lapsed in June')
  })

  it('owner-performed work shows no license check', async () => {
    await handle.db
      .update(applications)
      .set({ values: { description: 'Panel upgrade', work_by: 'owner' } })
      .where(eq(applications.id, trade.applicationId))
    const html = await page()
    expect(html).not.toContain('State license check')
    expect(html).not.toContain('State license checked')
  })
})
