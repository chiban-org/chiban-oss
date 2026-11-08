import { z } from 'zod'
import { TOWN_SECTION_KINDS } from '@/db/schema'
import { choice, optionalText, recordId, requiredText } from '@/features/input/schemas'

const REFERENCE_MAX = 200
const TITLE_MAX = 200

export const ADD_SECTION_FORM = z.object({
  provisionKind: choice('what kind of rule it is', TOWN_SECTION_KINDS),
  reference: requiredText('the section', { max: REFERENCE_MAX }),
  title: optionalText('a short title', { max: TITLE_MAX }),
})

export const EDIT_SECTION_FORM = ADD_SECTION_FORM.extend({ sectionId: recordId('a section') })

export const RETIRE_SECTION_FORM = z.object({ sectionId: recordId('a section') })
