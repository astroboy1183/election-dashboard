/**
 * Tiny client-side intent detector for navigation phrases like
 *   "take me to west bengal page", "go to kerala swing", "open tamil nadu map".
 *
 * Catches these BEFORE we round-trip to Claude — there's no reason to spend
 * a second + an API call on a UI command we can resolve locally.
 *
 * Returns the matched route + a human-readable description, or null if the
 * query doesn't look like a navigation request (in which case the caller
 * should fall through to the LLM Q&A path).
 */

const NAV_VERBS = /^(take me to|go to|navigate to|open|view|show me|switch to|jump to|let'?s see|see)\s+/i

// Page name → URL slug. Match against the trailing words of the cleaned query.
const PAGE_SYNONYMS: { keywords: string[]; slug: string }[] = [
  { keywords: ['overview', 'overview page', 'home', 'main page', 'dashboard'],         slug: 'overview' },
  { keywords: ['constituency', 'constituencies', 'constituencies page', 'ac', 'acs'],  slug: 'constituencies' },
  { keywords: ['full results', 'all results', 'results', 'candidates'],                slug: 'results' },
  { keywords: ['party', 'parties', 'party analysis', 'party slate'],                   slug: 'parties' },
  { keywords: ['swing', 'trends', 'swing and trends', 'swing & trends', 'swings'],     slug: 'swing' },
  { keywords: ['geography', 'district', 'districts', 'ls', 'lok sabha', 'district and ls', 'district & ls'], slug: 'geography' },
  { keywords: ['map', 'interactive map'],                                              slug: 'map' },
  { keywords: ['assets', 'criminality', 'criminal', 'criminality and assets', 'criminality & assets'], slug: 'assets' },
]

export interface NavMatch {
  to: string                 // e.g. "/west-bengal/map"
  description: string        // e.g. "West Bengal · Interactive Map"
}

export interface State {
  slug: string
  name: string
}

/** Normalise for matching: lowercase, collapse whitespace, drop trailing punctuation. */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[.?!,]+$/g, '').trim()

export function matchNavIntent(query: string, states: State[], currentState?: string | null): NavMatch | null {
  if (!query || !states?.length) return null
  let q = norm(query)

  // Strip the optional nav verb. If there's no verb, only proceed when the
  // query is literally just a state/page name (so "kerala" → navigate, but
  // "what is the winner in kerala" → fall through to LLM).
  const hadVerb = NAV_VERBS.test(q)
  if (hadVerb) q = q.replace(NAV_VERBS, '')
  q = q.replace(/\s+(page|view|section|tab)$/i, '').trim()

  // Try to identify the state. Longest match wins (e.g. "west bengal" beats "kerala" if both present).
  const stateMatch = findState(q, states)
  if (!stateMatch) return null

  // Remove the matched state phrase from the query; whatever's left should be a page hint.
  const leftover = q.replace(stateMatch.matchedPhrase, '').replace(/\s+/g, ' ').trim()

  // Default to overview when no page hint is given.
  let pageSlug = 'overview'
  let pageLabel = 'Overview'
  if (leftover) {
    const page = findPage(leftover)
    if (page) {
      pageSlug = page.slug
      pageLabel = labelForSlug(page.slug)
    } else if (!hadVerb) {
      // Without a nav verb AND with leftover words that don't match a page,
      // it's almost certainly a real question (e.g. "what won kerala").
      return null
    }
  }

  return {
    to: `/${stateMatch.slug}/${pageSlug}`,
    description: `${stateMatch.name} · ${pageLabel}`,
  }

  // ── helpers (closures over `query` aren't needed) ──
  function findState(text: string, list: State[]) {
    // Try longest names first so "west bengal" wins over "bengal" alone.
    const candidates = list
      .map(s => ({ ...s, _phrases: phraseVariants(s) }))
      .flatMap(s => s._phrases.map(p => ({ slug: s.slug, name: s.name, phrase: p })))
      .sort((a, b) => b.phrase.length - a.phrase.length)
    for (const c of candidates) {
      // Match as a whole-word substring (avoid "ke" matching inside another word).
      const re = new RegExp(`(^|\\s)${escapeRe(c.phrase)}(\\s|$)`)
      if (re.test(text)) return { slug: c.slug, name: c.name, matchedPhrase: c.phrase }
    }
    // If a current-state context exists, allow page-only commands ("open swing")
    // to inherit it. Only applies inside a state's pages.
    if (currentState) {
      const st = list.find(s => s.slug === currentState)
      if (st) {
        const page = findPage(text)
        if (page) return { slug: st.slug, name: st.name, matchedPhrase: '' }
      }
    }
    return null
  }

  function findPage(text: string) {
    const t = norm(text)
    const candidates: { kw: string; slug: string }[] = []
    for (const syn of PAGE_SYNONYMS) {
      for (const kw of syn.keywords) candidates.push({ kw, slug: syn.slug })
    }
    candidates.sort((a, b) => b.kw.length - a.kw.length)  // prefer longest match
    for (const c of candidates) {
      const re = new RegExp(`(^|\\s)${escapeRe(c.kw)}(\\s|$)`)
      if (re.test(t)) return { slug: c.slug }
    }
    return null
  }
}

function phraseVariants(s: State): string[] {
  // Generate spelling variants users might type: slug-as-is, hyphens→spaces,
  // name-as-is, name-lowercased.
  const variants = new Set<string>()
  variants.add(s.slug.toLowerCase())
  variants.add(s.slug.replace(/-/g, ' ').toLowerCase())
  variants.add(s.name.toLowerCase())
  return Array.from(variants)
}

function labelForSlug(slug: string): string {
  switch (slug) {
    case 'overview':        return 'Overview'
    case 'constituencies':  return 'Constituencies'
    case 'results':         return 'Full Results'
    case 'parties':         return 'Party Analysis'
    case 'swing':           return 'Swing & Trends'
    case 'geography':       return 'District & LS View'
    case 'map':             return 'Interactive Map'
    case 'assets':          return 'Criminality & Assets'
    default:                return slug
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
