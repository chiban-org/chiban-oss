import { describe, expect, it } from 'vitest'
import { CHECK_ONLY_FIELD } from '@/constants/formCheck'
import type { Role } from '@/constants/roles'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { type FieldSpec, type InvalidVariant, invalidVariants } from './fields'
import type { Fields } from './form'
import type { ActionHarness } from './harness'
import { type Outcome, settle } from './outcome'
import { type CapabilityRule, rolesLacking } from './roles'
import { CSRF_TOKEN } from './state'

export type Expected<R> = Outcome<R>

export interface Refusals<R> {
  csrf: Expected<R>
  signedOut: Expected<R>
  forbidden: Expected<R> | ((role: Role) => Expected<R>)
  invalid: Expected<R> | ((variant: InvalidVariant) => Expected<R>)
  checkOnly: Expected<R>
}

export interface AcceptedContext<I extends Fields> {
  db: Db
  input: I
  written: string[]
}

interface CaseTable<R, I extends Fields> {
  invoke: (form: FormData) => Promise<R>
  actor: () => Actor | Promise<Actor>
  input: () => I | Promise<I>
  fields: Readonly<Record<string, FieldSpec>>
  refusals: Refusals<R>
  accepted: (result: Outcome<R>, context: AcceptedContext<I>) => void | Promise<void>
  ignoreWrites?: readonly string[]
}

export type RoleRule =
  | { capability: CapabilityRule; refusedRoles?: never }
  | { refusedRoles: readonly Role[]; capability?: never }

export type ActionCases<R, I extends Fields = Fields> = CaseTable<R, I> & RoleRule

export const MISMATCHED_CSRF_TOKEN = 'not-the-cookie-token'

export const FOREIGN_ORIGIN = 'https://elsewhere.example'

function pick<R, A>(expected: Expected<R> | ((arg: A) => Expected<R>), arg: A): Expected<R> {
  return typeof expected === 'function' ? (expected as (arg: A) => Expected<R>)(arg) : expected
}

export function describeActionCases<R, I extends Fields>(
  h: ActionHarness,
  name: string,
  cases: ActionCases<R, I>,
): void {
  const ignored = new Set(cases.ignoreWrites ?? [])
  const refusedRoles =
    cases.capability === undefined ? cases.refusedRoles : rolesLacking(cases.capability)

  async function expectRefused(
    actor: Actor | null,
    input: Fields,
    csrfToken: string | null,
    expected: Expected<R>,
    mark: (form: FormData) => void = () => undefined,
  ): Promise<void> {
    if (actor === null) h.signOut()
    else h.signIn(actor)
    const form = h.form(input, csrfToken)
    mark(form)
    const { value, written } = await h.recordWrites(() => settle(cases.invoke(form)))
    expect({
      result: value,
      written: written.filter((t) => !ignored.has(t)),
      mailed: h.mail.sent.length,
      enqueued: h.jobs.length,
    }).toEqual({ result: expected, written: [], mailed: 0, enqueued: 0 })
  }

  describe(name, () => {
    it('accepts valid input', async () => {
      h.signIn(await cases.actor())
      const input = await cases.input()
      const form = h.form(input)
      const { value, written } = await h.recordWrites(() => settle(cases.invoke(form)))
      await cases.accepted(value, { db: h.db, input, written })
    })

    for (const variant of invalidVariants(cases.fields)) {
      it(`refuses ${variant.title}`, async () => {
        const input = variant.apply(await cases.input())
        await expectRefused(
          await cases.actor(),
          input,
          CSRF_TOKEN,
          pick(cases.refusals.invalid, variant),
        )
      })
    }

    it('refuses a signed-out caller', async () => {
      await expectRefused(null, await cases.input(), CSRF_TOKEN, cases.refusals.signedOut)
    })

    it('refuses a missing csrf token', async () => {
      await expectRefused(await cases.actor(), await cases.input(), null, cases.refusals.csrf)
    })

    it('refuses a mismatched csrf token', async () => {
      const input = await cases.input()
      await expectRefused(await cases.actor(), input, MISMATCHED_CSRF_TOKEN, cases.refusals.csrf)
    })

    it('refuses a foreign origin', async () => {
      h.setHeader('origin', FOREIGN_ORIGIN)
      await expectRefused(await cases.actor(), await cases.input(), CSRF_TOKEN, cases.refusals.csrf)
    })

    it('refuses a cross-site request', async () => {
      h.setHeader('sec-fetch-site', 'cross-site')
      await expectRefused(await cases.actor(), await cases.input(), CSRF_TOKEN, cases.refusals.csrf)
    })

    it('acts on nothing for a check-only request', async () => {
      const input = await cases.input()
      await expectRefused(await cases.actor(), input, CSRF_TOKEN, cases.refusals.checkOnly, (f) =>
        f.set(CHECK_ONLY_FIELD, '1'),
      )
    })

    for (const role of refusedRoles) {
      it(`refuses the ${role} role`, async () => {
        const actor = await h.actorFor(role)
        await expectRefused(
          actor,
          await cases.input(),
          CSRF_TOKEN,
          pick(cases.refusals.forbidden, role),
        )
      })
    }
  })
}
