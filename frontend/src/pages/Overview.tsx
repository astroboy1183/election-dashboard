import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LabelList, CartesianGrid } from 'recharts'
import { useOverview, useResults, useSwing, useStateKPIs, useConstituencies, useDistrictSwing } from '../lib/api'
import PartyLogo from '../components/PartyLogo'
import InsightsCard, { type Insight } from '../components/InsightsCard'
import { PageSkeleton } from '../components/Skeleton'
import { useEscapeKey } from '../lib/useEscapeKey'
import StateStoryCard from '../components/StateStoryCard'
import { fmtIN, fmtCompact } from '../lib/format'
import { useSortable } from '../lib/useSortable'
import { SortableGridHeader } from '../components/SortableGridHeader'
import { axisTickStyle, tooltipContentStyle, tooltipLabelStyle, refLineStyle } from '../lib/chartTheme'

const fmtCompactNum = (n: number) => fmtCompact(n)

function SmallKpi({
  emoji, label, value, sub, hint, accent, onClick, drillLabel,
  secondaryLabel, secondaryValue,
}: {
  emoji: string
  label: string
  value: string
  sub?: string
  hint?: string
  accent: string
  /** Optional click target. When set, the tile becomes a button with hover affordance. */
  onClick?: () => void
  /** Short caption shown at the bottom of clickable tiles, e.g. "See list →". */
  drillLabel?: string
  /** Optional second stat shown side-by-side with the primary value — used to merge
   *  two closely-related stats into one tile (e.g. avg age + typical assets). */
  secondaryLabel?: string
  secondaryValue?: string
}) {
  const clickable = !!onClick
  const hasSecondary = secondaryValue !== undefined && secondaryLabel !== undefined
  return (
    <div
      className="stat-card"
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!() } } : undefined}
      style={{
        borderLeft: `3px solid ${accent}`,
        cursor: clickable ? 'pointer' : 'default',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>{emoji}</span>
        <span style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-secondary)',
                       textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {label}
        </span>
      </div>
      {hasSecondary ? (
        // Side-by-side dual-stat layout: each gets a tiny micro-label above its value.
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'end' }}>
          <div>
            <div className="tabular" style={{ fontSize: '1.15rem', fontWeight: 800, color: accent, lineHeight: 1.1 }}>{value}</div>
            {sub && (
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 2 }}>{sub}</div>
            )}
          </div>
          <div style={{ borderLeft: `1px solid ${accent}33`, paddingLeft: 8 }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-secondary)',
                          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
              {secondaryLabel}
            </div>
            <div className="tabular" style={{ fontSize: '1.15rem', fontWeight: 800, color: accent, lineHeight: 1.1 }}>{secondaryValue}</div>
          </div>
        </div>
      ) : (
        <>
          <div className="tabular" style={{ fontSize: '1.45rem', fontWeight: 800, color: accent, lineHeight: 1.1 }}>
            {value}
          </div>
          {sub && (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.35 }}>
              {sub}
            </div>
          )}
        </>
      )}
      {hint && (
        <div style={{ fontSize: '0.66rem', color: accent, marginTop: 4, fontWeight: 600 }}>
          ⚠ {hint}
        </div>
      )}
      {clickable && (
        <div style={{
          fontSize: '0.66rem', color: accent, marginTop: 6,
          fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, opacity: 0.85,
        }}>
          {drillLabel ?? 'Drill in'} <span style={{ fontSize: '0.78rem' }}>→</span>
        </div>
      )}
    </div>
  )
}

export default function Overview() {
  const { state } = useParams<{ state: string }>()
  const navigate = useNavigate()
  const [allianceModalOpen, setAllianceModalOpen] = useState(false)
  const [majorityModalOpen, setMajorityModalOpen] = useState(false)
  const [closeContestsOpen, setCloseContestsOpen] = useState(false)
  const [marginDistOpen, setMarginDistOpen] = useState(false)
  const [antiIncOpen, setAntiIncOpen] = useState(false)
  const [efficiencyOpen, setEfficiencyOpen] = useState(false)
  const [ageDistOpen, setAgeDistOpen] = useState(false)
  const [notaOpen, setNotaOpen] = useState(false)
  useEscapeKey(allianceModalOpen, () => setAllianceModalOpen(false))
  useEscapeKey(majorityModalOpen, () => setMajorityModalOpen(false))
  useEscapeKey(closeContestsOpen, () => setCloseContestsOpen(false))
  useEscapeKey(marginDistOpen, () => setMarginDistOpen(false))
  useEscapeKey(antiIncOpen, () => setAntiIncOpen(false))
  useEscapeKey(efficiencyOpen, () => setEfficiencyOpen(false))
  useEscapeKey(ageDistOpen, () => setAgeDistOpen(false))
  useEscapeKey(notaOpen, () => setNotaOpen(false))
  const { data, isLoading } = useOverview(state!)
  // Pre-fetch all winners (used when alliance modal opens) — limit high enough for biggest state (WB 294)
  const { data: winnersData } = useResults(state!, { winners_only: true, limit: 500, offset: 0 })
  const { data: swingData } = useSwing(state!)
  const { data: kpis } = useStateKPIs(state!)
  const { data: constituencies } = useConstituencies(state!)
  // Only fetch district-swing when the anti-incumbency modal is opened — it's the heaviest endpoint.
  const { data: districtSwingData } = useDistrictSwing(state!)

  // ─────────  Sortable data for modals ─────────
  // We lift these out of the IIFE-inside-JSX modals because hooks can't be
  // called inside conditional renders. Each useSortable manages its own column
  // sort state; the data passed in is memoised so the hook only re-sorts when
  // the source data changes.
  const closeContestsAll = useMemo(() => (
    (constituencies ?? []).filter((c: any) =>
      c.party && c.margin !== undefined && c.margin > 0
      && c.margin_pct !== undefined && c.margin_pct < 5
    )
  ), [constituencies])
  const closeContestsSort = useSortable<any>(closeContestsAll, [{ key: 'margin_pct', dir: 'asc' }])

  const antiIncFlipped = useMemo(() => {
    const all: any[] = []
    ;(districtSwingData?.districts ?? []).forEach((d: any) => {
      (d.acs ?? []).forEach((a: any) => all.push({ ...a, district: d.name }))
    })
    return all.filter((a: any) => a.flipped && a.winner_party_2026 && a.winner_party_2021)
  }, [districtSwingData])
  const antiIncSort = useSortable<any>(antiIncFlipped, [{ key: 'margin_2026', dir: 'desc' }])

  const notaDecidedAll = useMemo(() => (kpis?.nota?.nota_decided_seats ?? []), [kpis])
  const notaSort = useSortable<any>(notaDecidedAll, [{ key: 'nota_over_margin_x', dir: 'desc' }])

  if (isLoading) return <PageSkeleton />
  if (!data) return null

  const majorityPct = (data.majority / data.total_seats) * 100
  const topAlliance = [...data.alliances].sort((a, b) => b.seats - a.seats)[0]
  const runnerAlliance = [...data.alliances].sort((a, b) => b.seats - a.seats)[1]

  // ─────────────────────  KEY INSIGHTS  ─────────────────────
  // Each insight returns { emoji, headline, detail } so the card can render uniformly.
  const insights: Insight[] = []

  // 1. Government formation outcome (majority cleared, hung, narrowly won)
  if (topAlliance) {
    const lead = topAlliance.seats - (runnerAlliance?.seats ?? 0)
    const cleanName = topAlliance.name.replace(/\s*\(.*\)/, '').trim()
    if (topAlliance.seats >= data.majority) {
      const buffer = topAlliance.seats - data.majority
      insights.push({
        emoji: '🏛️', accent: topAlliance.color,
        headline: buffer >= 30
          ? `${cleanName} sweeps to power with a landslide.`
          : buffer >= 10
          ? `${cleanName} forms the government comfortably.`
          : `${cleanName} clears the majority — but only just.`,
        detail: `${topAlliance.seats} seats won out of ${data.total_seats} — that's ${buffer} above the ${data.majority}-seat majority line, leading the runner-up by ${lead}.`,
      })
    } else {
      insights.push({
        emoji: '⚖️', accent: '#f59e0b',
        headline: `Hung assembly — no alliance has a majority.`,
        detail: `${cleanName} is the largest bloc with ${topAlliance.seats} seats, ${data.majority - topAlliance.seats} short of the ${data.majority}-seat majority. Government formation depends on post-poll arithmetic.`,
      })
    }
  }

  // 2. Vote-to-seat efficiency: which alliance over- or under-performed
  // Compute alliance vote shares via the swing data so the numbers match the rest of the dashboard.
  if (swingData && data.alliances.length >= 2) {
    const partyToAlliance: Record<string, string> = {}
    data.parties.forEach(p => { if (p.alliance_id) partyToAlliance[p.party] = p.alliance_id })
    const allianceShare: Record<string, number> = {}
    swingData.swing.forEach(p => {
      const aid = partyToAlliance[p.party] ?? 'others'
      allianceShare[aid] = (allianceShare[aid] ?? 0) + (p.share_2026 ?? 0)
    })
    const top = topAlliance
    if (top) {
      const topVoteShare = allianceShare[top.alliance_id] ?? 0
      const topSeatShare = (top.seats / data.total_seats) * 100
      const gap = topSeatShare - topVoteShare
      const cleanName = top.name.replace(/\s*\(.*\)/, '').trim()
      if (Math.abs(gap) >= 5) {
        insights.push({
          emoji: gap > 0 ? '🎯' : '⚠️', accent: gap > 0 ? '#22c55e' : '#ef4444',
          headline: gap > 0
            ? `${cleanName} converted votes into seats efficiently.`
            : `${cleanName} underperformed on seat conversion.`,
          detail: `Polled ${topVoteShare.toFixed(1)}% of votes but won ${topSeatShare.toFixed(1)}% of seats — a ${Math.abs(gap).toFixed(1)}pp ${gap > 0 ? 'bonus' : 'penalty'} in how votes translated to MLAs.`,
        })
      }
    }
  }

  // 3. Biggest seat swinger vs 2021 (if swing data is available)
  if (swingData?.swing?.length) {
    const meaningful = swingData.swing.filter(p => p.seats_2026 > 0 || p.seats_2021 > 0)
    const sortedByChange = [...meaningful].sort((a, b) => b.seat_change - a.seat_change)
    const gainer = sortedByChange[0]
    const loser = sortedByChange[sortedByChange.length - 1]
    if (gainer && gainer.seat_change > 0 && loser && loser.seat_change < 0) {
      insights.push({
        emoji: '📈', accent: gainer.color,
        headline: `${gainer.party}'s rise, ${loser.party}'s fall.`,
        detail: `${gainer.party} added ${gainer.seat_change} seats (${gainer.seats_2021} → ${gainer.seats_2026}) — the state's biggest gainer. ${loser.party} dropped ${Math.abs(loser.seat_change)} (${loser.seats_2021} → ${loser.seats_2026}) — the biggest faller.`,
      })
    }
  }

  // 4. Pending / declared status — only surface if anything pending
  if (data.declared < data.total_seats) {
    const pending = data.total_seats - data.declared
    insights.push({
      emoji: '⏳', accent: '#facc15',
      headline: `${pending} seat${pending === 1 ? '' : 's'} still pending.`,
      detail: `Results from ${data.declared} of ${data.total_seats} ACs are in; the rest are awaiting declaration. The headline numbers above may shift.`,
    })
  }

  // Build alliance → parties → MLAs map for the modal
  const allianceParties = data.parties.filter(p => p.alliance_id === topAlliance?.alliance_id && p.seats > 0)
  const mlasByParty: Record<string, { name: string; constituency: string; ac_number: number; votes: number }[]> = {}
  ;(winnersData?.candidates ?? []).forEach((c: any) => {
    if (!mlasByParty[c.party]) mlasByParty[c.party] = []
    mlasByParty[c.party].push({ name: c.name, constituency: c.constituency, ac_number: c.ac_number, votes: c.votes })
  })

  // Consolidated Row 1: dropped the standalone "Total Seats" tile — that number
  // is already part of the "Declared" tile's denominator ("30 / 30 declared").
  const kpiCards = [
    {
      label: 'Declared',
      value: `${data.declared} / ${data.total_seats}`,
      onClick: () => navigate(`/${state}/results?winners_only=true`),
      hint: 'See all declared winners',
    },
    {
      label: 'For Majority',
      value: data.majority,
      onClick: () => setMajorityModalOpen(true),
      hint: 'Who forms govt',
    },
    {
      label: 'Leading Alliance',
      value: topAlliance?.name?.replace(/\s*\(.*\)/, '').trim() ?? '—',
      onClick: () => setAllianceModalOpen(true),
      hint: 'View alliance MLAs',
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          State Overview
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>{data.state}</h1>
      </div>

      {state && <StateStoryCard state={state} />}
      <InsightsCard insights={insights} subtitle="Auto-derived from this state's 2026 results" />

      {/* Row 1 — primary KPI cards (3 tiles after the Total-Seats/Declared merge) */}
      <div className="kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {kpiCards.map(k => {
          const clickable = !!k.onClick
          return (
            <div
              key={k.label}
              className="stat-card"
              onClick={k.onClick}
              style={{
                cursor: clickable ? 'pointer' : 'default',
                position: 'relative',
              }}
            >
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                {k.label}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{k.value}</div>
              {k.hint && (
                <div style={{ fontSize: '0.7rem', color: 'var(--accent)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {k.hint} <span style={{ fontSize: '0.85rem' }}>→</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Row 2 — Competition + MLA Profile + NOTA (3 tiles, consolidated from 9 across
          two earlier rows). Removed: Anti-incumbency (full coverage in /swing), MLAs
          with criminal cases (full coverage in /assets), Vote-to-seat tilt (full
          coverage in /swing). Each removed metric still has a dedicated page
          accessible from the sidebar — this row is only the at-a-glance overview. */}
      {kpis && (
        <div className="kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
          <SmallKpi
            emoji="🎯" label="Competition" accent="#f59e0b"
            value={`${kpis.competition.close_contests_lt_5pct}`}
            sub={`close contests (<5%)`}
            secondaryLabel="Avg margin"
            secondaryValue={fmtCompactNum(kpis.competition.avg_margin)}
            hint={kpis.competition.recount_eligible_lt_0_5pct > 0
              ? `${kpis.competition.recount_eligible_lt_0_5pct} recount-eligible (<0.5%)` : undefined}
            onClick={() => setCloseContestsOpen(true)}
            drillLabel="See close-contest list"
          />
          <SmallKpi
            emoji="🧑‍💼" label="MLA profile" accent="#67e8f9"
            value={kpis.demographics.avg_age !== null ? `${kpis.demographics.avg_age} yrs` : '—'}
            sub={kpis.demographics.youngest !== null
              ? `avg age · range ${kpis.demographics.youngest}–${kpis.demographics.oldest}` : 'avg age'}
            secondaryLabel="Typical assets"
            secondaryValue={kpis.demographics.median_assets_cr !== null ? `₹${kpis.demographics.median_assets_cr} cr` : '—'}
            onClick={() => setAgeDistOpen(true)}
            drillLabel="Age + asset breakdown"
          />
          {kpis.nota && (
            <SmallKpi
              emoji="🗳️" label="NOTA" accent="#94a3b8"
              value={`${kpis.nota.nota_share_pct}%`}
              sub={`${fmtCompact(kpis.nota.total_nota_votes)} of ${fmtCompact(kpis.nota.polled_votes)} polled`}
              secondaryLabel="Decided seats"
              secondaryValue={`${kpis.nota.nota_decided_count}`}
              hint={kpis.nota.nota_decided_count > 0
                ? `${kpis.nota.nota_decided_count} seat${kpis.nota.nota_decided_count === 1 ? '' : 's'} where NOTA > margin` : undefined}
              onClick={kpis.nota.nota_decided_count > 0 ? () => setNotaOpen(true) : undefined}
              drillLabel="See NOTA-decided seats"
            />
          )}
        </div>
      )}

      {/* Drill-deeper hint row — small links pointing at the dedicated pages
          for the metrics we removed from the tile grid. Keeps the headline
          numbers one click away without re-crowding the page. */}
      <div style={{
        display: 'flex', gap: '0.6rem', marginBottom: '1.5rem',
        fontSize: '0.78rem', flexWrap: 'wrap',
      }}>
        <button
          onClick={() => navigate(`/${state}/swing`)}
          style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#fca5a5', padding: '0.35rem 0.7rem', borderRadius: 6, cursor: 'pointer',
            fontWeight: 600,
          }}
        >🔁 Anti-incumbency → Swing & Trends</button>
        <button
          onClick={() => navigate(`/${state}/assets`)}
          style={{
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)',
            color: '#f87171', padding: '0.35rem 0.7rem', borderRadius: 6, cursor: 'pointer',
            fontWeight: 600,
          }}
        >⚖️ Criminal MLAs → Criminality & Assets</button>
        <button
          onClick={() => navigate(`/${state}/swing`)}
          style={{
            background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.3)',
            color: '#a78bfa', padding: '0.35rem 0.7rem', borderRadius: 6, cursor: 'pointer',
            fontWeight: 600,
          }}
        >📊 Vote-to-seat tilt → Swing & Trends</button>
      </div>

      {/* NOTA-Decided Seats — inline list so users SEE the actual seats
          without clicking. The tile in Row 2 stays for the at-a-glance count;
          this card surfaces the seat-level detail (top 5 by shock factor). */}
      {kpis?.nota && kpis.nota.nota_decided_count > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <div>
              <div className="section-title" style={{ marginBottom: 2 }}>
                ⚠️ NOTA-Decided Seats ({kpis.nota.nota_decided_count})
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Seats where the NOTA vote exceeded the winning margin — voter dissatisfaction that <em>could</em> have changed the outcome.
              </div>
            </div>
            {kpis.nota.nota_decided_count > 5 && (
              <button
                onClick={() => setNotaOpen(true)}
                style={{
                  padding: '0.4rem 0.85rem', borderRadius: 8,
                  background: 'rgba(245,158,11,0.12)', color: '#fbbf24',
                  border: '1px solid rgba(245,158,11,0.40)',
                  cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem',
                }}>
                See all {kpis.nota.nota_decided_count} seats →
              </button>
            )}
          </div>

          <SortableGridHeader
            sort={notaSort.sort}
            onSort={notaSort.onSort}
            gridTemplate="46px 1fr 90px 90px 90px"
            columns={[
              { key: 'ac_number',          label: 'AC#' },
              { key: 'name',               label: 'Constituency · Winner' },
              { key: 'margin',             label: 'Margin',          align: 'right' },
              { key: 'nota_votes',         label: 'NOTA votes',      align: 'right' },
              { key: 'nota_over_margin_x', label: 'NOTA ÷ margin',   align: 'right' },
            ]}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {notaSort.sorted.slice(0, 5).map(s => {
              const ratioColor = s.nota_over_margin_x >= 10 ? '#ef4444' : s.nota_over_margin_x >= 3 ? '#f59e0b' : '#facc15'
              return (
                <div key={s.ac_number}
                  onClick={() => navigate(`/${state}/constituencies/${s.ac_number}`)}
                  title={`Open ${s.name} detail`}
                  style={{
                    display: 'grid', gridTemplateColumns: '46px 1fr 90px 90px 90px', gap: '0.6rem',
                    alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: 8,
                    background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.30)',
                    cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.14)'; e.currentTarget.style.borderColor = 'rgba(245,158,11,0.55)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.06)'; e.currentTarget.style.borderColor = 'rgba(245,158,11,0.30)' }}
                >
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>AC#{s.ac_number}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.86rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.name}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      <span style={{ fontWeight: 700 }}>{s.winner_party}</span> · {s.winner}
                    </div>
                  </div>
                  <span className="tabular" style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.84rem', color: '#f59e0b' }}>
                    {s.margin.toLocaleString('en-IN')}
                  </span>
                  <span className="tabular" style={{ textAlign: 'right', fontSize: '0.82rem' }}>
                    {s.nota_votes.toLocaleString('en-IN')}
                  </span>
                  <span className="tabular" style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.86rem', color: ratioColor }}
                        title="How many times bigger NOTA was than the margin">
                    {s.nota_over_margin_x}×
                  </span>
                </div>
              )
            })}
          </div>

          {kpis.nota.nota_decided_count > 5 && (
            <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
              Showing top 5 by NOTA-to-margin ratio · {kpis.nota.nota_decided_count - 5} more in the full list →
            </div>
          )}
        </div>
      )}

      {/* Seat tally bar */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="section-title">Seat Tally</div>
        <div style={{ marginBottom: '0.75rem' }}>
          {data.alliances.map(a => (
            <div key={a.alliance_id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 8 }}>
              <div style={{ width: 120, fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                {a.name.split('(')[0].trim()}
              </div>
              <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 4, height: 20, overflow: 'hidden' }}>
                <div style={{
                  width: `${(a.seats / data.total_seats) * 100}%`,
                  height: '100%',
                  background: a.color,
                  borderRadius: 4,
                  transition: 'width 0.6s ease',
                }} />
              </div>
              <div style={{ width: 40, fontSize: '0.875rem', fontWeight: 600, textAlign: 'right' }}>{a.seats}</div>
            </div>
          ))}
          {/* Majority marker */}
          <div style={{ position: 'relative', marginTop: 8 }}>
            <div style={{ fontSize: '0.7rem', color: '#eab308', marginLeft: `calc(${majorityPct}% - 2px)` }}>
              ▲ Majority ({data.majority})
            </div>
          </div>
        </div>
      </div>

      {/* Party-wise seats bar — alliance-level totals already shown in the Seat Tally above,
          so this view focuses on the within-alliance party split. */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Party-wise Seats (Top 8)</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            Dashed line = <span style={{ color: '#eab308', fontWeight: 700 }}>{data.majority}-seat majority</span> threshold
          </div>
        </div>
        <ResponsiveContainer width="100%" height={290}>
          <BarChart data={data.parties.slice(0, 8)} layout="vertical" margin={{ left: 10, right: 56, top: 8, bottom: 6 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tick={axisTickStyle} domain={[0, Math.max(data.majority, data.parties[0]?.seats ?? 0) * 1.05]} />
            <YAxis type="category" dataKey="party" width={70} tick={axisTickStyle} />
            <Tooltip
              cursor={{ fill: 'rgba(167,139,250,0.06)' }}
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              formatter={(v, _n, p: any) => {
                const seats = Number(v)
                const pct = ((seats / data.total_seats) * 100).toFixed(1)
                return [`${seats} seats · ${pct}% of ${data.total_seats}`, p?.payload?.full_name ?? p?.payload?.party]
              }}
              labelFormatter={(label, items) => {
                const p = (items?.[0]?.payload as any)
                const gap = (p?.seats ?? 0) - data.majority
                return `${label}${p?.full_name ? ' · ' + p.full_name : ''} · ${gap >= 0 ? '+' : ''}${gap} vs majority`
              }}
            />
            {/* Majority threshold marker so the chart shows context, not just bars */}
            <ReferenceLine x={data.majority} {...refLineStyle}
              label={{ value: `Majority ${data.majority}`, position: 'top', fill: '#eab308', fontSize: 10, fontWeight: 700 }}
            />
            <Bar dataKey="seats" radius={[0, 4, 4, 0]}>
              {data.parties.slice(0, 8).map(p => <Cell key={p.party} fill={p.color} />)}
              <LabelList dataKey="seats" position="right" fill="var(--text-primary)" fontSize={11} fontWeight={700} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ──────────────  Alliance MLA modal  ────────────── */}
      {allianceModalOpen && topAlliance && (
        <div
          onClick={() => setAllianceModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(7, 9, 26, 0.78)',
            backdropFilter: 'blur(6px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '4rem 1rem 2rem',
            overflowY: 'auto',
            animation: 'fadeInUp 0.25s ease-out',
          }}
        >
          <div
            className="card"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 760,
              width: '100%',
              borderLeft: `4px solid ${topAlliance.color}`,
              maxHeight: '85vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Leading Alliance
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: topAlliance.color, marginBottom: 4 }}>
                  {topAlliance.name}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {topAlliance.seats} seats · {allianceParties.length} {allianceParties.length === 1 ? 'party' : 'parties'} with elected MLAs
                </div>
              </div>
              <button
                onClick={() => setAllianceModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  borderRadius: 8,
                  padding: '0.35rem 0.75rem',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                Close ✕
              </button>
            </div>

            {allianceParties.length === 0 && (
              <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                No MLAs in this alliance.
              </div>
            )}

            {allianceParties.map(p => {
              const mlas = (mlasByParty[p.party] ?? []).sort((a, b) => b.votes - a.votes)
              return (
                <div key={p.party} style={{ marginBottom: '1.5rem' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: '0.6rem',
                    paddingBottom: '0.5rem',
                    borderBottom: `1px solid ${p.color}33`,
                  }}>
                    <PartyLogo party={p.party} size={26} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: p.color, fontSize: '1rem' }}>{p.party}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{p.full_name}</div>
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: p.color }}>
                      {p.seats}
                      <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 4 }}>seats</span>
                    </div>
                  </div>
                  {mlas.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 6 }}>
                      {mlas.map(mla => (
                        <div
                          key={`${mla.ac_number}-${mla.name}`}
                          onClick={() => {
                            setAllianceModalOpen(false)
                            navigate(`/${state}/constituencies/${mla.ac_number}`)
                          }}
                          style={{
                            padding: '0.5rem 0.75rem',
                            borderRadius: 8,
                            background: `${p.color}10`,
                            border: `1px solid ${p.color}25`,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = `${p.color}22`
                            e.currentTarget.style.borderColor = `${p.color}55`
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = `${p.color}10`
                            e.currentTarget.style.borderColor = `${p.color}25`
                          }}
                        >
                          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{mla.name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                            AC {mla.ac_number} · {mla.constituency} · {fmtIN(mla.votes)} votes
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '0.3rem 0' }}>
                      MLA names loading or unavailable…
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ──────────────  Close Contests modal  ────────────── */}
      {closeContestsOpen && (() => {
        // Sort state is maintained at component scope (closeContestsSort) so
        // we can call useSortable outside the conditional render.
        const allClose = closeContestsSort.sorted
        const recount = allClose.filter((c: any) => c.recount_eligible)
        const justClose = allClose.filter((c: any) => !c.recount_eligible)

        // Reusable row renderer so the recount + close sections look identical.
        const renderRow = (c: any) => (
          <div key={c.ac_number}
            onClick={() => { setCloseContestsOpen(false); navigate(`/${state}/constituencies/${c.ac_number}`) }}
            title={`Open ${c.name} detail`}
            style={{
              display: 'grid', gridTemplateColumns: '46px 1fr auto 90px 92px', gap: '0.6rem',
              alignItems: 'center', padding: '0.55rem 0.75rem', borderRadius: 8,
              background: c.recount_eligible ? 'rgba(239,68,68,0.10)' : `${c.color}10`,
              border: c.recount_eligible ? '1px solid rgba(239,68,68,0.45)' : `1px solid ${c.color}30`,
              cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = c.recount_eligible ? 'rgba(239,68,68,0.18)' : `${c.color}1f`
              e.currentTarget.style.borderColor = c.recount_eligible ? 'rgba(239,68,68,0.75)' : `${c.color}66`
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = c.recount_eligible ? 'rgba(239,68,68,0.10)' : `${c.color}10`
              e.currentTarget.style.borderColor = c.recount_eligible ? 'rgba(239,68,68,0.45)' : `${c.color}30`
            }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>AC#{c.ac_number}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.name}
                </span>
                {c.recount_eligible && (
                  <span style={{
                    fontSize: '0.58rem', fontWeight: 800, padding: '0.1rem 0.4rem',
                    borderRadius: 4, background: 'rgba(239,68,68,0.18)', color: '#fca5a5',
                    border: '1px solid rgba(239,68,68,0.45)',
                    textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0,
                  }}>⚠ Recount</span>
                )}
              </div>
              <div style={{ fontSize: '0.7rem', color: c.color, fontWeight: 600 }}>
                {c.party} · {c.winner}
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {c.runner_up_party ? (
                <span>vs <span style={{ color: c.runner_up_color, fontWeight: 700 }}>{c.runner_up_party}</span></span>
              ) : '—'}
            </div>
            <span className="tabular" style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.85rem', color: c.recount_eligible ? '#f87171' : '#f59e0b' }}>
              {c.margin.toLocaleString('en-IN')}
            </span>
            <span className="tabular" style={{
              textAlign: 'right', fontWeight: 800, fontSize: '0.85rem',
              color: c.recount_eligible ? '#f87171' : '#f59e0b',
            }}>
              {c.margin_pct.toFixed(2)}%
            </span>
          </div>
        )

        // Sortable header — uses the same useSortable instance for both
        // sections, so clicking a column reorders both lists consistently.
        const headerRow = (
          <SortableGridHeader
            sort={closeContestsSort.sort}
            onSort={closeContestsSort.onSort}
            gridTemplate="46px 1fr auto 90px 92px"
            columns={[
              { key: 'ac_number',       label: 'AC#' },
              { key: 'name',            label: 'Constituency · Winner' },
              { key: 'runner_up_party', label: 'vs Runner-up', align: 'right' },
              { key: 'margin',          label: 'Margin',       align: 'right' },
              { key: 'margin_pct',      label: 'Margin %',     align: 'right' },
            ]}
          />
        )

        return (
          <div onClick={() => setCloseContestsOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(7, 9, 26, 0.78)', backdropFilter: 'blur(6px)',
              zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
              padding: '4rem 1rem 2rem', overflowY: 'auto',
            }}>
            <div className="card" onClick={e => e.stopPropagation()}
              style={{ maxWidth: 860, width: '100%', borderLeft: '4px solid #f59e0b', maxHeight: '85vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                    🎯 Close Contests
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b' }}>
                    {allClose.length} seat{allClose.length === 1 ? '' : 's'} decided by &lt; 5% margin
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                    Sorted by tightest first.
                  </div>
                </div>
                <button onClick={() => setCloseContestsOpen(false)}
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                           borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                  Close ✕
                </button>
              </div>

              {/* Headline metric strip — surfaces recount-eligible count alongside the close-contest total */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div style={{
                  padding: '0.7rem 0.85rem', borderRadius: 10,
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)',
                }}>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: 3 }}>
                    Close contests
                  </div>
                  <div className="tabular" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b' }}>
                    {allClose.length}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>margin &lt; 5%</div>
                </div>
                <div style={{
                  padding: '0.7rem 0.85rem', borderRadius: 10,
                  background: recount.length > 0 ? 'rgba(239,68,68,0.10)' : 'rgba(34,197,94,0.06)',
                  border: recount.length > 0 ? '1px solid rgba(239,68,68,0.40)' : '1px solid rgba(34,197,94,0.30)',
                }}>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: 3 }}>
                    ⚠ Recount-eligible
                  </div>
                  <div className="tabular" style={{ fontSize: '1.5rem', fontWeight: 800, color: recount.length > 0 ? '#f87171' : '#22c55e' }}>
                    {recount.length}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    margin &lt; 0.5% of polled · qualifies under Rule 56(C)
                  </div>
                </div>
              </div>

              {allClose.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  No close contests in this state — every seat was decided by more than 5%.
                </div>
              )}

              {/* Recount-eligible section — highlighted at the top when applicable */}
              {recount.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#fca5a5',
                                   padding: '0.2rem 0.55rem', borderRadius: 999,
                                   background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.50)',
                                   textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      ⚠ Recount-eligible ({recount.length})
                    </span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      Margin under 0.5% of polled votes — Rule 56(C) of the Conduct of Election Rules permits a recount request.
                    </span>
                  </div>
                  {headerRow}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {recount.map(renderRow)}
                  </div>
                </div>
              )}

              {/* Other close contests (≥ 0.5%, < 5%) */}
              {justClose.length > 0 && (
                <div>
                  {recount.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#fbbf24',
                                     padding: '0.2rem 0.55rem', borderRadius: 999,
                                     background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.40)',
                                     textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        Close ({justClose.length})
                      </span>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                        Margin between 0.5% and 5% — competitive, but above the recount threshold.
                      </span>
                    </div>
                  )}
                  {headerRow}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {justClose.map(renderRow)}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 12, fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic',
                            padding: '0.5rem 0.7rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                Click any row to open the constituency's full breakdown.
              </div>
            </div>
          </div>
        )
      })()}

      {/* ──────────────  Margin Distribution modal  ────────────── */}
      {marginDistOpen && (() => {
        const decided = (constituencies ?? []).filter((c: any) => c.party && c.margin > 0)
        const buckets = [
          { label: '< 1k',          range: [0, 1000],         color: '#ef4444' },
          { label: '1k – 5k',       range: [1000, 5000],      color: '#f59e0b' },
          { label: '5k – 10k',      range: [5000, 10000],     color: '#facc15' },
          { label: '10k – 25k',     range: [10000, 25000],    color: '#a3e635' },
          { label: '25k – 50k',     range: [25000, 50000],    color: '#22c55e' },
          { label: '50k+',          range: [50000, Infinity], color: '#16a34a' },
        ].map(b => ({ ...b, count: decided.filter((c: any) => c.margin >= b.range[0] && c.margin < b.range[1]).length }))
        const maxCount = Math.max(...buckets.map(b => b.count), 1)
        return (
          <div onClick={() => setMarginDistOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,26,0.78)', backdropFilter: 'blur(6px)',
                     zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                     padding: '4rem 1rem 2rem', overflowY: 'auto' }}>
            <div className="card" onClick={e => e.stopPropagation()}
              style={{ maxWidth: 720, width: '100%', borderLeft: '4px solid #22c55e', maxHeight: '85vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                    📏 Margin Distribution
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#22c55e' }}>
                    {decided.length} declared seats
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                    avg <strong>{fmtCompactNum(kpis?.competition.avg_margin ?? 0)}</strong> · median <strong>{fmtCompactNum(kpis?.competition.median_margin ?? 0)}</strong>
                  </div>
                </div>
                <button onClick={() => setMarginDistOpen(false)}
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                           borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                  Close ✕
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {buckets.map(b => {
                  const widthPct = (b.count / maxCount) * 100
                  return (
                    <div key={b.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, color: b.color }}>{b.label}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          <strong className="tabular" style={{ color: 'var(--text-primary)' }}>{b.count}</strong> seat{b.count === 1 ? '' : 's'} ({decided.length ? Math.round(b.count / decided.length * 100) : 0}%)
                        </span>
                      </div>
                      <div style={{ height: 14, borderRadius: 4, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                        <div style={{
                          width: `${widthPct}%`, height: '100%',
                          background: `linear-gradient(90deg, ${b.color} 0%, ${b.color}cc 100%)`,
                          borderRadius: 4, transition: 'width 0.6s cubic-bezier(0.22,1,0.36,1)',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop: 14, fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic',
                            padding: '0.5rem 0.7rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                Tight margins (left) signal closely contested seats — anti-incumbency risk. Wide margins (right) signal strongholds.
              </div>
            </div>
          </div>
        )
      })()}

      {/* ──────────────  Age Distribution modal  ────────────── */}
      {ageDistOpen && kpis && (() => {
        const dist = kpis.demographics.age_distribution
        const buckets = [
          { key: 'u35'   as const, label: 'Under 35', range: '< 35',  color: '#22c55e' },
          { key: '35_44' as const, label: '35 – 44',  range: '35-44', color: '#4ade80' },
          { key: '45_54' as const, label: '45 – 54',  range: '45-54', color: '#a78bfa' },
          { key: '55_64' as const, label: '55 – 64',  range: '55-64', color: '#f59e0b' },
          { key: '65p'   as const, label: '65 and over', range: '65+', color: '#ef4444' },
        ].map(b => ({ ...b, count: dist[b.key] ?? 0 }))
        const totalWithAge = buckets.reduce((s, b) => s + b.count, 0)
        const maxCount = Math.max(...buckets.map(b => b.count), 1)
        // Surface the actual youngest / oldest MLAs (with constituency) from
        // the already-loaded winners list — much more useful than a bare number.
        const allWinners = (winnersData?.candidates ?? []).filter((c: any) => c.age != null)
        const youngest3 = [...allWinners].sort((a: any, b: any) => a.age - b.age).slice(0, 3)
        const oldest3   = [...allWinners].sort((a: any, b: any) => b.age - a.age).slice(0, 3)
        return (
          <div onClick={() => setAgeDistOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,26,0.78)', backdropFilter: 'blur(6px)',
                     zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                     padding: '4rem 1rem 2rem', overflowY: 'auto' }}>
            <div className="card" onClick={e => e.stopPropagation()}
              style={{ maxWidth: 780, width: '100%', borderLeft: '4px solid #67e8f9', maxHeight: '85vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                    🎂 MLA Age Distribution
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#67e8f9' }}>
                    Avg {kpis.demographics.avg_age} yrs · range {kpis.demographics.youngest}–{kpis.demographics.oldest}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                    Based on <strong>{totalWithAge}</strong> of {kpis.declared} winning MLAs (where age was published in affidavit).
                  </div>
                </div>
                <button onClick={() => setAgeDistOpen(false)}
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                           borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                  Close ✕
                </button>
              </div>

              {/* Bucketed bar chart */}
              <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8 }}>
                Distribution by age bracket
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {buckets.map(b => {
                  const widthPct = (b.count / maxCount) * 100
                  const pctOfTotal = totalWithAge ? Math.round((b.count / totalWithAge) * 100) : 0
                  return (
                    <div key={b.key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, color: b.color }}>{b.label}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          <strong className="tabular" style={{ color: 'var(--text-primary)' }}>{b.count}</strong> MLA{b.count === 1 ? '' : 's'} ({pctOfTotal}%)
                        </span>
                      </div>
                      <div style={{ height: 14, borderRadius: 4, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                        <div style={{
                          width: `${widthPct}%`, height: '100%',
                          background: `linear-gradient(90deg, ${b.color} 0%, ${b.color}cc 100%)`,
                          borderRadius: 4, transition: 'width 0.6s cubic-bezier(0.22,1,0.36,1)',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Youngest / Oldest spotlights */}
              {youngest3.length > 0 && (
                <div className="col-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                  <div style={{ padding: '0.85rem 1rem', borderRadius: 10, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.30)' }}>
                    <div style={{ fontSize: '0.66rem', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8 }}>
                      👶 Youngest MLAs
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {youngest3.map((c: any) => (
                        <div key={c.ac_number}
                          onClick={() => { setAgeDistOpen(false); navigate(`/${state}/constituencies/${c.ac_number}`) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem' }}
                          title={`Open AC ${c.ac_number} ${c.constituency}`}>
                          <span className="tabular" style={{ fontWeight: 800, color: '#22c55e', minWidth: 30 }}>{c.age}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                              <span style={{ color: c.color, fontWeight: 700 }}>{c.party}</span> · AC {c.ac_number} {c.constituency}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: '0.85rem 1rem', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.30)' }}>
                    <div style={{ fontSize: '0.66rem', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8 }}>
                      🎓 Oldest MLAs
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {oldest3.map((c: any) => (
                        <div key={c.ac_number}
                          onClick={() => { setAgeDistOpen(false); navigate(`/${state}/constituencies/${c.ac_number}`) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem' }}
                          title={`Open AC ${c.ac_number} ${c.constituency}`}>
                          <span className="tabular" style={{ fontWeight: 800, color: '#ef4444', minWidth: 30 }}>{c.age}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                              <span style={{ color: c.color, fontWeight: 700 }}>{c.party}</span> · AC {c.ac_number} {c.constituency}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={() => { setAgeDistOpen(false); navigate(`/${state}/assets`) }}
                style={{
                  marginTop: 14, width: '100%', textAlign: 'left',
                  fontSize: '0.78rem', color: 'var(--accent)',
                  padding: '0.6rem 0.85rem', background: 'rgba(167,139,250,0.08)',
                  border: '1px solid rgba(167,139,250,0.30)', borderRadius: 8,
                  cursor: 'pointer', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.16)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.55)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.08)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.30)' }}
              >
                <span>📋</span>
                <span style={{ flex: 1 }}>For per-MLA biographical detail, open <strong style={{ color: 'var(--text-primary)' }}>Criminality & Assets</strong></span>
                <span style={{ fontSize: '0.85rem' }}>→</span>
              </button>
            </div>
          </div>
        )
      })()}

      {/* ──────────────  NOTA-decided Seats modal  ────────────── */}
      {notaOpen && kpis && (() => {
        const seats = notaSort.sorted
        return (
          <div onClick={() => setNotaOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,26,0.78)', backdropFilter: 'blur(6px)',
                     zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                     padding: '4rem 1rem 2rem', overflowY: 'auto' }}>
            <div className="card" onClick={e => e.stopPropagation()}
              style={{ maxWidth: 880, width: '100%', borderLeft: '4px solid #f59e0b', maxHeight: '85vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                    ⚠️ NOTA-decided Seats
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f59e0b' }}>
                    {seats.length} seat{seats.length === 1 ? '' : 's'} where NOTA exceeded the winning margin
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>
                    If NOTA voters had picked any other candidate, these races <em>could</em> have flipped. Sorted by NOTA-to-margin ratio (most "shockable" first).
                  </div>
                </div>
                <button onClick={() => setNotaOpen(false)}
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                           borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                  Close ✕
                </button>
              </div>

              {seats.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  No seats where NOTA exceeded the margin — every winning margin was wider than the local NOTA vote.
                </div>
              )}

              {seats.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <SortableGridHeader
                    sort={notaSort.sort}
                    onSort={notaSort.onSort}
                    gridTemplate="46px 1fr 110px 90px 90px 80px"
                    columns={[
                      { key: 'ac_number',          label: 'AC#' },
                      { key: 'name',               label: 'Constituency · Winner' },
                      { key: 'margin',             label: 'Margin',          align: 'right' },
                      { key: 'nota_votes',         label: 'NOTA votes',      align: 'right' },
                      { key: 'nota_over_margin_x', label: 'NOTA ÷ margin',   align: 'right' },
                      { key: '_open',              label: 'Open',            align: 'right', sortable: false },
                    ]}
                  />
                  {seats.map(s => {
                    const ratioColor = s.nota_over_margin_x >= 10 ? '#ef4444' : s.nota_over_margin_x >= 3 ? '#f59e0b' : '#facc15'
                    return (
                      <div key={s.ac_number}
                        onClick={() => { setNotaOpen(false); navigate(`/${state}/constituencies/${s.ac_number}`) }}
                        style={{
                          display: 'grid', gridTemplateColumns: '46px 1fr 110px 90px 90px 80px', gap: '0.6rem',
                          alignItems: 'center', padding: '0.55rem 0.75rem', borderRadius: 8,
                          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.30)',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.14)'; e.currentTarget.style.borderColor = 'rgba(245,158,11,0.55)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.06)'; e.currentTarget.style.borderColor = 'rgba(245,158,11,0.30)' }}
                      >
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>AC#{s.ac_number}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {s.name}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            <span style={{ fontWeight: 700 }}>{s.winner_party}</span> · {s.winner}
                          </div>
                        </div>
                        <span className="tabular" style={{ textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>
                          {s.margin.toLocaleString('en-IN')}
                        </span>
                        <span className="tabular" style={{ textAlign: 'right', fontWeight: 600 }}>
                          {s.nota_votes.toLocaleString('en-IN')}
                        </span>
                        <span className="tabular" style={{ textAlign: 'right', fontWeight: 800, color: ratioColor }}
                              title="How many times bigger NOTA was than the margin">
                          {s.nota_over_margin_x}×
                        </span>
                        <span style={{ textAlign: 'right', fontSize: '0.66rem', color: 'var(--accent)' }}>open →</span>
                      </div>
                    )
                  })}
                </div>
              )}

              <div style={{ marginTop: 12, fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic',
                            padding: '0.5rem 0.7rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                "NOTA ÷ margin" of 10× means there were ten times as many NOTA voters as the winning margin — a strong signal of voter dissatisfaction in that AC.
              </div>
            </div>
          </div>
        )
      })()}

      {/* ──────────────  Anti-incumbency modal  ────────────── */}
      {antiIncOpen && (() => {
        // Sort state lives on component scope (antiIncSort), data was computed in the
        // antiIncFlipped useMemo above. The flow summary still uses the raw list
        // because it's a count aggregation, not a sortable view.
        const flipped = antiIncSort.sorted
        // Aggregate by from→to flow
        const flowMap: Record<string, { from: string; to: string; fromColor: string; toColor: string; count: number }> = {}
        antiIncFlipped.forEach((a: any) => {
          const key = `${a.winner_party_2021}→${a.winner_party_2026}`
          if (!flowMap[key]) flowMap[key] = {
            from: a.winner_party_2021, to: a.winner_party_2026,
            fromColor: a.winner_party_2021_color, toColor: a.winner_party_2026_color, count: 0,
          }
          flowMap[key].count++
        })
        const flows = Object.values(flowMap).sort((a, b) => b.count - a.count)
        return (
          <div onClick={() => setAntiIncOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,26,0.78)', backdropFilter: 'blur(6px)',
                     zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                     padding: '4rem 1rem 2rem', overflowY: 'auto' }}>
            <div className="card" onClick={e => e.stopPropagation()}
              style={{ maxWidth: 880, width: '100%', borderLeft: '4px solid #ef4444', maxHeight: '85vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                    🔁 Anti-incumbency
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ef4444' }}>
                    {kpis?.incumbency.anti_incumbency_pct}% of seats flipped party
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                    {kpis?.incumbency.flipped_seats} of {kpis?.incumbency.matched_2021_seats} matched 2021 seats changed hands.
                  </div>
                </div>
                <button onClick={() => setAntiIncOpen(false)}
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                           borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                  Close ✕
                </button>
              </div>

              {/* Flow summary */}
              {flows.length > 0 && (
                <>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8 }}>
                    Party-to-party flow
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
                    {flows.map(f => (
                      <span key={`${f.from}-${f.to}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                                 padding: '0.35rem 0.65rem', borderRadius: 999,
                                 background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                        <span style={{ color: f.fromColor, fontWeight: 700, fontSize: '0.78rem' }}>{f.from}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>→</span>
                        <span style={{ color: f.toColor, fontWeight: 700, fontSize: '0.78rem' }}>{f.to}</span>
                        <span className="tabular" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: 4 }}>×{f.count}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}

              {/* All flipped seats — sortable */}
              <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8 }}>
                {flipped.length} flipped seat{flipped.length === 1 ? '' : 's'} · click a column to sort
              </div>
              <SortableGridHeader
                sort={antiIncSort.sort}
                onSort={antiIncSort.onSort}
                gridTemplate="46px 1fr auto auto 80px"
                columns={[
                  { key: 'ac_number',         label: 'AC#' },
                  { key: 'name',              label: 'Constituency · District' },
                  { key: 'winner_party_2021', label: 'From → To', align: 'right' },
                  { key: 'margin_2026',       label: 'Margin',    align: 'right' },
                  { key: '_open',             label: 'Open',      align: 'right', sortable: false },
                ]}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {flipped.slice(0, 30).map((a: any) => (
                  <div key={a.ac_number}
                    onClick={() => { setAntiIncOpen(false); navigate(`/${state}/constituencies/${a.ac_number}`) }}
                    style={{
                      display: 'grid', gridTemplateColumns: '46px 1fr auto auto 80px', gap: '0.6rem',
                      alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: 8,
                      background: `${a.winner_party_2026_color}10`, border: `1px solid ${a.winner_party_2026_color}30`,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = `${a.winner_party_2026_color}1f`; e.currentTarget.style.borderColor = `${a.winner_party_2026_color}66` }}
                    onMouseLeave={e => { e.currentTarget.style.background = `${a.winner_party_2026_color}10`; e.currentTarget.style.borderColor = `${a.winner_party_2026_color}30` }}
                  >
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>AC#{a.ac_number}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.86rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.name}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{a.district}</div>
                    </div>
                    <span style={{ fontSize: '0.78rem' }}>
                      <span style={{ color: a.winner_party_2021_color, fontWeight: 700 }}>{a.winner_party_2021}</span>
                      <span style={{ color: 'var(--text-muted)', margin: '0 5px' }}>→</span>
                      <span style={{ color: a.winner_party_2026_color, fontWeight: 700 }}>{a.winner_party_2026}</span>
                    </span>
                    <span className="tabular" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#22c55e', textAlign: 'right', minWidth: 70 }}>
                      +{(a.margin_2026 ?? 0).toLocaleString('en-IN')}
                    </span>
                    <span style={{ fontSize: '0.66rem', color: 'var(--accent)', textAlign: 'right' }}>open →</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => { setAntiIncOpen(false); navigate(`/${state}/swing#district-churn`) }}
                style={{
                  marginTop: 12, width: '100%', textAlign: 'left',
                  fontSize: '0.78rem', color: 'var(--accent)', fontStyle: 'italic',
                  padding: '0.6rem 0.85rem', background: 'rgba(167,139,250,0.08)',
                  border: '1px solid rgba(167,139,250,0.30)', borderRadius: 8,
                  cursor: 'pointer', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.16)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.55)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.08)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.30)' }}
              >
                <span>📊</span>
                <span style={{ flex: 1, fontStyle: 'normal' }}>
                  For the full per-district flip view, open <strong style={{ color: 'var(--text-primary)' }}>Swing & Trends → District Churn</strong>
                </span>
                <span style={{ fontSize: '0.85rem' }}>→</span>
              </button>
            </div>
          </div>
        )
      })()}

      {/* ──────────────  Vote-to-seat Tilt modal  ────────────── */}
      {efficiencyOpen && kpis && (
        <div onClick={() => setEfficiencyOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,26,0.78)', backdropFilter: 'blur(6px)',
                   zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                   padding: '4rem 1rem 2rem', overflowY: 'auto' }}>
          <div className="card" onClick={e => e.stopPropagation()}
            style={{ maxWidth: 760, width: '100%', borderLeft: `4px solid ${kpis.efficiency[0]?.color ?? 'var(--accent)'}`, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  📊 Vote-to-seat Conversion
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  How efficiently each alliance turned votes into seats
                </div>
              </div>
              <button onClick={() => setEfficiencyOpen(false)}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                         borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                Close ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {kpis.efficiency.map(e => {
                const tiltColor = e.delta_pp > 5 ? '#22c55e' : e.delta_pp < -5 ? '#ef4444' : 'var(--text-secondary)'
                return (
                  <div key={e.alliance_id} style={{ padding: '0.85rem 1rem', borderRadius: 10,
                                                    border: `1px solid ${e.color}40`, background: `${e.color}08` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ color: e.color, fontWeight: 700, fontSize: '0.92rem' }}>
                        {e.alliance_name}
                      </span>
                      <span className="tabular" style={{ fontWeight: 800, fontSize: '1rem', color: tiltColor }}>
                        {e.delta_pp > 0 ? '+' : ''}{e.delta_pp}pp tilt
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 90px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Vote share</span>
                      <div style={{ height: 12, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                        <div style={{ width: `${e.vote_share}%`, height: '100%', background: `${e.color}80`, borderRadius: 3 }} />
                      </div>
                      <span className="tabular" style={{ fontSize: '0.85rem', fontWeight: 700, textAlign: 'right' }}>{e.vote_share}%</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 90px', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Seat share</span>
                      <div style={{ height: 12, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                        <div style={{ width: `${e.seat_share}%`, height: '100%', background: e.color, borderRadius: 3 }} />
                      </div>
                      <span className="tabular" style={{ fontSize: '0.85rem', fontWeight: 700, textAlign: 'right', color: e.color }}>{e.seat_share}%</span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ marginTop: 14, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5,
                          padding: '0.7rem 0.85rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Reading the tilt:</strong>{' '}
              <span style={{ color: '#22c55e', fontWeight: 700 }}>Positive (+pp)</span> means the alliance won a higher share of <em>seats</em> than its share of <em>votes</em> — an efficiency bonus from concentrated wins.{' '}
              <span style={{ color: '#ef4444', fontWeight: 700 }}>Negative (−pp)</span> means votes were spread too thin to convert into seats. Large positive tilts (≥10pp) usually indicate a dominant front benefitting from first-past-the-post.
            </div>
          </div>
        </div>
      )}

      {/* ──────────────  Government Formation modal  ────────────── */}
      {majorityModalOpen && (() => {
        const sortedAlliances = [...data.alliances].sort((a, b) => b.seats - a.seats)
        // Honour the explicit government_formation override (e.g., TN post-poll)
        const gov = data.government_formation
        const overrideAlliance = gov
          ? data.alliances.find(a => a.alliance_id === gov.primary_alliance_id)
          : null
        const winning = overrideAlliance ?? sortedAlliances[0]
        const winningSeats = gov ? gov.primary_seats : (winning?.seats ?? 0)
        const totalSupport = gov ? gov.total_supporting : winningSeats
        const hasClearMajority = totalSupport >= data.majority
        const govtParties = data.parties.filter(p => p.alliance_id === winning?.alliance_id && p.seats > 0)
        const overshoot = totalSupport - data.majority
        const winningPct = (winningSeats / data.total_seats) * 100
        const coalitionPct = gov ? (gov.coalition_seats / data.total_seats) * 100 : 0
        const outsidePct = gov ? (gov.outside_support_seats / data.total_seats) * 100 : 0

        return (
          <div
            onClick={() => setMajorityModalOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(7, 9, 26, 0.78)',
              backdropFilter: 'blur(6px)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              padding: '4rem 1rem 2rem',
              overflowY: 'auto',
              animation: 'fadeInUp 0.25s ease-out',
            }}
          >
            <div
              className="card"
              onClick={e => e.stopPropagation()}
              style={{
                maxWidth: 720,
                width: '100%',
                borderLeft: `4px solid ${hasClearMajority ? '#22c55e' : '#eab308'}`,
                maxHeight: '85vh',
                overflowY: 'auto',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                    Government Formation
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 4 }}>
                    {hasClearMajority ? (
                      <>
                        <span style={{ color: winning.color }}>{winning.name}</span>
                        <span style={{ color: '#22c55e', marginLeft: 8, fontSize: '0.85rem', fontWeight: 600 }}>
                          forms government
                        </span>
                      </>
                    ) : (
                      <span style={{ color: '#eab308' }}>Hung assembly — no single alliance has majority</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Majority threshold: <strong>{data.majority}</strong> of {data.total_seats} seats
                  </div>
                </div>
                <button
                  onClick={() => setMajorityModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    borderRadius: 8,
                    padding: '0.35rem 0.75rem',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  Close ✕
                </button>
              </div>

              {/* CM banner (only when government_formation override is present) */}
              {gov && gov.chief_minister && (
                <div style={{
                  marginBottom: '1.25rem',
                  padding: '0.75rem 1rem',
                  background: `${winning?.color ?? '#94a3b8'}15`,
                  border: `1px solid ${winning?.color ?? '#94a3b8'}35`,
                  borderRadius: 10,
                }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                    Chief Minister
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                    {gov.chief_minister}
                  </div>
                  {gov.sworn_in && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                      Sworn in {gov.sworn_in}
                    </div>
                  )}
                </div>
              )}

              {/* Majority progress visualization */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                  Seats vs Majority
                </div>
                <div style={{ position: 'relative', background: 'var(--bg-secondary)', borderRadius: 8, height: 28, overflow: 'hidden', display: 'flex' }}>
                  {/* Primary alliance segment */}
                  <div title={`Primary alliance: ${winningSeats} seats`} style={{
                    width: `${winningPct}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, ${winning?.color ?? '#94a3b8'} 0%, ${winning?.color ?? '#94a3b8'}cc 100%)`,
                    transition: 'width 0.6s ease',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 12,
                    fontWeight: 700,
                    color: 'white',
                    fontSize: '0.85rem',
                    whiteSpace: 'nowrap',
                  }}>
                    {winningSeats}
                  </div>
                  {/* Coalition members (joined post-poll) — solid lighter shade */}
                  {gov && coalitionPct > 0 && (
                    <div title={`Coalition members: ${gov.coalition_seats} seats`} style={{
                      width: `${coalitionPct}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, ${winning?.color ?? '#94a3b8'}99 0%, ${winning?.color ?? '#94a3b8'}77 100%)`,
                      transition: 'width 0.6s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 600,
                      color: 'white',
                      fontSize: '0.75rem',
                    }}>
                      +{gov.coalition_seats}
                    </div>
                  )}
                  {/* Outside support segment (issue-by-issue) — diagonal stripes */}
                  {gov && outsidePct > 0 && (
                    <div title={`Outside support: ${gov.outside_support_seats} seats`} style={{
                      width: `${outsidePct}%`,
                      height: '100%',
                      background: `repeating-linear-gradient(45deg,
                        ${winning?.color ?? '#94a3b8'}66 0px, ${winning?.color ?? '#94a3b8'}66 6px,
                        ${winning?.color ?? '#94a3b8'}22 6px, ${winning?.color ?? '#94a3b8'}22 12px)`,
                      transition: 'width 0.6s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 600,
                      color: 'white',
                      fontSize: '0.72rem',
                    }}>
                      +{gov.outside_support_seats}
                    </div>
                  )}
                  {/* Majority marker line */}
                  <div style={{
                    position: 'absolute',
                    left: `${(data.majority / data.total_seats) * 100}%`,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: '#eab308',
                    boxShadow: '0 0 6px #eab308',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  <span>0</span>
                  <span style={{ color: '#eab308', fontWeight: 700 }}>▲ Majority {data.majority}</span>
                  <span>{data.total_seats}</span>
                </div>
                <div style={{ marginTop: 12, fontSize: '0.9rem', color: hasClearMajority ? '#4ade80' : '#facc15' }}>
                  {hasClearMajority ? (
                    gov ? (
                      <>
                        Coalition total: <strong>{totalSupport}</strong> ({winningSeats} alliance
                        {gov.coalition_seats > 0 && <> + {gov.coalition_seats} coalition</>}
                        {gov.outside_support_seats > 0 && <> + {gov.outside_support_seats} outside support</>}
                        ) — <strong>{overshoot}</strong> above majority
                      </>
                    ) : (
                      <>{winning.name.split('(')[0].trim()} is <strong>{overshoot}</strong> seat{overshoot === 1 ? '' : 's'} above the majority mark</>
                    )
                  ) : (
                    <>{winning?.name.split('(')[0].trim()} falls <strong>{data.majority - winningSeats}</strong> short of majority — would need coalition partner</>
                  )}
                </div>
                {gov?.note && (
                  <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    {gov.note}
                  </div>
                )}
              </div>

              {/* Government parties */}
              <div style={{ marginBottom: '0.5rem', fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Alliance Parties Forming Government
              </div>
              {govtParties.map(p => (
                <div key={p.party} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '0.75rem 0.85rem',
                  marginBottom: 6,
                  borderRadius: 10,
                  background: `${p.color}10`,
                  border: `1px solid ${p.color}30`,
                  transition: 'all 0.15s',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setMajorityModalOpen(false)
                  navigate(`/${state}/results?winners_only=true&party=${p.party}`)
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = `${p.color}20`
                  e.currentTarget.style.borderColor = `${p.color}55`
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = `${p.color}10`
                  e.currentTarget.style.borderColor = `${p.color}30`
                }}>
                  <PartyLogo party={p.party} size={32} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: p.color, fontSize: '1rem' }}>{p.party}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{p.full_name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: p.color }}>{p.seats}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      {((p.seats / data.total_seats) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}

              {/* Coalition members — parties that formally joined the government
                   despite being from a different pre-poll alliance (e.g., TN INC). */}
              {gov && gov.coalition_members.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                    Coalition Members — Joined Post-Poll ({gov.coalition_seats} seats)
                  </div>
                  {gov.coalition_members.map(p => {
                    const origAlliance = data.alliances.find(a => a.alliance_id === p.alliance_id)
                    return (
                      <div key={p.party}
                        onClick={() => {
                          setMajorityModalOpen(false)
                          navigate(`/${state}/results?winners_only=true&party=${p.party}`)
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '0.7rem 0.85rem',
                          marginBottom: 6,
                          borderRadius: 10,
                          background: `${p.color}10`,
                          border: `1px solid ${p.color}40`,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = `${p.color}1f`
                          e.currentTarget.style.borderColor = `${p.color}80`
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = `${p.color}10`
                          e.currentTarget.style.borderColor = `${p.color}40`
                        }}
                      >
                        <PartyLogo party={p.party} size={28} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700, color: p.color, fontSize: '0.95rem' }}>{p.party}</span>
                            <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.45rem', borderRadius: 999, background: 'rgba(148,163,184,0.15)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                              left {origAlliance?.name?.split('(')[0]?.trim() ?? p.alliance_id}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{p.full_name}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: p.color }}>{p.seats}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>seats</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Outside support parties (only when government_formation override is present) */}
              {gov && gov.outside_support_parties.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                    Outside Support ({gov.outside_support_seats} seats)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
                    {gov.outside_support_parties.map(p => (
                      <div
                        key={p.party}
                        onClick={() => {
                          setMajorityModalOpen(false)
                          navigate(`/${state}/results?winners_only=true&party=${p.party}`)
                        }}
                        style={{
                          padding: '0.6rem 0.75rem',
                          borderRadius: 10,
                          background: `${p.color}10`,
                          border: `1px dashed ${p.color}55`,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = `${p.color}20`
                          e.currentTarget.style.borderColor = p.color
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = `${p.color}10`
                          e.currentTarget.style.borderColor = `${p.color}55`
                        }}
                      >
                        <PartyLogo party={p.party} size={22} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: p.color }}>{p.party}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{p.full_name}</div>
                        </div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: p.color }}>{p.seats}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 8, fontStyle: 'italic' }}>
                    These parties remain in their original alliance but extend issue-by-issue support to the government.
                  </div>
                </div>
              )}

              {/* If no clear majority AND no override, show possible coalition partner */}
              {!hasClearMajority && !gov && sortedAlliances[1] && (
                <div style={{ marginTop: '1.5rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                    Possible Coalition Partner
                  </div>
                  <div style={{ padding: '0.75rem 0.85rem', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 700, color: sortedAlliances[1].color }}>{sortedAlliances[1].name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                      {sortedAlliances[1].seats} seats · combined would be {winning.seats + sortedAlliances[1].seats}
                      {' '}({winning.seats + sortedAlliances[1].seats >= data.majority ? '✓ above majority' : 'still short of majority'})
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
