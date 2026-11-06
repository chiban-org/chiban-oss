import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { clocks } from '@/db/schema'
import { getStaffApplicationView } from '@/features/applications/staffApplicationView'
import { adjustClock } from '@/features/clocks/adjustClock'
import { dueNext, expandedClocks } from '@/features/clocks/clockSummary'
import { setupBoardWorld, submitBoardApplication } from '@/test/boardFixtures'
import { makeTestDb } from '@/test/db'

const signal = new AbortController().signal

describe('the application rail after a ZBA decision clock is extended', () => {
  it('keeps showing the unextendable hearing deadline as due next while the decision clock card shows the new date', async () => {
    const handle = await makeTestDb()
    const db = handle.db
    try {
      const world = await setupBoardWorld(db)
      const applicationId = await submitBoardApplication(db, world, world.zbaTypeKey, '2027-03-02')
      const [decision] = await db
        .select()
        .from(clocks)
        .where(and(eq(clocks.applicationId, applicationId), eq(clocks.ruleKey, 'nh.zba.decision')))
      const adjusted = await adjustClock(
        db,
        world.staff,
        {
          clockId: decision?.id ?? '',
          kind: 'extension',
          days: 30,
          reason: 'Applicant asked for time',
          applicantConsent: true,
        },
        signal,
      )
      expect(adjusted.ok).toBe(true)
      const view = await getStaffApplicationView(
        db,
        world.staff,
        applicationId,
        new Date('2027-04-13T16:00:00Z'),
        signal,
      )
      const clocksShown = view?.clocks ?? []
      const byRule = new Map(clocksShown.map((c) => [c.ruleKey, c]))
      expect(byRule.get('nh.zba.decision')?.currentDue).toMatchObject({
        value: '2027-06-30',
        source: 'manual_override',
      })
      const next = dueNext(clocksShown)
      expect([next?.ruleKey, next?.currentDue.value, next?.daysRemaining]).toEqual([
        'nh.zba.hearing',
        '2027-04-16',
        3,
      ])
      expect(next?.allowedAdjustments).toEqual(['statutory_exception'])
      const expanded = [...expandedClocks(clocksShown)].map((c) => c.ruleKey)
      expect(expanded).toEqual(['nh.zba.hearing'])
    } finally {
      await handle.drop()
    }
  })
})
