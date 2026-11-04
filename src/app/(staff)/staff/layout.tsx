import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { ServiceNotice } from '@/components/ServiceNotice'
import { StaffNav } from '@/components/staff/StaffNav'
import { STAFF_NAV_COOKIE } from '@/constants/cookies'
import { loadAccountSummary } from '@/features/auth/accountSummary'
import { navItemsFor } from '@/features/staffNav/navItems'
import { primaryRoleLabel } from '@/features/staffNav/roleLabels'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { currentServiceState } from '@/features/town/serviceStatus'
import { getTownSettings } from '@/features/town/settings'
import { createContext } from '@/server/trpc/context'

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const { actor, db, signal } = await createContext()
  if (actor?.kind !== 'staff') redirect('/staff/sign-in')
  const [service, viewer, town, account, jar] = await Promise.all([
    currentServiceState(db, new Date(), signal),
    loadNavViewer(db, actor, signal),
    getTownSettings(db, signal),
    loadAccountSummary(db, actor.userId, signal),
    cookies(),
  ])
  const navItems = navItemsFor(viewer)
  const rail = jar.get(STAFF_NAV_COOKIE)?.value === 'rail'
  return (
    <div className="staff-shell flex min-h-screen flex-col md:flex-row">
      <StaffNav
        items={navItems}
        town={town.ok ? town.value.name : null}
        user={{ name: account?.displayName ?? 'Signed in', role: primaryRoleLabel(actor.roles) }}
        initialRail={rail}
      />
      <div className="staff-content w-full max-w-[var(--content-max-width)] flex-1 px-4 py-6 md:px-10 md:py-10">
        <ServiceNotice mode={service.mode} exportUntil={service.exportUntil} />
        {children}
      </div>
    </div>
  )
}
