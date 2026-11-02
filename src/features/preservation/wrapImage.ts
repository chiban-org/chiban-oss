import { PDFDocument } from 'pdf-lib'

export async function wrapImageAsPdf(
  bytes: Uint8Array,
  contentType: 'image/jpeg' | 'image/png',
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const image = contentType === 'image/jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes)
  const page = doc.addPage([image.width, image.height])
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  return await doc.save()
}
