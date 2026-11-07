import { expect, fillDate, test, waitForEmail } from '../fixtures/test'
import { applicationIdFor, daysFromToday } from './records'

const APPLICATION = 'Loon Cove site plan'
const ZBA = 'Alder Pond Zoning Board of Adjustment'
const ZBA_MEMBER = 'zba.member@alderpond.example'

function longDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${iso}T00:00:00Z`))
}

test.describe
  .serial('a board comments on an application it is not deciding', () => {
    let applicationId: string
    let assignmentId: string
    let commentBy: string
    let comment: string

    test.describe('the clerk', () => {
      test.use({ role: 'staff' })

      test('sends the site plan to the zoning board for comment', async ({ page, db }) => {
        applicationId = await applicationIdFor(db, APPLICATION)
        commentBy = await daysFromToday(db, 14)
        const since = new Date()
        await page.goto(`/staff/applications/${applicationId}`)
        const reviewers = page.getByRole('region', { name: 'Reviewers' })
        await reviewers.getByText('Send to a board for comment', { exact: true }).click()
        const board = reviewers.getByLabel('Board', { exact: true })
        await expect(board.locator('option')).not.toContainText(['Alder Pond Planning Board'])
        await board.selectOption({ label: ZBA })
        await fillDate(reviewers.getByLabel(/^Comment by/), commentBy)
        await reviewers.getByRole('button', { name: 'Send to the board' }).click()
        await expect(
          page.locator('[data-sonner-toast]').filter({ hasText: 'Sent to the board for comment.' }),
        ).toBeVisible()
        const item = reviewers.getByRole('listitem').filter({ hasText: ZBA })
        await expect(item).toContainText('Waiting for comments')
        await expect(item).toContainText(`Comments by ${longDate(commentBy)}`)
        const row = await db.one<{ id: string }>(
          `select ra.id from review_assignments ra join boards b on b.id = ra.board_id
            where ra.application_id = $1 and b.kind = 'zba' and ra.removed_at is null`,
          [applicationId],
        )
        assignmentId = row.id
        const mail = await waitForEmail({ to: ZBA_MEMBER, since, subject: 'Comments requested' })
        expect(mail.text).toContain('/board')
        expect(mail.text).toContain(`Comments by ${longDate(commentBy)}.`)
      })
    })

    test.describe('a zoning board member', () => {
      test.use({ role: 'zbaMember' })

      test('finds it on the board page and comments', async ({ page, suffix }) => {
        comment = `Lot coverage looks fine from the board's side ${suffix}`
        await page.goto('/board')
        const requests = page.getByRole('region', { name: 'Sent to your board for comment' })
        await expect(requests).toContainText(`Comments by ${longDate(commentBy)}.`)
        await requests.getByRole('link', { name: new RegExp(APPLICATION) }).click()
        await expect(page).toHaveURL(`/board/comments/${assignmentId}`)
        await expect(page.getByRole('heading', { level: 1 })).toContainText(APPLICATION)
        await expect(page.getByText(`Sent to the ${ZBA} for comment.`)).toBeVisible()
        const comments = page.getByRole('region', { name: 'Comments' })
        const submit = comments.getByRole('button', { name: 'Post comment' })
        await expect(submit).toBeEnabled()
        await comments.getByLabel(/^Comment/).fill(comment)
        await submit.click()
        await expect(comments.getByRole('status')).toHaveText(
          'Comment posted. The land use office can read it now.',
        )
        await page.reload()
        await expect(page.getByRole('region', { name: 'Comments' })).toContainText(comment)
        await expect(page.getByText('Comments received')).toBeVisible()
      })
    })

    test.describe('a planning board member', () => {
      test.use({ role: 'planningBoardMember' })

      test('cannot open it and does not see it listed', async ({ page }) => {
        const response = await page.goto(`/board/comments/${assignmentId}`)
        expect(response?.status()).toBe(404)
        await page.goto('/board')
        await expect(
          page.getByRole('region', { name: 'Sent to your board for comment' }),
        ).toHaveCount(0)
      })
    })

    test.describe('the clerk again', () => {
      test.use({ role: 'staff' })

      test('reads the comment attributed to the member and the board', async ({ page }) => {
        await page.goto(`/staff/applications/${applicationId}`)
        const item = page
          .getByRole('region', { name: 'Reviewers' })
          .getByRole('listitem')
          .filter({ hasText: ZBA })
          .first()
        await expect(item).toContainText('Comments received')
        await expect(item).toContainText(comment)
        await expect(item).toContainText('Drew Hale, Zoning Board of Adjustment, ')
      })
    })
  })
