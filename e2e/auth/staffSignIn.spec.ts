import { accountFor, expect, type StaffRoleKey, signInWithPassword, test } from '../fixtures/test'

interface Landing {
  path: string
  heading: string
  sections: string[]
}

const LANDINGS: [StaffRoleKey, Landing][] = [
  [
    'staff',
    {
      path: '/staff',
      heading: 'Today',
      sections: [
        'Applications',
        'Board packets',
        'Enforcement',
        'Inspections',
        'Payments',
        'Records',
      ],
    },
  ],
  ['inspector', { path: '/staff', heading: 'Today', sections: ['Enforcement', 'Inspections'] }],
  ['finance', { path: '/staff', heading: 'Today', sections: ['Payments'] }],
  ['records', { path: '/staff', heading: 'Today', sections: ['Records'] }],
  [
    'admin',
    {
      path: '/staff',
      heading: 'Today',
      sections: ['Board packets', 'Payments', 'Records', 'System'],
    },
  ],
  ['reviewer', { path: '/staff/reviews', heading: 'Your reviews', sections: [] }],
  ['board', { path: '/board', heading: 'Your board', sections: [] }],
]

test.describe('staff sign-in through the real form', () => {
  for (const [role, landing] of LANDINGS) {
    test(`signs ${role} in and lands on ${landing.path} with heading ${landing.heading}`, async ({
      page,
    }) => {
      await signInWithPassword(page, accountFor(role).email)
      await expect(page).toHaveURL(landing.path)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(landing.heading)
      if (landing.sections.length === 0) return
      const sections = page.getByRole('main').getByRole('heading', { level: 2 })
      await expect(sections).toHaveCount(landing.sections.length)
      expect((await sections.allTextContents()).sort()).toEqual(landing.sections)
    })
  }
})
