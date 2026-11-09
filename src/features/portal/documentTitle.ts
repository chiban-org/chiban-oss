const SNAPSHOT_SEQUENCE = /snapshot (\d+)$/

export function portalDocumentTitle(doc: { docKind: string; title: string }): string {
  if (doc.docKind !== 'application_snapshot') return doc.title
  const sequence = Number(SNAPSHOT_SEQUENCE.exec(doc.title)?.[1] ?? '1')
  const plain = 'Your application as submitted'
  return sequence > 1 ? `${plain} (version ${sequence})` : plain
}
