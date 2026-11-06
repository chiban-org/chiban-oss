import { describe, expect, it } from 'vitest'
import { CHECK_ONLY_FIELD } from '@/constants/formCheck'
import type { Db } from '@/db/client'
import { FOREIGN_ORIGIN, MISMATCHED_CSRF_TOKEN, type Refusals } from './cases'
import type { FieldSpec } from './fields'
import { type InvalidVariant, invalidVariants } from './fields'
import type { Fields } from './form'
import type { ActionHarness } from './harness'
import { type Outcome, settle } from './outcome'
import { CSRF_TOKEN } from './state'

type InvalidFor<R> = (variant: InvalidVariant) => Outcome<R>

export interface AnonymousCases<R, I extends Fields> {
  invoke: (form: FormData) => Promise<R>
  input: () => I | Promise<I>
  fields: Readonly<Record<string, FieldSpec>>
  refusals: Pick<Refusals<R>, 'csrf' | 'invalid' | 'checkOnly'>
  accepted: (
    result: Outcome<R>,
    context: { db: Db; input: I; written: string[] },
  ) => void | Promise<void>
  ignoreWrites?: readonly string[]
}

export function describeAnonymousCases<R, I extends Fields>(
  h: ActionHarness,
  name: string,
  cases: AnonymousCases<R, I>,
): void {
  const ignored = new Set(cases.ignoreWrites ?? [])

  async function expectRefused(
    input: Fields,
    csrfToken: string | null,
    expected: Outcome<R>,
    mark: (form: FormData) => void = () => undefined,
  ): Promise<void> {
    h.signOut()
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
    it('accepts valid input from a signed-out caller', async () => {
      h.signOut()
      const input = await cases.input()
      const form = h.form(input)
      const { value, written } = await h.recordWrites(() => settle(cases.invoke(form)))
      await cases.accepted(value, { db: h.db, input, written })
    })

    for (const variant of invalidVariants(cases.fields)) {
      it(`refuses ${variant.title}`, async () => {
        const invalid = cases.refusals.invalid
        const expected =
          typeof invalid === 'function' ? (invalid as InvalidFor<R>)(variant) : invalid
        await expectRefused(variant.apply(await cases.input()), CSRF_TOKEN, expected)
      })
    }

    it('refuses a missing csrf token', async () => {
      await expectRefused(await cases.input(), null, cases.refusals.csrf)
    })

    it('refuses a mismatched csrf token', async () => {
      await expectRefused(await cases.input(), MISMATCHED_CSRF_TOKEN, cases.refusals.csrf)
    })

    it('refuses a foreign origin', async () => {
      h.setHeader('origin', FOREIGN_ORIGIN)
      await expectRefused(await cases.input(), CSRF_TOKEN, cases.refusals.csrf)
    })

    it('refuses a cross-site request', async () => {
      h.setHeader('sec-fetch-site', 'cross-site')
      await expectRefused(await cases.input(), CSRF_TOKEN, cases.refusals.csrf)
    })

    it('acts on nothing for a check-only request', async () => {
      await expectRefused(await cases.input(), CSRF_TOKEN, cases.refusals.checkOnly, (f) =>
        f.set(CHECK_ONLY_FIELD, '1'),
      )
    })
  })
}
