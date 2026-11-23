import { ME_PACK } from '@packs/me'
import { FERNHOLLOW_STORIES } from '@/features/demo/me/maineStories'
import { formatCivilDate } from '@/lib/formatDate'
import { pdfText } from '@/test/pdfText'
import { expect, test } from '../fixtures/test'
import { signInAs, storyApplicationId } from './support'

const LAPSE_RULE_KEYS = ME_PACK.manifest.rules
  .filter((r) => r.kind === 'clock' && r.consequence.kind === 'lapse')
  .map((r) => r.key)

test.describe('Fernhollow permit expiry dates', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'admin')
  })

  for (const story of [FERNHOLLOW_STORIES.shorelandIssued, FERNHOLLOW_STORIES.plumbingIssued]) {
    test(`the ${story} permit prints the date it lapses`, async ({ page, db }) => {
      const id = await storyApplicationId(db, story)
      const clock = await db.one<{ due: string }>(
        `select c.current_due::text as due from clocks c
         where c.application_id = $1
           and c.superseded_by is null
           and c.rule_key = any($2::text[])
         order by c.created_at desc, c.id desc
         limit 1`,
        [id, LAPSE_RULE_KEYS],
      )
      const response = await page.request.get(`/staff/applications/${id}/permit.pdf`)
      expect(response.ok()).toBe(true)
      const lines = (await pdfText(new Uint8Array(await response.body())))
        .split('\n')
        .map((line) => line.trim())
      const expires = lines.indexOf('Expires')
      expect(expires).toBeGreaterThan(-1)
      expect(lines[expires + 1]).toBe(formatCivilDate(clock.due))
      expect(lines[expires + 1]).not.toBe('Not applicable')
    })
  }
})
