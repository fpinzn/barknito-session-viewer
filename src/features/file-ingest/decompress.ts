/**
 * Decompress a gzipped file using DecompressionStream.
 * Returns the decompressed text content.
 */
export async function decompressGz(file: File): Promise<string> {
  const ds = new DecompressionStream('gzip')
  const decompressedStream = file.stream().pipeThrough(ds)
  const reader = decompressedStream.getReader()
  const chunks: BlobPart[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value as BlobPart)
  }

  const blob = new Blob(chunks)
  return blob.text()
}
