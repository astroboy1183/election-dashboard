import { useParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
  ScatterChart, Scatter, ZAxis, LabelList,
} from 'recharts'
import { useSwing, useOverview, useSeatFlips, useAllianceBreakdown, useFlipMatrix, useStateKPIs } from '../lib/api'
import { useSortable, sortIcon } from '../lib/useSortable'
import PartyLogo from '../components/PartyLogo'
import SortableTh from '../components/SortableTh'
import { type Insight } from '../components/InsightsCard'
import { PageSkeleton, Skeleton } from '../components/Skeleton'
import { Sparkline } from '../components/Sparkline'
import { useEscapeKey } from '../lib/useEscapeKey'
import { EmptyState } from '../components/EmptyState'
import { fmtIN } from '../lib/format'



// Compact party-to-party transfer block.
// Header = one party + total gained/lost; rows = other-party + count, each expandable to seat names.
function TransferGroup({
  partyA, partyAColor, total, totalLabel, items, itemArrow, onSeatClick,
}: {
  partyA: string; partyAColor: string;
  total: number; totalLabel: 'gained' | 'lost';
  items: { party: string; party_color: string; count: number; seats: any[] }[];
  itemArrow: '←' | '→';
  onSeatClick: (ac: number) => void;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const sign = totalLabel === 'gained' ? '+' : '−'
  const totalColor = totalLabel === 'gained' ? '#22c55e' : '#ef4444'
  return (
    <div style={{ marginBottom: '0.85rem', padding: '0.7rem 0.85rem', borderRadius: 8, background: 'var(--bg-secondary)', borderLeft: `3px solid ${partyAColor}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PartyLogo party={partyA} size={20} />
          <span style={{ fontWeight: 800, fontSize: '0.92rem', color: partyAColor }}>{partyA}</span>
        </div>
        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: totalColor }}>{sign}{total}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((it, i) => {
          const isOpen = openIdx === i
          return (
            <div key={it.party}>
              <div
                onClick={() => setOpenIdx(isOpen ? null : i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '0.3rem 0.5rem', borderRadius: 6, cursor: 'pointer',
                  background: isOpen ? 'rgba(148,163,184,0.10)' : 'transparent',
                  border: `1px solid ${isOpen ? 'var(--border)' : 'transparent'}`,
                }}
              >
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{itemArrow}</span>
                <PartyLogo party={it.party} size={16} />
                <span style={{ fontWeight: 600, color: it.party_color, fontSize: '0.82rem' }}>{it.party}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.82rem', fontWeight: 700 }}>{it.count}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', minWidth: 14, textAlign: 'right' }}>{isOpen ? '▾' : '▸'}</span>
              </div>
              {isOpen && (
                <div style={{ marginTop: 4, marginBottom: 4, marginLeft: 16, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {it.seats.map((s: any) => (
                    <span key={s.ac_number} onClick={() => onSeatClick(s.ac_number)}
                      style={{
                        padding: '0.2rem 0.5rem', borderRadius: 5, fontSize: '0.68rem',
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        color: 'var(--text-primary)', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}>
                      <span style={{ opacity: 0.55 }}>AC#{s.ac_number}</span>
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                      {s.margin_2026 != null && (
                        <span style={{ color: '#22c55e', fontWeight: 700, opacity: 0.9 }}>
                          +{fmtIN(s.margin_2026)}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Expandable per-party card used in the Alliance Breakdown modal.
// Header shows headline counts; click "Expand" to reveal seat names per bucket.
function AlliancePartyCard({ p, onSeatClick }: { p: any; onSeatClick: (ac: number) => void }) {
  const [open, setOpen] = useState<null | 'holds' | 'flipped_in' | 'flipped_out' | 'new_seats' | 'delimited_seats'>(null)
  const fmt = (n: number) => fmtIN(n)
  const buckets = [
    { key: 'holds' as const,          label: 'Held',          color: '#94a3b8', count: p.holds.length },
    { key: 'flipped_in' as const,     label: 'Flipped In',    color: '#22c55e', count: p.flipped_in.length },
    { key: 'flipped_out' as const,    label: 'Flipped Out',   color: '#ef4444', count: p.flipped_out.length },
    { key: 'new_seats' as const,      label: 'New Seats',     color: '#3b82f6', count: p.new_seats.length },
    { key: 'delimited_seats' as const,label: 'Delimited Away',color: '#facc15', count: p.delimited_seats.length },
  ].filter(b => b.count > 0)
  return (
    <div className="card" style={{ marginBottom: '0.85rem', padding: '1rem 1.1rem', borderLeft: `3px solid ${p.color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
          <PartyLogo party={p.party} size={28} />
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: p.color, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              {p.party}
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{p.full_name}</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              {p.seats_2021} → <strong style={{ color: 'var(--text-primary)' }}>{p.seats_2026}</strong>
              <span style={{ marginLeft: 8, color: p.net_change > 0 ? '#22c55e' : p.net_change < 0 ? '#ef4444' : 'var(--text-secondary)', fontWeight: 700 }}>
                {p.net_change > 0 ? '+' : ''}{p.net_change}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {buckets.map(b => (
            <button
              key={b.key}
              onClick={() => setOpen(open === b.key ? null : b.key)}
              style={{
                padding: '0.35rem 0.7rem', borderRadius: 8,
                background: open === b.key ? `${b.color}22` : 'var(--bg-card)',
                border: `1px solid ${open === b.key ? b.color : 'var(--border)'}`,
                cursor: 'pointer', fontSize: '0.78rem',
                color: open === b.key ? b.color : 'var(--text-primary)',
                fontWeight: 600,
              }}>
              <span style={{ marginRight: 4 }}>{b.label}</span>
              <span style={{ color: b.color, fontWeight: 800 }}>{b.count}</span>
            </button>
          ))}
          {buckets.length === 0 && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No flip activity</span>
          )}
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
          {open === 'holds' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {p.holds.map((s: any) => (
                <span key={s.ac_number} onClick={() => onSeatClick(s.ac_number)}
                  style={{ padding: '0.25rem 0.55rem', borderRadius: 6, fontSize: '0.72rem', background: 'rgba(148,163,184,0.10)', border: '1px solid rgba(148,163,184,0.3)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <span style={{ opacity: 0.6, marginRight: 4 }}>AC#{s.ac_number}</span>{s.name}
                  <span style={{ marginLeft: 6, color: 'var(--text-secondary)', fontSize: '0.68rem' }}>margin {fmt(s.margin_2026)}</span>
                </span>
              ))}
            </div>
          )}
          {open === 'flipped_in' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {p.flipped_in.map((s: any) => (
                <div key={s.ac_number} onClick={() => onSeatClick(s.ac_number)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.4rem 0.6rem', borderRadius: 6, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)', cursor: 'pointer' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>AC#{s.ac_number}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{s.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.72rem' }}>
                    <span style={{ color: s.from_party_color, fontWeight: 600 }}>{s.from_party}</span>
                    <span style={{ margin: '0 6px', color: 'var(--text-secondary)' }}>→</span>
                    <span style={{ color: p.color, fontWeight: 700 }}>{p.party}</span>
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>margin {fmt(s.margin_2026)}</span>
                </div>
              ))}
            </div>
          )}
          {open === 'flipped_out' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {p.flipped_out.map((s: any) => (
                <div key={s.ac_number} onClick={() => onSeatClick(s.ac_number)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.4rem 0.6rem', borderRadius: 6, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>AC#{s.ac_number}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{s.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.72rem' }}>
                    <span style={{ color: p.color, fontWeight: 600 }}>{p.party}</span>
                    <span style={{ margin: '0 6px', color: 'var(--text-secondary)' }}>→</span>
                    <span style={{ color: s.to_party_color, fontWeight: 700 }}>{s.to_party}</span>
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>margin {fmt(s.margin_2026)}</span>
                </div>
              ))}
            </div>
          )}
          {open === 'new_seats' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {p.new_seats.map((s: any) => (
                <span key={s.ac_number} onClick={() => onSeatClick(s.ac_number)}
                  style={{ padding: '0.25rem 0.55rem', borderRadius: 6, fontSize: '0.72rem', background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.30)', color: '#60a5fa', cursor: 'pointer' }}>
                  <span style={{ opacity: 0.65, marginRight: 4 }}>AC#{s.ac_number}</span>{s.name}
                  <span style={{ marginLeft: 6, color: 'var(--text-secondary)', fontSize: '0.68rem' }}>margin {fmt(s.margin_2026)}</span>
                </span>
              ))}
            </div>
          )}
          {open === 'delimited_seats' && (
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                Seats {p.party} held in 2021 that ceased to exist after redistricting:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {p.delimited_seats.map((s: any) => (
                  <span key={s.ac_2021}
                    style={{ padding: '0.25rem 0.55rem', borderRadius: 6, fontSize: '0.72rem', background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.30)', color: '#facc15' }}>
                    <span style={{ opacity: 0.65, marginRight: 4 }}>AC#{s.ac_2021}</span>{s.name_2021}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Reusable sortable flips/new-seats grid used inside the modal.
interface FlipRow {
  ac_number: number
  name: string
  from_party?: string; from_party_color?: string
  to_party?: string;   to_party_color?: string
  to_candidate?: string
  margin_2026: number
}

function FlipsTable({
  flips, color, title, onRowClick, faded, signPrefix = '+',
}: {
  flips: FlipRow[]; color: string; title: string;
  onRowClick: (ac: number) => void; faded?: boolean; signPrefix?: '+' | '−';
}) {
  const { sorted, sort, onSort } = useSortable<FlipRow>(flips, { key: 'margin_2026', dir: 'desc' })
  if (!flips || flips.length === 0) return null

  const cols = '90px 1.4fr 1fr 0.5fr 1fr 1fr'
  const hdrStyle: React.CSSProperties = {
    cursor: 'pointer', userSelect: 'none', fontSize: '0.7rem',
    color: 'var(--text-secondary)', textTransform: 'uppercase',
    letterSpacing: '0.06em', fontWeight: 700,
  }
  const SortableHdr = ({ k, label, align }: { k: string; label: string; align?: 'left' | 'right' | 'center' }) => (
    <div onClick={(e) => onSort(k, { additive: e.shiftKey })} style={{ ...hdrStyle, textAlign: align ?? 'left' }} title="Click to sort · Shift+click to add as a tiebreaker">
      {label} <span style={{ opacity: sort && sort.some(s => s.key === k) ? 1 : 0.4 }}>{sortIcon(sort, k)}</span>
    </div>
  )

  return (
    <>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        {title}
      </div>
      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, padding: '0.4rem 0.8rem', marginBottom: 4 }}>
        <SortableHdr k="ac_number" label="AC #" />
        <SortableHdr k="name" label="Constituency" />
        <SortableHdr k="from_party" label="From" />
        <div></div>
        <SortableHdr k="to_party" label="To" />
        <SortableHdr k="margin_2026" label="Margin" align="right" />
      </div>
      {/* Data rows */}
      <div style={{ display: 'grid', gap: 6, marginBottom: '1.25rem' }}>
        {sorted.map(f => (
          <div
            key={f.ac_number}
            onClick={() => onRowClick(f.ac_number)}
            style={{
              display: 'grid', gridTemplateColumns: cols, gap: 10, alignItems: 'center',
              padding: '0.65rem 0.8rem', borderRadius: 10,
              background: `${color}0d`, border: `1px solid ${color}28`,
              cursor: 'pointer', transition: 'all 0.15s',
              opacity: faded ? 0.92 : 1,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = `${color}1c`; e.currentTarget.style.borderColor = `${color}55`; if (faded) e.currentTarget.style.opacity = '1' }}
            onMouseLeave={e => { e.currentTarget.style.background = `${color}0d`; e.currentTarget.style.borderColor = `${color}28`; if (faded) e.currentTarget.style.opacity = '0.92' }}
          >
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>AC{f.ac_number}</div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{f.name}</div>
            {f.from_party ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <PartyLogo party={f.from_party} size={16} />
                <span style={{ color: f.from_party_color, fontWeight: 600, fontSize: '0.8rem' }}>{f.from_party}</span>
              </div>
            ) : <div style={{ color: '#facc15', fontSize: '0.7rem', fontStyle: 'italic' }}>🆕 new seat</div>}
            <div style={{ fontSize: '1rem', color: 'var(--text-secondary)', textAlign: 'center' }}>→</div>
            {f.to_party ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <PartyLogo party={f.to_party} size={16} />
                <span style={{ color: f.to_party_color, fontWeight: 700, fontSize: '0.8rem' }}>{f.to_party}</span>
              </div>
            ) : <div></div>}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: signPrefix === '+' ? '#4ade80' : '#f87171' }}>
                {signPrefix}{fmtIN(f.margin_2026)}
              </div>
              {f.to_candidate && <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>{f.to_candidate.split(' ').slice(0, 2).join(' ')}</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export default function Swing() {
  const { state } = useParams<{ state: string }>()
  const { data, isLoading, isError, refetch } = useSwing(state!)
  const { data: overview } = useOverview(state!)
  const { data: kpis } = useStateKPIs(state!)
  const [flipsModal, setFlipsModal] = useState<{ party: string; direction: 'gained' | 'lost'; color: string } | null>(null)
  const [allianceModal, setAllianceModal] = useState<{ id: string; name: string; color: string } | null>(null)
  useEscapeKey(flipsModal !== null, () => setFlipsModal(null))
  useEscapeKey(allianceModal !== null, () => setAllianceModal(null))
  const { data: flipsData, isLoading: flipsLoading } = useSeatFlips(
    state!, flipsModal?.party ?? '', flipsModal?.direction ?? 'gained', !!flipsModal,
  )
  // Always also fetch the OPPOSITE direction so the modal can show counter-flow
  const oppositeDirection = flipsModal?.direction === 'gained' ? 'lost' : 'gained'
  const { data: counterFlowData } = useSeatFlips(
    state!, flipsModal?.party ?? '', oppositeDirection, !!flipsModal,
  )
  const { data: allianceData, isLoading: allianceLoading } = useAllianceBreakdown(
    state!, allianceModal?.id ?? '', !!allianceModal,
  )
  const { data: flipMatrix } = useFlipMatrix(state!)
  // (Churn cards previously lived here; moved to Geography page. The
  // hash-scroll for #district-churn now belongs to Geography too.)

  // Per-year alliance lookup. Some parties switched alliances between 2021 and
  // 2026 (e.g. UPPL was in Assam NDA in 2021 but contested independently in 2026);
  // the backend exposes both mappings so swing aggregation can credit each year
  // to the alliance the party belonged to at the time.
  const partyAlliance = useMemo(() => {
    const m: Record<string, string> = {}
    overview?.parties?.forEach((p: any) => { m[p.party] = p.alliance_id })
    return m
  }, [overview])
  const partyAlliance2021 = useMemo(() => {
    const m: Record<string, string> = {}
    overview?.parties?.forEach((p: any) => { m[p.party] = p.alliance_id_2021 ?? p.alliance_id })
    return m
  }, [overview])

  // Alliance aggregation
  const allianceSwing = useMemo(() => {
    if (!data || !overview) return []
    const agg: Record<string, { seats_2026: number; seats_2021: number; share_2026: number; share_2021: number; name: string; color: string; parties: string[] }> = {}
    const ensure = (aid: string) => {
      if (!agg[aid]) {
        const a = overview.alliances?.find((x: any) => x.alliance_id === aid)
        agg[aid] = { seats_2026: 0, seats_2021: 0, share_2026: 0, share_2021: 0, name: a?.name ?? aid, color: a?.color ?? '#999', parties: [] }
      }
    }
    data.swing.forEach(p => {
      const aid26 = partyAlliance[p.party] ?? 'others'
      const aid21 = partyAlliance2021[p.party] ?? aid26
      ensure(aid26); ensure(aid21)
      agg[aid26].seats_2026 += p.seats_2026
      agg[aid26].share_2026 += p.share_2026
      agg[aid21].seats_2021 += p.seats_2021
      agg[aid21].share_2021 += p.share_2021
      // Only list the party in the alliance's "parties" array if it's there in 2026
      // (so the visible list reflects current alliance composition).
      if (!agg[aid26].parties.includes(p.party)) agg[aid26].parties.push(p.party)
    })
    return Object.entries(agg).map(([id, d]) => ({
      id, name: d.name, color: d.color, parties: d.parties,
      seats_2026: d.seats_2026, seats_2021: d.seats_2021,
      seat_change: d.seats_2026 - d.seats_2021,
      share_2026: +d.share_2026.toFixed(2),
      share_2021: +d.share_2021.toFixed(2),
      share_swing: +(d.share_2026 - d.share_2021).toFixed(2),
    })).sort((a, b) => b.seats_2026 - a.seats_2026)
  }, [data, overview, partyAlliance, partyAlliance2021])

  // Sortable-table hooks (must be declared before any early return)
  const { sorted: sortedAllianceSwing, sort: aSort, onSort: aOnSort } =
    useSortable<any>(allianceSwing, { key: 'seats_2026', dir: 'desc' })
  // Closest-contests sortable hook removed with the closest-contests table.
  // The same data is now surfaced from Overview's Competition KPI tile modal.

  if (isError) {
    return (
      <div>
        <div className="page-title">Swing & Trends</div>
        <EmptyState
          variant="error"
          title="Couldn't load swing data."
          body="The backend may be down or temporarily unreachable. Refresh to try again."
          action={{ label: 'Retry', onClick: () => refetch() }}
        />
      </div>
    )
  }
  if (isLoading || !data) return <PageSkeleton rows={12} />

  // Build derived insights. Exclude pseudo-parties (OTHERS aggregate bucket, NOTA)
  // from per-party charts — they aren't actual parties and skew "biggest gainer/loser"
  // and bar-chart rankings. They still flow into alliance aggregation below.
  const meaningful = data.swing.filter(p =>
    (p.seats_2026 > 0 || p.seats_2021 > 0)
    && p.party !== 'OTHERS' && p.party !== 'NOTA'
  )
  const sortedByGain = [...meaningful].sort((a, b) => b.seat_change - a.seat_change)
  const biggestGainer = sortedByGain[0]
  const biggestLoser = sortedByGain[sortedByGain.length - 1]
  const newParties = meaningful.filter(p => p.seats_2021 === 0 && p.seats_2026 > 0)
                                 .sort((a, b) => b.seats_2026 - a.seats_2026)
  const wipedOut = meaningful.filter(p => p.seats_2021 > 0 && p.seats_2026 === 0)
                                 .sort((a, b) => b.seats_2021 - a.seats_2021)
  const topNew = newParties[0]
  const topWipedOut = wipedOut[0]

  // Two related-but-different turnover metrics:
  //   • netSeatShift  = sum(|Δ seats per party|) / 2 — net reshuffle between party tallies.
  //     UNDERSTATES actual churn when a party both gains and loses seats (cancellation).
  //   • acFlipCount   = number of constituencies whose 2026 winning party differs from 2021.
  //     Comes from /flip-matrix (truth source for per-AC turnover).
  // Anti-incumbency % on the top tile = acFlipCount / matched_2021_seats.
  const netSeatShift = data.swing.reduce((s, p) => s + Math.abs(p.seat_change), 0) / 2
  const rulingAlliance2021 = [...allianceSwing].sort((a, b) => b.seats_2021 - a.seats_2021)[0]
  const rulingAlliance2026 = [...allianceSwing].sort((a, b) => b.seats_2026 - a.seats_2026)[0]
  const powerShift = rulingAlliance2021?.id !== rulingAlliance2026?.id

  // (Removed: `top` slice was for the Vote Share Swing + Seats Won 2021 vs 2026
  // bar charts that have been dropped. The scatter chart below uses
  // `scatterData` directly.)

  // ─────────────────────  KEY INSIGHTS  ─────────────────────
  // Insights here intentionally SKIP power-shift / continuity and per-AC flip
  // counts — both already prominent above:
  //   • Power retention is the headline of "The Story" card
  //   • Per-AC flips ("20 of 30 ACs flipped") is in The Story
  //   • Top gainer / loser / net shift are the three stat-cards
  // What stays = facts NOT visible elsewhere on this page.
  const swingInsights: Insight[] = []

  // 1. Biggest vote-share swing — distinct from seat-change; not surfaced by the stat cards.
  const swingByShare = [...meaningful].sort((a, b) => Math.abs(b.share_swing) - Math.abs(a.share_swing))[0]
  if (swingByShare && Math.abs(swingByShare.share_swing) >= 3) {
    swingInsights.push({
      emoji: swingByShare.share_swing > 0 ? '📈' : '📉', accent: swingByShare.color,
      headline: `${swingByShare.party} ${swingByShare.share_swing > 0 ? 'surged' : 'collapsed'} in vote share.`,
      detail: `${Math.abs(swingByShare.share_swing).toFixed(1)}pp ${swingByShare.share_swing > 0 ? 'jump' : 'drop'} from 2021 (${swingByShare.share_2021}% → ${swingByShare.share_2026}%) — the biggest vote-share swing of any party.`,
    })
  }

  // 2. New entrant / wiped out — qualitative shift not captured by gainer/loser numbers.
  if (topNew) {
    swingInsights.push({
      emoji: '🆕', accent: topNew.color,
      headline: `${topNew.party} arrived as a force.`,
      detail: `Won ${topNew.seats_2026} seat${topNew.seats_2026 === 1 ? '' : 's'} after contesting 0 in 2021 — a brand-new entrant to the assembly with ${topNew.share_2026}% vote share.`,
    })
  } else if (topWipedOut) {
    swingInsights.push({
      emoji: '🚫', accent: '#ef4444',
      headline: `${topWipedOut.party} was wiped out.`,
      detail: `Held ${topWipedOut.seats_2021} seats in 2021, won 0 in 2026 — fell off the assembly map entirely.`,
    })
  }

  // 3. Vote-vs-seat divergence — surfaces when a party gained/lost vote share but
  //    seat change went the OPPOSITE way (FPTP can punish you for spreading thin).
  //    Distinct narrative from anything else on the page.
  const divergent = meaningful.find(p =>
    Math.abs(p.share_swing) >= 2 &&
    Math.abs(p.seat_change) >= 3 &&
    Math.sign(p.share_swing) !== Math.sign(p.seat_change)
  )
  if (divergent) {
    swingInsights.push({
      emoji: '⚠️', accent: '#facc15',
      headline: `${divergent.party}'s vote share and seat count moved in opposite directions.`,
      detail: `Vote share ${divergent.share_swing > 0 ? 'rose' : 'fell'} ${Math.abs(divergent.share_swing).toFixed(1)}pp (${divergent.share_2021}% → ${divergent.share_2026}%) but seats ${divergent.seat_change > 0 ? 'went up' : 'went down'} ${Math.abs(divergent.seat_change)} (${divergent.seats_2021} → ${divergent.seats_2026}). First-past-the-post can punish vote-spreading or reward concentration.`,
    })
  }

  // Vote-to-seat efficiency (Δseats per Δpp): meaningful only when both swings exist
  const scatterData = meaningful
    .filter(p => Math.abs(p.share_swing) > 0.05 || Math.abs(p.seat_change) > 0)
    .map(p => ({
      party: p.party, color: p.color,
      x: p.share_swing,    // vote share swing (pp)
      y: p.seat_change,    // seat change
      z: Math.abs(p.seats_2026) + 1,
    }))

  return (
    <div>
      <div className="page-title">Swing & Trends (2021 → 2026)</div>

      {/* Anti-incumbency + vote-to-seat efficiency tiles */}
      {kpis && (
        <div className="col-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
          <div className="card" style={{ borderLeft: '4px solid #ef4444', padding: '1rem 1.1rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              🔁 Anti-incumbency
            </div>
            <div className="tabular" style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ef4444', lineHeight: 1.1 }}>
              {kpis.incumbency.anti_incumbency_pct !== null ? `${kpis.incumbency.anti_incumbency_pct}%` : '—'}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.45 }}>
              {kpis.incumbency.flipped_seats} of {kpis.incumbency.matched_2021_seats} seats flipped party between 2021 and 2026.
              The remaining <strong style={{ color: '#22c55e' }}>{kpis.incumbency.same_party_held}</strong> seats were retained by the same party.
            </div>
          </div>

          <div className="card" style={{ borderLeft: `4px solid ${kpis.efficiency[0]?.color ?? 'var(--accent)'}`, padding: '1rem 1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                📊 Vote-to-seat conversion
              </div>
              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>+pp = over-represented</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {kpis.efficiency.slice(0, 4).map(e => (
                <div key={e.alliance_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: e.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, color: e.color, fontWeight: 700 }}>{e.alliance_name.split('(')[0].trim()}</span>
                  <span className="tabular" style={{ width: 60, textAlign: 'right' }}>{e.vote_share}%</span>
                  <span style={{ color: 'var(--text-muted)' }}>→</span>
                  <span className="tabular" style={{ width: 60, textAlign: 'right' }}>{e.seat_share}%</span>
                  <span className="tabular" style={{
                    width: 60, textAlign: 'right', fontWeight: 800,
                    color: e.delta_pp > 5 ? '#22c55e' : e.delta_pp < -5 ? '#ef4444' : 'var(--text-secondary)',
                  }}>
                    {e.delta_pp > 0 ? '+' : ''}{e.delta_pp}pp
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Headline narrative */}
      <div className="card" style={{ marginBottom: '1.25rem', borderLeft: powerShift ? `4px solid ${rulingAlliance2026?.color}` : '4px solid var(--border)' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          The Story
        </div>
        <div style={{ fontSize: '1rem', lineHeight: 1.5 }}>
          {powerShift ? (
            <>
              <strong style={{ color: rulingAlliance2026?.color }}>{rulingAlliance2026?.name}</strong> displaces{' '}
              <strong style={{ color: rulingAlliance2021?.color }}>{rulingAlliance2021?.name}</strong> — going from{' '}
              {rulingAlliance2026?.seats_2021} → {rulingAlliance2026?.seats_2026} seats while the incumbent fell{' '}
              {rulingAlliance2021?.seats_2021} → {rulingAlliance2021?.seats_2026}.
            </>
          ) : (
            <>
              <strong style={{ color: rulingAlliance2026?.color }}>{rulingAlliance2026?.name}</strong> retains power with{' '}
              {rulingAlliance2026?.seats_2026} seats (was {rulingAlliance2026?.seats_2021}).
            </>
          )}{' '}
          {(flipMatrix as any)?.total_flips ? (
            <>
              <strong>{(flipMatrix as any).total_flips}</strong> of {data.swing.reduce((s, p) => s + p.seats_2026, 0)} constituencies flipped party between 2021 and 2026
              {' '}(a net <strong>{Math.round(netSeatShift)}</strong>-seat shift in party tallies).
            </>
          ) : (
            <>A net <strong>{Math.round(netSeatShift)}</strong>-seat shift across party tallies.</>
          )}
        </div>
      </div>

      {/* InsightsCard removed — The Story narrative above already serves as the
          page's auto-generated takeaways. swingInsights still computed for
          potential reuse elsewhere. */}

      {/* KPI cards row */}
      <div className="kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {biggestGainer && (
          <div className="stat-card"
               onClick={() => setFlipsModal({ party: biggestGainer.party, direction: 'gained', color: biggestGainer.color })}
               style={{ borderLeft: `3px solid ${biggestGainer.color}`, cursor: 'pointer' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Biggest Gainer</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: biggestGainer.color, display: 'flex', alignItems: 'center', gap: 8 }}>
              <PartyLogo party={biggestGainer.party} size={24} />{biggestGainer.party}
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#22c55e' }}>+{biggestGainer.seat_change} seats</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{biggestGainer.seats_2021} → {biggestGainer.seats_2026}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--accent)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              See which seats flipped <span style={{ fontSize: '0.85rem' }}>→</span>
            </div>
          </div>
        )}
        {biggestLoser && biggestLoser.seat_change < 0 && (
          <div className="stat-card"
               onClick={() => setFlipsModal({ party: biggestLoser.party, direction: 'lost', color: biggestLoser.color })}
               style={{ borderLeft: `3px solid ${biggestLoser.color}`, cursor: 'pointer' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Biggest Loser</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: biggestLoser.color, display: 'flex', alignItems: 'center', gap: 8 }}>
              <PartyLogo party={biggestLoser.party} size={24} />{biggestLoser.party}
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444' }}>{biggestLoser.seat_change} seats</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{biggestLoser.seats_2021} → {biggestLoser.seats_2026}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--accent)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              See which seats slipped <span style={{ fontSize: '0.85rem' }}>→</span>
            </div>
          </div>
        )}
        {topNew && (
          <div className="stat-card"
               onClick={() => setFlipsModal({ party: topNew.party, direction: 'gained', color: topNew.color })}
               style={{ borderLeft: `3px solid ${topNew.color}`, cursor: 'pointer' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>New Entrant</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: topNew.color, display: 'flex', alignItems: 'center', gap: 8 }}>
              <PartyLogo party={topNew.party} size={24} />{topNew.party}
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#22c55e' }}>{topNew.seats_2026} seats</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{newParties.length} new {newParties.length === 1 ? 'party' : 'parties'} in 2026</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--accent)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              See seats captured <span style={{ fontSize: '0.85rem' }}>→</span>
            </div>
          </div>
        )}
        {topWipedOut ? (
          <div className="stat-card"
               onClick={() => setFlipsModal({ party: topWipedOut.party, direction: 'lost', color: topWipedOut.color })}
               style={{ borderLeft: `3px solid ${topWipedOut.color}`, cursor: 'pointer' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Wiped Out</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: topWipedOut.color, display: 'flex', alignItems: 'center', gap: 8 }}>
              <PartyLogo party={topWipedOut.party} size={24} />{topWipedOut.party}
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444' }}>0 seats</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>was {topWipedOut.seats_2021} in 2021</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--accent)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              See seats lost <span style={{ fontSize: '0.85rem' }}>→</span>
            </div>
          </div>
        ) : (
          <div className="stat-card" style={{ borderLeft: '3px solid var(--border)' }}
               title="Net change in party-tally totals = sum(|Δ seats per party|) ÷ 2. Smaller than the per-AC flip count whenever a party both gained and lost seats."
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Net Seat Shift</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Party Tallies</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{Math.round(netSeatShift)}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>net reshuffle (party totals)</div>
          </div>
        )}
      </div>

      {/* Alliance swing */}
      {allianceSwing.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="section-title">Alliance Swing — Aggregated by Alliance</div>
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <SortableTh label="Alliance" sortKey="name" sort={aSort} onSort={aOnSort} />
                  <th>Parties</th>
                  <SortableTh label="Seats 2021" sortKey="seats_2021" sort={aSort} onSort={aOnSort} align="right" />
                  <SortableTh label="Seats 2026" sortKey="seats_2026" sort={aSort} onSort={aOnSort} align="right" />
                  <SortableTh label="Seat Change" sortKey="seat_change" sort={aSort} onSort={aOnSort} align="right" />
                  <SortableTh label="Vote Share 2026" sortKey="share_2026" sort={aSort} onSort={aOnSort} align="right" />
                  <SortableTh label="Vote Share Swing" sortKey="share_swing" sort={aSort} onSort={aOnSort} align="right" />
                  <th style={{ textAlign: 'right' }}>Trend</th>
                </tr>
              </thead>
              <tbody>
                {sortedAllianceSwing.map((a: any) => (
                  <tr key={a.id} onClick={() => setAllianceModal({ id: a.id, name: a.name, color: a.color })}
                      style={{ cursor: 'pointer' }}
                      title="Click to see party-wise holds, gains & losses">
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 12, height: 12, borderRadius: 3, background: a.color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 700 }}>{a.name}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent)', marginLeft: 4 }}>→</span>
                      </div>
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{a.parties.join(', ')}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{a.seats_2021}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '1.05rem' }}>{a.seats_2026}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: a.seat_change > 0 ? '#22c55e' : a.seat_change < 0 ? '#ef4444' : 'var(--text-secondary)' }}>
                      {a.seat_change > 0 ? '+' : ''}{a.seat_change}
                    </td>
                    <td style={{ textAlign: 'right' }}>{a.share_2026.toFixed(1)}%</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: a.share_swing > 0 ? '#22c55e' : a.share_swing < 0 ? '#ef4444' : 'var(--text-secondary)' }}>
                      {a.share_swing > 0 ? '+' : ''}{a.share_swing.toFixed(1)}pp
                    </td>
                    <td style={{ textAlign: 'right' }} title={`${a.seats_2021} → ${a.seats_2026} seats`}>
                      <Sparkline
                        values={[a.seats_2021, a.seats_2026]}
                        color={a.color}
                        width={56}
                        height={20}
                        ariaLabel={`${a.name} seats 2021 to 2026`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* District-Wise Churn + LS-Wise Segment Churn cards moved to the
          Geography page (under District View and Lok Sabha View tabs
          respectively) — they're a better fit alongside the rest of the
          area-aggregation views. Deep-link IDs (#district-churn,
          #ls-segment-churn) are preserved at their new home. */}

      {/* Seat transfers — who snatched from whom / who lost to whom */}
      {flipMatrix && flipMatrix.total_flips > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: 8 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Seat Transfers — Who Took Seats From Whom</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <strong>{flipMatrix.total_flips}</strong> seats changed parties between 2021 and 2026
            </div>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Each party's row shows the breakdown of where their gains came from (left) and where their losses went (right). Click any source/destination to expand the seat names.
          </div>
          <div className="col-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                Who snatched from whom ←
              </div>
              {flipMatrix.gainers.map((g: any) => (
                <TransferGroup key={`gain-${g.party}`}
                  partyA={g.party} partyAColor={g.party_color}
                  total={g.total_gained} totalLabel="gained"
                  items={g.sources}
                  itemArrow="←"
                  onSeatClick={(ac: number) => window.open(`/${state}/constituencies/${ac}`, '_blank')}
                />
              ))}
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                Who lost to whom →
              </div>
              {flipMatrix.losers.map((l: any) => (
                <TransferGroup key={`lose-${l.party}`}
                  partyA={l.party} partyAColor={l.party_color}
                  total={l.total_lost} totalLabel="lost"
                  items={l.destinations}
                  itemArrow="→"
                  onSeatClick={(ac: number) => window.open(`/${state}/constituencies/${ac}`, '_blank')}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Two-column charts (Vote Share Swing + Seats Won 2021 vs 2026) removed —
          both metrics are already conveyed by The Story above + the Alliance Swing
          and Seat Transfers sections. Vote-to-Seat scatter below keeps the
          swing/seat-change relationship visible in one chart instead of two. */}

      {/* Vote-to-seat efficiency scatter */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="section-title">Vote-to-Seat Conversion Efficiency</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
          X = vote-share swing (pp) · Y = seat change · Top-right = efficient winners · Bottom-left = collapses · Steep slope = high vote→seat conversion
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 10 }}>
            <XAxis type="number" dataKey="x" name="Vote swing" unit="pp" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}>
              <LabelList dataKey="x" />
            </XAxis>
            <YAxis type="number" dataKey="y" name="Seat change" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
            <ZAxis dataKey="z" range={[60, 400]} />
            <ReferenceLine x={0} stroke="var(--border)" />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Tooltip
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              formatter={(value, name) => {
                const v = Number(value)
                if (name === 'Vote swing') return [`${v > 0 ? '+' : ''}${v.toFixed(1)}pp`, name]
                if (name === 'Seat change') return [`${v > 0 ? '+' : ''}${v}`, name]
                return [value, name]
              }}
              labelFormatter={() => ''}
              cursor={{ strokeDasharray: '3 3' }}
            />
            <Scatter data={scatterData}>
              {scatterData.map((p, i) => <Cell key={i} fill={p.color} />)}
              <LabelList dataKey="party" position="top" style={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* "20 Closest Contests" table removed — same data available in the
          Overview page's Close-Contests modal, where it's also more discoverable
          (clickable Competition KPI tile). Kept the per-AC drill-in pattern there. */}

      {/* ──────────────  Alliance breakdown modal  ────────────── */}
      {allianceModal && (
        <div
          onClick={() => setAllianceModal(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(7, 9, 26, 0.78)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '4vh 1rem', zIndex: 50, overflowY: 'auto',
          }}
        >
          <div
            className="card"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 920, width: '100%',
              borderLeft: `4px solid ${allianceModal.color}`,
              maxHeight: '92vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Alliance Breakdown
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: allianceModal.color, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: allianceModal.color }} />
                  {allianceModal.name}
                </div>
                {allianceData && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 6 }}>
                    {allianceData.seats_2021} → <strong>{allianceData.seats_2026}</strong> seats ·{' '}
                    <span style={{ color: allianceData.net_change > 0 ? '#22c55e' : allianceData.net_change < 0 ? '#ef4444' : 'var(--text-secondary)', fontWeight: 700 }}>
                      {allianceData.net_change > 0 ? '+' : ''}{allianceData.net_change} net
                    </span>
                    {allianceData.uses_name_match && (
                      <span style={{ marginLeft: 10, fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: 4, background: 'rgba(234,179,8,0.12)', color: '#facc15', border: '1px solid rgba(234,179,8,0.3)' }}>
                        Matched by name (post-2023 delimitation)
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button onClick={() => setAllianceModal(null)} style={{
                background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem',
              }}>Close ✕</button>
            </div>

            {allianceLoading && (
              <div style={{ padding: '0.75rem 0' }}>
                <Skeleton height={16} width="50%" />
                <Skeleton height={16} width="70%" style={{ marginTop: 8 }} />
                <Skeleton height={16} width="60%" style={{ marginTop: 8 }} />
              </div>
            )}

            {allianceData && allianceData.parties.length === 0 && (
              <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>No parties in this alliance.</div>
            )}

            {allianceData && allianceData.parties.length > 0 && (
              <>
                {/* Alliance totals summary chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '1.25rem' }}>
                  {[
                    { label: 'Held', value: allianceData.totals.holds, color: '#94a3b8' },
                    { label: 'Flipped In', value: allianceData.totals.flipped_in_inter, color: '#22c55e' },
                    { label: 'Flipped Out', value: allianceData.totals.flipped_out_inter, color: '#ef4444' },
                    { label: 'New Seats', value: allianceData.totals.new_seats, color: '#3b82f6' },
                    { label: 'Delimited Away', value: allianceData.totals.delimited_seats, color: '#facc15' },
                    ...(allianceData.totals.intra_alliance_flips > 0
                      ? [{ label: 'Intra-Alliance', value: allianceData.totals.intra_alliance_flips, color: '#a78bfa' }]
                      : []),
                  ].map(k => (
                    <div key={k.label} className="stat-card" style={{ padding: '0.5rem 0.85rem', borderLeft: `3px solid ${k.color}` }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: k.color }}>{k.value}</div>
                    </div>
                  ))}
                </div>

                {/* Per-party cards */}
                {allianceData.parties.map((p: any) => (
                  <AlliancePartyCard
                    key={p.party}
                    p={p}
                    onSeatClick={(ac: number) => window.open(`/${state}/constituencies/${ac}`, '_blank')}
                  />
                ))}

                <div style={{ marginTop: 14, fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '0.5rem 0.7rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                  💡 Clicking any seat opens its detail page in a new tab so this breakdown stays open.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ──────────────  Seat flips modal  ────────────── */}
      {flipsModal && (
        <div
          onClick={() => setFlipsModal(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(7, 9, 26, 0.78)',
            backdropFilter: 'blur(6px)',
            zIndex: 100,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '4rem 1rem 2rem', overflowY: 'auto',
            animation: 'fadeInUp 0.25s ease-out',
          }}
        >
          <div
            className="card"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 820, width: '100%',
              borderLeft: `4px solid ${flipsModal.color}`,
              maxHeight: '85vh', overflowY: 'auto',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  {flipsModal.direction === 'gained' ? 'Seats Gained' : 'Seats Lost'} by
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: flipsModal.color, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <PartyLogo party={flipsModal.party} size={32} />
                  {flipsModal.party}
                  {flipsData && (
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginLeft: 6 }}>
                      · {flipsData.party_full_name}
                    </span>
                  )}
                </div>
                {flipsData && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <span><strong style={{ color: flipsModal.direction === 'gained' ? '#4ade80' : '#f87171' }}>{flipsData.flipped_count}</strong> seats {flipsModal.direction === 'gained' ? 'flipped to' : 'lost from'} {flipsModal.party}</span>
                    <span>· <strong>{flipsData.held_count}</strong> held from 2021</span>
                    {flipsData.new_seat_count > 0 && (
                      <span>· <strong style={{ color: '#facc15' }}>{flipsData.new_seat_count}</strong> {flipsModal.direction === 'gained' ? 'wins in new (post-delimitation) seats' : ''}</span>
                    )}
                  </div>
                )}
              </div>
              <button onClick={() => setFlipsModal(null)} style={{
                background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem',
              }}>Close ✕</button>
            </div>

            {flipsLoading && <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Loading flipped seats…</div>}

            {flipsData && flipsData.flips.length === 0 && flipsData.new_seat_count === 0 && (
              <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                {flipsModal.direction === 'gained'
                  ? `${flipsModal.party} did not gain any seats from other parties.`
                  : `${flipsModal.party} did not lose any seats to other parties.`}
              </div>
            )}

            {/* Flipped seats table — sortable */}
            <FlipsTable
              flips={flipsData?.flips ?? []}
              color={flipsModal.color}
              title="Flipped Seats"
              onRowClick={(ac) => window.open(`/${state}/constituencies/${ac}`, "_blank")}
            />


            {/* New seats section (post-delimitation) — now sortable */}
            <FlipsTable
              flips={(flipsData?.new_seats ?? []).map((s: any) => ({ ...s, from_party: undefined, to_party: undefined }))}
              color="#eab308"
              title="Wins in Post-Delimitation New Seats"
              onRowClick={(ac) => window.open(`/${state}/constituencies/${ac}`, "_blank")}
            />

            {/* Delimitation losses — for the main view's "lost" direction */}
            {flipsData && flipsData.delimitation_losses > 0 && flipsModal.direction === 'lost' && (
              <div style={{
                marginTop: '0.5rem', marginBottom: '1rem',
                padding: '0.85rem 1rem',
                borderRadius: 10,
                background: 'rgba(234,179,8,0.08)',
                border: '1px dashed rgba(234,179,8,0.40)',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#facc15', display: 'flex', alignItems: 'center', gap: 6 }}>
                      🚫 Lost to 2023 delimitation
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                      {flipsData.delimitation_losses} {flipsData.delimitation_losses === 1 ? 'seat' : 'seats'} that {flipsModal.party} held in 2021 ceased to exist after Assam's August 2023 redistricting — these names were merged, split, or renamed and no longer appear on the 2026 map.
                    </div>
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#facc15' }}>
                    −{flipsData.delimitation_losses}
                  </div>
                </div>
                {flipsData.delimited_seats && flipsData.delimited_seats.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {flipsData.delimited_seats.map((s: any) => (
                      <span key={s.ac_2021} style={{
                        padding: '0.25rem 0.55rem', borderRadius: 6, fontSize: '0.72rem',
                        background: 'rgba(234,179,8,0.12)', color: '#facc15',
                        border: '1px solid rgba(234,179,8,0.30)',
                      }}>
                        <span style={{ opacity: 0.7, marginRight: 4 }}>AC#{s.ac_2021}</span>
                        {s.name_2021}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Counter-flow: the opposite direction (gained ↔ lost) for the same party. */}
            {counterFlowData && (() => {
              const isLost = oppositeDirection === 'lost'
              const accentSoft = isLost ? '#f87171' : '#4ade80'
              const n = counterFlowData.flips.length
              return (
                <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px dashed var(--border-strong)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      But {flipsModal!.party} also {isLost ? 'lost' : 'gained'} seats
                    </div>
                    <div style={{ fontSize: '0.85rem', color: n > 0 ? accentSoft : 'var(--text-secondary)', fontWeight: 700 }}>
                      {n > 0 ? (isLost ? '−' : '+') : ''}{n} seat{n === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
                    {n === 0 ? (
                      isLost
                        ? `${flipsModal!.party} didn't lose any of the seats they held in 2021 — a clean sweep.`
                        : `${flipsModal!.party} didn't capture any new seats — their loss is purely subtractive.`
                    ) : isLost
                      ? `Even while gaining ${flipsData?.flipped_count ?? 0} new seats, ${flipsModal!.party} also lost ${counterFlowData.flipped_count} seats they held in 2021.`
                      : `Even while losing ${flipsData?.flipped_count ?? 0} seats, ${flipsModal!.party} also captured ${counterFlowData.flipped_count} new seats from other parties.`}
                  </div>
                  <FlipsTable
                    flips={counterFlowData.flips}
                    color={isLost ? '#ef4444' : '#22c55e'}
                    title=""
                    onRowClick={(ac) => window.open(`/${state}/constituencies/${ac}`, "_blank")}
                    faded
                    signPrefix={isLost ? '−' : '+'}
                  />

                  {/* Delimitation losses in counter-flow — only when the counter-flow direction is 'lost' */}
                  {isLost && counterFlowData.delimitation_losses > 0 && (
                    <div style={{
                      marginTop: '0.75rem',
                      padding: '0.7rem 0.9rem',
                      borderRadius: 10,
                      background: 'rgba(234,179,8,0.06)',
                      border: '1px dashed rgba(234,179,8,0.35)',
                      opacity: 0.95,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                        <div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#facc15', display: 'flex', alignItems: 'center', gap: 6 }}>
                            🚫 …and lost seats to 2023 delimitation
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 3 }}>
                            {counterFlowData.delimitation_losses} more {counterFlowData.delimitation_losses === 1 ? 'seat' : 'seats'} {flipsModal!.party} held in 2021 ceased to exist after Assam's August 2023 redistricting — these names were merged, split, or renamed.
                          </div>
                        </div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#facc15' }}>
                          −{counterFlowData.delimitation_losses}
                        </div>
                      </div>
                      {counterFlowData.delimited_seats && counterFlowData.delimited_seats.length > 0 && (
                        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {counterFlowData.delimited_seats.map((s: any) => (
                            <span key={s.ac_2021} style={{
                              padding: '0.2rem 0.5rem', borderRadius: 6, fontSize: '0.7rem',
                              background: 'rgba(234,179,8,0.10)', color: '#facc15',
                              border: '1px solid rgba(234,179,8,0.25)',
                            }}>
                              <span style={{ opacity: 0.65, marginRight: 4 }}>AC#{s.ac_2021}</span>
                              {s.name_2021}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Net change summary at the bottom — gives the headline math */}
            {flipsData && counterFlowData && (
              <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', borderRadius: 10, background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Net seat change for <strong style={{ color: flipsModal!.color }}>{flipsModal!.party}</strong></div>
                {(() => {
                  const gained = flipsModal!.direction === 'gained' ? (flipsData.flipped_count + (flipsData.new_seat_count || 0)) : counterFlowData.flipped_count
                  const flipLost = flipsModal!.direction === 'lost' ? flipsData.flipped_count : counterFlowData.flipped_count
                  const delimLost = flipsData.delimitation_losses || 0
                  const lost = flipLost + delimLost
                  const net = gained - lost
                  return (
                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                      <span style={{ color: '#4ade80' }}>+{gained}</span>
                      <span style={{ color: 'var(--text-secondary)', margin: '0 6px' }}>−</span>
                      <span style={{ color: '#f87171' }}>{lost}</span>
                      {delimLost > 0 && (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 500, marginLeft: 4 }}>
                          ({flipLost} flipped + {delimLost} delimited)
                        </span>
                      )}
                      <span style={{ color: 'var(--text-secondary)', margin: '0 8px' }}>=</span>
                      <span style={{ color: net > 0 ? '#4ade80' : net < 0 ? '#f87171' : 'var(--text-secondary)', fontSize: '1rem' }}>
                        {net > 0 ? '+' : ''}{net} seats
                      </span>
                    </div>
                  )
                })()}
              </div>
            )}

            {flipsData && (flipsData.flips.length > 0 || (counterFlowData && counterFlowData.flips.length > 0)) && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 10, padding: '0.5rem 0.7rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                Click any row to drill into the constituency detail page.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
