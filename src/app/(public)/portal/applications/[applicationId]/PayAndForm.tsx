'use client'

import type { ReactNode } from 'react'
import { ApplicationForm, type ApplicationFormActions } from '@/components/portal/ApplicationForm'
import { PayButton } from '@/components/portal/PayButton'
import type { DocumentRequirement } from '@/features/applications/liveChecklist'
import type { FormBody } from '@/features/forms/formSchema'
import { saveDraftAction, submitApplicationAction } from './actions'
import { startPaymentAction } from './paymentActions'

const FORM_ACTIONS: ApplicationFormActions = {
  save: saveDraftAction,
  submit: submitApplicationAction,
}

export function PortalApplicationForm(props: {
  applicationId: string
  form: FormBody
  initialValues: Record<string, unknown>
  attestationText: string
  attestationSha256: string
  requirements: readonly DocumentRequirement[]
  documents: ReactNode
}) {
  return <ApplicationForm {...props} actions={FORM_ACTIONS} />
}

export function PortalPayButton(props: { applicationId: string; dueCents: number }) {
  return <PayButton {...props} start={startPaymentAction} />
}
