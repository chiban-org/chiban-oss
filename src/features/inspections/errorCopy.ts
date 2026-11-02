export const INSPECTION_ERROR_COPY: Record<string, string> = {
  not_found: 'That record was not found.',
  forbidden: 'You do not have permission to do this.',
  not_issued: 'The permit has not been issued, so it cannot be inspected yet.',
  permit_suspended: 'Inspections are paused while this permit is under appeal.',
  not_a_pinned_checklist: 'That inspection is not part of this permit.',
  portal_requests_disabled: 'Online inspection requests are turned off. Call the land use office.',
  reinspection_not_failed: 'Only a failed inspection can be inspected again.',
  reinspection_open: 'A reinspection is already requested for that failure.',
  reinspection_exists: 'That failure already has a reinspection.',
  reinspection_superseded: 'A newer failed inspection of this type needs the reinspection instead.',
  inspection_already_open: 'That inspection is already requested or scheduled.',
  inspection_already_passed: 'That inspection has already passed.',
  preferred_date_unavailable:
    'The town does not inspect on that day. Choose one of the listed days.',
  not_an_inspector: 'Choose an inspector.',
  not_schedulable: 'This inspection can no longer be scheduled.',
  date_unavailable: 'The town does not inspect on that day. Add a reason to book it anyway.',
  slot_not_on_grid: 'That start time is not one of the town slots. Add a reason to book it anyway.',
  slot_taken: 'That time was just taken. Pick another.',
  inspector_full: 'That inspector has no room left on that day.',
  stale_version: 'This inspection changed since you opened it. Reload the page and try again.',
  not_cancellable: 'This inspection can no longer be cancelled.',
  not_a_co_type: 'This permit type does not take a certificate of occupancy.',
  final_not_passed: 'The final inspection has not passed.',
  future_date: 'The issue date cannot be in the future.',
}

export function inspectionErrorCopy(code: string): string {
  return INSPECTION_ERROR_COPY[code] ?? 'Something went wrong. Try again.'
}
