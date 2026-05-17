import { Fragment, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, BarChart, Bar, Cell, LabelList,
} from 'recharts'
import { usePartyAnalytics, useResults } from '../lib/api'
import PartyLogo from '../components/PartyLogo'
import InsightsCard, { type Insight } from '../components/InsightsCard'
import SortableTh from '../components/SortableTh'
import { useSortable } from '../lib/useSortable'
import { Skeleton, PageSkeleton } from '../components/Skeleton'
import { EmptyState } from '../components/EmptyState'
import { readableOnDark } from '../lib/format'
import { axisTickStyle, tooltipContentStyle, tooltipLabelStyle, refLineStyle, rankLabel } from '../lib/chartTheme'
import { fmtCompact, fmtIN } from '../lib/format'
import { useEscapeKey } from '../lib/useEscapeKey'

// Per-party analytics: strike rate, vote efficiency, geographic reach, dominant
// districts. Distinct from Overview (seats) and Swing (2021↔2026 deltas) — this
// page is about *how* each party built and converted its candidate slate.

const fmtK = (n: number) => n >= 100_000 ? `${(n / 100_000).toFixed(1)}L` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

// One headline tile in the KPI row. Renders a placeholder if `pick` is null
// so the grid always lays out 4 evenly-spaced cards.
function HeroCard({
  emoji, label, accent, pick, metric, detail, onClick,
}: {
  emoji: string
  label: string
  accent: string
  pick: any
  metric?: string
  detail?: string
  onClick?: () => void
}) {
  if (!pick) {
    return (
      <div className="stat-card" style={{
        padding: '1.1rem 1.25rem', minHeight: 156, opacity: 0.45,
        borderLeft: '4px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.4rem', lineHeight: 1, filter: 'grayscale(1)' }}>{emoji}</span>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
            {label}
          </div>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 'auto', fontStyle: 'italic' }}>
          Not enough data to rank yet.
        </div>
      </div>
    )
  }
  const clickable = !!onClick
  return (
    <div className="stat-card"
      onClick={onClick}
      onMouseEnter={e => { if (clickable) e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { if (clickable) e.currentTarget.style.transform = '' }}
      style={{
        padding: '1.1rem 1.25rem', minHeight: 156,
        borderLeft: `4px solid ${accent}`,
        background: `linear-gradient(135deg, ${accent}0d 0%, transparent 60%)`,
        display: 'flex', flexDirection: 'column', gap: 10,
        cursor: clickable ? 'pointer' : 'default',
        transition: 'transform 0.15s ease',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{emoji}</span>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
          {label}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
        <PartyLogo party={pick.party} size={28} />
        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: pick.color }}>{pick.party}</div>
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: accent, lineHeight: 1, marginTop: -2 }}>
        {metric ?? '—'}
      </div>
      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: 'auto' }}>
        {detail ?? ''}
      </div>
      {clickable && (
        <div style={{ fontSize: '0.7rem', color: accent, fontWeight: 600, marginTop: 4 }}>
          See breakdown <span style={{ fontSize: '0.8rem' }}>→</span>
        </div>
      )}
    </div>
  )
}

// ───────────────  Expanded party row ───────────────
// Mini-dashboard shown when a party row is expanded. Lays out a 4-stat strip
// (with state-average context underneath each number), a stronghold-districts
// row sized by seat count, and an age/asset bar.
function ExpandedPartyPanel({
  p, stateAvg, onDistrictClick,
}: {
  p: any
  stateAvg: { votes_per_seat: number | null; avg_age: number | null; avg_assets_cr: number | null; criminal_pct: number | null }
  onDistrictClick: (district: string) => void
}) {
  const accent = p.color
  // `accentText` is a brightened variant used wherever the accent appears as
  // text on the dark theme — dark party colors (CPI(M) #CC0000, RJD brown) are
  // unreadable as text but fine as bar fills.
  const accentText = readableOnDark(accent)
  // Compare values to the state average; returns a tiny "vs avg" footer string.
  const vsAvg = (val: number | null | undefined, avg: number | null, fmt: (n: number) => string, lowerIsBetter = false) => {
    if (val == null || avg == null || avg === 0) return null
    const ratio = val / avg
    const pct = Math.round((ratio - 1) * 100)
    const better = lowerIsBetter ? ratio < 1 : ratio > 1
    const color = pct === 0 ? 'var(--text-secondary)' : better ? '#22c55e' : '#ef4444'
    if (Math.abs(pct) < 5) return <span style={{ color: 'var(--text-secondary)' }}>≈ state avg ({fmt(avg)})</span>
    return <span style={{ color }}>{pct > 0 ? '+' : ''}{pct}% vs state avg ({fmt(avg)})</span>
  }

  const tile = (label: string, emoji: string, primary: string, secondary: React.ReactNode) => (
    <div style={{
      flex: 1, minWidth: 0,
      padding: '0.7rem 0.85rem',
      borderRadius: 10,
      background: `linear-gradient(145deg, ${accent}14 0%, ${accent}05 60%, transparent 100%)`,
      border: `1px solid ${accent}33`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>{emoji}</span>
        <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)' }}>
          {label}
        </span>
      </div>
      <div className="tabular" style={{ fontSize: '1.1rem', fontWeight: 800, color: accentText, lineHeight: 1.15 }}>{primary}</div>
      <div style={{ fontSize: '0.66rem', marginTop: 3, fontWeight: 500 }}>{secondary}</div>
    </div>
  )

  // Max seat-count among stronghold districts → used to size the pills proportionally.
  const maxSeats = Math.max(1, ...(p.top_districts?.map((d: any) => d.seats) ?? [1]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Row 1 — 4 KPI tiles with vs-state-avg context */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {tile(
          'Votes Polled', '🗳️',
          p.total_votes != null ? `${(p.total_votes / 1e5).toFixed(1)}L` : '—',
          <span style={{ color: 'var(--text-secondary)' }}>{p.total_votes != null ? `${p.total_votes.toLocaleString('en-IN')} total` : ''}</span>,
        )}
        {tile(
          'Votes / Seat Won', '🎯',
          p.votes_per_seat != null ? `${Math.round(p.votes_per_seat / 1000)}k` : '—',
          vsAvg(p.votes_per_seat, stateAvg.votes_per_seat, n => `${Math.round(n / 1000)}k`, true) ?? <span style={{ opacity: 0 }}>—</span>,
        )}
        {tile(
          'Avg Candidate Age', '👤',
          p.avg_age != null ? `${p.avg_age} yrs` : '—',
          p.youngest != null
            ? <span style={{ color: 'var(--text-secondary)' }}>{p.youngest}–{p.oldest} yrs range</span>
            : <span style={{ opacity: 0 }}>—</span>,
        )}
        {tile(
          'Avg Assets', '💰',
          p.avg_assets_cr != null ? `₹${p.avg_assets_cr} cr` : '—',
          vsAvg(p.avg_assets_cr, stateAvg.avg_assets_cr, n => `₹${n.toFixed(1)} cr`)
            ?? (p.median_assets_cr != null ? <span style={{ color: 'var(--text-secondary)' }}>median ₹{p.median_assets_cr} cr</span> : <span style={{ opacity: 0 }}>—</span>),
        )}
      </div>

      {/* Row 2 — Stronghold districts + Slate composition */}
      <div className="col-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, fontWeight: 700 }}>
            🗺️ Stronghold districts {p.top_districts?.length ? `· ${p.top_districts.length} where ${p.party} won` : ''}
          </div>
          {p.top_districts?.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'flex-end' }}>
              {p.top_districts.map((td: any) => {
                // Pill height grows with seat count (visual weight) so dominant districts pop.
                const sizeRatio = td.seats / maxSeats
                const fontSize = 0.74 + sizeRatio * 0.12
                return (
                  <button key={td.district}
                    onClick={() => onDistrictClick(td.district)}
                    title={`See all ${p.party} wins in ${td.district}`}
                    style={{
                      padding: '0.4rem 0.7rem',
                      borderRadius: 8,
                      fontSize: `${fontSize}rem`,
                      fontWeight: 700,
                      background: `linear-gradient(135deg, ${accent}${Math.round(20 + sizeRatio * 25).toString(16).padStart(2, '0')} 0%, ${accent}10 100%)`,
                      color: accentText,
                      border: `1px solid ${accent}${Math.round(60 + sizeRatio * 40).toString(16).padStart(2, '0')}`,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'transform 0.15s ease, border-color 0.15s ease',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = '' }}
                  >
                    {td.district}
                    <span className="tabular" style={{
                      padding: '0.05rem 0.4rem',
                      borderRadius: 999,
                      background: accentText,
                      color: '#0e1226',
                      fontSize: '0.65rem',
                      fontWeight: 800,
                    }}>
                      {td.seats}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              No districts won. {p.party} contested {p.contested} seat{p.contested === 1 ? '' : 's'} but didn't win any.
            </div>
          )}
        </div>

        {/* Slate composition: age range bar + criminality */}
        <div>
          <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, fontWeight: 700 }}>
            🧑‍🤝‍🧑 Slate composition
          </div>

          {/* Age range with avg marker */}
          {p.youngest != null && p.oldest != null && p.avg_age != null && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', color: 'var(--text-secondary)', marginBottom: 3 }}>
                <span>Age {p.youngest}</span>
                <span style={{ color: accentText, fontWeight: 700 }}>avg {p.avg_age}</span>
                <span>{p.oldest}</span>
              </div>
              <div style={{ position: 'relative', height: 8, borderRadius: 6, background: 'var(--bg-secondary)', overflow: 'visible' }}>
                {/* Range bar */}
                <div style={{
                  position: 'absolute',
                  left: `${((p.youngest - 25) / 60) * 100}%`,
                  width: `${((p.oldest - p.youngest) / 60) * 100}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, ${accent}55 0%, ${accent} 50%, ${accent}55 100%)`,
                  borderRadius: 6,
                }} />
                {/* Avg marker */}
                <div style={{
                  position: 'absolute',
                  left: `calc(${((p.avg_age - 25) / 60) * 100}% - 4px)`,
                  top: -3, bottom: -3,
                  width: 8,
                  borderRadius: 2,
                  background: accent,
                  boxShadow: `0 0 8px ${accent}aa`,
                }} />
              </div>
            </div>
          )}

          {/* Criminal cases bar */}
          {p.candidates_with_criminal != null && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: 3 }}>
                <span style={{ color: 'var(--text-secondary)' }}>⚖️ With criminal cases</span>
                <span className="tabular" style={{ fontWeight: 700, color: p.criminal_pct >= 30 ? '#ef4444' : p.criminal_pct >= 15 ? '#f59e0b' : '#22c55e' }}>
                  {p.candidates_with_criminal}/{p.contested} ({p.criminal_pct ?? 0}%)
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                <div style={{
                  width: `${p.criminal_pct ?? 0}%`,
                  height: '100%',
                  background: p.criminal_pct >= 30 ? '#ef4444' : p.criminal_pct >= 15 ? '#f59e0b' : '#22c55e',
                  borderRadius: 3,
                  transition: 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
                }} />
              </div>
              {p.max_criminal_cases != null && p.max_criminal_cases > 0 && (
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 3 }}>
                  Most by one candidate: <strong style={{ color: 'var(--text-primary)' }}>{p.max_criminal_cases}</strong> cases
                </div>
              )}
            </div>
          )}

          {/* Asset spread (avg vs median tells you about skew) */}
          {p.avg_assets_cr != null && p.median_assets_cr != null && (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 8, padding: '0.4rem 0.55rem', background: 'var(--bg-secondary)', borderRadius: 6 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Assets:</strong>{' '}
              avg <span className="tabular" style={{ color: accentText, fontWeight: 700 }}>₹{p.avg_assets_cr} cr</span>
              {' · '}median <span className="tabular" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>₹{p.median_assets_cr} cr</span>
              {p.avg_assets_cr > p.median_assets_cr * 1.5 && (
                <span style={{ color: '#f59e0b', fontStyle: 'italic', marginLeft: 6 }}>
                  · skewed by a few wealthy candidates
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ───────────────  Card drill-down modals ───────────────

type CardKind = 'strike' | 'efficient' | 'reach' | 'dominant'

function StrikeRateBody({ party, state, allParties }: { party: any; state: string; allParties: any[] }) {
  const { data, isLoading } = useResults(state, { party: party.party, limit: 500, sort_by: 'votes_desc' })
  const rows = data?.candidates ?? []
  // Compare with top 4 other parties by strike rate
  const compare = allParties.filter((p: any) => p.contested >= 5).slice(0, 5)
  return (
    <>
      <div style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>
        <strong style={{ color: party.color }}>{party.party}</strong> won{' '}
        <strong>{party.won}</strong> of <strong>{party.contested}</strong> seats they contested —{' '}
        <strong style={{ color: '#22c55e' }}>{party.strike_rate}% strike rate</strong>.
      </div>

      <div className="section-title">How They Compare</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '1.25rem' }}>
        {compare.map((p: any) => (
          <div key={p.party} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PartyLogo party={p.party} size={16} />
            <div style={{ width: 65, fontSize: '0.78rem', fontWeight: 600, color: p.color }}>{p.party}</div>
            <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 3, height: 14, overflow: 'hidden' }}>
              <div style={{ width: `${p.strike_rate}%`, height: '100%', background: p.color, borderRadius: 3 }} />
            </div>
            <div style={{ width: 55, textAlign: 'right', fontSize: '0.78rem', fontWeight: 700 }}>{p.strike_rate}%</div>
            <div style={{ width: 70, textAlign: 'right', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{p.won}/{p.contested}</div>
          </div>
        ))}
      </div>

      <div className="section-title">Every Seat They Contested</div>
      {isLoading && <div style={{ padding: '0.5rem 0' }}><Skeleton height={14} width="60%" /><Skeleton height={14} width="80%" style={{ marginTop: 6 }} /><Skeleton height={14} width="70%" style={{ marginTop: 6 }} /></div>}
      <div style={{ maxHeight: '40vh', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
        <table>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
            <tr>
              <th style={{ fontSize: '0.7rem' }}>AC#</th>
              <th style={{ fontSize: '0.7rem' }}>Constituency</th>
              <th style={{ fontSize: '0.7rem' }}>District</th>
              <th style={{ fontSize: '0.7rem', textAlign: 'right' }}>Votes</th>
              <th style={{ fontSize: '0.7rem', textAlign: 'right' }}>Margin (from leader)</th>
              <th style={{ fontSize: '0.7rem' }}>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c: any) => (
              <tr key={c.ac_number}
                  onClick={() => window.open(`/${state}/constituencies/${c.ac_number}`, '_blank')}
                  style={{ cursor: 'pointer', background: c.is_winner ? 'rgba(34,197,94,0.05)' : 'transparent' }}>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{c.ac_number}</td>
                <td style={{ fontSize: '0.82rem', fontWeight: 600 }}>{c.constituency}</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{c.district || '—'}</td>
                <td style={{ textAlign: 'right', fontSize: '0.78rem' }}>{fmtIN(c.votes)}</td>
                <td style={{ textAlign: 'right', fontSize: '0.75rem', fontWeight: 600,
                             color: c.margin > 0 ? '#22c55e' : c.margin < 0 ? '#ef4444' : 'var(--text-secondary)' }}>
                  {c.margin === 0 ? '—' : c.margin > 0 ? `+${fmtIN(c.margin)}` : `−${fmtIN(Math.abs(c.margin))}`}
                </td>
                <td>
                  {c.is_winner
                    ? <span className="badge badge-green" style={{ fontSize: '0.65rem' }}>Won</span>
                    : <span className="badge" style={{ background: 'rgba(148,163,184,0.1)', color: 'var(--text-secondary)', fontSize: '0.65rem' }}>Lost</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function VoteEfficientBody({ party, allParties }: { party: any; allParties: any[] }) {
  const seatBacked = allParties.filter((p: any) => p.won >= 3 && p.votes_per_seat != null)
  const sortedByEff = [...seatBacked].sort((a, b) => a.votes_per_seat - b.votes_per_seat)
  const worst = sortedByEff[sortedByEff.length - 1]
  const ratio = worst && party.votes_per_seat
    ? (worst.votes_per_seat / party.votes_per_seat).toFixed(1)
    : null
  const maxVps = Math.max(...sortedByEff.map((p: any) => p.votes_per_seat))
  return (
    <>
      <div className="section-title">The Math</div>
      <div style={{
        padding: '1rem 1.25rem', borderRadius: 10, background: 'var(--bg-secondary)',
        border: `1px solid ${party.color}44`, marginBottom: '1.25rem',
        fontSize: '0.9rem', lineHeight: 1.8,
      }}>
        <div><strong>{fmtIN(party.total_votes)}</strong> total votes polled by <span style={{ color: party.color, fontWeight: 700 }}>{party.party}</span> across all their candidates</div>
        <div>÷ <strong>{party.won}</strong> seats won</div>
        <div>= <strong style={{ color: '#06b6d4', fontSize: '1.05rem' }}>{fmtIN(party.votes_per_seat)} votes per seat</strong></div>
      </div>

      {worst && worst.party !== party.party && (
        <>
          <div className="section-title">Vs The Least Efficient</div>
          <div style={{ fontSize: '0.88rem', marginBottom: '1.25rem', lineHeight: 1.55 }}>
            <strong style={{ color: worst.color }}>{worst.party}</strong> needed <strong>{fmtIN(worst.votes_per_seat)}</strong> votes for each seat —{' '}
            <strong style={{ color: '#ef4444' }}>{ratio}× more than {party.party}</strong>.
            Despite polling {fmtIN(worst.total_votes)} votes (≈{(worst.total_votes / party.total_votes).toFixed(1)}× {party.party}'s total),
            they won only <strong>{worst.won}</strong> seats. That gap is what vote efficiency measures.
          </div>
        </>
      )}

      <div className="section-title">All Parties Ranked by Efficiency</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 8 }}>Lower bar = more efficient. Parties with ≥3 wins.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {sortedByEff.map((p: any) => {
          const w = (p.votes_per_seat / maxVps) * 100
          return (
            <div key={p.party} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <PartyLogo party={p.party} size={16} />
              <div style={{ width: 65, fontSize: '0.78rem', fontWeight: 600, color: p.color }}>{p.party}</div>
              <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 3, height: 14, overflow: 'hidden' }}>
                <div style={{ width: `${w}%`, height: '100%', background: p.color, borderRadius: 3 }} />
              </div>
              <div style={{ width: 90, textAlign: 'right', fontSize: '0.78rem', fontWeight: p.party === party.party ? 700 : 500 }}>
                {(p.votes_per_seat / 1000).toFixed(1)}k
              </div>
              <div style={{ width: 50, textAlign: 'right', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{p.won} seats</div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function WidestReachBody({ party, state }: { party: any; state: string }) {
  const { data, isLoading } = useResults(state, { party: party.party, winners_only: true, limit: 500 })
  const wins = data?.candidates ?? []
  // Group by district
  const grouped: Record<string, any[]> = {}
  wins.forEach((w: any) => {
    const d = w.district || 'Unknown'
    if (!grouped[d]) grouped[d] = []
    grouped[d].push(w)
  })
  const districtRows = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length)
  return (
    <>
      <div style={{ fontSize: '0.95rem', marginBottom: '1.25rem' }}>
        <strong style={{ color: party.color }}>{party.party}</strong> won at least one seat in{' '}
        <strong>{party.districts_won_count}</strong> districts, totaling{' '}
        <strong>{party.won}</strong> MLAs.
      </div>
      {isLoading && <Skeleton height={16} width="40%" />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
        {districtRows.map(([district, acs]) => (
          <div key={district} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.65rem 0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 700 }}>{district}</div>
              <div style={{ fontSize: '0.75rem', color: party.color, fontWeight: 700 }}>{acs.length} seat{acs.length === 1 ? '' : 's'}</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {acs
                .slice()
                .sort((a: any, b: any) => (b.margin ?? 0) - (a.margin ?? 0))
                .map((ac: any) => (
                  <span key={ac.ac_number}
                    onClick={() => window.open(`/${state}/constituencies/${ac.ac_number}`, '_blank')}
                    title={`Won by ${fmtIN(ac.margin)} votes`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '0.25rem 0.55rem', borderRadius: 5, fontSize: '0.72rem',
                      background: `${party.color}1a`, color: party.color,
                      border: `1px solid ${party.color}44`, cursor: 'pointer',
                    }}>
                    <span style={{ opacity: 0.65 }}>AC#{ac.ac_number}</span>
                    <span>{ac.constituency}</span>
                    <span className="tabular" style={{
                      marginLeft: 2, paddingLeft: 6,
                      borderLeft: `1px solid ${party.color}55`,
                      fontWeight: 700, opacity: 0.92,
                    }}>
                      +{fmtCompact(ac.margin ?? 0)}
                    </span>
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// Modal popup: every seat a specific party won inside one district, sorted by
// margin descending. Opened from the stronghold-district pills in the expanded
// party row. Stays inside the Parties page (no route change) so the user's
// table state is preserved.
function DistrictDrillModal({
  party, partyColor, district, state, onClose,
}: {
  party: string
  partyColor: string
  district: string
  state: string
  onClose: () => void
}) {
  useEscapeKey(true, onClose)
  const { data, isLoading } = useResults(state, { party, district, winners_only: true, limit: 500 })
  const wins = (data?.candidates ?? []).slice().sort((a: any, b: any) => (b.margin ?? 0) - (a.margin ?? 0))
  const totalVotes = wins.reduce((s: number, c: any) => s + (c.votes ?? 0), 0)
  const accentText = readableOnDark(partyColor)
  const navigate = useNavigate()

  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(7, 9, 26, 0.78)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '6vh 1rem', zIndex: 60, overflowY: 'auto',
      }}>
      <div onClick={e => e.stopPropagation()} className="card"
        style={{ maxWidth: 760, width: '100%', borderLeft: `4px solid ${partyColor}`, maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              <span style={{ marginRight: 6 }}>🗺️</span>{district} District · <span style={{ color: accentText, fontWeight: 700 }}>{party}</span> wins
            </div>
            {!isLoading && (
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: accentText }}>
                {wins.length} {wins.length === 1 ? 'seat' : 'seats'} won
              </div>
            )}
            {!isLoading && wins.length > 0 && (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                <strong className="tabular" style={{ color: 'var(--text-primary)' }}>{fmtIN(totalVotes)}</strong> total votes polled by {party} candidates in this district.
              </div>
            )}
          </div>
          <button onClick={onClose}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                     borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>
            Close ✕
          </button>
        </div>

        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton height={14} width="70%" />
            <Skeleton height={14} width="55%" />
            <Skeleton height={14} width="80%" />
          </div>
        )}

        {!isLoading && wins.length === 0 && (
          <EmptyState
            title="No wins in this district."
            body={`${party} contested but didn't win any seat in ${district}.`}
          />
        )}

        {!isLoading && wins.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '38px 1fr auto auto auto', gap: '0.6rem', padding: '0.4rem 0.75rem',
                          fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>
              <span>AC#</span><span>Constituency · Winner</span><span style={{ textAlign: 'right' }}>Votes</span><span style={{ textAlign: 'right' }}>Share</span><span style={{ textAlign: 'right' }}>Margin</span>
            </div>
            {wins.map((c: any) => {
              const margin = c.margin ?? 0
              const isComfortable = margin >= 10000
              return (
                <div key={c.ac_number}
                  onClick={() => { onClose(); navigate(`/${state}/constituencies/${c.ac_number}`) }}
                  title={`Open ${c.constituency} detail`}
                  style={{
                    display: 'grid', gridTemplateColumns: '38px 1fr auto auto auto', gap: '0.6rem',
                    alignItems: 'center',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 8,
                    background: `${partyColor}10`,
                    border: `1px solid ${partyColor}30`,
                    cursor: 'pointer',
                    transition: 'background 0.15s ease, border-color 0.15s ease, transform 0.12s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = `${partyColor}1f`
                    e.currentTarget.style.borderColor = `${partyColor}66`
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = `${partyColor}10`
                    e.currentTarget.style.borderColor = `${partyColor}30`
                    e.currentTarget.style.transform = ''
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>AC#{c.ac_number}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.constituency}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{c.name}</div>
                  </div>
                  <span className="tabular" style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                    {fmtIN(c.votes)}
                  </span>
                  <span className="tabular" style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {c.vote_share != null ? `${c.vote_share.toFixed(1)}%` : '—'}
                  </span>
                  <span className="tabular" style={{
                    textAlign: 'right', fontWeight: 800, fontSize: '0.86rem',
                    color: isComfortable ? '#22c55e' : '#f59e0b',
                  }}
                  title={isComfortable ? 'Comfortable margin' : 'Close contest'}>
                    +{fmtCompact(margin)}
                  </span>
                </div>
              )
            })}
            <div style={{ marginTop: 10, fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic',
                          padding: '0.5rem 0.7rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
              Sorted by winning margin (largest first). Click any row to open the constituency's full breakdown.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DominantDistrictBody({ party, state }: { party: any; state: string }) {
  // Pull EVERY candidate in the stronghold district (any party) so we can show full picture
  const { data, isLoading } = useResults(state, { district: party.top_district_name, winners_only: true, limit: 500 })
  const allWinnersInDistrict = data?.candidates ?? []
  return (
    <>
      <div style={{ fontSize: '0.95rem', marginBottom: '1.25rem' }}>
        <strong>{party.top_district_seats}</strong> of <strong style={{ color: party.color }}>{party.party}</strong>'s{' '}
        <strong>{party.won}</strong> seats — <strong style={{ color: '#f59e0b' }}>{party.top_district_share}%</strong> — came from{' '}
        <strong>{party.top_district_name}</strong>. That's their stronghold.
      </div>

      <div className="section-title">Every AC in {party.top_district_name}</div>
      {isLoading && <PageSkeleton rows={4} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {allWinnersInDistrict
          .sort((a: any, b: any) => a.ac_number - b.ac_number)
          .map((c: any) => {
            const heldByParty = c.party === party.party
            return (
              <div key={c.ac_number}
                onClick={() => window.open(`/${state}/constituencies/${c.ac_number}`, '_blank')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '0.6rem 0.85rem', borderRadius: 8, cursor: 'pointer',
                  background: heldByParty ? `${party.color}14` : 'var(--bg-secondary)',
                  border: `1px solid ${heldByParty ? `${party.color}66` : 'var(--border)'}`,
                }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 30 }}>AC#{c.ac_number}</span>
                <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{c.constituency}</span>
                <span className="badge"
                  style={{ background: `${c.color}22`, color: c.color, border: `1px solid ${c.color}44`, marginLeft: 'auto' }}>
                  <PartyLogo party={c.party} size={12} />{c.party}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', minWidth: 100, textAlign: 'right' }}>
                  {c.name} · {fmtIN(c.votes)}
                </span>
                {heldByParty
                  ? <span style={{ color: party.color, fontSize: '1rem', fontWeight: 700 }}>★</span>
                  : <span style={{ width: 14 }} />}
              </div>
            )
          })}
      </div>
      <div style={{ marginTop: 10, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
        ★ = {party.party} won this seat
      </div>
    </>
  )
}

/**
 * Tabbed card: per-party stacked-bar breakdown of MLA Age / Assets / Criminal cases.
 * One card with three views keeps the page lean instead of stacking three near-identical sections.
 */
type ProfileTab = 'age' | 'assets' | 'criminal'

const PROFILE_TABS: {
  key: ProfileTab
  emoji: string
  label: string
  distField: string                // field on party row holding the bucket counts
  totalField: string               // field with the denominator (mla_with_age / mla_with_assets / ...)
  avgField?: string                // optional avg field shown on the right
  avgPrefix?: string               // optional prefix like '₹' for assets
  avgSuffix?: string               // optional suffix like ' cr'
  subtitle: string
  buckets: { key: string; label: string; color: string; titleSingular: string }[]
}[] = [
  {
    key: 'age', emoji: '🎂', label: 'Age',
    distField: 'mla_age_distribution',
    totalField: 'mla_with_age',
    avgField: 'mla_avg_age',
    subtitle: 'Younger MLAs on the left of each bar; older on the right. Cool blues = young, warm reds = older.',
    // Clean cool→warm sequential ramp (cyan → teal → amber → orange → crimson)
    // — no jarring purple in the middle, gradient reads as "age progression".
    buckets: [
      { key: 'u35',   label: '<35',   color: '#06b6d4', titleSingular: 'aged under 35' },
      { key: '35_44', label: '35-44', color: '#14b8a6', titleSingular: 'aged 35-44' },
      { key: '45_54', label: '45-54', color: '#eab308', titleSingular: 'aged 45-54' },
      { key: '55_64', label: '55-64', color: '#f97316', titleSingular: 'aged 55-64' },
      { key: '65p',   label: '65+',   color: '#dc2626', titleSingular: 'aged 65+' },
    ],
  },
  {
    key: 'assets', emoji: '💰', label: 'Assets',
    distField: 'mla_asset_distribution',
    totalField: 'mla_with_assets',
    avgField: 'mla_avg_assets_cr',
    avgPrefix: '₹', avgSuffix: ' cr',
    subtitle: 'Modest assets on the left; ultra-rich ₹50 cr+ tier on the right.',
    // Distinct wealth-tier ramp: slate (modest) → teal → blue → indigo → magenta
    // — clearer separation between adjacent tiers than the old gray/green/yellow mix.
    buckets: [
      { key: 'u0_5',  label: '<₹0.5 cr',  color: '#64748b', titleSingular: 'with declared assets <₹0.5 cr' },
      { key: '0_5_2', label: '₹0.5-2 cr', color: '#14b8a6', titleSingular: 'with declared assets ₹0.5-2 cr' },
      { key: '2_10',  label: '₹2-10 cr',  color: '#3b82f6', titleSingular: 'with declared assets ₹2-10 cr' },
      { key: '10_50', label: '₹10-50 cr', color: '#8b5cf6', titleSingular: 'with declared assets ₹10-50 cr' },
      { key: '50p',   label: '₹50 cr+',   color: '#ec4899', titleSingular: 'with declared assets ₹50 cr+' },
    ],
  },
  {
    key: 'criminal', emoji: '⚖️', label: 'Criminal Cases',
    distField: 'mla_criminal_distribution',
    totalField: 'mla_with_crim_data',
    subtitle: 'Clean MLAs on the left; ≥3-case "serious" tier in red. Deliberate green→red judgment ramp.',
    // Punchier green→red judgment ramp — deeper greens for "clean", stronger
    // orange/red for "serious" so the visual contrast matches the meaning.
    buckets: [
      { key: 'clean', label: '0 cases',   color: '#16a34a', titleSingular: 'with no criminal cases' },
      { key: '1_2',   label: '1-2 cases', color: '#eab308', titleSingular: 'with 1-2 cases' },
      { key: '3_5',   label: '3-5 cases', color: '#ea580c', titleSingular: 'with 3-5 cases' },
      { key: '6p',    label: '6+ cases',  color: '#dc2626', titleSingular: 'with 6+ cases' },
    ],
  },
]

function MlaProfilesCard({ parties }: { parties: any[] }) {
  const [tab, setTab] = useState<ProfileTab>('age')
  const config = PROFILE_TABS.find(t => t.key === tab)!

  // Show every party that has at least 1 MLA. If the party has no data for
  // the current dimension (totalField == 0), render a "no data" stub instead
  // of an empty bar — keeps every winning party visible and transparently
  // labels missing data rather than silently dropping the row.
  const partiesWithMLA = parties.filter((p: any) => (p.won ?? 0) >= 1)
  if (partiesWithMLA.length === 0) return null
  const sorted = [...partiesWithMLA].sort((a: any, b: any) => b.won - a.won)
  const totalMLAs = sorted.reduce((s, p) => s + (p.won ?? 0), 0)
  const partiesMissingData = sorted.filter(p => (p[config.totalField] ?? 0) === 0)
  const missingMLAs = partiesMissingData.reduce((s, p) => s + (p.won ?? 0), 0)

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginRight: 8 }}>
          MLA Profile by Party
        </div>
        {PROFILE_TABS.map(t => {
          const active = t.key === tab
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                padding: '0.3rem 0.7rem', borderRadius: 6, cursor: 'pointer',
                fontSize: '0.78rem', fontWeight: 700,
                background: active ? 'rgba(167,139,250,0.18)' : 'var(--bg-card)',
                border: `1px solid ${active ? 'rgba(167,139,250,0.5)' : 'var(--border)'}`,
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
              }}>
              {t.emoji} {t.label}
            </button>
          )
        })}
      </div>

      {/* Header + legend */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
          {config.subtitle}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.72rem' }}>
          {config.buckets.map(b => (
            <span key={b.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)' }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: b.color, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }} />
              {b.label}
            </span>
          ))}
        </div>
      </div>

      {/* Per-party rows. Render a "no data" stub when a party has 0 MLAs
          with data for this dimension. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.map((p: any) => {
          const dist = p[config.distField] || {}
          const dataCount = p[config.totalField] ?? 0
          const total = dataCount || 1
          const avgRaw = config.avgField ? p[config.avgField] : null
          const noData = dataCount === 0
          const totalMLAs = p.won ?? 0
          return (
            <div key={p.party} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: '0.82rem', color: p.color }}>
                {p.party} <span style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.7rem' }}>({totalMLAs})</span>
              </span>
              {noData ? (
                // Empty-state stub for this dimension
                <div style={{
                  height: 22, borderRadius: 5,
                  background: 'repeating-linear-gradient(45deg, rgba(148,163,184,0.08) 0 6px, rgba(148,163,184,0.16) 6px 12px)',
                  border: '1px dashed var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic',
                }}
                  title={`No ${config.label.toLowerCase()} data for ${p.party}'s ${totalMLAs} MLA${totalMLAs === 1 ? '' : 's'} — affidavit not in MyNeta`}>
                  no {config.label.toLowerCase()} data on file
                </div>
              ) : (
                <div style={{
                  display: 'flex', height: 22, borderRadius: 5, overflow: 'hidden',
                  background: 'var(--bg-secondary)',
                  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
                }}>
                  {config.buckets.map(b => {
                    const v = dist[b.key] ?? 0
                    if (!v) return null
                    const pct = (v / total) * 100
                    return (
                      <div
                        key={b.key}
                        style={{
                          width: `${pct}%`, background: b.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.72rem', fontWeight: 800, color: '#0b1020',
                          textShadow: '0 1px 0 rgba(255,255,255,0.25)',
                        }}
                        title={`${v} MLA${v === 1 ? '' : 's'} ${b.titleSingular} (${pct.toFixed(1)}%)`}
                      >
                        {pct >= 7 ? v : ''}
                      </div>
                    )
                  })}
                </div>
              )}
              <span className="tabular" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
                {noData ? (
                  <span style={{ opacity: 0.7 }}>—</span>
                ) : avgRaw != null ? (
                  <>avg <strong style={{ color: 'var(--text-primary)' }}>{config.avgPrefix ?? ''}{avgRaw}{config.avgSuffix ?? ''}</strong>
                    {dataCount < totalMLAs && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.66rem' }} title={`Based on ${dataCount} of ${totalMLAs} MLAs with affidavit data`}>
                        {' '}({dataCount}/{totalMLAs})
                      </span>
                    )}
                  </>
                ) : (
                  <>n=<strong style={{ color: 'var(--text-primary)' }}>{dataCount}</strong>{dataCount < totalMLAs && <span style={{ color: 'var(--text-muted)' }}>/{totalMLAs}</span>}</>
                )}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
        Showing all {sorted.length} parties with ≥1 MLA ({totalMLAs} total).
        {missingMLAs > 0 && (
          <span style={{ color: '#f59e0b' }}>
            {' '}⚠ {missingMLAs} MLA{missingMLAs === 1 ? '' : 's'} across {partiesMissingData.length} part{partiesMissingData.length === 1 ? 'y' : 'ies'} have no {config.label.toLowerCase()} data (affidavits not in MyNeta — listed transparently above).
          </span>
        )}
      </div>
    </div>
  )
}


type LeaderMetric = 'strike_rate' | 'votes_per_seat' | 'districts_won_count' | 'won'

const METRIC_META: Record<LeaderMetric, { label: string; unit: string; lowerIsBetter: boolean; describe: string }> = {
  strike_rate:         { label: 'Strike Rate',     unit: '%',  lowerIsBetter: false, describe: '% of contested seats won' },
  won:                 { label: 'Seats Won',       unit: '',   lowerIsBetter: false, describe: 'Total MLAs elected' },
  votes_per_seat:      { label: 'Votes per Seat',  unit: 'k',  lowerIsBetter: true,  describe: 'Lower is more efficient' },
  districts_won_count: { label: 'Districts Won',   unit: '',   lowerIsBetter: false, describe: 'Geographic reach' },
}

export default function Parties() {
  const { state } = useParams<{ state: string }>()
  const { data, isError, refetch, isLoading: pageLoading } = usePartyAnalytics(state!)
  const [expandedParty, setExpandedParty] = useState<string | null>(null)
  const [leaderMetric, setLeaderMetric] = useState<LeaderMetric>('strike_rate')
  const [leaderDir, setLeaderDir] = useState<'desc' | 'asc'>('desc')
  const [leaderMinWon, setLeaderMinWon] = useState<0 | 1 | 3>(1) // hide parties with 0 wins by default
  const [cardModal, setCardModal] = useState<{ kind: CardKind; party: any; accent: string; label: string; emoji: string } | null>(null)
  useEscapeKey(cardModal !== null, () => setCardModal(null))
  const [districtDrill, setDistrictDrill] = useState<{ party: string; partyColor: string; district: string } | null>(null)
  useEscapeKey(districtDrill !== null, () => setDistrictDrill(null))

  const parties = (data?.parties ?? []).filter((p: any) => p.contested > 0)
  const { sorted, sort, onSort } = useSortable<any>(parties, { key: 'won', dir: 'desc' })

  // State-wide averages — used in the expanded-row mini cards so each party's
  // numbers carry comparative meaning ("avg ₹1.2 cr · 1.3× state slate avg").
  const stateAvg = useMemo(() => {
    const seatWinners = parties.filter((p: any) => p.won > 0)
    const avgOf = (arr: any[], key: string) => {
      const vals = arr.map((p: any) => p[key]).filter((v: any) => v != null && Number.isFinite(v))
      return vals.length ? vals.reduce((s: number, v: number) => s + v, 0) / vals.length : null
    }
    return {
      votes_per_seat: avgOf(seatWinners, 'votes_per_seat'),
      avg_age: avgOf(parties, 'avg_age'),
      avg_assets_cr: avgOf(parties, 'avg_assets_cr'),
      criminal_pct: avgOf(parties, 'criminal_pct'),
    }
  }, [parties])

  if (!data) return <div style={{ color: 'var(--text-secondary)', padding: '2rem' }}>Loading party analytics…</div>

  const meaningful = parties.filter((p: any) => p.contested >= 5)
  const seatBacked = parties.filter((p: any) => p.won >= 3)

  const bestStrike = [...meaningful].sort((a, b) => b.strike_rate - a.strike_rate)[0]
  const mostEfficient = [...seatBacked]
    .filter(p => p.votes_per_seat != null)
    .sort((a, b) => a.votes_per_seat - b.votes_per_seat)[0]
  const widestReach = [...meaningful]
    .filter(p => p.districts_won_count != null && p.districts_won_count > 0)
    .sort((a, b) => b.districts_won_count - a.districts_won_count)[0]
  const mostDominant = [...seatBacked]
    .filter(p => p.top_district_share != null)
    .sort((a, b) => b.top_district_share - a.top_district_share)[0]

  // Scatter: x = strike rate, y = contested, bubble size ∝ seats won
  const scatterData = parties.map((p: any) => ({
    party: p.party, color: p.color,
    x: p.strike_rate, y: p.contested,
    z: Math.max(p.won, 1) * 8,
  }))

  // Vote-efficiency bar chart: votes per seat (lower = better), seat-backed parties only
  const efficiencyData = [...seatBacked]
    .filter(p => p.votes_per_seat != null)
    .sort((a, b) => a.votes_per_seat - b.votes_per_seat)
    .map(p => ({
      party: p.party, color: p.color,
      vps_k: Math.round((p.votes_per_seat ?? 0) / 1000),
      won: p.won,
    }))

  // ─────────────────────  KEY INSIGHTS  ─────────────────────
  const fmt = (n: number) => fmtIN(n)
  const insights: Insight[] = []
  // Sort parties for various callouts
  const bySeats = [...parties].sort((a: any, b: any) => b.won - a.won)
  const winners = bySeats.filter((p: any) => p.won > 0)
  // 1. Largest party
  const top = bySeats[0]
  if (top && top.won > 0) {
    insights.push({
      emoji: '🥇', accent: top.color,
      headline: `${top.party} is the state's largest single party.`,
      detail: `Won ${top.won} of ${top.contested} contested seats (${top.strike_rate}% strike rate), polling ${fmt(top.total_votes)} votes statewide.`,
    })
  }
  // 2. Most-efficient slate (seat-backed)
  if (mostEfficient) {
    const worst = [...seatBacked].filter(p => p.votes_per_seat != null).sort((a, b) => b.votes_per_seat - a.votes_per_seat)[0]
    if (worst && worst.party !== mostEfficient.party) {
      const ratio = (worst.votes_per_seat / mostEfficient.votes_per_seat).toFixed(1)
      insights.push({
        emoji: '⚡', accent: '#06b6d4',
        headline: `${mostEfficient.party} squeezed the most out of every vote.`,
        detail: `Took just ${fmt(mostEfficient.votes_per_seat)} votes per seat. ${worst.party} needed ${ratio}× more (${fmt(worst.votes_per_seat)}/seat) to win.`,
      })
    }
  }
  // 3. Contest-without-winning (effort with no return)
  const triedHardNoSeat = [...parties].filter((p: any) => p.contested >= 20 && p.won === 0)
    .sort((a: any, b: any) => b.contested - a.contested)[0]
  if (triedHardNoSeat) {
    insights.push({
      emoji: '🪂', accent: '#94a3b8',
      headline: `${triedHardNoSeat.party} contested broadly without winning.`,
      detail: `Fielded ${triedHardNoSeat.contested} candidates and lost all of them — polled ${fmt(triedHardNoSeat.total_votes)} votes that didn't translate into a single MLA.`,
    })
  }
  // 4. Stronghold-dependent party
  if (mostDominant && mostDominant.top_district_share >= 40) {
    insights.push({
      emoji: '🏰', accent: '#f59e0b',
      headline: `${mostDominant.party} is geographically concentrated.`,
      detail: `${mostDominant.top_district_seats} of ${mostDominant.party}'s ${mostDominant.won} seats came from ${mostDominant.top_district_name} alone — ${mostDominant.top_district_share}% of their wins are in one district.`,
    })
  }
  // 5. Vote-leader-without-seat-lead anomaly (party with more votes but fewer seats than next)
  const byVotes = [...winners].sort((a: any, b: any) => b.total_votes - a.total_votes)
  if (byVotes.length >= 2 && byVotes[0].party !== bySeats[0]?.party) {
    insights.push({
      emoji: '⚠️', accent: '#ef4444',
      headline: `Vote leader ≠ seat leader.`,
      detail: `${byVotes[0].party} polled the most votes (${fmt(byVotes[0].total_votes)}) but won fewer seats than ${bySeats[0].party} (${byVotes[0].won} vs ${bySeats[0].won}) — first-past-the-post arithmetic at work.`,
    })
  }

  // Flexible leaderboard data — user picks metric, direction, and minimum wins
  const meta = METRIC_META[leaderMetric]
  const leaderboard = parties
    .filter((p: any) => p.won >= leaderMinWon)
    .filter((p: any) => p[leaderMetric] != null)
    .map((p: any) => {
      const raw = p[leaderMetric]
      const value = leaderMetric === 'votes_per_seat' ? Math.round(raw / 1000) : raw
      return { party: p.party, color: p.color, value, raw, won: p.won, contested: p.contested }
    })
    .sort((a: any, b: any) => leaderDir === 'desc' ? b.value - a.value : a.value - b.value)

  if (isError) {
    return (
      <div>
        <div className="page-title">Party Analysis</div>
        <EmptyState
          variant="error"
          title="Couldn't load party analytics."
          body="The backend may be down or temporarily unreachable. Refresh to try again."
          action={{ label: 'Retry', onClick: () => refetch() }}
        />
      </div>
    )
  }
  if (pageLoading) {
    return <PageSkeleton rows={10} />
  }

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="page-title" style={{ marginBottom: 4 }}>Party Analysis</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: 720 }}>
          How parties built and converted their candidate slates. Strike rate, vote efficiency, geographic reach, and stronghold districts — beyond the headline seat counts on Overview.
        </div>
      </div>

      <InsightsCard insights={insights} subtitle="What stands out about how parties performed" />

      {/* Headline KPI tiles — always 4, even if some data is missing */}
      <div className="kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <HeroCard
          emoji="🎯" label="Best Strike Rate" accent="#22c55e" pick={bestStrike}
          metric={bestStrike ? `${bestStrike.strike_rate}%` : undefined}
          detail={bestStrike ? `${bestStrike.won} of ${bestStrike.contested} candidates won` : undefined}
          onClick={bestStrike ? () => setCardModal({ kind: 'strike', party: bestStrike, accent: '#22c55e', label: 'Best Strike Rate', emoji: '🎯' }) : undefined}
        />
        <HeroCard
          emoji="⚡" label="Most Vote-Efficient" accent="#06b6d4" pick={mostEfficient}
          metric={mostEfficient ? `${fmtK(mostEfficient.votes_per_seat)}` : undefined}
          detail={mostEfficient ? `Votes per seat won · lowest in the state` : undefined}
          onClick={mostEfficient ? () => setCardModal({ kind: 'efficient', party: mostEfficient, accent: '#06b6d4', label: 'Most Vote-Efficient', emoji: '⚡' }) : undefined}
        />
        <HeroCard
          emoji="🌐" label="Widest Reach" accent="#a78bfa" pick={widestReach}
          metric={widestReach ? `${widestReach.districts_won_count} districts` : undefined}
          detail={widestReach ? `Won at least one seat in ${widestReach.districts_won_count} of the state's districts` : undefined}
          onClick={widestReach ? () => setCardModal({ kind: 'reach', party: widestReach, accent: '#a78bfa', label: 'Widest Geographic Reach', emoji: '🌐' }) : undefined}
        />
        <HeroCard
          emoji="🏰" label="Most Dominant District" accent="#f59e0b" pick={mostDominant}
          metric={mostDominant ? `${mostDominant.top_district_share}%` : undefined}
          detail={mostDominant
            ? `${mostDominant.top_district_seats} of ${mostDominant.won} seats from ${mostDominant.top_district_name}`
            : undefined}
          onClick={mostDominant ? () => setCardModal({ kind: 'dominant', party: mostDominant, accent: '#f59e0b', label: 'Most Dominant District', emoji: '🏰' }) : undefined}
        />
      </div>

      {/* Side-by-side: scatter (conversion) + bar (efficiency) — both at a glance */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
        <div className="card">
          <div className="section-title">Conversion Map — Strike Rate vs Slate Size</div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
            X = % of contested seats won · Y = candidates fielded · Bubble size ∝ seats won. Top-right is the sweet spot.
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" dataKey="x" name="Strike rate" unit="%" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} domain={[0, 100]} />
              <YAxis type="number" dataKey="y" name="Contested" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
              <ZAxis type="number" dataKey="z" range={[40, 600]} />
              <ReferenceLine x={50} stroke="var(--border)" strokeDasharray="4 4" />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                formatter={(_, __, p: any) => [`${p.payload.party} — ${p.payload.x}% of ${p.payload.y} contested`, '']}
                labelFormatter={() => ''}
              />
              <Scatter data={scatterData}>
                {scatterData.map((entry: any, idx: number) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          {(() => {
            // Compute the median votes-per-seat across all seat-backed parties so
            // we can draw a reference line and make over/under-performance visible.
            const vpsValues = efficiencyData.map((e: any) => e.vps_k)
            const sorted = [...vpsValues].sort((a, b) => a - b)
            const medianVps = sorted.length
              ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
              : 0
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                  <div className="section-title" style={{ marginBottom: 0 }}>Vote Efficiency — Votes per Seat Won</div>
                  {medianVps > 0 && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      Dashed line = <span style={{ color: '#eab308', fontWeight: 700 }}>state median {Math.round(medianVps)}k</span>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
                  Lower bar = more efficient. Among parties with at least 3 seats won. Bars below the dashed line are over-performing the typical conversion rate.
                </div>
                {efficiencyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={efficiencyData} layout="vertical" margin={{ left: 0, right: 60, top: 12 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" tick={axisTickStyle} unit="k" />
                      <YAxis type="category" dataKey="party" width={70} tick={axisTickStyle} />
                      <Tooltip
                        cursor={{ fill: 'rgba(167,139,250,0.06)' }}
                        contentStyle={tooltipContentStyle}
                        labelStyle={tooltipLabelStyle}
                        formatter={(v: any, _n, p: any) => {
                          const vps = (v as number) * 1000
                          const delta = (v as number) - medianVps
                          const vsMedian = delta < 0
                            ? `${Math.round(Math.abs(delta))}k below median (more efficient)`
                            : delta > 0
                            ? `${Math.round(delta)}k above median (less efficient)`
                            : 'at the median'
                          return [`${fmtIN(vps)} votes per seat · ${p.payload.won} won · ${vsMedian}`, '']
                        }}
                        labelFormatter={(l) => `${l}`}
                      />
                      {medianVps > 0 && (
                        <ReferenceLine x={medianVps} {...refLineStyle}
                          label={{ value: 'median', position: 'top', fill: '#eab308', fontSize: 10, fontWeight: 700 }} />
                      )}
                      <Bar dataKey="vps_k" radius={[0, 4, 4, 0]}>
                        {efficiencyData.map((e: any) => <Cell key={e.party} fill={e.color} />)}
                        <LabelList dataKey="vps_k" position="right" fill="var(--text-primary)" fontSize={11} fontWeight={700}
                          formatter={((v: number) => `${v}k`) as any} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    No parties with enough wins to compare yet.
                  </div>
                )}
              </>
            )
          })()}
        </div>
      </div>

      {/* Flexible leaderboard — strike rate / votes per seat / districts / seats, with sort */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="section-title" style={{ marginBottom: 0 }}>Party Leaderboard</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2 }}>{meta.describe}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select value={leaderMetric} onChange={e => setLeaderMetric(e.target.value as LeaderMetric)}
              style={{ padding: '0.4rem 0.6rem', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '0.82rem' }}>
              <option value="strike_rate">Strike Rate</option>
              <option value="won">Seats Won</option>
              <option value="votes_per_seat">Votes / Seat</option>
              <option value="districts_won_count">Districts Won</option>
            </select>
            <button
              onClick={() => setLeaderDir(leaderDir === 'desc' ? 'asc' : 'desc')}
              title="Toggle sort direction"
              style={{
                padding: '0.4rem 0.7rem', borderRadius: 6, cursor: 'pointer',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', fontSize: '0.82rem',
              }}>
              {leaderDir === 'desc' ? '↓ High → Low' : '↑ Low → High'}
            </button>
            <select value={leaderMinWon} onChange={e => setLeaderMinWon(Number(e.target.value) as 0 | 1 | 3)}
              style={{ padding: '0.4rem 0.6rem', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '0.82rem' }}>
              <option value={0}>All parties</option>
              <option value={1}>Won ≥ 1 seat</option>
              <option value={3}>Won ≥ 3 seats</option>
            </select>
          </div>
        </div>
        {leaderboard.length > 0 ? (() => {
          // Mean across visible leaderboard rows — gives users a benchmark.
          const vals: number[] = leaderboard.map((e: any) => Number(e.value)).filter((n: number) => Number.isFinite(n))
          const avg = vals.length ? vals.reduce((s: number, v: number) => s + v, 0) / vals.length : 0
          return (
            <ResponsiveContainer width="100%" height={Math.max(260, leaderboard.length * 24)}>
              <BarChart data={leaderboard} layout="vertical" margin={{ left: 0, right: 96, top: 12 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={axisTickStyle} unit={meta.unit} />
                <YAxis type="category" dataKey="party" width={80} tick={axisTickStyle} />
                <Tooltip
                  cursor={{ fill: 'rgba(167,139,250,0.06)' }}
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(_: any, __, p: any) => {
                    const d = p.payload
                    const display = leaderMetric === 'votes_per_seat'
                      ? `${fmtIN(d.raw as number)} votes/seat`
                      : `${d.raw}${meta.unit}`
                    const delta = Number(d.value) - avg
                    const cmp = delta === 0 ? 'at the avg' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}${meta.unit} vs avg`
                    return [`${display} · ${d.won} won / ${d.contested} contested · ${cmp}`, '']
                  }}
                  labelFormatter={(l) => l as string}
                />
                {avg > 0 && (
                  <ReferenceLine x={avg} {...refLineStyle}
                    label={{ value: 'avg', position: 'top', fill: '#eab308', fontSize: 10, fontWeight: 700 }} />
                )}
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {leaderboard.map((e: any) => <Cell key={e.party} fill={e.color} />)}
                  <LabelList
                    dataKey="value"
                    position="right"
                    content={(props: any) => {
                      const { x, y, width, height, index } = props
                      const e = leaderboard[index]
                      if (!e) return null
                      return (
                        <g>
                          <text x={x + width + 6} y={y + height / 2 + 4}
                            fill="var(--text-primary)" fontSize={11} fontWeight={700}>
                            {`${e.value}${meta.unit}`}
                          </text>
                          {index < 3 && (
                            <text x={x + width + 6 + String(`${e.value}${meta.unit}`).length * 7 + 6}
                              y={y + height / 2 + 4} fontSize={12} fontWeight={800}>
                              {rankLabel(index)}
                            </text>
                          )}
                        </g>
                      )
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )
        })() : (
          <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            No parties match the current filter.
          </div>
        )}
      </div>

      {/* MLA Profile by Party — tabbed card (Age / Assets / Criminal Cases). */}
      <MlaProfilesCard parties={parties} />

      {/* Analytics table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="section-title" style={{ marginBottom: 0 }}>Party Slate Analytics</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              Click any row for stronghold districts and slate profile.
            </div>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            {parties.length} parties · {parties.reduce((s: number, p: any) => s + p.contested, 0).toLocaleString('en-IN')} total candidates
          </div>
        </div>
        <div className="table-wrap" style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <SortableTh label="Party" sortKey="party" sort={sort} onSort={onSort} />
                <SortableTh label="Alliance" sortKey="alliance_id" sort={sort} onSort={onSort} />
                <SortableTh label="Contested" sortKey="contested" sort={sort} onSort={onSort} align="right" />
                <SortableTh label="Won" sortKey="won" sort={sort} onSort={onSort} align="right" />
                <SortableTh label="Strike Rate" sortKey="strike_rate" sort={sort} onSort={onSort} align="right" />
                <SortableTh label="Votes / Seat" sortKey="votes_per_seat" sort={sort} onSort={onSort} align="right" />
                <SortableTh label="Districts Won" sortKey="districts_won_count" sort={sort} onSort={onSort} align="right" />
                <SortableTh label="2021 Retention" sortKey="retention_pct" sort={sort} onSort={onSort} align="right" />
                <SortableTh label="Top District" sortKey="top_district_name" sort={sort} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p: any) => {
                const isOpen = expandedParty === p.party
                return (
                  <Fragment key={p.party}>
                    <tr
                        onClick={() => setExpandedParty(isOpen ? null : p.party)}
                        style={{ cursor: 'pointer', background: isOpen ? `${p.color}10` : undefined }}>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ color: p.color, fontSize: '0.75rem', width: 10 }}>{isOpen ? '▾' : '▸'}</span>
                          <PartyLogo party={p.party} size={26} />
                          <strong style={{ color: p.color, fontSize: '0.95rem' }}>{p.party}</strong>
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-blue" style={{ fontSize: '0.65rem' }}>
                          {p.alliance_name.replace(/\s*\(.*\)/, '').trim()}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>{p.contested}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{p.won}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700,
                                   color: p.strike_rate >= 50 ? '#22c55e' : p.strike_rate >= 25 ? '#f59e0b' : 'var(--text-secondary)' }}>
                        {p.strike_rate}%
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {p.votes_per_seat != null ? fmtK(p.votes_per_seat) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {p.districts_won_count ?? '—'}
                      </td>
                      <td style={{ textAlign: 'right' }} title={p.retention_pct != null ? `${p.seats_held} of ${p.seats_2021} 2021 seats retained` : 'No 2021 seats'}>
                        {p.seats_2021 ? (
                          <>
                            <span className="tabular" style={{
                              fontWeight: 700,
                              color: p.retention_pct >= 80 ? '#22c55e' : p.retention_pct >= 40 ? '#f59e0b' : '#ef4444',
                            }}>
                              {p.retention_pct}%
                            </span>
                            <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>
                              {p.seats_held}/{p.seats_2021}
                            </div>
                          </>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td>
                        {p.top_district_name ? (
                          <span style={{ fontSize: '0.78rem' }}>
                            {p.top_district_name}
                            <span style={{ color: 'var(--text-secondary)', marginLeft: 4 }}>
                              ({p.top_district_seats}, {p.top_district_share}%)
                            </span>
                          </span>
                        ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={9} style={{ background: `${p.color}08`, padding: '1.25rem 1.5rem', borderTop: `1px dashed ${p.color}44` }}>
                          <ExpandedPartyPanel
                            p={p}
                            stateAvg={stateAvg}
                            onDistrictClick={(district) => setDistrictDrill({ party: p.party, partyColor: p.color, district })}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ────────  Stronghold-district drill modal  ──────── */}
      {districtDrill && state && (
        <DistrictDrillModal
          party={districtDrill.party}
          partyColor={districtDrill.partyColor}
          district={districtDrill.district}
          state={state}
          onClose={() => setDistrictDrill(null)}
        />
      )}

      {/* ────────  Card drill-down modal  ──────── */}
      {cardModal && (
        <div onClick={() => setCardModal(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(7, 9, 26, 0.78)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '4vh 1rem', zIndex: 50, overflowY: 'auto',
          }}>
          <div onClick={e => e.stopPropagation()} className="card"
            style={{
              maxWidth: 880, width: '100%',
              borderLeft: `4px solid ${cardModal.accent}`,
              maxHeight: '92vh', overflowY: 'auto',
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  <span style={{ marginRight: 6 }}>{cardModal.emoji}</span>{cardModal.label}
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: cardModal.accent, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <PartyLogo party={cardModal.party.party} size={28} />
                  {cardModal.party.party}
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    · {cardModal.party.full_name}
                  </span>
                </div>
              </div>
              <button onClick={() => setCardModal(null)}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                         borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>Close ✕</button>
            </div>

            {cardModal.kind === 'strike'   && <StrikeRateBody party={cardModal.party} state={state!} allParties={parties} />}
            {cardModal.kind === 'efficient'&& <VoteEfficientBody party={cardModal.party} allParties={parties} />}
            {cardModal.kind === 'reach'    && <WidestReachBody party={cardModal.party} state={state!} />}
            {cardModal.kind === 'dominant' && <DominantDistrictBody party={cardModal.party} state={state!} />}
          </div>
        </div>
      )}
    </div>
  )
}
