import axios from 'axios'
import { useQuery } from '@tanstack/react-query'
import type {
  StateInfo, OverviewData, ConstituencyRow, ConstituencyDetail,
  SwingData, CandidatesData, LokSabhaData,
} from './types'

// In dev, requests go to '/api' which Vite proxies to localhost:8000.
// In prod (Vercel), VITE_API_URL is set at build time to the Render backend URL.
const apiBase = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api'
export const api = axios.create({ baseURL: apiBase })

export const useStates = () =>
  useQuery<StateInfo[]>({
    queryKey: ['states'],
    queryFn: () => api.get('/states').then(r => r.data),
  })

export const useOverview = (state: string) =>
  useQuery<OverviewData>({
    queryKey: ['overview', state],
    queryFn: () => api.get(`/${state}/overview`).then(r => r.data),
    enabled: !!state,
  })

export const useConstituencies = (state: string, filters: Record<string, string> = {}) =>
  useQuery<ConstituencyRow[]>({
    queryKey: ['constituencies', state, filters],
    queryFn: () => api.get(`/${state}/constituencies`, { params: filters }).then(r => r.data),
    enabled: !!state,
  })

export const useConstituencyDetail = (state: string, acNumber: number) =>
  useQuery<ConstituencyDetail>({
    queryKey: ['constituency-detail', state, acNumber],
    queryFn: () => api.get(`/${state}/constituency/${acNumber}`).then(r => r.data),
    enabled: !!state && !!acNumber,
  })

export const useSwing = (state: string) =>
  useQuery<SwingData>({
    queryKey: ['swing', state],
    queryFn: () => api.get(`/${state}/swing`).then(r => r.data),
    enabled: !!state,
  })

export const useCandidates = (state: string, filters: Record<string, string | boolean> = {}, page = 0) =>
  useQuery<CandidatesData>({
    queryKey: ['candidates', state, filters, page],
    queryFn: () =>
      api.get(`/${state}/candidates`, {
        params: { ...filters, offset: page * 50, limit: 50 },
      }).then(r => r.data),
    enabled: !!state,
  })

export const useLokSabha = (state: string) =>
  useQuery<LokSabhaData>({
    queryKey: ['loksabha', state],
    queryFn: () => api.get(`/${state}/loksabha`).then(r => r.data),
    enabled: !!state,
  })

export const useResults = (state: string, params: Record<string, string | number | boolean>) =>
  useQuery<CandidatesData>({
    queryKey: ['results', state, params],
    queryFn: () => api.get(`/${state}/candidates`, { params }).then(r => r.data),
    enabled: !!state,
  })

export const useSeatFlips = (state: string, party: string, direction: 'gained' | 'lost', enabled = true) =>
  useQuery<any>({
    queryKey: ['seat-flips', state, party, direction],
    queryFn: () => api.get(`/${state}/seat-flips`, { params: { party, direction } }).then(r => r.data),
    enabled: !!state && !!party && enabled,
  })

export const useAllianceBreakdown = (state: string, allianceId: string, enabled = true) =>
  useQuery<any>({
    queryKey: ['alliance-breakdown', state, allianceId],
    queryFn: () => api.get(`/${state}/alliance-breakdown/${allianceId}`).then(r => r.data),
    enabled: !!state && !!allianceId && enabled,
  })

export const useFlipMatrix = (state: string) =>
  useQuery<any>({
    queryKey: ['flip-matrix', state],
    queryFn: () => api.get(`/${state}/flip-matrix`).then(r => r.data),
    enabled: !!state,
  })

export const useDistrictSwing = (state: string) =>
  useQuery<any>({
    queryKey: ['district-swing', state],
    queryFn: () => api.get(`/${state}/district-swing`).then(r => r.data),
    enabled: !!state,
  })

export const usePartyAnalytics = (state: string) =>
  useQuery<any>({
    queryKey: ['party-analytics', state],
    queryFn: () => api.get(`/${state}/party-analytics`).then(r => r.data),
    enabled: !!state,
  })

export interface DashboardSummary {
  states: number
  total_seats: number
  total_candidates: number
  total_polled_votes: number
  eci_match_pct: number
  last_updated: string | null
  // Newly added cross-state KPIs
  total_mlas: number
  criminal_mlas: number
  criminal_mlas_pct: number | null
  criminal_mlas_coverage: string
  avg_mla_age: number | null
  hung_states: number
  decisive_states: number
  top_parties: { party: string; seats: number; pct: number; seats_2021: number; delta: number }[]
  nota_by_state: {
    state: string
    name: string
    total_nota: number
    polled: number
    share_pct: number
    decided_count: number
    decided_seats: {
      ac_number: number
      ac_name: string
      district: string
      winner: string
      party: string
      margin: number
      nota_votes: number
    }[]
  }[]
  total_nota_votes_all_states: number
  total_nota_decided_seats_all_states: number
}

export const useDashboardSummary = () =>
  useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get('/dashboard-summary').then(r => r.data),
  })

// ─────────────────────  Cross-state postal-ballot leads  ─────────────────────

export interface PostalPartyRow {
  party: string
  evm_votes: number
  postal_votes: number
  total_votes: number
  evm_share_pct: number
  postal_share_pct: number
  delta_pp: number              // postal% − evm%. positive = over-performs among postal voters.
  seats_won: number             // ACs the party actually won (decided by total votes).
  postal_seats_led: number      // ACs where the party had the highest postal_votes.
  seat_delta: number            // postal_seats_led − seats_won.
}

export interface PostalLeads {
  grand_total_postal: number
  grand_total_evm: number
  grand_total_polled: number
  states: {
    state: string
    name: string
    postal_total: number
    evm_total: number
    postal_share_of_polled: number
    parties: PostalPartyRow[]
    top_over_performer: PostalPartyRow | null
    top_under_performer: PostalPartyRow | null
    biggest_seat_divergence: PostalPartyRow | null
  }[]
}

export const usePostalLeads = () =>
  useQuery<PostalLeads>({
    queryKey: ['postal-leads'],
    queryFn: () => api.get('/postal-leads').then(r => r.data),
  })

// ─────────────  Postal 2021 → 2026 swing  ─────────────

export interface PostalSwingPartyRow {
  party: string
  votes_2021: number
  votes_2026: number
  share_2021_pct: number
  share_2026_pct: number
  swing_pp: number       // share_2026 − share_2021 (in percentage points)
  seats_led_2021: number // ACs the party led in postal votes in 2021
  seats_led_2026: number // ACs the party led in postal votes in 2026
  seat_swing: number     // seats_led_2026 − seats_led_2021
}

export interface PostalSwing {
  states: {
    state: string
    name: string
    postal_total_2021: number
    postal_total_2026: number
    acs_with_postal_2021: number
    acs_with_postal_2026: number
    parties: PostalSwingPartyRow[]
    top_gainer: PostalSwingPartyRow | null
    top_loser: PostalSwingPartyRow | null
    top_seat_gainer: PostalSwingPartyRow | null
    top_seat_loser: PostalSwingPartyRow | null
  }[]
}

export const usePostalSwing = () =>
  useQuery<PostalSwing>({
    queryKey: ['postal-2021-vs-2026'],
    queryFn: () => api.get('/postal-2021-vs-2026').then(r => r.data),
  })

// ─────────────────────  Per-state KPIs (composite)  ─────────────────────

export interface StateKPIs {
  state: string
  name: string
  declared: number
  total_seats: number
  competition: {
    avg_margin: number
    median_margin: number
    close_contests_lt_5pct: number
    recount_eligible_lt_0_5pct: number
  }
  concentration: {
    top_party: string | null
    top_party_seats: number
    single_party_pct: number
  }
  demographics: {
    avg_age: number | null
    youngest: number | null
    oldest: number | null
    age_distribution: { u35: number; '35_44': number; '45_54': number; '55_64': number; '65p': number }
    median_assets_cr: number | null
    avg_assets_cr: number | null
    assets_coverage: string
    criminal_mlas: number
    criminal_mlas_pct: number
    serious_criminal_mlas: number
  }
  incumbency: {
    matched_2021_seats: number
    same_party_held: number
    flipped_seats: number
    anti_incumbency_pct: number | null
    note: string
  }
  efficiency: {
    alliance_id: string
    alliance_name: string
    color: string
    vote_share: number
    seat_share: number
    delta_pp: number
  }[]
  nota: {
    total_nota_votes: number
    polled_votes: number
    nota_share_pct: number
    nota_decided_count: number
    nota_decided_seats: {
      ac_number: number
      name: string
      district: string
      winner: string
      winner_party: string
      winner_votes: number
      margin: number
      nota_votes: number
      nota_over_margin_x: number
    }[]
    per_ac_coverage: number
  }
}

export const useStateKPIs = (state: string) =>
  useQuery<StateKPIs>({
    queryKey: ['kpis', state],
    queryFn: () => api.get(`/${state}/kpis`).then(r => r.data),
    enabled: !!state,
  })

// ─────────────────────  Rule-based insights  ─────────────────────
// (Replaced the LLM-backed /ai/* endpoints — same UX, no external API.)

export interface StateStory {
  state: string
  headline: string
  tagline: string
  story: string         // kept for compatibility — = headline + tagline
  method: string
}

export const useStateStory = (state: string, enabled = true) =>
  useQuery<StateStory>({
    queryKey: ['state-story', state],
    queryFn: () => api.get(`/insights/state-story/${state}`).then(r => r.data),
    enabled: enabled && !!state,
    staleTime: 60 * 60 * 1000, // 1 hour — recomputed cheap, but no reason to refetch often.
  })

export type CompareKind = 'party' | 'district' | 'constituency'
export interface CompareSide { kind: CompareKind; state: string; value: string }
export interface CompareRowItem { label: string; a: any; b: any }
export interface CompareResponse {
  a: { label: string; color: string; kind: CompareKind }
  b: { label: string; color: string; kind: CompareKind }
  rows: CompareRowItem[]
  verdict: string
  method: string
}

export const compareEntities = (a: CompareSide, b: CompareSide) =>
  api.post<CompareResponse>('/insights/compare', { a, b }).then(r => r.data)

export interface QuickAnswer {
  emoji: string
  label: string
  answer: string
  link?: string
}

export interface QuickAnswersResponse {
  state: string | null
  answers: QuickAnswer[]
}

export const useQuickAnswers = (state: string | null | undefined) =>
  useQuery<QuickAnswersResponse>({
    queryKey: ['quick-answers', state ?? '__default__'],
    queryFn: () => api.get(state ? `/insights/quick-answers/${state}` : '/insights/quick-answers').then(r => r.data),
    staleTime: 60 * 60 * 1000,
  })

// ─────────────────────  Ask the dashboard (Claude tool-use, dashboard-only)  ─────────────────────

export interface AskResponse {
  answer: string
  trace: { tool: string; args: Record<string, any>; ok: boolean; error?: string }[]
  model: string
}

/** Calls /api/ai/ask. Returns 503 detail if ANTHROPIC_API_KEY isn't set. */
export const askAI = (question: string, state?: string | null) =>
  api.post<AskResponse>('/ai/ask', { question, state: state ?? undefined }).then(r => r.data)
