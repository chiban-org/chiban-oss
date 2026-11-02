import { date, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core'
import { applications } from './projects'

export const relianceLinks = pgTable(
  'reliance_links',
  {
    varianceApplicationId: uuid('variance_application_id')
      .notNull()
      .references(() => applications.id),
    planningApplicationId: uuid('planning_application_id')
      .notNull()
      .references(() => applications.id),
    resolvedOn: date('resolved_on', { mode: 'string' }),
  },
  (t) => [primaryKey({ columns: [t.varianceApplicationId, t.planningApplicationId] })],
)
