export function parcelPublicHref(parcelId: string): string {
  return `/parcels/${parcelId}`
}

export function applicationPublicHref(app: { state: string; parcelId: string }): string | null {
  return app.state === 'draft' ? null : parcelPublicHref(app.parcelId)
}

export function casePublicHref(row: { isPublic: boolean; parcelId: string | null }): string | null {
  return row.isPublic && row.parcelId !== null ? parcelPublicHref(row.parcelId) : null
}
