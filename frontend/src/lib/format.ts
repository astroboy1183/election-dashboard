/**
 * Number formatting helpers. All numeric UI in the dashboard should route
 * through these so we stay consistent across pages.
 */

/** Indian-style comma grouping: 1234567 → "12,34,567". */
export const fmtIN = (n: number | null | undefined): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-IN')
}

/**
 * Compact Indian numbering: 123 → "123", 12,345 → "12.3K",
 * 1,23,456 → "1.23L", 1,23,45,678 → "1.23Cr".
 * Useful in tight spaces like table cells and chips.
 */
export const fmtCompact = (n: number | null | undefined, digits = 1): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs < 1_000) return `${sign}${abs}`
  if (abs < 1_00_000) return `${sign}${(abs / 1_000).toFixed(digits)}K`
  if (abs < 1_00_00_000) return `${sign}${(abs / 1_00_000).toFixed(digits)}L`
  return `${sign}${(abs / 1_00_00_000).toFixed(digits)}Cr`
}

/** Format a percent value (already in 0-100 space). */
export const fmtPct = (n: number | null | undefined, digits = 1): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${n.toFixed(digits)}%`
}

/**
 * Return a readable-on-dark variant of a hex color. Dark party colors (CPI(M)
 * `#CC0000`, RJD `#A0522D`, etc.) read fine as bar fills with light surrounds,
 * but become illegible as text on the dashboard's navy background. This blends
 * the input toward white until it crosses a minimum perceptual luminance.
 *
 *   readableOnDark('#cc0000')  // → ~'#ff4d4d' — same hue, readable
 *   readableOnDark('#22c55e')  // → unchanged, already bright enough
 */
export const readableOnDark = (hex: string, minLum = 0.45): string => {
  const m = hex.replace('#', '').match(/.{1,2}/g)
  if (!m || m.length < 3) return hex
  let [r, g, b] = m.slice(0, 3).map(h => parseInt(h, 16))
  // Relative luminance (sRGB perceived brightness, 0..1)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  if (lum >= minLum) return hex
  // Blend toward white by the deficit. The factor controls how aggressively we
  // brighten — picked so #CC0000 lands near #ff4d4d (readable, still red).
  const blend = Math.min(1, (minLum - lum) * 1.8)
  r = Math.round(r + (255 - r) * blend)
  g = Math.round(g + (255 - g) * blend)
  b = Math.round(b + (255 - b) * blend)
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
}
