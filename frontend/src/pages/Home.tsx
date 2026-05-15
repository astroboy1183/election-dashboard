import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { api, useStates, useDashboardSummary } from '../lib/api'
import type { StateInfo } from '../lib/types'
import InsightsCard, { type Insight } from '../components/InsightsCard'
import { CountUp } from '../components/CountUp'
import { useEscapeKey } from '../lib/useEscapeKey'
import { useAITools } from '../lib/AIToolsContext'
import { fmtIN } from '../lib/format'

const STATUS_BADGE: Record<string, { label: string; cls: string; dot: string }> = {
  declared: { label: 'Results Declared', cls: 'badge-green',  dot: '#22c55e' },
  counting: { label: 'Counting Live',    cls: 'badge-yellow', dot: '#eab308' },
  upcoming: { label: 'Upcoming',         cls: 'badge-blue',   dot: '#94a3b8' },
}

interface StateOverview {
  state: string
  total_seats: number
  majority: number
  declared: number
  alliances: { alliance_id: string; name: string; color: string; seats: number }[]
  parties: { party: string; full_name?: string; color: string; alliance_id: string; seats: number }[]
}

interface StateSummary {
  top_alliance?: { name: string; seats: number; color: string }
  runner_alliance?: { name: string; seats: number; color: string }
  top_party?: { party: string; color: string; seats: number }
  hung: boolean
  buffer: number  // seats above (or below if hung) the majority line
  headline: string
}

function summarize(o?: StateOverview): StateSummary {
  if (!o || !o.alliances || o.alliances.length === 0) {
    return { hung: false, buffer: 0, headline: '' }
  }
  const sortedAlliances = [...o.alliances].sort((a, b) => b.seats - a.seats)
  const top = sortedAlliances[0]
  const runner = sortedAlliances[1]
  const sortedParties = [...o.parties].filter(p => p.seats > 0).sort((a, b) => b.seats - a.seats)
  const topParty = sortedParties[0]
  const hung = top.seats < o.majority
  const buffer = top.seats - o.majority
  const cleanName = top.name.replace(/\s*\(.*\)/, '').trim()
  let headline: string
  if (hung) {
    headline = `Hung — ${cleanName} largest at ${top.seats}, ${Math.abs(buffer)} short`
  } else if (buffer >= 30) {
    headline = `${cleanName} sweeps · ${top.seats} of ${o.total_seats}`
  } else if (buffer >= 10) {
    headline = `${cleanName} wins comfortably · ${top.seats} of ${o.total_seats}`
  } else {
    headline = `${cleanName} edges through · ${top.seats} of ${o.total_seats}`
  }
  return {
    top_alliance: top ? { name: cleanName, seats: top.seats, color: top.color } : undefined,
    runner_alliance: runner ? { name: runner.name, seats: runner.seats, color: runner.color } : undefined,
    top_party: topParty ? { party: topParty.party, color: topParty.color, seats: topParty.seats } : undefined,
    hung, buffer, headline,
  }
}

function StateCard({ state, summary }: { state: StateInfo; summary: StateSummary }) {
  const navigate = useNavigate()
  const s = STATUS_BADGE[state.status] ?? STATUS_BADGE.upcoming
  const isLive = state.status !== 'upcoming'
  // Use the ruling alliance's color as the card accent — more meaningful than a static palette.
  const accent = summary.top_alliance?.color ?? '#818cf8'

  return (
    <div
      onClick={() => isLive && navigate(`/${state.slug}/overview`)}
      style={{
        position: 'relative',
        background: `linear-gradient(160deg, ${accent}1f 0%, ${accent}08 30%, var(--bg-card) 70%)`,
        border: `1px solid ${accent}33`,
        borderRadius: 18,
        padding: '1.6rem 1.5rem 1.4rem',
        cursor: isLive ? 'pointer' : 'default',
        transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: isLive ? 1 : 0.55,
        overflow: 'hidden',
        boxShadow: `0 4px 16px -8px ${accent}30`,
      }}
      onMouseEnter={e => {
        if (!isLive) return
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = `${accent}aa`
        el.style.transform = 'translateY(-6px) scale(1.01)'
        el.style.boxShadow = `0 20px 50px -10px ${accent}55, 0 0 0 1px ${accent}44`
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = `${accent}33`
        el.style.transform = 'translateY(0) scale(1)'
        el.style.boxShadow = `0 4px 16px -8px ${accent}30`
      }}
    >
      {/* Big glowing orb in the top-right corner for visual interest */}
      <div style={{
        position: 'absolute', top: -60, right: -60, width: 160, height: 160, borderRadius: '50%',
        background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Top accent strip */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${accent} 0%, ${accent}66 60%, ${accent}22 100%)`,
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem', position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.1 }}>{state.name}</div>
        <span className={`badge ${s.cls}`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.66rem' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
          {s.label}
        </span>
      </div>

      {/* Headline insight per state — the punchy one-liner */}
      {summary.headline && (
        <div style={{
          fontSize: '0.85rem',
          color: accent,
          fontWeight: 700,
          marginBottom: '0.9rem',
          padding: '0.45rem 0.65rem',
          borderRadius: 8,
          background: `${accent}14`,
          border: `1px solid ${accent}33`,
          lineHeight: 1.35,
        }}>
          {summary.hung ? '⚖️' : summary.buffer >= 30 ? '🏆' : '🏛️'} {summary.headline}
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1rem', marginBottom: '1rem', position: 'relative', zIndex: 1 }}>
        {[
          { label: 'Total Seats', value: state.total_seats },
          { label: 'Majority',    value: state.majority },
          { label: 'LS Seats',    value: state.ls_seats },
          { label: 'Results',     value: state.results_date },
        ].map(item => (
          <div key={item.label}>
            <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
              {item.label}
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700 }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      {isLive && (
        <div style={{
          background: `linear-gradient(135deg, ${accent}28 0%, ${accent}14 100%)`,
          border: `1px solid ${accent}55`,
          borderRadius: 10,
          padding: '0.6rem 0.85rem',
          fontSize: '0.85rem',
          color: accent,
          fontWeight: 700,
          textAlign: 'center',
          letterSpacing: '0.02em',
          position: 'relative',
          zIndex: 1,
        }}>
          Explore Results  →
        </div>
      )}
    </div>
  )
}

function CrossStateTile({
  emoji, label, value, sub, accent,
}: { emoji: string; label: string; value: string; sub?: string; accent: string }) {
  return (
    <div style={{
      padding: '0.85rem 1rem',
      borderRadius: 10,
      background: `linear-gradient(145deg, ${accent}18 0%, ${accent}06 100%)`,
      border: `1px solid ${accent}40`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: '1rem', lineHeight: 1 }}>{emoji}</span>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)',
                       textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {label}
        </span>
      </div>
      <div className="tabular" style={{ fontSize: '1.5rem', fontWeight: 800, color: accent, lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function HeroStat({
  value, label, accent, emoji, hint, onClick,
  countTo, countFormat,
}: {
  value: string; label: string; accent: string;
  emoji?: string; hint?: string; onClick?: () => void;
  /** If set, renders an animated count-up to this number instead of the static `value`. */
  countTo?: number;
  countFormat?: (n: number) => string;
}) {
  const clickable = !!onClick
  return (
    <button
      onClick={onClick}
      disabled={!clickable}
      style={{
        padding: '1.1rem 1.25rem',
        borderRadius: 14,
        background: `linear-gradient(145deg, ${accent}22 0%, ${accent}0a 50%, rgba(255,255,255,0.02) 100%)`,
        border: `1px solid ${accent}40`,
        flex: 1,
        minWidth: 175,
        cursor: clickable ? 'pointer' : 'default',
        textAlign: 'left',
        color: 'inherit',
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s, border-color 0.25s',
        boxShadow: `0 4px 14px -8px ${accent}40`,
      }}
      onMouseEnter={e => {
        if (!clickable) return
        const el = e.currentTarget as HTMLButtonElement
        el.style.transform = 'translateY(-3px)'
        el.style.borderColor = `${accent}90`
        el.style.boxShadow = `0 16px 36px -10px ${accent}55`
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.transform = 'translateY(0)'
        el.style.borderColor = `${accent}40`
        el.style.boxShadow = `0 4px 14px -8px ${accent}40`
      }}
    >
      <div style={{
        position: 'absolute', top: -40, right: -40, width: 100, height: 100, borderRadius: '50%',
        background: `radial-gradient(circle, ${accent}33 0%, transparent 70%)`, pointerEvents: 'none',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {emoji && <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{emoji}</span>}
        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: '1.9rem', fontWeight: 900, color: accent, lineHeight: 1, marginBottom: 4 }}>
        {countTo !== undefined
          ? <CountUp value={countTo} format={countFormat} />
          : value}
      </div>
      {hint && (
        <div style={{ fontSize: '0.7rem', color: accent, fontWeight: 600, marginTop: 6, opacity: 0.85 }}>
          {hint} →
        </div>
      )}
    </button>
  )
}

// Per-state breakdown rows used inside hero-stat modals
function BreakdownRow({ left, right, color }: { left: string; right: string; color?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '0.55rem 0.8rem', borderRadius: 8,
      background: 'var(--bg-secondary)',
      borderLeft: color ? `3px solid ${color}` : '3px solid transparent',
    }}>
      <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{left}</span>
      <span style={{ fontSize: '0.95rem', fontWeight: 800, color: color ?? 'var(--text-primary)' }}>{right}</span>
    </div>
  )
}

type StatModalKind = 'states' | 'seats' | 'candidates' | 'votes' | 'ecimatch'

// Per-state hardcoded constants — verified exact against ECI in the previous reconciliation passes.
const STATE_CANDIDATES: Record<string, number> = {
  'tamil-nadu': 4023, 'kerala': 883, 'west-bengal': 2926, 'assam': 722, 'puducherry': 294,
}
const STATE_VOTES: Record<string, number> = {
  'tamil-nadu': 49_324_121, 'kerala': 21_595_055, 'west-bengal': 63_753_070,
  'assam': 21_665_618, 'puducherry': 866_139,
}

function HeroStatModal({
  kind, states, onClose,
}: {
  kind: StatModalKind; states: StateInfo[]; onClose: () => void;
}) {
  const meta: Record<StatModalKind, { emoji: string; title: string; accent: string; subtitle: string }> = {
    states:     { emoji: '🗺️', title: 'States Covered',         accent: '#818cf8', subtitle: 'The 5 states whose 2026 results are fully analyzed here.' },
    seats:      { emoji: '🪑', title: 'Assembly Seats',         accent: '#22c55e', subtitle: 'Total Vidhan Sabha constituencies across all 5 states.' },
    candidates: { emoji: '👥', title: 'Contesting Candidates',  accent: '#f59e0b', subtitle: 'Every candidate who filed nomination — verified against affidavit.eci.gov.in.' },
    votes:      { emoji: '🗳️', title: 'Votes Polled',           accent: '#06b6d4', subtitle: 'Total polled votes including NOTA. Matches ECI exactly.' },
    ecimatch:   { emoji: '✅', title: 'Match with ECI',         accent: '#a78bfa', subtitle: 'How we verified the dataset against the Election Commission.' },
  }
  const m = meta[kind]

  let body: any = null
  if (kind === 'states') {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {states.map(s => (
          <BreakdownRow key={s.slug} left={s.name} right={`${s.total_seats} seats · majority ${s.majority}`} color={m.accent} />
        ))}
      </div>
    )
  } else if (kind === 'seats') {
    const total = states.reduce((a, s) => a + s.total_seats, 0)
    body = (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {states.sort((a, b) => b.total_seats - a.total_seats).map(s => (
            <BreakdownRow key={s.slug} left={s.name} right={s.total_seats.toString()} color={m.accent} />
          ))}
        </div>
        <div style={{ marginTop: 14, fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
          Total: <strong style={{ color: 'var(--text-primary)' }}>{fmtIN(total)}</strong> seats
        </div>
      </>
    )
  } else if (kind === 'candidates') {
    body = (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[...states].sort((a, b) => (STATE_CANDIDATES[b.slug] ?? 0) - (STATE_CANDIDATES[a.slug] ?? 0)).map(s => (
            <BreakdownRow key={s.slug} left={s.name}
              right={`${fmtIN(STATE_CANDIDATES[s.slug] ?? 0)} candidates`} color={m.accent} />
          ))}
        </div>
        <div style={{ marginTop: 14, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Each row matches the count published at <strong>affidavit.eci.gov.in</strong>. Average: <strong style={{ color: 'var(--text-primary)' }}>
            ~10.7 candidates per constituency
          </strong>.
        </div>
      </>
    )
  } else if (kind === 'votes') {
    const total = Object.values(STATE_VOTES).reduce((a, b) => a + b, 0)
    body = (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[...states].sort((a, b) => (STATE_VOTES[b.slug] ?? 0) - (STATE_VOTES[a.slug] ?? 0)).map(s => {
            const v = STATE_VOTES[s.slug] ?? 0
            const pct = (v / total * 100).toFixed(1)
            return (
              <BreakdownRow key={s.slug} left={s.name}
                right={`${fmtIN(v)} (${pct}%)`} color={m.accent} />
            )
          })}
        </div>
        <div style={{ marginTop: 14, fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
          Total: <strong style={{ color: 'var(--text-primary)' }}>{fmtIN(total)}</strong> votes (~15.7 crore)
        </div>
      </>
    )
  } else if (kind === 'ecimatch') {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.9rem', lineHeight: 1.55 }}>
        <div>This dataset was reconciled against ECI's published data at three levels:</div>
        <BreakdownRow left="State-level totals"          right="✓ exact (0 votes diff)"     color="#22c55e" />
        <BreakdownRow left="Every party listed by ECI"   right="✓ vote-for-vote match"      color="#22c55e" />
        <BreakdownRow left="Candidate counts per state"  right="✓ matches affidavit.eci.gov.in" color="#22c55e" />
        <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Parties ECI bundles into "Others" are broken out individually here (PMK, AMMK, AISF, etc.) for more granular analysis.
          Multi-faction parties like Kerala Congress are correctly split by faction (KC, KC(M), KC(J), KC(B)).
        </div>
      </div>
    )
  }

  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(7, 9, 26, 0.78)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '6vh 1rem', zIndex: 50, overflowY: 'auto',
      }}>
      <div onClick={e => e.stopPropagation()} className="card"
        style={{ maxWidth: 640, width: '100%', borderLeft: `4px solid ${m.accent}`, maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              <span style={{ marginRight: 6 }}>{m.emoji}</span>{m.title}
            </div>
            <div style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', lineHeight: 1.45, maxWidth: 460 }}>
              {m.subtitle}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                     borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>Close ✕</button>
        </div>
        {body}
      </div>
    </div>
  )
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMin = Math.floor((now - then) / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Home() {
  const { data: states, isLoading, isError } = useStates()
  const { data: summary } = useDashboardSummary()
  const [statModal, setStatModal] = useState<StatModalKind | null>(null)
  // When the user clicks a per-state NOTA "⚠ N" badge, we open a modal listing
  // the actual NOTA-decided seats in that state. Store the state-slug we clicked.
  const [notaModalState, setNotaModalState] = useState<string | null>(null)
  const { openQuickAnswers, openCompare } = useAITools()
  useEscapeKey(statModal !== null, () => setStatModal(null))
  useEscapeKey(notaModalState !== null, () => setNotaModalState(null))

  // Fetch overview for every state in parallel — powers the per-card headline + page-level insights
  const overviewQueries = useQueries({
    queries: (states ?? []).map(s => ({
      queryKey: ['overview', s.slug],
      queryFn: () => api.get(`/${s.slug}/overview`).then(r => r.data as StateOverview),
      enabled: !!states,
      staleTime: 5 * 60 * 1000,
    })),
  })

  const summaries = useMemo<Record<string, StateSummary>>(() => {
    if (!states) return {}
    const out: Record<string, StateSummary> = {}
    states.forEach((s, i) => {
      out[s.slug] = summarize(overviewQueries[i]?.data)
    })
    return out
  }, [states, overviewQueries])

  // Build page-level Key Insights from the aggregated overviews.
  // These are deliberately CROSS-STATE — per-state details belong on each state's Overview page.
  const pageInsights = useMemo<Insight[]>(() => {
    if (!states || overviewQueries.some(q => !q.data)) return []
    const all = states.map((s, i) => ({
      state: s,
      summary: summaries[s.slug],
      overview: overviewQueries[i].data as StateOverview,
    }))
    const out: Insight[] = []

    // 1. Aggregate hung-vs-clear count
    const hungStates = all.filter(x => x.summary.hung)
    if (hungStates.length > 0) {
      out.push({
        emoji: '⚖️', accent: '#f59e0b',
        headline: `${hungStates.length} of ${all.length} states delivered a hung verdict.`,
        detail: `${hungStates.map(x => x.state.name).join(', ')} — government formation depends on post-poll alignments.`,
      })
    } else {
      out.push({
        emoji: '🏛️', accent: '#22c55e',
        headline: `All ${all.length} states produced a decisive verdict.`,
        detail: 'Every state crossed the majority line for its leading alliance — no hung assemblies this cycle.',
      })
    }

    // 2. Which national alliance / party leads in the most states
    const ruledBy: Record<string, { count: number; states: string[]; color: string }> = {}
    all.filter(x => x.summary.top_alliance).forEach(x => {
      const a = x.summary.top_alliance!
      const k = a.name
      if (!ruledBy[k]) ruledBy[k] = { count: 0, states: [], color: a.color }
      ruledBy[k].count++
      ruledBy[k].states.push(x.state.name)
    })
    const sortedRulers = Object.entries(ruledBy).sort((a, b) => b[1].count - a[1].count)
    const topRuler = sortedRulers[0]
    if (topRuler) {
      const [name, info] = topRuler
      out.push({
        emoji: '🗺️', accent: info.color,
        headline: `${name} leads in ${info.count} of ${all.length} state${all.length === 1 ? '' : 's'}.`,
        detail: `Largest alliance in ${info.states.join(', ')} — the broadest geographic footprint of any front this cycle.`,
      })
    }

    // 3. Biggest landslide across all states
    const sortedByBuffer = [...all].filter(x => !x.summary.hung).sort((a, b) => b.summary.buffer - a.summary.buffer)
    const biggest = sortedByBuffer[0]
    if (biggest && biggest.summary.top_alliance) {
      const ta = biggest.summary.top_alliance
      out.push({
        emoji: '🌊', accent: ta.color,
        headline: `Biggest sweep nationally: ${ta.name} in ${biggest.state.name}.`,
        detail: `${ta.seats} of ${biggest.state.total_seats} seats — ${biggest.summary.buffer} above the ${biggest.overview.majority}-seat majority line.`,
      })
    }

    // 4. Single-party largest haul across all states
    const sortedByTopParty = all
      .map(x => ({ state: x.state, p: x.summary.top_party }))
      .filter(x => x.p)
      .sort((a, b) => (b.p!.seats - a.p!.seats))
    const sp = sortedByTopParty[0]
    if (sp && sp.p) {
      out.push({
        emoji: '🥇', accent: sp.p.color,
        headline: `${sp.p.party} is the single largest party — ${sp.p.seats} seats in ${sp.state.name}.`,
        detail: `The most seats any single party won in any of the ${all.length} states this cycle.`,
      })
    }

    // 5. Scale of the dataset — derived numbers, not hardcoded
    if (summary) {
      const crore = (summary.total_polled_votes / 1e7).toFixed(1)
      out.push({
        emoji: '🧮', accent: '#06b6d4',
        headline: `${fmtIN(summary.total_candidates)} candidates contested ${summary.total_seats} seats across ${summary.states} states.`,
        detail: `~${crore} crore votes polled. Every vote and candidate verified vote-for-vote against ECI's official aggregate.`,
      })
    }

    return out
  }, [states, overviewQueries, summaries, summary])

  const totalSeats = summary?.total_seats ?? (states ?? []).reduce((s, x) => s + x.total_seats, 0) ?? 0
  const numStates = summary?.states ?? (states ?? []).length ?? 0
  const totalCandidates = summary?.total_candidates ?? 0
  const totalVotes = summary?.total_polled_votes ?? 0
  const votesCrore = totalVotes ? (totalVotes / 1e7).toFixed(1) : null
  const matchPct = summary?.eci_match_pct ?? 100

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Hero */}
      <div style={{
        position: 'relative',
        background: `radial-gradient(ellipse at top left, rgba(99,102,241,0.18) 0%, transparent 60%),
                     radial-gradient(ellipse at bottom right, rgba(255,153,51,0.10) 0%, transparent 55%),
                     var(--bg-secondary)`,
        borderBottom: '1px solid var(--border)',
        padding: '3.5rem 2rem 2.5rem',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: 'linear-gradient(90deg, #FF9933 0%, #FF9933 33%, #FFFFFF 33%, #FFFFFF 66%, #138808 66%, #138808 100%)',
          opacity: 0.85,
        }} />

        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ fontSize: '0.75rem', color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 12 }}>
            🇮🇳 India · Election Dashboard
          </div>
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3.4rem)',
            fontWeight: 900,
            lineHeight: 1.05,
            margin: 0,
            background: 'linear-gradient(135deg, #fff 0%, #c7d2fe 50%, #818cf8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Assembly Elections 2026
          </h1>
          <p style={{
            fontSize: '1.05rem',
            color: 'var(--text-secondary)',
            maxWidth: 720,
            lineHeight: 1.55,
            marginTop: 14,
            marginBottom: 24,
          }}>
            Welcome. This is a comprehensive, candidate-level breakdown of India's 2026 state elections —
            built from the ground up against ECI's official data. Drill into any state to see who won,
            who lost, who flipped, and where the action happened.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem', marginTop: 20 }}>
            <HeroStat emoji="🗺️" value={`${numStates}`} countTo={numStates}
              label="States Covered" accent="#818cf8"
              hint="See list" onClick={() => setStatModal('states')} />
            <HeroStat emoji="🪑" value={fmtIN(totalSeats)} countTo={totalSeats}
              label="Assembly Seats" accent="#22c55e"
              hint="Per-state breakdown" onClick={() => setStatModal('seats')} />
            <HeroStat emoji="👥" value={totalCandidates ? fmtIN(totalCandidates) : '—'}
              countTo={totalCandidates || undefined}
              label="Contesting Candidates" accent="#f59e0b"
              hint="Per-state breakdown" onClick={() => setStatModal('candidates')} />
            <HeroStat emoji="🗳️" value={votesCrore ? `${votesCrore} Cr` : '—'}
              countTo={totalVotes ? totalVotes / 1e7 : undefined}
              countFormat={(n) => `${n.toFixed(1)} Cr`}
              label="Votes Polled" accent="#06b6d4"
              hint="Per-state breakdown" onClick={() => setStatModal('votes')} />
            <HeroStat emoji="✅" value={`${matchPct.toFixed(0)}%`} countTo={matchPct}
              countFormat={(n) => `${Math.round(n)}%`}
              label="Match with ECI" accent="#a78bfa"
              hint="How we verified" onClick={() => setStatModal('ecimatch')} />
          </div>

          {/* Inline tools row — Home has no sidebar, so surface the two
              modal tools alongside the hero stats. */}
          <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={openQuickAnswers}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: 8,
                background: 'rgba(167,139,250,0.10)',
                border: '1px solid rgba(167,139,250,0.30)',
                color: '#a78bfa',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              <span>💡</span> Quick answers
              <span className="kbd" style={{ fontSize: '0.62rem' }}>⌘J</span>
            </button>
            <button
              onClick={openCompare}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: 8,
                background: 'rgba(245,158,11,0.10)',
                border: '1px solid rgba(245,158,11,0.30)',
                color: '#fbbf24',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              <span>⚖️</span> Compare anything
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 2rem' }}>
        {/* Cross-state legislature snapshot */}
        {summary && summary.total_mlas > 0 && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="section-title">What kind of legislature did we elect?</div>
            <div className="kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', marginTop: 6 }}>
              <CrossStateTile
                emoji="🏛️" label="Total MLAs" accent="#818cf8"
                value={summary.total_mlas.toLocaleString('en-IN')}
                sub={`across ${summary.states} states`}
              />
              <CrossStateTile
                emoji="🗺️" label="Decisive vs Hung" accent="#22c55e"
                value={`${summary.decisive_states} / ${summary.hung_states}`}
                sub={`${summary.decisive_states} clear majorities, ${summary.hung_states} hung`}
              />
              <CrossStateTile
                emoji="⚖️" label="MLAs with criminal cases" accent="#ef4444"
                value={summary.criminal_mlas_pct !== null ? `${summary.criminal_mlas_pct}%` : '—'}
                sub={`${summary.criminal_mlas} of ${summary.criminal_mlas_coverage} with data`}
              />
              <CrossStateTile
                emoji="🎂" label="Avg MLA age" accent="#67e8f9"
                value={summary.avg_mla_age !== null ? `${summary.avg_mla_age} yrs` : '—'}
                sub={`across all ${summary.total_mlas} elected representatives`}
              />
            </div>
            {summary.top_parties.length > 0 && (
              <>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginTop: 18, marginBottom: 8 }}>
                  Biggest parties by MLA count (all 5 states combined)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {/* Header row labelling the columns so the +/- delta column is unambiguous */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    fontSize: '0.62rem', color: 'var(--text-secondary)',
                    textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700,
                    marginBottom: 2,
                  }}>
                    <span style={{ width: 60 }}>Party</span>
                    <span style={{ flex: 1 }}></span>
                    <span style={{ width: 70, textAlign: 'right' }}>2026</span>
                    <span style={{ width: 50, textAlign: 'right' }}>%</span>
                    <span style={{ width: 70, textAlign: 'right' }} title="Change vs 2021">vs 2021</span>
                  </div>
                  {summary.top_parties.map(p => {
                    const deltaColor = p.delta > 0 ? '#22c55e' : p.delta < 0 ? '#ef4444' : 'var(--text-secondary)'
                    const deltaSign = p.delta > 0 ? '+' : ''
                    return (
                      <div key={p.party} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 60, fontWeight: 700, fontSize: '0.84rem', color: 'var(--text-primary)' }}>{p.party}</span>
                        <div style={{ flex: 1, height: 18, borderRadius: 4, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.max(1, (p.pct / (summary.top_parties[0].pct || 1)) * 100)}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, var(--accent) 0%, var(--accent-cyan) 100%)',
                            borderRadius: 4,
                          }} />
                        </div>
                        <span className="tabular" style={{ width: 70, textAlign: 'right', fontWeight: 700 }}>{p.seats}</span>
                        <span className="tabular" style={{ width: 50, textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{p.pct}%</span>
                        <span
                          className="tabular"
                          style={{
                            width: 70, textAlign: 'right', fontSize: '0.82rem', fontWeight: 700,
                            color: deltaColor,
                          }}
                          title={`2021: ${p.seats_2021} seats → 2026: ${p.seats} seats (${deltaSign}${p.delta})`}
                        >
                          {deltaSign}{p.delta}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* NOTA — voter dissatisfaction signal across states */}
            {summary.nota_by_state && summary.nota_by_state.some(n => n.total_nota > 0) && (
              <>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginTop: 22, marginBottom: 8 }}>
                  🗳️ NOTA — voter dissatisfaction
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                  <div>
                    <span className="tabular" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b' }}>
                      {summary.total_nota_votes_all_states.toLocaleString('en-IN')}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: 6 }}>NOTA votes across all 5 states</span>
                  </div>
                  {summary.total_nota_decided_seats_all_states > 0 && (
                    <div style={{
                      padding: '0.25rem 0.65rem', borderRadius: 999,
                      background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.45)',
                      color: '#fbbf24', fontWeight: 700, fontSize: '0.82rem',
                    }}>
                      ⚠ {summary.total_nota_decided_seats_all_states} seats where NOTA exceeded the winning margin
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {summary.nota_by_state.slice().sort((a, b) => b.share_pct - a.share_pct).map(n => (
                    <div key={n.state} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 100, fontWeight: 700, fontSize: '0.82rem' }}>{n.name}</span>
                      <div style={{ flex: 1, height: 14, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.max(2, (n.share_pct / Math.max(...summary.nota_by_state.map(x => x.share_pct), 0.001)) * 100)}%`,
                          height: '100%', background: 'linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)', borderRadius: 3,
                        }} />
                      </div>
                      <span className="tabular" style={{ width: 60, textAlign: 'right', fontWeight: 700, fontSize: '0.82rem' }}>{n.share_pct}%</span>
                      <span className="tabular" style={{ width: 80, textAlign: 'right', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                        {n.total_nota.toLocaleString('en-IN')}
                      </span>
                      {n.decided_count > 0 && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={() => setNotaModalState(n.state)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setNotaModalState(n.state) } }}
                          style={{
                            fontSize: '0.66rem', fontWeight: 800, color: '#f87171',
                            padding: '0.1rem 0.4rem', borderRadius: 4,
                            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
                            cursor: 'pointer', userSelect: 'none',
                          }}
                          title={`Click to see the ${n.decided_count} seat${n.decided_count === 1 ? '' : 's'} in ${n.name} where NOTA exceeded the winning margin`}
                        >
                          ⚠ {n.decided_count}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Page-level Key Insights */}
        <InsightsCard insights={pageInsights} subtitle="What stands out across all 5 states" />

        <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>
            Pick a state to begin
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Each card shows that state's headline result. Tap to drill in.
          </div>
        </div>

        {isLoading && (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '4rem' }}>
            Loading states…
          </div>
        )}
        {isError && (
          <div style={{ color: '#ef4444', textAlign: 'center', padding: '4rem' }}>
            Couldn't connect to the API. Make sure the backend is running on port 8000.
          </div>
        )}
        {states && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '1.4rem' }}>
            {states.map(s => <StateCard key={s.slug} state={s} summary={summaries[s.slug] ?? { hung: false, buffer: 0, headline: '' }} />)}
          </div>
        )}

        {/* Capability tour */}
        <div style={{
          marginTop: '3rem',
          padding: '1.5rem 1.75rem',
          borderRadius: 14,
          background: 'rgba(99,102,241,0.04)',
          border: '1px solid rgba(99,102,241,0.15)',
        }}>
          <div style={{ fontSize: '0.7rem', color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 10 }}>
            What you'll find inside
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            {[
              { icon: '🏛️', label: 'Overview',     desc: 'Power outcome, alliances, key insights at a glance.' },
              { icon: '📊', label: 'Party Analysis', desc: 'Strike rates, vote efficiency, stronghold districts.' },
              { icon: '📈', label: 'Swing & Trends', desc: 'What changed since 2021 — seats flipped, held, gained.' },
              { icon: '🗺️', label: 'District & LS',  desc: 'Geographic breakdown + Lok Sabha projection per state.' },
              { icon: '🌐', label: 'Interactive Map',desc: 'Hover any constituency to see who won.' },
              { icon: '⚖️', label: 'Criminality & Assets', desc: 'Candidate affidavit profiles.' },
            ].map(c => (
              <div key={c.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1.3rem', lineHeight: 1.1 }}>{c.icon}</span>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{c.label}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 1 }}>{c.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{
        borderTop: '1px solid var(--border)',
        padding: '1.5rem 2rem',
        textAlign: 'center',
        fontSize: '0.78rem',
        color: 'var(--text-secondary)',
        background: 'var(--bg-secondary)',
      }}>
        Data verified against the Election Commission of India (ECI) and MyNeta affidavits.
        <span style={{ margin: '0 8px', opacity: 0.5 }}>·</span>
        Built with React + FastAPI.
        {summary?.last_updated && (
          <>
            <span style={{ margin: '0 8px', opacity: 0.5 }}>·</span>
            <span title={new Date(summary.last_updated).toLocaleString('en-IN')}>
              Last updated <strong style={{ color: 'var(--text-primary)' }}>{formatRelative(summary.last_updated)}</strong>
            </span>
          </>
        )}
      </div>

      {statModal && states && (
        <HeroStatModal kind={statModal} states={states} onClose={() => setStatModal(null)} />
      )}

      {/* NOTA-decided seats modal — opens when the per-state ⚠ badge is clicked */}
      {notaModalState && summary?.nota_by_state && (() => {
        const stateInfo = summary.nota_by_state.find(n => n.state === notaModalState)
        if (!stateInfo) return null
        return (
          <div
            onClick={() => setNotaModalState(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(7, 9, 26, 0.78)',
              backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex',
              alignItems: 'flex-start', justifyContent: 'center',
              padding: '4rem 1rem 2rem', overflowY: 'auto', animation: 'fadeInUp 0.25s ease-out',
            }}
          >
            <div
              className="card"
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 720, width: '100%', borderLeft: '4px solid #f87171', maxHeight: '85vh', overflowY: 'auto' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                    NOTA-Decided Seats · {stateInfo.name}
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f87171' }}>
                    {stateInfo.decided_count} seat{stateInfo.decided_count === 1 ? '' : 's'} where NOTA &gt; winning margin
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                    Sorted by how NOTA-decided each contest was (NOTA ÷ margin, descending).
                  </div>
                </div>
                <button
                  onClick={() => setNotaModalState(null)}
                  style={{
                    background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                    borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem',
                  }}
                >Close ✕</button>
              </div>

              <div className="table-wrap" style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}>#</th>
                      <th>AC</th>
                      <th>Winner</th>
                      <th style={{ textAlign: 'right' }}>Margin</th>
                      <th style={{ textAlign: 'right' }}>NOTA</th>
                      <th style={{ textAlign: 'right' }}>NOTA / Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stateInfo.decided_seats.map((s, i) => {
                      const ratio = s.nota_votes / Math.max(s.margin, 1)
                      return (
                        <tr
                          key={s.ac_number}
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            setNotaModalState(null)
                            navigate(`/${notaModalState}/constituency/${s.ac_number}`)
                          }}
                          title={`Open ${s.ac_name} drilldown`}
                        >
                          <td style={{ color: 'var(--text-secondary)' }}>{i + 1}</td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{s.ac_name}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                              AC-{s.ac_number} · {s.district}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{s.winner}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{s.party}</div>
                          </td>
                          <td className="tabular" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtIN(s.margin)}</td>
                          <td className="tabular" style={{ textAlign: 'right', fontWeight: 700, color: '#fbbf24' }}>{fmtIN(s.nota_votes)}</td>
                          <td className="tabular" style={{ textAlign: 'right', fontWeight: 700, color: '#f87171' }}>
                            {ratio >= 100 ? `${ratio.toFixed(0)}×` : `${ratio.toFixed(1)}×`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                💡 A high <strong>NOTA / Margin</strong> ratio means voters who rejected every candidate (NOTA) outnumbered the margin
                of victory many times over — if those NOTA voters had backed the runner-up, the outcome would have flipped.
                Click any row to drill into that constituency.
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
