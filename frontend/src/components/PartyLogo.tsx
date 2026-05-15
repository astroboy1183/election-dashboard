import { useState } from 'react'
import { partySymbol } from '../lib/partySymbols'

// Parties with sourced logo files in /public/party-logos/
// (See public/party-logos/ATTRIBUTIONS.md for source + license per file.)
const HAS_LOGO: Record<string, 'svg' | 'png' | 'jpg'> = {
  // Original set
  BJP:      'svg',
  INC:      'svg',
  DMK:      'svg',
  AIADMK:   'svg',
  AITC:     'svg',
  CPI:      'svg',
  IUML:     'svg',
  TVK:      'svg',
  AIUDF:    'svg',
  AINC:     'svg',
  VCK:      'png',
  AGP:      'png',
  RJD:      'png',
  // Added 2026-05 via Wikimedia Commons / Wikipedia (see ATTRIBUTIONS.md).
  'CPI(M)': 'svg',
  PMK:      'svg',
  AIFB:     'svg',
  DMDK:     'svg',
  AJP:      'svg',
  BPF:      'svg',
  KC:       'svg',
  'KC(M)':  'svg',
  NCPSP:    'png',
  RSP:      'png',
  MDMK:     'png',
  AMMK:     'png',
  BGPM:     'png',
  UPPL:     'png',
  'CPI(L)': 'png',
  INL:      'png',
  CMPKSC:   'png',
  'KC(J)':  'png',
  TP:       'png',
  AISF:     'jpg',
  RD:       'jpg',
}

interface Props {
  party: string
  size?: number
  className?: string
  /** Don't wrap in a circular badge — useful when you just want the raw image. */
  bare?: boolean
}

/**
 * Renders a party's election symbol wrapped in a light circular badge so it
 * remains visible on dark backgrounds (many official symbols are dark or use
 * transparent fills that get lost on the dashboard's dark theme).
 *
 * Falls back to a Unicode emoji symbol if the logo file is missing/fails to load.
 */
export default function PartyLogo({ party, size = 16, className, bare = false }: Props) {
  const ext = HAS_LOGO[party]
  const [errored, setErrored] = useState(false)

  const hasImage = ext && !errored
  const innerSize = Math.round(size * 0.78)  // image takes ~78% of badge
  const padding = Math.max(1, Math.round(size * 0.08))

  // Visual: white circular badge, subtle inner shadow + outer ring for depth
  const wrapperStyle: React.CSSProperties = bare
    ? {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
      }
    : {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        padding,
        borderRadius: '50%',
        background: '#ffffff',
        boxShadow:
          '0 0 0 1px rgba(255,255,255,0.15), 0 1px 2px rgba(0,0,0,0.4)',
        verticalAlign: 'middle',
        flexShrink: 0,
        overflow: 'hidden',
      }

  if (!hasImage) {
    // Emoji fallback — sized to fill the badge nicely
    return (
      <span style={wrapperStyle} className={className} title={party}>
        <span
          style={{
            fontSize: innerSize,
            lineHeight: 1,
            // Emojis are colorful naturally; no need to invert
          }}
        >
          {partySymbol(party)}
        </span>
      </span>
    )
  }

  return (
    <span style={wrapperStyle} className={className} title={`${party} election symbol`}>
      <img
        src={`/party-logos/${party}.${ext}`}
        alt={`${party} symbol`}
        width={innerSize}
        height={innerSize}
        style={{
          display: 'block',
          objectFit: 'contain',
          width: innerSize,
          height: innerSize,
        }}
        onError={() => setErrored(true)}
        loading="lazy"
      />
    </span>
  )
}
