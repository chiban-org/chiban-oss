import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { type boardPackets, documentVersions, files } from '@/db/schema'
import { packetItemRows, readableVersion } from '@/features/boards/packetContents'
import { townDateOf } from '@/features/boards/packetView'
import type { StoredObject } from '@/features/storage/delivery'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type PacketDocumentError = 'not_found' | { withdrawnOn: CivilDate }

export async function packetDocument(
  db: Db,
  packet: typeof boardPackets.$inferSelect,
  versionId: string,
  signal: AbortSignal,
): Promise<Result<StoredObject, PacketDocumentError>> {
  const found = readableVersion(await packetItemRows(db, packet.id), packet, versionId)
  if (found === null) return err('not_found')
  if (found.item.withdrawn !== null) {
    return err({ withdrawnOn: await townDateOf(db, found.item.withdrawn.at, signal) })
  }
  const storedVersion = found.row.versionId
  if (storedVersion === null) return err('not_found')
  const [row] = await db
    .select({
      storageKey: files.storageKey,
      filename: documentVersions.filename,
      contentType: documentVersions.contentType,
    })
    .from(documentVersions)
    .innerJoin(files, eq(files.sha256, documentVersions.fileSha256))
    .where(eq(documentVersions.id, storedVersion))
  return row === undefined ? err('not_found') : ok(row)
}
