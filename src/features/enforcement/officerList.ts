import { and, desc, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { enforcementDesignations, roleCapabilities, userRoles, users } from '@/db/schema'

export async function listDesignations(db: DbOrTx) {
  return await db
    .select({
      id: enforcementDesignations.id,
      name: users.displayName,
      title: enforcementDesignations.title,
      authority: enforcementDesignations.adoptingAuthority,
      adoptedOn: enforcementDesignations.adoptedOn,
      endedOn: enforcementDesignations.endedOn,
    })
    .from(enforcementDesignations)
    .innerJoin(users, eq(users.id, enforcementDesignations.userId))
    .orderBy(desc(enforcementDesignations.adoptedOn))
}

export async function designationCandidates(db: DbOrTx) {
  return await db
    .selectDistinct({ id: users.id, name: users.displayName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(
      roleCapabilities,
      and(
        eq(roleCapabilities.role, userRoles.role),
        eq(roleCapabilities.capability, 'enforcement.issue_order'),
      ),
    )
    .where(eq(users.isActive, true))
    .orderBy(users.displayName)
}
