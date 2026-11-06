import type { Page } from '@playwright/test'
import type { E2eDb } from '../fixtures/test'

export const MAILED_ON = '2026-09-01'
export const CERTIFIED = [
  'Certified mail, Alder Valley Regional Planning Commission',
  'Certified mail, Town of Dunmore',
  'Certified mail, Town of Pine River',
]
export const OTHER_GROUPS = [
  {
    method: 'First class mail',
    items: ['First class mail, NH Department of Environmental Services'],
  },
  { method: 'Certificate of mailing', items: ['Verified mail, Alex Applicant'] },
  {
    method: 'Posting',
    items: [
      'Public posting',
      'Bulletin board, Alder Pond Public Library',
      'Bulletin board, Alder Pond Town Hall bulletin board',
    ],
  },
]

export async function hearingFor(db: E2eDb, applicationId: string): Promise<string> {
  const row = await db.one<{ id: string }>('select id from hearings where application_id = $1', [
    applicationId,
  ])
  return row.id
}

export async function proofCount(db: E2eDb, hearingId: string): Promise<number> {
  const rows = await db.rows(
    `select 1 from notice_proofs p join notice_items i on i.id = p.item_id
     join hearings h on h.notice_set_id = i.set_id where h.id = $1`,
    [hearingId],
  )
  return rows.length
}

export async function fillProof(
  page: Page,
  proofTitle: string,
  group: { method: string; items: string[]; reference?: string },
): Promise<void> {
  await page.goto(page.url())
  const form = page.locator('#record-proof')
  if (!(await form.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await form.locator('summary').click()
  }
  for (const item of group.items) await form.getByLabel(item, { exact: true }).check()
  await form.getByLabel('Proof', { exact: true }).selectOption({ label: group.method })
  if (group.reference !== undefined) await form.getByLabel('Tracking number').fill(group.reference)
  await form.getByLabel('Date of mailing, posting, or publication').fill(MAILED_ON)
  await form.getByLabel(/^Certificate or receipt/).selectOption({ label: proofTitle })
  await form.getByRole('button', { name: 'Record proof' }).click()
}
