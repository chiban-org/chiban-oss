export function applicationSubtitle(typeLabel: string, projectTitle: string): string {
  return projectTitle.toLowerCase().startsWith(typeLabel.toLowerCase())
    ? projectTitle
    : `${typeLabel} for ${projectTitle}`
}
