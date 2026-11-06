import { describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import type { Fields } from './form'
import type { ActionHarness } from './harness'
import { type Outcome, settle } from './outcome'

export interface ForeignRecordCase<R> {
  invoke: (form: FormData) => Promise<R>
  actor: () => Actor | Promise<Actor>
  input: () => Fields | Promise<Fields>
  refusal: Outcome<R>
  ignoreWrites?: readonly string[]
}

export function describeForeignRecordCase<R>(
  h: ActionHarness,
  name: string,
  spec: ForeignRecordCase<R>,
): void {
  const ignored = new Set(spec.ignoreWrites ?? [])
  describe(name, () => {
    it("refuses a signed-in applicant acting on someone else's record", async () => {
      h.signIn(await spec.actor())
      const form = h.form(await spec.input())
      const { value, written } = await h.recordWrites(() => settle(spec.invoke(form)))
      expect({
        result: value,
        written: written.filter((t) => !ignored.has(t)),
        mailed: h.mail.sent.length,
        enqueued: h.jobs.length,
      }).toEqual({ result: spec.refusal, written: [], mailed: 0, enqueued: 0 })
    })
  })
}
