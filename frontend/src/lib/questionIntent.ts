/**
 * Client-side question-intent matcher for the Quick Answers Ask box.
 *
 * The backend already exposes `/api/insights/quick-answers/{state}` with ~10
 * curated answers per state (closest contest, biggest landslide, richest MLA,
 * youngest winner, etc). When the user types a question that maps to one of
 * those categories, we can answer instantly without spending a Claude call.
 *
 * Usage flow:
 *   1. Caller passes question text + states + current state slug.
 *   2. We pattern-match the question against known categories AND identify
 *      which state the question is asking about.
 *   3. Return { matchedCategory, stateSlug } so the caller can fetch the
 *      curated answers for that state and surface the matching one.
 */

/**
 * The label used by the backend for each canonical answer. Keep these in
 * sync with the `label:` strings in `backend/routes/insights.py:_quick_answers_for`.
 *
 * Some labels include the state name (e.g. "Closest contest in Tamil Nadu");
 * the matcher uses startswith / contains so a per-state label still resolves.
 */
export type QuickAnswerCategory =
  | 'closest_contest'
  | 'biggest_landslide'
  | 'highest_vote_total'
  | 'largest_party'
  | 'best_strike_rate'
  | 'most_efficient_party'
  | 'biggest_gainer'
  | 'biggest_loser'
  | 'who_forms_government'
  | 'wealthiest_mla'
  | 'most_criminal_mla'
  | 'youngest_mla'
  | 'oldest_mla'

/** Keyword patterns that map a typed question to a curated-answer category.
 *  Each entry is a list of substring patterns matched case-insensitively
 *  against the full question text. Order doesn't matter; first match wins. */
const CATEGORY_PATTERNS: { cat: QuickAnswerCategory; patterns: RegExp[] }[] = [
  {
    cat: 'closest_contest',
    patterns: [
      /closest\s+(contest|race|seat|margin)/i,
      /tight(est)?\s+(contest|race|seat|margin)/i,
      /smallest\s+margin/i,
      /narrow(est)?\s+(win|margin|contest)/i,
      /one[- ]vote/i,
    ],
  },
  {
    cat: 'biggest_landslide',
    patterns: [
      /biggest\s+(landslide|margin|win)/i,
      /largest\s+(margin|win|victory)/i,
      /widest\s+margin/i,
      /sweep(est)?/i,
    ],
  },
  {
    cat: 'highest_vote_total',
    patterns: [
      /most\s+votes/i,
      /highest\s+(vote|votes|individual vote)/i,
      /top\s+vote[- ]getter/i,
      /who\s+got\s+(the\s+)?most\s+votes/i,
    ],
  },
  {
    cat: 'largest_party',
    patterns: [
      /single\s+largest\s+party/i,
      /biggest\s+party/i,
      /largest\s+party/i,
      /which\s+party\s+won\s+(the\s+)?most/i,
    ],
  },
  {
    cat: 'best_strike_rate',
    patterns: [
      /best\s+strike\s+rate/i,
      /highest\s+strike\s+rate/i,
      /most\s+(efficient|effective)\s+party/i,  // we'll prefer this over efficient_party below
    ],
  },
  {
    cat: 'most_efficient_party',
    patterns: [
      /vote\s+efficien(t|cy)/i,
      /fewest\s+votes\s+per\s+seat/i,
      /lowest\s+votes\s+per\s+seat/i,
    ],
  },
  {
    cat: 'biggest_gainer',
    patterns: [
      /biggest\s+(seat\s+)?gainer/i,
      /most\s+seats?\s+gained/i,
      /biggest\s+(swing|gain)/i,
      /largest\s+gain/i,
    ],
  },
  {
    cat: 'biggest_loser',
    patterns: [
      /biggest\s+(seat\s+)?loser/i,
      /most\s+seats?\s+lost/i,
      /biggest\s+decline/i,
      /largest\s+loss/i,
      /worst\s+(swing|decline)/i,
    ],
  },
  {
    cat: 'who_forms_government',
    patterns: [
      /who\s+(won|formed?|forms)\s+(the\s+)?(government|govt|majority)/i,
      /who\s+won\b/i,                          // plain "who won kerala"
      /which\s+(alliance|party)\s+(won|formed|will\s+form)/i,
      /(is|are)\s+(it\s+)?(a\s+)?hung\s+(assembly|legislature)/i,
      /\bhung\s+(verdict|assembly|legislature)/i,
      /majority\s+(winner|leader)/i,
      /who\s+is\s+the\s+(cm|chief\s+minister)/i,
      /winning\s+alliance/i,
    ],
  },
  {
    cat: 'wealthiest_mla',
    patterns: [
      /wealthiest|richest/i,
      /most\s+(assets|wealth|money)/i,
      /highest\s+assets/i,
    ],
  },
  {
    cat: 'most_criminal_mla',
    patterns: [
      /most\s+criminal\s+(cases|case)/i,
      /worst\s+criminal\s+record/i,
      /highest\s+(number\s+of\s+)?(criminal\s+)?cases/i,
      /most\s+cases/i,
    ],
  },
  {
    cat: 'youngest_mla',
    patterns: [
      /youngest\s+(mla|winner|elected)/i,
      /youngest/i,
    ],
  },
  {
    cat: 'oldest_mla',
    patterns: [
      /oldest\s+(mla|winner|elected)/i,
      /oldest/i,
      /eldest/i,
    ],
  },
]

/** Map a category to the prefix the backend uses in the label. Allows quick
 *  lookup of the curated answer once we know the category + state. */
export const CATEGORY_LABEL_PREFIX: Record<QuickAnswerCategory, string> = {
  closest_contest: 'Closest contest in',
  biggest_landslide: 'Biggest landslide in',
  highest_vote_total: 'Highest individual vote total in',
  largest_party: 'Single largest party in',
  best_strike_rate: 'Best strike rate in',
  most_efficient_party: 'Most vote-efficient party in',
  biggest_gainer: 'Biggest seat gainer vs 2021 in',
  biggest_loser: 'Biggest seat loser vs 2021 in',
  who_forms_government: 'Who forms government in',
  wealthiest_mla: 'Wealthiest winning MLA in',
  most_criminal_mla: 'Most criminal cases (winning MLA) in',
  youngest_mla: 'Youngest winning MLA in',
  oldest_mla: 'Oldest winning MLA in',
}

export interface QuestionIntent {
  category: QuickAnswerCategory
  stateSlug: string             // resolved state slug to query for the answer
  stateName: string             // display name of resolved state
  matchedKeyword?: string       // for debugging
}

/** Resolve which state the user mentioned in the question. Falls back to
 *  `defaultState`. Looks for full state name OR slug-equivalent. */
function detectStateInQuestion(
  question: string,
  states: { slug: string; name: string }[],
  defaultState: string | null | undefined,
): { slug: string; name: string } | null {
  const q = question.toLowerCase()
  // Try full state name first (longer match wins)
  const sortedByLen = [...states].sort((a, b) => b.name.length - a.name.length)
  for (const s of sortedByLen) {
    if (q.includes(s.name.toLowerCase())) return { slug: s.slug, name: s.name }
    // Also check slug variants ("west-bengal" → "west bengal", "wb")
    const slugWords = s.slug.replace(/-/g, ' ')
    if (q.includes(slugWords)) return { slug: s.slug, name: s.name }
  }
  // Common short forms
  const SHORT_FORMS: Record<string, string> = {
    'tn': 'tamil-nadu', 'tamil nadu': 'tamil-nadu',
    'kl': 'kerala',
    'wb': 'west-bengal', 'bengal': 'west-bengal',
    'as': 'assam',
    'py': 'puducherry', 'pondi': 'puducherry', 'pondicherry': 'puducherry',
  }
  for (const [key, slug] of Object.entries(SHORT_FORMS)) {
    // word-boundary match for short codes so "tn" doesn't match "tnpsc"
    const re = new RegExp(`\\b${key}\\b`, 'i')
    if (re.test(q)) {
      const state = states.find(s => s.slug === slug)
      if (state) return { slug: state.slug, name: state.name }
    }
  }
  // Fallback to defaultState
  if (defaultState) {
    const state = states.find(s => s.slug === defaultState)
    if (state) return { slug: state.slug, name: state.name }
  }
  return null
}

/** Main entry point. Returns null if the question doesn't match any known
 *  curated-answer pattern — caller should then fall through to the LLM. */
export function matchQuestionIntent(
  question: string,
  states: { slug: string; name: string }[],
  defaultState: string | null | undefined,
): QuestionIntent | null {
  if (!question?.trim() || !states?.length) return null

  let matchedCategory: QuickAnswerCategory | null = null
  let matchedKeyword: string | undefined
  for (const { cat, patterns } of CATEGORY_PATTERNS) {
    for (const pat of patterns) {
      const m = question.match(pat)
      if (m) {
        matchedCategory = cat
        matchedKeyword = m[0]
        break
      }
    }
    if (matchedCategory) break
  }
  if (!matchedCategory) return null

  const stateMatch = detectStateInQuestion(question, states, defaultState)
  if (!stateMatch) return null

  return {
    category: matchedCategory,
    stateSlug: stateMatch.slug,
    stateName: stateMatch.name,
    matchedKeyword,
  }
}
