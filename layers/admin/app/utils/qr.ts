import { encode } from 'uqr'

export interface QrPath {
  size: number
  d: string
}

/** The QR code of `text` as one SVG path of unit squares, one per dark module, on a `size` × `size` grid with a quiet border. */
export function qrPath(text: string): QrPath {
  const { data, size } = encode(text, { ecc: 'M', border: 2 })
  const parts: string[] = []
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x} ${y}h1v1h-1z`)
    })
  })
  return { size, d: parts.join('') }
}

/** A base32 secret in groups of four, easier to type into an authenticator app by hand. */
export function groupedSecret(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, '$1 ')
}
