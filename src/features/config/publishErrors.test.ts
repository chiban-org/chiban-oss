import { NH_STARTERS } from '@packs/nh/starters'
import { describe, expect, it } from 'vitest'
import { fieldErrorsFor } from '@/features/config/publishErrors'
import { validateBody } from '@/features/config/store'

describe('fieldErrorsFor', () => {
  it('a workflow step with no name asks to name every step, once', () => {
    const type = NH_STARTERS.find((s) => s.applicationType.workflow.substeps.length > 0)
    if (type === undefined) throw new Error('no starter with steps')
    const body = {
      ...type.applicationType,
      workflow: {
        ...type.applicationType.workflow,
        substeps: [
          ...type.applicationType.workflow.substeps,
          { state: 'under_review', key: '', label: '' },
        ],
      },
    }
    const checked = validateBody('application_type', body)
    const issues = checked.ok ? [] : checked.issues
    expect(fieldErrorsFor({ invalid: issues }).workflow).toBe('Name every step.')
  })

  it('puts missing bindings next to the bindings field and names them', () => {
    const e = fieldErrorsFor({ missingBindings: ['nh.bp.decision'] })
    expect(e.bindings).toContain('nh.bp.decision')
  })

  it('maps each publish error to the field that caused it', () => {
    expect(fieldErrorsFor({ missingClassification: true }).classification).toBeDefined()
    expect(fieldErrorsFor({ unknownBindings: ['x'] }).bindings).toContain('x')
    expect(fieldErrorsFor({ missingReferences: ['form:bp-form'] }).references).toContain(
      'form:bp-form',
    )
    expect(fieldErrorsFor({ unknownMergeFields: ['nope'] }).body).toContain('nope')
    expect(fieldErrorsFor({ unknownFieldRefs: ['ghost'] }).lines).toContain('ghost')
  })

  it('maps policy violations to the value or adoption record', () => {
    expect(
      fieldErrorsFor({
        policyViolations: [{ ruleKey: 'town.bp.validity', error: 'adoption_record_missing' }],
      }).adoption,
    ).toBeDefined()
    expect(
      fieldErrorsFor({
        policyViolations: [
          { ruleKey: 'nh.code.technical_requirements', error: 'locally_prohibited' },
        ],
      }).value,
    ).toContain('cannot')
  })

  it('maps schema issues to the first segment of their path, and permission errors to the form', () => {
    const e = fieldErrorsFor({
      invalid: [{ path: 'fields.1.options', message: 'options required' }],
    })
    expect(e.fields).toContain('options required')
    expect(fieldErrorsFor('forbidden')._form).toBeDefined()
    expect(fieldErrorsFor('not_draft')._form).toBeDefined()
  })
})
