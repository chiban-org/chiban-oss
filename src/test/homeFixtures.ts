import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import type { HomeContext, HomeSection, SectionKey } from '@/features/staffHome/homeTypes'
import { loadHomeSections } from '@/features/staffHome/loadHome'
import { startPageFor } from '@/features/staffHome/startPage'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { townToday } from '@/features/town/today'

const signal = new AbortController().signal

export async function homeContextFor(db: Db, actor: Actor, now: Date): Promise<HomeContext> {
  return {
    db,
    actor,
    viewer: await loadNavViewer(db, actor, signal),
    today: await townToday(db, now, signal),
    now,
    signal,
  }
}

export async function homeSectionsFor(db: Db, actor: Actor, now: Date): Promise<HomeSection[]> {
  const ctx = await homeContextFor(db, actor, now)
  const start = startPageFor(ctx.viewer)
  return start.kind === 'home' ? await loadHomeSections(ctx, start.roles) : []
}

export async function homeKeysFor(db: Db, actor: Actor, now: Date): Promise<SectionKey[]> {
  return (await homeSectionsFor(db, actor, now)).map((section) => section.key)
}

export function rowHref(section: HomeSection | null | undefined, label: string): string {
  return section?.rows.find((row) => row.label === label)?.href ?? ''
}

export function rowCount(section: HomeSection | null | undefined, label: string): number {
  return section?.rows.find((row) => row.label === label)?.count ?? -1
}

export function searchOf(href: string): Record<string, string[]> {
  const params = new URL(href, 'http://town.test').searchParams
  return Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.getAll(key)]))
}
