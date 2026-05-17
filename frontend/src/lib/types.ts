export interface StateInfo {
  slug: string
  name: string
  total_seats: number
  majority: number
  election_date: string
  results_date: string
  ls_seats: number
  status: 'declared' | 'counting' | 'upcoming'
}

export interface AllianceResult {
  alliance_id: string
  name: string
  color: string
  seats: number
}

export interface PartyResult {
  party: string
  full_name: string
  color: string
  alliance_id: string
  seats: number
  seats_2021?: number
  seat_change?: number
  share_2026?: number
  share_2021?: number
  share_swing?: number
}

export interface GovPartyInfo {
  party: string
  full_name: string
  color: string
  alliance_id: string
  seats: number
}

export interface GovernmentFormation {
  primary_alliance_id: string
  primary_alliance_name: string
  primary_alliance_color: string
  primary_seats: number
  coalition_members: GovPartyInfo[]
  coalition_seats: number
  outside_support_parties: GovPartyInfo[]
  outside_support_seats: number
  in_government_seats: number
  total_supporting: number
  chief_minister: string | null
  sworn_in: string | null
  note: string | null
}

export interface OverviewData {
  state: string
  slug: string
  total_seats: number
  majority: number
  declared: number
  alliances: AllianceResult[]
  parties: PartyResult[]
  government_formation: GovernmentFormation | null
}

export interface ConstituencyRow {
  ac_number: number
  name: string
  district: string
  winner: string | null
  party: string | null
  alliance: string | null
  color: string
  votes: number
  margin: number
  margin_pct?: number
  recount_eligible?: boolean
  vote_share: number
  total_votes: number
  // Runner-up — used by the map hover panel for close-contest context
  runner_up?: string | null
  runner_up_party?: string | null
  runner_up_color?: string | null
  runner_up_votes?: number
  status?: "declared" | "pending"
  candidate_count?: number
}

export interface CandidateDetail {
  name: string
  party: string
  color: string
  votes: number
  vote_share: number
  is_winner: boolean
  assets_cr: number | null
  criminal_cases: number | null
  education: string | null
  gender: string | null
  age: number | null
}

export interface ConstituencyDetail {
  ac_number: number
  name: string
  district: string
  total_votes: number
  margin: number
  candidates: CandidateDetail[]
  historical_2021: { party: string; votes: number; is_winner: boolean }[]
  representation?: {
    mla: {
      name: string
      party: string
      party_color: string
      party_full_name: string | null
      votes: number
      vote_share: number
      margin: number
      gender: string | null
      age: number | null
      assets_cr: number | null
      criminal_cases: number | null
      education: string | null
      constituency_name: string
      ac_number: number
    } | null
    mp: {
      name: string
      party: string
      party_color: string
      party_full_name: string | null
      gender: string | null
      social_category: string | null
      seat_type: string | null
      ls_name: string
      ls_number: number
      elected_year: number
    } | null
  } | null
}

export interface SwingRow {
  party: string
  full_name: string
  color: string
  seats_2026: number
  seats_2021: number
  seat_change: number
  share_2026: number
  share_2021: number
  share_swing: number
}

export interface CloseContest {
  ac_number: number
  name: string
  winner: string
  winner_party: string
  runner_up: string
  runner_up_party: string
  margin: number
}

export interface SwingData {
  swing: SwingRow[]
  closest_contests: CloseContest[]
}

export interface Candidate {
  name: string
  party: string
  full_party_name: string
  color: string
  constituency: string
  ac_number: number
  district: string
  votes: number
  is_winner: boolean
  // Enriched fields (present in /candidates response)
  vote_share?: number
  rank?: number
  // Signed margin: positive for winners (lead over runner-up), negative for losers (deficit from leader)
  margin?: number
  // Legacy: absolute deficit from leader for losers, 0 for winners
  margin_from_leader?: number
  // Biographical (from MyNeta)
  assets_cr: number | null
  criminal_cases: number | null
  education: string | null
  gender: string | null
  age: number | null
  occupation: string | null
}

export interface CandidatesData {
  total: number
  candidates: Candidate[]
}

export interface LsSegment {
  ac_number: number
  name: string
  winner: string
  winner_party: string
  segment_votes: { party: string; votes: number; color: string }[]
  status?: "declared" | "pending"
}

export interface LsSeat {
  ls_seat_id: number
  ls_name: string
  ls_number: number
  total_segments: number
  projected_winner: string
  projected_winner_color: string
  projected_winner_votes: number
  total_votes: number
  party_breakdown: { party: string; full_name: string; color: string; votes: number; vote_share: number }[]
  segments: LsSegment[]
}

export interface LokSabhaData {
  total_ls_seats: number
  // Alliance-aggregated tally (the primary projection)
  tally: { alliance_id: string; alliance_name: string; color: string; seats: number }[]
  // Per-party "who carries the alliance" supplementary tally
  party_tally?: { party: string; full_name: string; color: string; alliance_id: string; seats: number }[]
  seats: LsSeat[]
}
