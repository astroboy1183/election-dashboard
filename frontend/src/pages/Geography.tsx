import { useState, useMemo, useRef, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useLokSabha, useConstituencies, useDistrictSwing, useLsSegmentSwing, useLs2024VsA2026Swing, useLs2024PcWinners } from '../lib/api'
import InsightsCard, { type Insight } from '../components/InsightsCard'
import PartyLogo from '../components/PartyLogo'
import SortableTh from '../components/SortableTh'
import { useSortable } from '../lib/useSortable'
import { fmtIN } from '../lib/format'
import { DistrictChurnCard } from '../components/charts/DistrictChurnCard'
import { Ls2024VsProjectionCard } from '../components/charts/Ls2024VsProjectionCard'

export default function Geography() {
  const { state } = useParams<{ state: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  // If the URL hash targets one of the churn cards, auto-select the matching
  // tab so the card is actually mounted before we try to scroll to it.
  const initialTab: 'district' | 'loksabha' =
    location.hash === '#ls-segment-churn' ? 'loksabha' : 'district'
  const [tab, setTab] = useState<'district' | 'loksabha'>(initialTab)
  const [selectedLs, setSelectedLs] = useState<number | null>(null)
  // Smooth-scroll the LS detail panel into view whenever the user picks a new seat
  // (from the scoreboard table or any alliance-row expansion).
  const lsDetailRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selectedLs == null) return
    // requestAnimationFrame so the panel has rendered before we scroll
    requestAnimationFrame(() => {
      lsDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [selectedLs])
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null)
  const [expandedAlliance, setExpandedAlliance] = useState<string | null>(null)
  const [districtCardModal, setDistrictCardModal] = useState<{
    kind: 'most_flipped' | 'sweep' | 'most_contested' | 'closest';
    district: any;
    accent: string;
    emoji: string;
    label: string;
  } | null>(null)

  const { data: lsData, isLoading: lsLoading } = useLokSabha(state!)
  const { data: constituencies } = useConstituencies(state!)
  const { data: districtSwing } = useDistrictSwing(state!)
  const { data: lsSegmentSwing } = useLsSegmentSwing(state!)
  const { data: lsVsA26Swing } = useLs2024VsA2026Swing(state!)
  const { data: ls2024PcWinners } = useLs2024PcWinners(state!)
  // Expanded-row state for the churn cards (one per tab — separate state so
  // jumping between tabs doesn't reset the other tab's open row).
  const [expandedDistrictChurn, setExpandedDistrictChurn] = useState<string | null>(null)
  const [expandedLsChurn, setExpandedLsChurn] = useState<string | null>(null)
  const [expandedLs24Churn, setExpandedLs24Churn] = useState<string | null>(null)
  // Sub-tab inside the LS view to pick which comparison the user wants to see.
  // Default = the headline "LS 2024 actual vs 2026 projection" PC-level view.
  type LsCompareView = 'projection' | 'churn-2021' | 'churn-2024'
  const [lsCompareView, setLsCompareView] = useState<LsCompareView>('projection')

  // Deep-link scroll: handles #district-churn (used by Overview's anti-
  // incumbency modal) and the three LS sub-tab hashes (#ls-segment-churn,
  // #ls24-vs-a26-churn, #ls2024-vs-projection). Selecting the matching
  // sub-tab before scrolling so the target element is actually mounted.
  useEffect(() => {
    if (!location.hash) return
    const id = location.hash.replace(/^#/, '')
    if (id === 'ls-segment-churn') setLsCompareView('churn-2021')
    else if (id === 'ls24-vs-a26-churn') setLsCompareView('churn-2024')
    else if (id === 'ls2024-vs-projection') setLsCompareView('projection')
    // Defer scroll one frame so the conditionally-mounted card renders first
    requestAnimationFrame(() => {
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [location.hash, districtSwing, lsSegmentSwing, lsVsA26Swing, ls2024PcWinners, tab])

  // Lookup: district name → enriched swing data (flipped count, leader swing, etc.)
  const swingByDistrict: Record<string, any> = useMemo(() => {
    const m: Record<string, any> = {}
    ;(districtSwing?.districts ?? []).forEach((d: any) => { m[d.name] = d })
    return m
  }, [districtSwing])

  // ── District aggregation ──────────────────────────────────────
  const districtMap: Record<string, {
    seats: number
    parties: Record<string, number>
    colors: Record<string, string>
    acs: typeof constituencies
  }> = {}
  ;(constituencies ?? []).forEach(c => {
    const d = c.district || 'Unknown'
    if (!districtMap[d]) districtMap[d] = { seats: 0, parties: {}, colors: {}, acs: [] }
    districtMap[d].seats++
    // For pending ACs, count under "Pending" instead of null party
    const partyKey = c.party ?? 'Pending'
    districtMap[d].parties[partyKey] = (districtMap[d].parties[partyKey] ?? 0) + 1
    districtMap[d].colors[partyKey] = c.color
    districtMap[d].acs!.push(c)
  })
  // Flatten to array of objects so useSortable can drive a multi-column sort
  const districtRows = Object.entries(districtMap).map(([name, info]) => {
    const leader = Object.entries(info.parties).sort((a, b) => b[1] - a[1])[0]
    return {
      name,
      seats: info.seats,
      leader: leader?.[0] ?? '',
      leader_seats: leader?.[1] ?? 0,
      parties: info.parties,
      colors: info.colors,
      acs: info.acs,
    }
  })
  const { sorted: districts, sort: dSort, onSort: dOnSort } =
    useSortable<any>(districtRows, { key: 'seats', dir: 'desc' })

  const selectedDistrictData = (selectedDistrict && districtMap[selectedDistrict])
    || (districts.length > 0 ? districtMap[districts[0].name] : null)
  const selectedDistrictName = selectedDistrict ?? (districts[0]?.name ?? '')

  // Sortable for the selected district's AC list
  const { sorted: sortedDistrictAcs, sort: acSort, onSort: acOnSort } =
    useSortable<any>(selectedDistrictData?.acs ?? [], { key: 'ac_number', dir: 'asc' })

  // Sortable for the LS scoreboard (Lok Sabha tab — left list)
  const { sorted: sortedLsSeats, sort: lsSort, onSort: lsOnSort } =
    useSortable<any>(lsData?.seats ?? [], { key: 'ls_number', dir: 'asc' })

  // Sortable for the per-AC segment table inside the LS detail view.
  // Supports computed columns (lead_votes, margin) via a getValue accessor.
  const { sorted: sortedSegments, sort: segSort, onSort: segOnSort } =
    useSortable<any>(
      lsData?.seats.find(s => s.ls_number === selectedLs)?.segments ?? lsData?.seats[0]?.segments ?? [],
      { key: 'ac_number', dir: 'asc' },
      (seg, key) => {
        if (key === 'lead_votes')   return seg.segment_votes?.[0]?.votes ?? 0
        if (key === 'margin')       return (seg.segment_votes?.[0]?.votes ?? 0) - (seg.segment_votes?.[1]?.votes ?? 0)
        return seg[key]
      },
    )

  // ── LS computed: pick selected seat ──────────────────────────
  const selectedSeat = lsData?.seats.find(s => s.ls_number === selectedLs) ?? lsData?.seats[0]

  // Sum-check for LS view: column-wise totals across selected seat's segments
  const sumCheck = useMemo(() => {
    if (!selectedSeat) return null
    const totals: Record<string, { votes: number; color: string }> = {}
    selectedSeat.segments.forEach(seg => {
      seg.segment_votes.forEach(sv => {
        if (!totals[sv.party]) totals[sv.party] = { votes: 0, color: sv.color }
        totals[sv.party].votes += sv.votes
      })
    })
    return Object.entries(totals).sort((a, b) => b[1].votes - a[1].votes)
  }, [selectedSeat])

  const tabStyle = (active: boolean) => ({
    padding: '0.5rem 1.25rem', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer',
    background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
    color: active ? '#818cf8' : 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: active ? 600 : 400,
  })

  const fmt = (n: number) => fmtIN(n)

  // ─────────────────────  KEY INSIGHTS  ─────────────────────
  // District tab insights (computed once; only shown when District tab is active)
  const districtInsights: Insight[] = []
  if (districtSwing?.districts) {
    const ds = districtSwing.districts
    const sweepers = ds.filter((d: any) => d.sweep_party && d.seats_2026 >= 3)
    const mostFlipped = [...ds].filter((d: any) => d.seats_2026 >= 2).sort((a, b) => b.flipped_count - a.flipped_count)[0]
    const closest = [...ds].filter((d: any) => d.seats_2026 >= 2).sort((a, b) => a.avg_margin - b.avg_margin)[0]
    const mostFragmented = [...ds].sort((a, b) => b.distinct_winners - a.distinct_winners)[0]
    if (mostFlipped && mostFlipped.flipped_count > 0) {
      districtInsights.push({
        emoji: '🔥', accent: '#f97316',
        headline: `${mostFlipped.name} was the epicenter of churn.`,
        detail: `${mostFlipped.flipped_count} of its ${mostFlipped.seats_2026} seats changed party from 2021 — the highest flip count in the state.`,
      })
    }
    if (sweepers.length > 0) {
      const biggest = sweepers.sort((a: any, b: any) => b.seats_2026 - a.seats_2026)[0]
      const pct = ((biggest.leader_seats / biggest.seats_2026) * 100).toFixed(0)
      districtInsights.push({
        emoji: '🏆', accent: '#22c55e',
        headline: `${biggest.sweep_party} dominates ${biggest.name}.`,
        detail: `Won ${biggest.leader_seats} of ${biggest.seats_2026} seats (${pct}%) — a sweep that anchors their state-level performance. ${sweepers.length - 1 > 0 ? `${sweepers.length - 1} other district${sweepers.length - 1 === 1 ? '' : 's'} also produced a single-party sweep.` : ''}`,
      })
    }
    if (closest && closest.avg_margin > 0) {
      districtInsights.push({
        emoji: '🎯', accent: '#ef4444',
        headline: `${closest.name} is the tightest battleground.`,
        detail: `Average winning margin of just ${fmt(closest.avg_margin)} votes per seat. ${closest.close_seats} of its seats were decided by fewer than 5,000 votes — small swings flip them.`,
      })
    }
    if (mostFragmented && mostFragmented.distinct_winners >= 4) {
      districtInsights.push({
        emoji: '⚔️', accent: '#a78bfa',
        headline: `${mostFragmented.name} is the most fragmented contest.`,
        detail: `${mostFragmented.distinct_winners} different parties won seats here — no single party could dominate. The leader (${mostFragmented.leader_party}) only took ${mostFragmented.leader_seats} of ${mostFragmented.seats_2026}.`,
      })
    }
  }

  // LS tab insights
  const lsInsights: Insight[] = []
  if (lsData?.seats && lsData?.tally) {
    const totalLs = lsData.total_ls_seats
    const top = (lsData as any).tally[0]
    if (top) {
      lsInsights.push({
        emoji: '🏛️', accent: top.color,
        headline: `${top.alliance_name.replace(/\s*\(.*\)/, '').trim()} leads the Lok Sabha projection.`,
        detail: `Projected to win ${top.seats} of ${totalLs} LS seats from this state, based on summing assembly votes by alliance.`,
      })
    }
    // Closest LS seat
    const seats = (lsData.seats as any[])
    const closestLs = [...seats].map(s => {
      const a0 = s.alliance_breakdown[0]
      const a1 = s.alliance_breakdown[1]
      return { ...s, marginPP: (a0?.vote_share ?? 0) - (a1?.vote_share ?? 0) }
    }).sort((a, b) => a.marginPP - b.marginPP)[0]
    if (closestLs && closestLs.marginPP < 5) {
      lsInsights.push({
        emoji: '🎯', accent: '#ef4444',
        headline: `${closestLs.ls_name} is the most knife-edge LS projection.`,
        detail: `${closestLs.projected_winning_alliance_name.replace(/\s*\(.*\)/, '').trim()} leads by just ${closestLs.marginPP.toFixed(1)}pp — small shifts on polling day could flip this seat.`,
      })
    }
    // AC-winner vs LS-aggregate divergence
    const divergent = seats.filter(s => {
      const ac_wins = (s.segments ?? []).filter((seg: any) => seg.winner_party === s.projected_winner).length
      const total_segs = s.total_segments
      return ac_wins < total_segs / 2 && total_segs >= 4
    })
    if (divergent.length > 0) {
      const example = divergent[0]
      const acWins = (example.segments ?? []).filter((seg: any) => seg.winner_party === example.projected_winner).length
      lsInsights.push({
        emoji: '⚠️', accent: '#f59e0b',
        headline: `Vote aggregate ≠ ground momentum in ${divergent.length} LS seat${divergent.length === 1 ? '' : 's'}.`,
        detail: `e.g. in ${example.ls_name}, ${example.projected_winner} would win by vote aggregate even though it only won ${acWins} of ${example.total_segments} assembly segments. Watch these for upsets.`,
      })
    }
  }

  return (
    <div>
      <div className="page-title">Geographic Analysis</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem' }}>
        <button style={tabStyle(tab === 'district')} onClick={() => setTab('district')}>District View</button>
        <button style={tabStyle(tab === 'loksabha')} onClick={() => setTab('loksabha')}>Lok Sabha View</button>
      </div>

      {/* ── DISTRICT TAB ── */}
      {tab === 'district' && (
        <>
          <InsightsCard insights={districtInsights} subtitle="What stands out across the state's districts" />

          {/* Battleground strip — 4 narrative cards */}
          {districtSwing?.headline && (
            <div className="kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
              {[
                { key: 'most_flipped',  emoji: '🔥', label: 'Most Flipped',  accent: '#f97316',
                  detail: (h: any) => `${h.flipped_count} of ${h.seats_2026} seats changed party from 2021` },
                { key: 'sweep',         emoji: '🏆', label: 'Sweep District', accent: '#22c55e',
                  detail: (h: any) => h.sweep_party ? `${h.sweep_party} won ${h.leader_seats}/${h.seats_2026}` : '—' },
                { key: 'most_contested',emoji: '⚔️', label: 'Most Contested', accent: '#a78bfa',
                  detail: (h: any) => `${h.distinct_winners} parties won seats here` },
                { key: 'closest',       emoji: '🎯', label: 'Tightest',       accent: '#ef4444',
                  detail: (h: any) => `Avg margin ${fmt(h.avg_margin)} · ${h.close_seats} close seat${h.close_seats === 1 ? '' : 's'}` },
              ].map(card => {
                const h = districtSwing.headline[card.key]
                if (!h) return null
                return (
                  <div key={card.key} className="stat-card"
                       onClick={() => setDistrictCardModal({
                         kind: card.key as any,
                         district: h,
                         accent: card.accent,
                         emoji: card.emoji,
                         label: card.label,
                       })}
                       style={{
                         borderLeft: `4px solid ${card.accent}`,
                         cursor: 'pointer',
                         padding: '1.1rem 1.25rem',
                         display: 'flex', flexDirection: 'column', gap: 8,
                         minHeight: 150,
                         transition: 'transform 0.15s ease, background 0.15s ease',
                       }}
                       onMouseEnter={e => { e.currentTarget.style.background = `${card.accent}0d` }}
                       onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{card.emoji}</span>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                        {card.label}
                      </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: card.accent, lineHeight: 1.1 }}>{h.name}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {card.detail(h)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: card.accent, fontWeight: 600, marginTop: 'auto' }}>
                      See breakdown <span style={{ fontSize: '0.8rem' }}>→</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1.5fr', gap: '1.25rem' }}>
          {/* Left: district list */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
              <div className="section-title" style={{ marginBottom: 0 }}>Districts ({districts.length})</div>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '70vh' }}>
              <table>
                <thead>
                  <tr>
                    <SortableTh label="District" sortKey="name" sort={dSort} onSort={dOnSort} />
                    <SortableTh label="Seats" sortKey="seats" sort={dSort} onSort={dOnSort} align="right" />
                    <SortableTh label="Leader" sortKey="leader" sort={dSort} onSort={dOnSort} />
                    <th style={{ textAlign: 'right' }} title="Leader's 2021→2026 seat change in this district">Swing</th>
                  </tr>
                </thead>
                <tbody>
                  {districts.map((row: any) => {
                    const dist = row.name
                    const info = row
                    const leading = Object.entries(info.parties).sort((a, b) => (b[1] as number) - (a[1] as number))[0] as [string, number]
                    const isSelected = selectedDistrictName === dist
                    const sw = swingByDistrict[dist]
                    return (
                      <tr key={dist}
                          onClick={() => setSelectedDistrict(dist)}
                          style={{ background: isSelected ? 'rgba(99,102,241,0.08)' : 'transparent', cursor: 'pointer' }}>
                        <td style={{ fontWeight: 600 }}>{dist}</td>
                        <td style={{ textAlign: 'right' }}>{info.seats}</td>
                        <td>
                          <span className="badge" style={{ background: `${info.colors[leading?.[0]] ?? '#6366f1'}22`, color: info.colors[leading?.[0]] ?? '#818cf8' }}>
                            <PartyLogo party={leading?.[0] ?? ''} size={12} />
                            {leading?.[0]} ({leading?.[1]})
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.78rem',
                                     color: !sw ? 'var(--text-secondary)' : sw.leader_swing > 0 ? '#22c55e' : sw.leader_swing < 0 ? '#ef4444' : 'var(--text-secondary)' }}
                            title={sw ? `Leader ${sw.leader_party} ${sw.leader_seats_2021} → ${sw.leader_seats}` : ''}>
                          {sw ? (sw.leader_swing > 0 ? `+${sw.leader_swing}` : sw.leader_swing === 0 ? '—' : sw.leader_swing) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: selected district detail */}
          {selectedDistrictData && (
            <div>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Selected District</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{selectedDistrictName}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                    {selectedDistrictData.seats} assembly constituencies
                  </div>
                </div>

                <div className="section-title">Party-wise Seats in {selectedDistrictName}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {Object.entries(selectedDistrictData.parties).sort((a, b) => b[1] - a[1]).map(([p, s]) => (
                    <span key={p} className="badge" style={{ background: `${selectedDistrictData.colors[p]}22`, color: selectedDistrictData.colors[p], fontWeight: 600 }}>
                      <PartyLogo party={p} size={12} />
                      {p}: {s}
                    </span>
                  ))}
                </div>

                {/* 2021 → 2026 swing */}
                {swingByDistrict[selectedDistrictName] && (
                  <>
                    <div className="section-title" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <span>2021 → 2026 Swing</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                        {swingByDistrict[selectedDistrictName].flipped_count} seat{swingByDistrict[selectedDistrictName].flipped_count === 1 ? '' : 's'} flipped · avg margin {fmt(swingByDistrict[selectedDistrictName].avg_margin)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                      {swingByDistrict[selectedDistrictName].party_comparison
                        .filter((p: any) => p.seats_2021 > 0 || p.seats_2026 > 0)
                        .map((p: any) => {
                          const total = selectedDistrictData.seats
                          const w21 = (p.seats_2021 / total) * 100
                          const w26 = (p.seats_2026 / total) * 100
                          return (
                            <div key={p.party} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 55, fontSize: '0.78rem', fontWeight: 600, color: p.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <PartyLogo party={p.party} size={14} />{p.party}
                              </div>
                              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <div title={`2021: ${p.seats_2021}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ width: 26, fontSize: '0.65rem', color: 'var(--text-secondary)' }}>'21</span>
                                  <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 3, height: 10, overflow: 'hidden' }}>
                                    <div style={{ width: `${w21}%`, height: '100%', background: p.color, opacity: 0.5, borderRadius: 3 }} />
                                  </div>
                                  <span style={{ width: 22, textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{p.seats_2021}</span>
                                </div>
                                <div title={`2026: ${p.seats_2026}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ width: 26, fontSize: '0.65rem', color: 'var(--text-secondary)' }}>'26</span>
                                  <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 3, height: 10, overflow: 'hidden' }}>
                                    <div style={{ width: `${w26}%`, height: '100%', background: p.color, borderRadius: 3 }} />
                                  </div>
                                  <span style={{ width: 22, textAlign: 'right', fontSize: '0.7rem', fontWeight: 700 }}>{p.seats_2026}</span>
                                </div>
                              </div>
                              <span style={{ minWidth: 32, textAlign: 'right', fontWeight: 700, fontSize: '0.78rem',
                                             color: p.change > 0 ? '#22c55e' : p.change < 0 ? '#ef4444' : 'var(--text-secondary)' }}>
                                {p.change > 0 ? `+${p.change}` : p.change === 0 ? '—' : p.change}
                              </span>
                            </div>
                          )
                        })}
                    </div>
                  </>
                )}
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
                  <div className="section-title" style={{ marginBottom: 0 }}>Assembly Constituencies in {selectedDistrictName}</div>
                </div>
                <div className="table-wrap" style={{ overflowX: 'auto', maxHeight: '60vh', overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <SortableTh label="AC #" sortKey="ac_number" sort={acSort} onSort={acOnSort} />
                        <SortableTh label="Constituency" sortKey="name" sort={acSort} onSort={acOnSort} />
                        <SortableTh label="Leader" sortKey="winner" sort={acSort} onSort={acOnSort} />
                        <SortableTh label="Party" sortKey="party" sort={acSort} onSort={acOnSort} />
                        <SortableTh label="Votes" sortKey="votes" sort={acSort} onSort={acOnSort} align="right" />
                        <SortableTh label="Margin" sortKey="margin" sort={acSort} onSort={acOnSort} align="right" />
                        <SortableTh label="Vote Share" sortKey="vote_share" sort={acSort} onSort={acOnSort} align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedDistrictAcs.map((c: any) => {
                        const isPending = c.status === 'pending'
                        return (
                          <tr key={c.ac_number} style={{ cursor: 'pointer' }}
                              onClick={() => navigate(`/${state}/constituencies/${c.ac_number}`)}>
                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{c.ac_number}</td>
                            <td style={{ fontWeight: 600 }}>{c.name}</td>
                            <td>{isPending ? <span style={{ color: 'var(--text-secondary)' }}>—</span> : c.winner}</td>
                            <td>
                              {isPending ? (
                                <span className="badge badge-yellow" style={{ fontSize: '0.62rem' }}>⏳ Pending</span>
                              ) : (
                                <span className="badge" style={{ background: `${c.color}22`, color: c.color, border: `1px solid ${c.color}44` }}>
                                  <PartyLogo party={c.party ?? ''} size={13} />
                                  {c.party}
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right', color: isPending ? 'var(--text-secondary)' : undefined }}>
                              {isPending ? '—' : fmt(c.votes)}
                            </td>
                            <td style={{ textAlign: 'right', color: isPending ? 'var(--text-secondary)' : (c.margin > 5000 ? 'var(--text-primary)' : '#f59e0b'), fontWeight: 600 }}>
                              {isPending ? '—' : `+${fmt(c.margin)}`}
                            </td>
                            <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                              {isPending ? '—' : `${c.vote_share.toFixed(1)}%`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          </div>

          {/* District-Wise Churn — moved here from Swing & Trends. Sortable
              table with per-district drill-down (flipped/held/new seats).
              id="district-churn" preserved so deep-links from Overview's
              anti-incumbency modal still work. */}
          {districtSwing && districtSwing.districts && districtSwing.districts.length > 0 && (
            <div id="district-churn" style={{ scrollMarginTop: 16, marginTop: '1.5rem' }}>
              <DistrictChurnCard
                districts={districtSwing.districts}
                state={state!}
                expandedDistrict={expandedDistrictChurn}
                setExpandedDistrict={setExpandedDistrictChurn}
              />
            </div>
          )}
        </>
      )}

      {/* ── LOK SABHA TAB ── */}
      {tab === 'loksabha' && (
        <div>
          {lsLoading && <div style={{ color: 'var(--text-secondary)' }}>Loading Lok Sabha data…</div>}
          {lsData && (
            <>
              <InsightsCard insights={lsInsights} subtitle="What the LS projection reveals from this state's assembly votes" />

              {/* (LS 2024 vs 2026 projection card moved to the "Compare LS
                  outcomes" tabbed section at the bottom of this tab so the
                  three comparison cards are grouped together with a sub-tab
                  picker — keeps the LS view from stacking similar tables.) */}

              {/* Tally — alliance-level, clickable rows expand to show that alliance's projected LS seats */}
              <div className="card" style={{ marginBottom: '1.25rem' }}>
                <div className="section-title">Projected LS Tally — Alliance Aggregation</div>
                <div style={{ marginBottom: 8 }}>
                  {(lsData as any).tally.map((t: any) => {
                    const isOpen = expandedAlliance === t.alliance_id
                    const allianceSeats = (lsData.seats as any[])
                      .filter(s => s.projected_winning_alliance_id === t.alliance_id)
                      .sort((a, b) => {
                        // Sort by alliance margin (winning - runner-up) descending — safest seats first
                        const am = (a.alliance_breakdown[0]?.votes ?? 0) - (a.alliance_breakdown[1]?.votes ?? 0)
                        const bm = (b.alliance_breakdown[0]?.votes ?? 0) - (b.alliance_breakdown[1]?.votes ?? 0)
                        return bm - am
                      })
                    return (
                      <div key={t.alliance_id} style={{ marginBottom: 8 }}>
                        <div
                          onClick={() => setExpandedAlliance(isOpen ? null : t.alliance_id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                            padding: '0.4rem 0.5rem', borderRadius: 6,
                            cursor: 'pointer',
                            background: isOpen ? `${t.color}14` : 'transparent',
                            border: `1px solid ${isOpen ? `${t.color}55` : 'transparent'}`,
                            transition: 'background 0.15s ease, border 0.15s ease',
                          }}
                          title="Click to see all LS constituencies projected to this alliance"
                        >
                          <span style={{ color: t.color, fontSize: '0.85rem', width: 12, textAlign: 'center' }}>{isOpen ? '▾' : '▸'}</span>
                          <div style={{ width: 200, fontSize: '0.85rem', fontWeight: 700, color: t.color }}>{t.alliance_name}</div>
                          <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 4, height: 20, overflow: 'hidden' }}>
                            <div style={{ width: `${(t.seats / lsData.total_ls_seats) * 100}%`, height: '100%', background: t.color, borderRadius: 4 }} />
                          </div>
                          <div style={{ width: 36, fontWeight: 700, textAlign: 'right', fontSize: '1rem' }}>{t.seats}</div>
                        </div>
                        {isOpen && allianceSeats.length > 0 && (
                          <div style={{ marginLeft: 28, marginTop: 6, marginBottom: 4, padding: '0.6rem 0.7rem',
                                        borderRadius: 8, background: 'var(--bg-secondary)',
                                        border: `1px dashed ${t.color}55` }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                              {allianceSeats.length} LS {allianceSeats.length === 1 ? 'seat' : 'seats'} projected to {t.alliance_name.replace(/\s*\(.*\)/, '').trim()} · sorted by alliance margin
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {allianceSeats.map((s: any) => {
                                const a0 = s.alliance_breakdown[0]
                                const a1 = s.alliance_breakdown[1]
                                const marginPP = (a0?.vote_share ?? 0) - (a1?.vote_share ?? 0)
                                const isSel = selectedLs === s.ls_number || (selectedLs === null && selectedSeat?.ls_number === s.ls_number)
                                return (
                                  <div key={s.ls_number}
                                    onClick={(e) => { e.stopPropagation(); setSelectedLs(s.ls_number) }}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 8,
                                      padding: '0.35rem 0.55rem', borderRadius: 6,
                                      cursor: 'pointer',
                                      background: isSel ? `${t.color}1a` : 'var(--bg-card)',
                                      border: `1px solid ${isSel ? `${t.color}66` : 'var(--border)'}`,
                                    }}
                                  >
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', minWidth: 22 }}>#{s.ls_number}</span>
                                    <span style={{ fontWeight: 700, fontSize: '0.82rem', flex: 1 }}>{s.ls_name}</span>
                                    <span className="badge" style={{ background: `${s.projected_winner_color}22`, color: s.projected_winner_color, border: `1px solid ${s.projected_winner_color}44`, fontSize: '0.65rem' }}>
                                      <PartyLogo party={s.projected_winner} size={11} />{s.projected_winner}
                                    </span>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 50, textAlign: 'right' }}>
                                      {a0?.vote_share.toFixed(1)}%
                                    </span>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, minWidth: 56, textAlign: 'right',
                                                   color: marginPP < 3 ? '#ef4444' : marginPP < 8 ? '#f59e0b' : '#22c55e' }}
                                          title="Margin vs runner-up alliance (percentage points)">
                                      +{marginPP.toFixed(1)}pp
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Total LS seats: <strong>{lsData.total_ls_seats}</strong> · For each LS seat we sum votes across all 2026 assembly segments grouped by <em>alliance</em>; the alliance with the highest combined votes is projected to win that seat. The party label inside each LS seat is the alliance's top vote-getter there.
                </div>
                {(lsData as any).party_tally && (lsData as any).party_tally.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Within-alliance top party (which party carries each LS for its alliance)
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(lsData as any).party_tally.map((p: any) => (
                        <span key={p.party} className="badge" style={{ background: `${p.color}22`, color: p.color, border: `1px solid ${p.color}44`, fontSize: '0.72rem' }}>
                          <PartyLogo party={p.party} size={12} />{p.party}: {p.seats}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* All-seats scoreboard + detail */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.8fr', gap: '1.25rem' }}>
                {/* Left: scoreboard */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
                    <div className="section-title" style={{ marginBottom: 0 }}>All {lsData.total_ls_seats} LS Seats</div>
                  </div>
                  <div style={{ overflowY: 'auto', maxHeight: 520 }}>
                    <table>
                      <thead>
                        <tr>
                          <SortableTh label="#" sortKey="ls_number" sort={lsSort} onSort={lsOnSort} />
                          <SortableTh label="LS Constituency" sortKey="ls_name" sort={lsSort} onSort={lsOnSort} />
                          <SortableTh label="Alliance" sortKey="projected_winning_alliance_name" sort={lsSort} onSort={lsOnSort} />
                          <SortableTh label="Top Party" sortKey="projected_winner" sort={lsSort} onSort={lsOnSort} />
                        </tr>
                      </thead>
                      <tbody>
                        {sortedLsSeats.map((s: any) => (
                          <tr key={s.ls_number} onClick={() => setSelectedLs(s.ls_number)}
                            style={{ background: selectedSeat?.ls_number === s.ls_number ? 'rgba(99,102,241,0.08)' : 'transparent', cursor: 'pointer' }}>
                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{s.ls_number}</td>
                            <td style={{ fontWeight: 600 }}>{s.ls_name}</td>
                            <td>
                              <span className="badge" style={{ background: `${s.projected_winning_alliance_color}22`, color: s.projected_winning_alliance_color, border: `1px solid ${s.projected_winning_alliance_color}44`, fontSize: '0.72rem' }}>
                                {s.projected_winning_alliance_name.replace(/\s*\(.*\)/, '').trim()}
                              </span>
                            </td>
                            <td>
                              <span className="badge" style={{ background: `${s.projected_winner_color}22`, color: s.projected_winner_color, border: `1px solid ${s.projected_winner_color}44` }}>
                                <PartyLogo party={s.projected_winner} size={13} />
                                {s.projected_winner}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Right: selected seat detail */}
                {selectedSeat && (
                  <div ref={lsDetailRef} style={{ scrollMarginTop: 16 }}>
                    <div className="card" style={{ marginBottom: '1rem' }}>
                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Selected LS Seat</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{selectedSeat.ls_name}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                          {selectedSeat.total_segments} assembly segments · {fmt(selectedSeat.total_votes)} total votes
                        </div>
                      </div>

                      {/* Sitting MP from LS 2024 — pairs the projection above
                          with the real person currently representing this PC. */}
                      {(selectedSeat as any).sitting_mp_2024 && (() => {
                        const mp = (selectedSeat as any).sitting_mp_2024
                        return (
                          <div style={{
                            padding: '0.7rem 0.85rem', borderRadius: 8, marginBottom: 14,
                            background: `${mp.party_color}0c`, border: `1px solid ${mp.party_color}44`,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                              <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                                🪪 Sitting MP (Lok Sabha 2024)
                              </div>
                              {mp.seat_type && mp.seat_type !== 'GEN' && (
                                <span style={{ fontSize: '0.65rem', padding: '0.12rem 0.45rem', borderRadius: 10,
                                               background: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.30)', color: '#a78bfa' }}>
                                  Reserved ({mp.seat_type})
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.98rem', fontWeight: 800, marginTop: 4 }}>{mp.name}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: '0.78rem' }}>
                              <PartyLogo party={mp.party} size={16} />
                              <span style={{ color: mp.party_color, fontWeight: 700 }}>{mp.party}</span>
                              {mp.gender && <span style={{ color: 'var(--text-muted)' }}>· {mp.gender}</span>}
                            </div>
                          </div>
                        )
                      })()}

                      {/* Alliance-level breakdown (the projection that matters) */}
                      {(selectedSeat as any).alliance_breakdown && (
                        <>
                          <div className="section-title">By Alliance (Projected)</div>
                          {(selectedSeat as any).alliance_breakdown.map((a: any) => (
                            <div key={a.alliance_id} style={{ marginBottom: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ width: 210, fontSize: '0.92rem', fontWeight: 700, color: a.color }}>
                                  {a.alliance_name.replace(/\s*\(.*\)/, '').trim()}
                                </div>
                                <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 6, height: 30, overflow: 'hidden', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }}>
                                  <div style={{
                                    width: `${a.vote_share}%`,
                                    height: '100%',
                                    background: `linear-gradient(90deg, ${a.color} 0%, ${a.color}dd 100%)`,
                                    borderRadius: 6,
                                    transition: 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
                                    boxShadow: `0 0 16px -2px ${a.color}77`,
                                  }} />
                                </div>
                                <div className="tabular" style={{ width: 110, fontSize: '1rem', textAlign: 'right', fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(a.votes)}</div>
                                <div className="tabular" style={{ width: 64, fontSize: '0.95rem', textAlign: 'right', fontWeight: 800, color: a.color }}>{a.vote_share.toFixed(1)}%</div>
                              </div>
                              {a.member_parties.length > 1 && (
                                <div style={{ marginLeft: 14, marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                  {a.member_parties.map((m: any) => (
                                    <span key={m.party} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', padding: '0.18rem 0.5rem', borderRadius: 4, background: `${m.color}1f`, color: m.color, border: `1px solid ${m.color}33` }}>
                                      <PartyLogo party={m.party} size={14} /> <strong>{m.party}</strong> <span className="tabular">{fmt(m.votes)}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </>
                      )}

                      <div className="section-title" style={{ marginTop: 18 }}>By Party (Individual)</div>
                      {selectedSeat.party_breakdown.map(p => (
                        <div key={p.party} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 8 }}>
                          <PartyLogo party={p.party} size={22} />
                          <div style={{ width: 70, fontSize: '0.92rem', fontWeight: 700, color: p.color }}>{p.party}</div>
                          <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 5, height: 24, overflow: 'hidden', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }}>
                            <div style={{
                              width: `${p.vote_share}%`,
                              height: '100%',
                              background: `linear-gradient(90deg, ${p.color} 0%, ${p.color}dd 100%)`,
                              borderRadius: 5,
                              transition: 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
                              boxShadow: `0 0 12px -3px ${p.color}66`,
                            }} />
                          </div>
                          <div className="tabular" style={{ width: 110, fontSize: '0.95rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(p.votes)}</div>
                          <div className="tabular" style={{ width: 58, fontSize: '0.88rem', fontWeight: 700, color: p.color, textAlign: 'right' }}>{p.vote_share.toFixed(1)}%</div>
                        </div>
                      ))}
                    </div>

                    {/* Segment table with per-AC leads */}
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
                        <div className="section-title" style={{ marginBottom: 0 }}>Assembly Segments — Per-AC Leads</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                          Top-3 parties per AC. Click row for details. Footer sums must equal the aggregate above.
                        </div>
                      </div>
                      <div className="table-wrap" style={{ overflowX: 'auto', maxHeight: '50vh', overflowY: 'auto' }}>
                        <table>
                          <thead>
                            <tr>
                              <SortableTh label="AC #" sortKey="ac_number" sort={segSort} onSort={segOnSort} />
                              <SortableTh label="Segment" sortKey="name" sort={segSort} onSort={segOnSort} />
                              <SortableTh label="Leader" sortKey="winner_party" sort={segSort} onSort={segOnSort} />
                              <SortableTh label="Lead Votes" sortKey="lead_votes" sort={segSort} onSort={segOnSort} align="right" />
                              <SortableTh label="Margin" sortKey="margin" sort={segSort} onSort={segOnSort} align="right" />
                              <th>Top Contenders</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedSegments.map((seg: any) => {
                              const isPending = seg.status === 'pending'
                              const top = seg.segment_votes[0]
                              const second = seg.segment_votes[1]
                              const margin = (top?.votes ?? 0) - (second?.votes ?? 0)
                              return (
                                <tr key={seg.ac_number} style={{ cursor: 'pointer' }}
                                    onClick={() => navigate(`/${state}/constituencies/${seg.ac_number}`)}>
                                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{seg.ac_number}</td>
                                  <td style={{ fontWeight: 600 }}>{seg.name}</td>
                                  <td>
                                    {isPending ? (
                                      <span className="badge badge-yellow" style={{ fontSize: '0.62rem' }}>⏳ Pending</span>
                                    ) : (
                                      <span className="badge" style={{ background: `${top?.color}22`, color: top?.color, border: `1px solid ${top?.color}44` }}>
                                        <PartyLogo party={seg.winner_party} size={13} />
                                        {seg.winner_party}
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'right', fontSize: '0.78rem', color: isPending ? 'var(--text-secondary)' : undefined }}>
                                    {isPending ? '—' : fmt(top?.votes ?? 0)}
                                  </td>
                                  <td style={{ textAlign: 'right', fontSize: '0.78rem', color: isPending ? 'var(--text-secondary)' : (margin > 5000 ? 'var(--text-primary)' : '#f59e0b'), fontWeight: 600 }}>
                                    {isPending ? '—' : `+${fmt(margin)}`}
                                  </td>
                                  <td>
                                    {isPending ? (
                                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontStyle: 'italic' }}>
                                        Election scheduled — results awaited
                                      </span>
                                    ) : (
                                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                        {seg.segment_votes.slice(0, 3).map((sv: any) => (
                                          <span key={sv.party} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: 4, background: `${sv.color}22`, color: sv.color }}>
                                            <PartyLogo party={sv.party} size={11} />
                                            {sv.party}: {fmt(sv.votes)}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          {/* Sum-check footer */}
                          {sumCheck && (
                            <tfoot>
                              <tr style={{ background: 'var(--bg-secondary)', borderTop: '2px solid var(--border)' }}>
                                <td colSpan={2} style={{ fontWeight: 700, fontSize: '0.78rem' }}>Column Sum (verification)</td>
                                <td colSpan={4}>
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {sumCheck.map(([party, info]) => (
                                      <span key={party} style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: 4, background: `${info.color}22`, color: info.color, fontWeight: 600 }}>
                                        {party}: {fmt(info.votes)}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Compare LS outcomes — tabbed section ──────────────
              Three structurally-similar comparison views (LS 2024 actual vs
              2026 projection at PC-level; AC-segment churn 2021→2026; AC-
              segment churn LS24→A26) live behind a single sub-tab picker so
              the LS view stops stacking near-identical tables. User picks
              which comparison to drill into. */}
          {((ls2024PcWinners?.seats?.length ?? 0) > 0
            || (lsSegmentSwing?.ls_seats?.length ?? 0) > 0
            || (lsVsA26Swing?.ls_seats?.length ?? 0) > 0) && (
            <div id="ls-compare" style={{ scrollMarginTop: 16, marginTop: '1.5rem' }}>
              <div style={{ marginBottom: 10 }}>
                <div className="section-title" style={{ marginBottom: 6 }}>Compare LS Outcomes</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
                  Three ways to compare what happened across cycles. Pick a view to drill in.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {([
                    { id: 'projection', label: '🆚 LS 2024 vs 2026 Projection (PC-level)',
                      hint: 'Per-PC table: actual LS 2024 alliance winner vs 2026-assembly-vote projection' },
                    { id: 'churn-2021', label: '🔁 AC-Segment Churn: 2021 → 2026',
                      hint: 'Assembly-to-assembly: which AC segments stayed vs flipped, grouped by parent LS seat' },
                    { id: 'churn-2024', label: '🔁 AC-Segment Churn: LS 2024 → 2026',
                      hint: 'LS-cycle to assembly-cycle: did LS 2024 momentum carry forward to A 2026?' },
                  ] as const).map(t => {
                    const active = lsCompareView === t.id
                    return (
                      <button key={t.id} onClick={() => setLsCompareView(t.id)} title={t.hint}
                        style={{
                          padding: '0.45rem 0.85rem', borderRadius: 8, cursor: 'pointer',
                          background: active ? 'rgba(167,139,250,0.18)' : 'var(--bg-card)',
                          border: `1px solid ${active ? 'rgba(167,139,250,0.5)' : 'var(--border)'}`,
                          color: active ? 'var(--accent)' : 'var(--text-secondary)',
                          fontSize: '0.78rem', fontWeight: 700,
                        }}>
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {lsCompareView === 'projection' && ls2024PcWinners?.seats?.length > 0 && (
                <Ls2024VsProjectionCard
                  ls2024Seats={ls2024PcWinners.seats}
                  projectionSeats={(lsData as any).seats}
                />
              )}

              {lsCompareView === 'churn-2021' && lsSegmentSwing?.ls_seats?.length > 0 && (
                <div id="ls-segment-churn">
                  <DistrictChurnCard
                    districts={lsSegmentSwing.ls_seats}
                    state={state!}
                    expandedDistrict={expandedLsChurn}
                    setExpandedDistrict={setExpandedLsChurn}
                    title="LS-Wise Assembly Segment Churn (2021 → 2026)"
                    subtitle="How assembly-segment winners changed between the 2021 and 2026 assembly elections, grouped by parent Lok Sabha seat. Click a row to see which seats."
                    columnLabel="Lok Sabha Seat"
                    prevLabel="2021 Leader"
                    prevLabelShort="2021"
                    groupNoun="Lok Sabha seat"
                  />
                </div>
              )}

              {lsCompareView === 'churn-2024' && lsVsA26Swing?.ls_seats?.length > 0 && (
                <div id="ls24-vs-a26-churn">
                  <DistrictChurnCard
                    districts={lsVsA26Swing.ls_seats}
                    state={state!}
                    expandedDistrict={expandedLs24Churn}
                    setExpandedDistrict={setExpandedLs24Churn}
                    title="LS-Wise Assembly Segment Churn (LS 2024 → Assembly 2026)"
                    subtitle="Compares each AC's LS 2024 vote leader against its Assembly 2026 winner. Shows how much LS-cycle momentum carried into the assembly cycle."
                    columnLabel="Lok Sabha Seat"
                    prevLabel="LS 2024 Leader"
                    prevLabelShort="LS 2024"
                    groupNoun="Lok Sabha seat"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ──────────────  District card drill-down modal  ────────────── */}
      {districtCardModal && (
        <div onClick={() => setDistrictCardModal(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(7, 9, 26, 0.78)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '4vh 1rem', zIndex: 50, overflowY: 'auto',
          }}>
          <div onClick={e => e.stopPropagation()} className="card"
            style={{
              maxWidth: 900, width: '100%',
              borderLeft: `4px solid ${districtCardModal.accent}`,
              maxHeight: '92vh', overflowY: 'auto',
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  <span style={{ marginRight: 6 }}>{districtCardModal.emoji}</span>{districtCardModal.label}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: districtCardModal.accent }}>
                  {districtCardModal.district.name}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  {districtCardModal.district.seats_2026} assembly constituencies
                </div>
              </div>
              <button onClick={() => setDistrictCardModal(null)}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                         borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>Close ✕</button>
            </div>

            {districtCardModal.kind === 'most_flipped'   && <MostFlippedBody d={districtCardModal.district} state={state!} accent={districtCardModal.accent} />}
            {districtCardModal.kind === 'sweep'          && <SweepBody d={districtCardModal.district} state={state!} accent={districtCardModal.accent} />}
            {districtCardModal.kind === 'most_contested' && <MostContestedBody d={districtCardModal.district} state={state!} accent={districtCardModal.accent} />}
            {districtCardModal.kind === 'closest'        && <ClosestBody d={districtCardModal.district} state={state!} accent={districtCardModal.accent} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────  District card drill-down body components  ─────────

function MostFlippedBody({ d, state, accent }: { d: any; state: string; accent: string }) {
  const fmt = (n: number) => fmtIN(n)
  const flipped = d.acs.filter((a: any) => a.flipped)
  const held = d.acs.filter((a: any) => a.winner_party_2026 && a.winner_party_2021 && a.winner_party_2026 === a.winner_party_2021)
  // Group flips by from→to pair to surface dominant flow
  const flows: Record<string, { from: string; to: string; from_color: string; to_color: string; acs: any[] }> = {}
  flipped.forEach((a: any) => {
    const key = `${a.winner_party_2021}→${a.winner_party_2026}`
    if (!flows[key]) flows[key] = { from: a.winner_party_2021, to: a.winner_party_2026, from_color: a.winner_party_2021_color, to_color: a.winner_party_2026_color, acs: [] }
    flows[key].acs.push(a)
  })
  const flowList = Object.values(flows).sort((a, b) => b.acs.length - a.acs.length)
  return (
    <>
      <div style={{ fontSize: '0.95rem', marginBottom: '1.25rem' }}>
        <strong style={{ color: accent }}>{d.flipped_count}</strong> of <strong>{d.seats_2026}</strong> seats here changed party between 2021 and 2026 —
        the highest flip count in the state. <strong>{held.length}</strong> seats were held by their 2021 winner.
      </div>

      <div className="section-title">Flow — who took seats from whom</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '1.25rem' }}>
        {flowList.map(f => (
          <div key={`${f.from}-${f.to}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.45rem 0.7rem', borderRadius: 8, background: 'var(--bg-secondary)' }}>
            <span style={{ color: f.from_color, fontWeight: 700 }}>{f.from}</span>
            <span style={{ color: 'var(--text-secondary)' }}>→</span>
            <span style={{ color: f.to_color, fontWeight: 700 }}>{f.to}</span>
            <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: '0.95rem', color: accent }}>{f.acs.length}</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>seat{f.acs.length === 1 ? '' : 's'}</span>
          </div>
        ))}
      </div>

      <div className="section-title">Every Flipped Seat</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {flipped.sort((a: any, b: any) => b.margin_2026 - a.margin_2026).map((a: any) => (
          <div key={a.ac_number}
            onClick={() => window.open(`/${state}/constituencies/${a.ac_number}`, '_blank')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '0.4rem 0.6rem', borderRadius: 6, cursor: 'pointer',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
            }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 36 }}>AC#{a.ac_number}</span>
            <span style={{ fontWeight: 700, fontSize: '0.85rem', flex: 1 }}>{a.name}</span>
            <span style={{ color: a.winner_party_2021_color, fontWeight: 600, fontSize: '0.78rem' }}>{a.winner_party_2021}</span>
            <span style={{ color: 'var(--text-secondary)' }}>→</span>
            <span style={{ color: a.winner_party_2026_color, fontWeight: 700, fontSize: '0.82rem' }}>{a.winner_party_2026}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 80, textAlign: 'right' }}>margin {fmt(a.margin_2026)}</span>
          </div>
        ))}
      </div>

      {held.length > 0 && (() => {
        // Group held seats by the party that held them
        const heldByParty: Record<string, { color: string; acs: any[] }> = {}
        held.forEach((a: any) => {
          if (!heldByParty[a.winner_party_2026]) {
            heldByParty[a.winner_party_2026] = { color: a.winner_party_2026_color, acs: [] }
          }
          heldByParty[a.winner_party_2026].acs.push(a)
        })
        const groups = Object.entries(heldByParty).sort((a, b) => b[1].acs.length - a[1].acs.length)
        return (
          <>
            <div className="section-title" style={{ marginTop: 18 }}>
              Seats Held by Same Party ({held.length})
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
              These seats stayed with their 2021 winner — the bedrock of each party's position in this district.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {groups.map(([party, info]) => (
                <div key={party} style={{ border: `1px solid ${info.color}44`, borderRadius: 8, padding: '0.65rem 0.85rem', background: `${info.color}08` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: info.color }}>{party}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      held <strong>{info.acs.length}</strong> seat{info.acs.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {info.acs.sort((a: any, b: any) => b.margin_2026 - a.margin_2026).map((a: any) => (
                      <div key={a.ac_number}
                        onClick={() => window.open(`/${state}/constituencies/${a.ac_number}`, '_blank')}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '0.3rem 0.55rem', borderRadius: 5, cursor: 'pointer',
                          background: 'var(--bg-card)', border: '1px solid var(--border)',
                        }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', minWidth: 36 }}>AC#{a.ac_number}</span>
                        <span style={{ fontWeight: 600, fontSize: '0.82rem', flex: 1 }}>{a.name}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                          margin <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fmt(a.margin_2026)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )
      })()}
    </>
  )
}

function SweepBody({ d, state, accent }: { d: any; state: string; accent: string }) {
  const fmt = (n: number) => fmtIN(n)
  const sweepParty = d.sweep_party
  const sweepWins = d.acs.filter((a: any) => a.winner_party_2026 === sweepParty)
  const escapees = d.acs.filter((a: any) => a.winner_party_2026 !== sweepParty)
  const sweepColor = d.acs.find((a: any) => a.winner_party_2026 === sweepParty)?.winner_party_2026_color || accent
  const pct = ((sweepWins.length / d.seats_2026) * 100).toFixed(0)
  return (
    <>
      <div style={{ fontSize: '0.95rem', marginBottom: '1.25rem' }}>
        <strong style={{ color: sweepColor }}>{sweepParty}</strong> swept <strong>{sweepWins.length}</strong> of <strong>{d.seats_2026}</strong> seats here ({pct}% dominance).
        {escapees.length > 0
          ? <> Only <strong>{escapees.length}</strong> seat{escapees.length === 1 ? '' : 's'} broke the sweep.</>
          : <> A clean sweep of every AC in the district.</>}
      </div>

      <div className="section-title">{sweepParty} Wins ({sweepWins.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: '1.25rem' }}>
        {sweepWins.sort((a: any, b: any) => b.margin_2026 - a.margin_2026).map((a: any) => (
          <div key={a.ac_number}
            onClick={() => window.open(`/${state}/constituencies/${a.ac_number}`, '_blank')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '0.4rem 0.6rem', borderRadius: 6, cursor: 'pointer',
              background: `${sweepColor}14`, border: `1px solid ${sweepColor}44`,
            }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 36 }}>AC#{a.ac_number}</span>
            <span style={{ fontWeight: 700, fontSize: '0.85rem', flex: 1 }}>{a.name}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 80, textAlign: 'right' }}>+{fmt(a.margin_2026)}</span>
            {a.flipped && <span style={{ fontSize: '0.6rem', color: '#22c55e', fontWeight: 700, marginLeft: 4 }}>FLIP</span>}
          </div>
        ))}
      </div>

      {escapees.length > 0 && (
        <>
          <div className="section-title">The {escapees.length === 1 ? 'Escapee' : 'Escapees'}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
            Seats that didn't fall to {sweepParty}:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {escapees.map((a: any) => (
              <div key={a.ac_number}
                onClick={() => window.open(`/${state}/constituencies/${a.ac_number}`, '_blank')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '0.4rem 0.6rem', borderRadius: 6, cursor: 'pointer',
                  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 36 }}>AC#{a.ac_number}</span>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', flex: 1 }}>{a.name}</span>
                <span style={{ color: a.winner_party_2026_color, fontWeight: 700, fontSize: '0.82rem' }}>{a.winner_party_2026}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 80, textAlign: 'right' }}>won by {fmt(a.margin_2026)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function MostContestedBody({ d, state, accent }: { d: any; state: string; accent: string }) {
  const fmt = (n: number) => fmtIN(n)
  // Group ACs by winning party
  const byParty: Record<string, { color: string; acs: any[] }> = {}
  d.acs.forEach((a: any) => {
    if (!a.winner_party_2026) return
    if (!byParty[a.winner_party_2026]) byParty[a.winner_party_2026] = { color: a.winner_party_2026_color, acs: [] }
    byParty[a.winner_party_2026].acs.push(a)
  })
  const grouped = Object.entries(byParty).sort((a, b) => b[1].acs.length - a[1].acs.length)
  const avgMarginThisDistrict = d.avg_margin
  return (
    <>
      <div style={{ fontSize: '0.95rem', marginBottom: '1.25rem' }}>
        <strong style={{ color: accent }}>{d.distinct_winners}</strong> different parties won seats in this district — the most fragmented result anywhere in the state.
        No single party could dominate; even the leader ({d.leader_party}) only took {d.leader_seats}/{d.seats_2026}.
      </div>

      <div className="section-title">Seat Distribution</div>
      <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', marginBottom: '1.25rem' }}>
        {grouped.map(([party, info]) => {
          const pct = (info.acs.length / d.seats_2026) * 100
          return (
            <div key={party} style={{
              width: `${pct}%`, background: info.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.7rem', fontWeight: 700, color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }} title={`${party}: ${info.acs.length} seats`}>
              {pct >= 8 ? `${party} ${info.acs.length}` : ''}
            </div>
          )
        })}
      </div>

      <div className="section-title">Wins by Party</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {grouped.map(([party, info]) => (
          <div key={party} style={{ border: `1px solid ${info.color}44`, borderRadius: 8, padding: '0.7rem 0.9rem', background: `${info.color}08` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: info.color }}>{party}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{info.acs.length} of {d.seats_2026} seats</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {info.acs.sort((a: any, b: any) => a.ac_number - b.ac_number).map((ac: any) => (
                <span key={ac.ac_number}
                  onClick={() => window.open(`/${state}/constituencies/${ac.ac_number}`, '_blank')}
                  style={{
                    padding: '0.22rem 0.5rem', borderRadius: 5, fontSize: '0.7rem', cursor: 'pointer',
                    background: `${info.color}1a`, color: info.color, border: `1px solid ${info.color}44`,
                  }}>
                  <span style={{ opacity: 0.6, marginRight: 4 }}>AC#{ac.ac_number}</span>{ac.name}
                  <span style={{ marginLeft: 5, color: 'var(--text-secondary)', fontSize: '0.65rem' }}>+{fmt(ac.margin_2026)}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        Average margin here: <strong>{fmt(avgMarginThisDistrict)}</strong> · the more parties win, the smaller individual margins tend to be.
      </div>
    </>
  )
}

function ClosestBody({ d, state, accent }: { d: any; state: string; accent: string }) {
  const fmt = (n: number) => fmtIN(n)
  // Sort by margin ascending — closest first
  const sorted = [...d.acs].sort((a: any, b: any) => a.margin_2026 - b.margin_2026)
  const closest = sorted[0]
  const veryClose = sorted.filter((a: any) => a.margin_2026 < 5000)
  return (
    <>
      <div style={{ fontSize: '0.95rem', marginBottom: '1.25rem' }}>
        Average winning margin in <strong>{d.name}</strong>: only <strong style={{ color: accent }}>{fmt(d.avg_margin)}</strong> votes —
        the tightest in the state. <strong>{d.close_seats}</strong> seat{d.close_seats === 1 ? '' : 's'} had a margin under 5,000.
      </div>

      {closest && (
        <div style={{ marginBottom: '1.25rem', padding: '0.9rem 1.1rem', borderRadius: 10,
                      background: `${accent}14`, border: `1px solid ${accent}55` }}>
          <div style={{ fontSize: '0.7rem', color: accent, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>
            🎯 Closest Contest
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 4 }}>{closest.name}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span style={{ color: closest.winner_party_2026_color, fontWeight: 700 }}>{closest.winner_party_2026}</span>{' '}
            beat{' '}
            <span style={{ color: closest.runner_up_party_2026_color, fontWeight: 700 }}>{closest.runner_up_party_2026}</span>{' '}
            by just <strong>{fmt(closest.margin_2026)}</strong> votes.
          </div>
        </div>
      )}

      <div className="section-title">Every AC, Closest First</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {sorted.map((a: any, i: number) => {
          const veryTight = a.margin_2026 < 5000
          return (
            <div key={a.ac_number}
              onClick={() => window.open(`/${state}/constituencies/${a.ac_number}`, '_blank')}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0.4rem 0.6rem', borderRadius: 6, cursor: 'pointer',
                background: veryTight ? `${accent}10` : 'var(--bg-card)',
                border: `1px solid ${veryTight ? `${accent}55` : 'var(--border)'}`,
              }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', minWidth: 22 }}>#{i + 1}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 36 }}>AC#{a.ac_number}</span>
              <span style={{ fontWeight: 700, fontSize: '0.85rem', flex: 1 }}>{a.name}</span>
              <span style={{ color: a.winner_party_2026_color, fontWeight: 700, fontSize: '0.78rem' }}>{a.winner_party_2026}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>vs</span>
              <span style={{ color: a.runner_up_party_2026_color, fontWeight: 600, fontSize: '0.78rem' }}>{a.runner_up_party_2026}</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, minWidth: 70, textAlign: 'right',
                             color: a.margin_2026 < 1000 ? '#ef4444' : a.margin_2026 < 5000 ? '#f59e0b' : 'var(--text-secondary)' }}>
                {fmt(a.margin_2026)}
              </span>
            </div>
          )
        })}
      </div>

      {veryClose.length > 0 && (
        <div style={{ marginTop: 14, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          <strong>{veryClose.length}</strong> seat{veryClose.length === 1 ? '' : 's'} decided by fewer than 5,000 votes — any small swing flips them.
        </div>
      )}
    </>
  )
}
