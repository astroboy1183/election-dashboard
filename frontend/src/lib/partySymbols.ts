// Party symbol emoji/glyph approximations of real ECI symbols.
// Used as small visual identifiers next to party abbreviations.
// (For production logos, replace with SVG icons sourced separately.)
const SYMBOLS: Record<string, string> = {
  BJP:    '🪷',   // Lotus
  INC:    '✋',   // Hand
  DMK:    '☀️',  // Rising Sun
  AIADMK: '🍃',   // Two Leaves
  TVK:    '⚡',   // (TVK has its own symbol; using lightning placeholder)
  AITC:   '🌼',   // Twin flowers
  AIUDF:  '🔒',   // Lock
  AGP:    '🐘',   // Elephant
  UPPL:   '🥁',   // Drum (placeholder)
  BPF:    '📚',   // Book (placeholder)
  'CPI(M)':'🔨',  // Hammer-sickle-star
  CPI:    '🌾',   // Ears of corn and sickle
  IUML:   '🪜',   // Ladder
  KC:     '🍃',   // Two leaves variation
  RSP:    '🪣',   // Spade
  NCP:    '⏰',   // Clock
  NTK:    '🎤',   // Mic (placeholder)
  PMK:    '🥭',   // Mango (PMK symbol)
  MDMK:   '🔝',   // Top (placeholder)
  VCK:    '🏺',   // Pot
  DMDK:   '🥁',   // Drum
  AMMK:   '🎁',   // Gift
  BSP:    '🐘',   // Elephant
  AINC:   '🥥',   // Coconut (AINRC)
  BGPM:   '🌸',   // Flower (Bharatiya Gorkha Prajatantrik Morcha)
  AISF:   '🕊️',  // Dove (Indian Secular Front)
  NOTA:   '✖️',   // X
  OTHERS: '📊',
  I:      '👤',   // Independent
}

export function partySymbol(party: string): string {
  return SYMBOLS[party] ?? '🏛️'
}

export function partyLabel(party: string): string {
  return `${partySymbol(party)} ${party}`
}
