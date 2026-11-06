import type { LocalCodeAmendmentBody } from '@/features/config/kinds'
import {
  isStartingChoiceLabel,
  UNTITLED_QUESTION,
  UNTITLED_SECTION,
} from '@/features/forms/formEdits'
import { type FormBody, isChoiceType } from '@/features/forms/formSchema'

export const PLACEHOLDER_CODE_SECTION = 'Section'
export const PLACEHOLDER_AUTHORITY = 'Governing body'
export const PLACEHOLDER_ADOPTED_ON = '2099-12-31'

interface PlaceholderIssue {
  path: string
  message: string
}

export function checkFormPlaceholders(body: FormBody): PlaceholderIssue[] {
  const issues: PlaceholderIssue[] = []
  body.fields.forEach((field, i) => {
    const row = `${field.type === 'section' ? 'Section' : 'Question'} ${i + 1}`
    if (field.label === UNTITLED_QUESTION || field.label === UNTITLED_SECTION) {
      issues.push({
        path: `fields.${i}.label`,
        message: `${row}: Replace the placeholder wording.`,
      })
    }
    if (isChoiceType(field.type)) {
      const options = field.options ?? []
      if (options.some((o) => isStartingChoiceLabel(o.label))) {
        issues.push({
          path: `fields.${i}.options`,
          message: `${row}: Replace the placeholder choices with the real ones.`,
        })
      }
    }
  })
  return issues
}

export function checkAmendmentPlaceholders(body: LocalCodeAmendmentBody): PlaceholderIssue[] {
  const issues: PlaceholderIssue[] = []
  if (body.codeSection === PLACEHOLDER_CODE_SECTION) {
    issues.push({ path: 'codeSection', message: 'Enter the code section this change amends.' })
  }
  if (body.adoptingAuthority === PLACEHOLDER_AUTHORITY) {
    issues.push({ path: 'adoptingAuthority', message: 'Enter who adopted this change.' })
  }
  if (body.adoptedOn === PLACEHOLDER_ADOPTED_ON) {
    issues.push({ path: 'adoptedOn', message: 'Enter the date it was adopted.' })
  }
  return issues
}
