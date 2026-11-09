import { expect, fillDate, test } from '../fixtures/test'
import { applicationIdFor, daysFromToday } from './records'

const APPLICATION = 'Service upgrade'
const CONSERVATION = 'Alder Pond Conservation Commission'
const MEMBER = 'concom.member@alderpond.example'
const MEMBER_NAME = 'Cleo Marsh'

test.describe
  .serial('the Conservation Commission comments on a demo application', () => {
    let applicationId: string
    let assignmentId: string
    let comment: string

    test.describe('the clerk', () => {
      test.use({ role: 'staff' })

      test('sends the service upgrade to the Conservation Commission', async ({ page, db }) => {
        applicationId = await applicationIdFor(db, APPLICATION)
        const commentBy = await daysFromToday(db, 10)
        await page.goto(`/staff/applications/${applicationId}`)
        const reviewers = page.getByRole('region', { name: 'Reviewers' })
        await reviewers.getByText('Send to a board for comment', { exact: true }).click()
        const board = reviewers.getByLabel('Board', { exact: true })
        await expect(board.locator('option')).toContainText([
          'Alder Pond Planning Board',
          'Alder Pond Zoning Board of Adjustment',
          CONSERVATION,
          'Alder Pond Historic District Commission',
        ])
        await board.selectOption({ label: CONSERVATION })
        await fillDate(reviewers.getByLabel(/^Comment by/), commentBy)
        await reviewers.getByRole('button', { name: 'Send to the board' }).click()
        const item = reviewers.getByRole('listitem').filter({ hasText: CONSERVATION })
        await expect(item).toContainText('Waiting for comments')
        const row = await db.one<{ id: string }>(
          `select ra.id from review_assignments ra join boards b on b.id = ra.board_id
            where ra.application_id = $1 and b.name = $2 and ra.removed_at is null`,
          [applicationId, CONSERVATION],
        )
        assignmentId = row.id
        const queued = await db.one<{ count: string }>(
          `select count(*) from notification_outbox n join users u on u.id = n.recipient_user_id
            where n.event = 'board_comment_requested' and n.application_id = $1 and u.email = $2`,
          [applicationId, MEMBER],
        )
        expect(Number(queued.count)).toBe(1)
      })
    })

    test.describe('a Conservation Commission member', () => {
      test.use({ role: 'concomMember' })

      test('finds it on the board page and comments', async ({ page, suffix }) => {
        comment = `The buffer to the brook is unchanged by the upgrade ${suffix}`
        await page.goto('/board')
        const requests = page.getByRole('region', { name: 'Sent to your board for comment' })
        await requests.getByRole('link', { name: new RegExp(APPLICATION) }).click()
        await expect(page).toHaveURL(`/board/comments/${assignmentId}`)
        await expect(page.getByRole('region', { name: 'About this request' })).toContainText(
          'Conservation Commission',
        )
        await expect(page.getByText('No comments yet')).toBeVisible()
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
      })
    })

    test.describe('a planning board member', () => {
      test.use({ role: 'planningBoardMember' })

      test('cannot open the comment page', async ({ page }) => {
        const response = await page.goto(`/board/comments/${assignmentId}`)
        expect(response?.status()).toBe(404)
      })
    })

    test.describe('the clerk again', () => {
      test.use({ role: 'staff' })

      test('reads the comment attributed to the member and the commission', async ({ page }) => {
        await page.goto(`/staff/applications/${applicationId}`)
        const item = page
          .getByRole('region', { name: 'Reviewers' })
          .getByRole('listitem')
          .filter({ hasText: CONSERVATION })
          .first()
        await expect(item).toContainText('Comments received')
        await expect(item).toContainText(comment)
        await expect(item).toContainText(`${MEMBER_NAME}, Conservation Commission, `)
      })
    })
  })
