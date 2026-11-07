import { env } from '@/config/env'
import { createCaseUploadIntentAction, finalizeCaseUploadAction } from '../uploadActions'
import type { CASE_UPLOAD_KINDS } from '../uploadForms'
import { CaseUploader } from './CaseUploader'

const ACTIONS = { createIntent: createCaseUploadIntentAction, finalize: finalizeCaseUploadAction }

export function CaseFileUpload({
  caseId,
  kind,
  label,
  capture,
}: {
  caseId: string
  kind: (typeof CASE_UPLOAD_KINDS)[number]
  label: string
  capture?: 'environment'
}) {
  return (
    <CaseUploader
      caseId={caseId}
      kinds={[[kind, label]]}
      maxBytes={env.MAX_UPLOAD_BYTES}
      actions={ACTIONS}
      {...(capture === undefined ? {} : { capture })}
    />
  )
}

export function CaseUploadAll({ caseId, kinds }: { caseId: string; kinds: [string, string][] }) {
  return (
    <CaseUploader caseId={caseId} kinds={kinds} maxBytes={env.MAX_UPLOAD_BYTES} actions={ACTIONS} />
  )
}
