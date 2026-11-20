import { recordsRequest } from '@/features/packs/vocabulary'

export function requestsTitle(): string {
  return `${recordsRequest()}s`
}

export function requestsNoPermissionAction(): string {
  return `see ${requestsTitle()}`
}

export function receivedThanks(): string {
  return `Thank you. The town has your ${recordsRequest()}.`
}

export function logRequestTitle(): string {
  return `Log a ${recordsRequest()}`
}

export function redactPurposeOptions(): [string, string][] {
  return [
    ['public', 'The public website'],
    ['rtk_release', `A ${recordsRequest()}`],
  ]
}

export function releaseHintWithoutRequest(): string {
  return `A copy for a ${recordsRequest()} is approved in the release step on the request page.`
}

export function releaseHintForRequest(): string {
  return `A copy for this ${recordsRequest()} is approved in the release step on the`
}
