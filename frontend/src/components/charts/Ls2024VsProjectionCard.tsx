import { useMemo, useState } from 'react'
import { useSortable } from '../../lib/useSortable'
import SortableTh from '../SortableTh'
import { fmtIN } from '../../lib/format'
import { useEscapeKey } from '../../lib/useEscapeKey'

type FilterMode = 'all' | 'same' | 'flip'

// Side-by-side comparison: actual LS 2024 PC winner (alliance-aggregated)
// vs the 2026-assembly-vote projection (same alliance grouping). Each row
// is one Lok Sabha seat. Flagged "FLIP" when the LS24 alliance ≠ projected
// 2026 alliance — i.e. the same voters that backed alliance A in LS 2024
// would project alliance B based on their 2026 assembly choices.
export function Ls2024VsProjectionCard({
  ls2024Seats, projectionSeats,
}: {
  ls2024Seats: any[]                 // from /{state}/ls2024-pc-winners
  projectionSeats: any[]             // from /{state}/loksabha → response.seats
}) {
  const fmt = (n: number) => fmtIN(n)

  // Join on ls_seat_id
  const rows = useMemo(() => {
    const byId: Record<number, any> = {}
    ls2024Seats.forEach((s: any) => { byId[s.ls_seat_id] = { ...byId[s.ls_seat_id], ls24: s } })
    projectionSeats.forEach((s: any) => { byId[s.ls_seat_id] = { ...byId[s.ls_seat_id], p26: s } })
    return Object.values(byId)
      .filter((r: any) => r.ls24 && r.p26)
      .map((r: any) => {
        const flipped = r.ls24.ls2024_alliance_id !== r.p26.projected_winning_alliance_id
        const partyMatch = r.ls24.ls2024_top_party === r.p26.projected_winner
        return {
          ls_seat_id: r.ls24.ls_seat_id,
          ls_number: r.ls24.ls_number,
          ls_name: r.ls24.ls_name,
          ls24_alliance: r.ls24.ls2024_alliance_name,
          ls24_alliance_color: r.ls24.ls2024_alliance_color,
          ls24_top_party: r.ls24.ls2024_top_party,
          ls24_top_party_color: r.ls24.ls2024_top_party_color,
          ls24_share: r.ls24.ls2024_alliance_share,
          ls24_margin: r.ls24.ls2024_margin,
          p26_alliance: r.p26.projected_winning_alliance_name,
          p26_alliance_color: r.p26.projected_winning_alliance_color,
          p26_top_party: r.p26.projected_winner,
          p26_top_party_color: r.p26.projected_winner_color,
          // 2026 alliance share + margin
          p26_share: r.p26.alliance_breakdown?.[0]
            ? r.p26.alliance_breakdown[0].vote_share
            : 0,
          p26_margin: (r.p26.alliance_breakdown?.[0]?.votes ?? 0) - (r.p26.alliance_breakdown?.[1]?.votes ?? 0),
          flipped,
          partyMatch,
          // For sortable's `flip_order` column: 1 = flip, 0 = same
          flip_order: flipped ? 1 : 0,
          // Full payloads kept for the detail modal
          _ls24_full: r.ls24,
          _p26_full: r.p26,
        }
      })
  }, [ls2024Seats, projectionSeats])

  // Filter mode driven by the "same"/"would flip" chip clicks.
  const [filter, setFilter] = useState<FilterMode>('all')
  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows
    if (filter === 'same') return rows.filter(r => !r.flipped)
    return rows.filter(r => r.flipped)
  }, [rows, filter])

  const { sorted, sort, onSort } = useSortable<any>(filteredRows, { key: 'flip_order', dir: 'desc' })

  // Detail-modal state — the clicked row
  const [openRow, setOpenRow] = useState<any | null>(null)
  useEscapeKey(openRow !== null, () => setOpenRow(null))

  const flipCount = rows.filter(r => r.flipped).length
  const sameCount = rows.length - flipCount
  const total = rows.length

  // Top-line LS 2024 vs 2026 alliance tally
  const tally = useMemo(() => {
    const ls24: Record<string, { color: string; n: number }> = {}
    const p26: Record<string, { color: string; n: number }> = {}
    rows.forEach(r => {
      if (!ls24[r.ls24_alliance]) ls24[r.ls24_alliance] = { color: r.ls24_alliance_color, n: 0 }
      ls24[r.ls24_alliance].n += 1
      if (!p26[r.p26_alliance]) p26[r.p26_alliance] = { color: r.p26_alliance_color, n: 0 }
      p26[r.p26_alliance].n += 1
    })
    const ls24List = Object.entries(ls24).map(([k, v]) => ({ name: k, ...v })).sort((a, b) => b.n - a.n)
    const p26List = Object.entries(p26).map(([k, v]) => ({ name: k, ...v })).sort((a, b) => b.n - a.n)
    return { ls24: ls24List, p26: p26List }
  }, [rows])

  if (rows.length === 0) return null

  return (
    <div id="ls2024-vs-projection" className="card" style={{ marginBottom: '1.5rem', padding: 0, overflow: 'hidden' }}>
      {/* Header + summary chips */}
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <div>
            <div className="section-title" style={{ marginBottom: 0 }}>LS 2024 Actual vs 2026 Projection — by PC</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              Compares the actual LS 2024 MP for each Lok Sabha seat against the alliance that would win it on 2026 assembly votes. The MP's party is mapped to its 2026 alliance, so a HOLD/FLIP shows whether the same alliance still leads.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, fontSize: '0.78rem', alignItems: 'center' }}>
            {filter !== 'all' && (
              <button onClick={() => setFilter('all')}
                title="Clear filter — show all PCs"
                style={{ padding: '0.3rem 0.55rem', borderRadius: 6, cursor: 'pointer',
                         background: 'transparent', color: 'var(--text-secondary)',
                         border: '1px solid var(--border)', fontSize: '0.72rem' }}>
                Show all ({total}) ✕
              </button>
            )}
            <button onClick={() => setFilter(filter === 'same' ? 'all' : 'same')}
              title={filter === 'same' ? 'Click again to clear the filter' : 'Click to show only PCs that would hold (no alliance change)'}
              style={{ padding: '0.3rem 0.65rem', borderRadius: 6, cursor: 'pointer', fontWeight: 700,
                       background: filter === 'same' ? 'rgba(34,197,94,0.25)' : 'rgba(34,197,94,0.10)',
                       color: '#22c55e',
                       border: `1px solid ${filter === 'same' ? '#22c55e' : 'rgba(34,197,94,0.30)'}`,
                       boxShadow: filter === 'same' ? '0 0 0 3px rgba(34,197,94,0.10)' : 'none',
                       transition: 'all 0.12s ease' }}>
              🔒 {fmt(sameCount)} same{filter === 'same' ? ' · filtering' : ''}
            </button>
            <button onClick={() => setFilter(filter === 'flip' ? 'all' : 'flip')}
              title={filter === 'flip' ? 'Click again to clear the filter' : 'Click to show only PCs that would flip alliance'}
              style={{ padding: '0.3rem 0.65rem', borderRadius: 6, cursor: 'pointer', fontWeight: 700,
                       background: filter === 'flip' ? 'rgba(249,115,22,0.25)' : 'rgba(249,115,22,0.10)',
                       color: '#f97316',
                       border: `1px solid ${filter === 'flip' ? '#f97316' : 'rgba(249,115,22,0.30)'}`,
                       boxShadow: filter === 'flip' ? '0 0 0 3px rgba(249,115,22,0.10)' : 'none',
                       transition: 'all 0.12s ease' }}>
              🔁 {fmt(flipCount)} would flip{filter === 'flip' ? ' · filtering' : ''}
            </button>
          </div>
        </div>

        {/* Two-row tally: LS 2024 vs 2026 projection bars */}
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '90px 1fr', gap: '0.5rem 0.85rem', fontSize: '0.78rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600, alignSelf: 'center' }}>LS 2024</div>
          <div style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden', background: 'var(--bg-secondary)' }}>
            {tally.ls24.map(t => {
              const pct = (t.n / total) * 100
              return (
                <div key={t.name} title={`${t.name}: ${t.n} PCs (${pct.toFixed(1)}%)`}
                  style={{ width: `${pct}%`, background: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                           fontSize: '0.68rem', fontWeight: 700, color: '#0b1020' }}>
                  {pct >= 6 ? t.n : ''}
                </div>
              )
            })}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600, alignSelf: 'center' }}>2026 proj.</div>
          <div style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden', background: 'var(--bg-secondary)' }}>
            {tally.p26.map(t => {
              const pct = (t.n / total) * 100
              return (
                <div key={t.name} title={`${t.name}: ${t.n} PCs (${pct.toFixed(1)}%)`}
                  style={{ width: `${pct}%`, background: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                           fontSize: '0.68rem', fontWeight: 700, color: '#0b1020' }}>
                  {pct >= 6 ? t.n : ''}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Comparison table */}
      <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        <table>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
            <tr>
              <SortableTh label="LS Seat" sortKey="ls_name" sort={sort} onSort={onSort} />
              <SortableTh label="LS 2024 Winner" sortKey="ls24_alliance" sort={sort} onSort={onSort} />
              <SortableTh label="LS 2024 Margin" sortKey="ls24_margin" sort={sort} onSort={onSort} align="right" />
              <SortableTh label="2026 Projection" sortKey="p26_alliance" sort={sort} onSort={onSort} />
              <SortableTh label="2026 Margin" sortKey="p26_margin" sort={sort} onSort={onSort} align="right" />
              <SortableTh label="Status" sortKey="flip_order" sort={sort} onSort={onSort} align="center" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  No PCs match the current filter.
                </td>
              </tr>
            )}
            {sorted.map((r: any) => (
              <tr key={r.ls_seat_id} onClick={() => setOpenRow(r)}
                title="Click to see the full alliance breakdown and sitting MP for this Lok Sabha seat"
                style={{
                  cursor: 'pointer',
                  background: r.flipped ? 'rgba(249,115,22,0.05)' : undefined,
                }}>
                <td>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginRight: 6 }}>#{r.ls_number}</span>
                  <span style={{ fontWeight: 600 }}>{r.ls_name}</span>
                </td>
                <td>
                  <span style={{ fontSize: '0.82rem' }}>
                    <span style={{ color: r.ls24_alliance_color, fontWeight: 700 }}>{r.ls24_alliance}</span>
                    {r.ls24_top_party && (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}> ({r.ls24_top_party})</span>
                    )}
                  </span>
                </td>
                <td className="tabular" style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-secondary)' }}
                  title={`${r.ls24_share.toFixed(1)}% vote share`}>
                  +{fmt(r.ls24_margin)}
                </td>
                <td>
                  <span style={{ fontSize: '0.82rem' }}>
                    <span style={{ color: r.p26_alliance_color, fontWeight: 700 }}>{r.p26_alliance}</span>
                    {r.p26_top_party && (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}> ({r.p26_top_party})</span>
                    )}
                  </span>
                </td>
                <td className="tabular" style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-secondary)' }}
                  title={`${r.p26_share.toFixed(1)}% vote share`}>
                  +{fmt(r.p26_margin)}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {r.flipped ? (
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.55rem',
                      borderRadius: 12, background: 'rgba(249,115,22,0.15)', color: '#f97316',
                      border: '1px solid rgba(249,115,22,0.40)',
                    }}
                      title={`LS 2024: ${r.ls24_alliance} → 2026 projection: ${r.p26_alliance}`}>
                      🔁 FLIP
                    </span>
                  ) : (
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.55rem',
                      borderRadius: 12, background: 'rgba(34,197,94,0.12)', color: '#22c55e',
                      border: '1px solid rgba(34,197,94,0.30)',
                    }}>
                      ✓ HOLD
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ padding: '0.7rem 1.25rem', fontSize: '0.72rem', color: 'var(--text-secondary)',
                    background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', fontStyle: 'italic' }}>
        "Would flip" means the alliance the MP's party belongs to (under the 2026 config) is different from the alliance projected to win on 2026 assembly votes. Example: a 2024 INC MP maps to the DMK-led SPA alliance — if 2026 assembly votes project NDA-TN for that PC, it's a FLIP. Click any row to see the full alliance + party breakdown and the sitting MP.
      </div>

      {/* Detail modal — opens on row click */}
      {openRow && (
        <LsPcDetailModal row={openRow} onClose={() => setOpenRow(null)} />
      )}
    </div>
  )
}


// Drill-down modal for one LS seat — shows the full alliance breakdown for
// both LS 2024 and the 2026 projection, plus the sitting MP from LS 2024.
function LsPcDetailModal({ row, onClose }: { row: any; onClose: () => void }) {
  const fmt = (n: number) => fmtIN(n)
  const ls24 = row._ls24_full
  const p26 = row._p26_full
  const mp = p26?.sitting_mp_2024

  const ls24Breakdown = (ls24?.ls2024_alliance_breakdown ?? []) as any[]
  const p26Breakdown = (p26?.alliance_breakdown ?? []) as any[]

  // Story sentence — explains in plain English what changed.
  // ls24 column references the ACTUAL MP (mp.name from the LS 2024 ECI list).
  const mpName = mp?.name ? <strong>{mp.name}</strong> : 'the sitting MP'
  const story = row.flipped ? (
    <>
      In LS 2024, {mpName} (<strong style={{ color: row.ls24_top_party_color }}>{row.ls24_top_party}</strong>)
      won this seat by {fmt(row.ls24_margin)} votes — placing it in the{' '}
      <strong style={{ color: row.ls24_alliance_color }}>{row.ls24_alliance}</strong> camp under the
      2026 alliance config.
      But the 2026 assembly votes from these same constituencies project{' '}
      <strong style={{ color: row.p26_alliance_color }}>{row.p26_alliance}</strong>
      {' '}leading with {row.p26_share.toFixed(1)}% (margin {fmt(row.p26_margin)}).
      Alliance allegiance has effectively flipped.
    </>
  ) : (
    <>
      In LS 2024, {mpName} (<strong style={{ color: row.ls24_top_party_color }}>{row.ls24_top_party}</strong>)
      won this seat by {fmt(row.ls24_margin)} votes for the{' '}
      <strong style={{ color: row.ls24_alliance_color }}>{row.ls24_alliance}</strong>.
      The 2026 assembly votes project the same alliance still leading with{' '}
      {row.p26_share.toFixed(1)}% (margin {fmt(row.p26_margin)}).
    </>
  )

  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(7, 9, 26, 0.78)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '4vh 1rem', zIndex: 50, overflowY: 'auto',
      }}>
      <div onClick={e => e.stopPropagation()} className="card"
        style={{
          maxWidth: 980, width: '100%', maxHeight: '92vh', overflowY: 'auto',
          borderLeft: `4px solid ${row.flipped ? '#f97316' : '#22c55e'}`,
        }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Lok Sabha Seat · #{row.ls_number}
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.2 }}>{row.ls_name}</div>
            <div style={{ marginTop: 6 }}>
              {row.flipped ? (
                <span style={{
                  fontSize: '0.72rem', fontWeight: 800, padding: '0.18rem 0.6rem',
                  borderRadius: 12, background: 'rgba(249,115,22,0.15)', color: '#f97316',
                  border: '1px solid rgba(249,115,22,0.40)',
                }}>
                  🔁 WOULD FLIP — {row.ls24_alliance} → {row.p26_alliance}
                </span>
              ) : (
                <span style={{
                  fontSize: '0.72rem', fontWeight: 800, padding: '0.18rem 0.6rem',
                  borderRadius: 12, background: 'rgba(34,197,94,0.12)', color: '#22c55e',
                  border: '1px solid rgba(34,197,94,0.30)',
                }}>
                  ✓ HOLD — {row.ls24_alliance} continues to lead
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                     borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>
            Close ✕
          </button>
        </div>

        {/* Sitting MP banner */}
        {mp && mp.name && (
          <div style={{
            padding: '0.7rem 0.85rem', borderRadius: 8, marginBottom: '1rem',
            background: `${mp.party_color}0c`, border: `1px solid ${mp.party_color}44`,
          }}>
            <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>
              🪪 Sitting MP (Lok Sabha 2024)
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: '1rem', fontWeight: 800 }}>{mp.name}</div>
              <div style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: mp.party_color, fontWeight: 700 }}>{mp.party}</span>
                {mp.gender && <span style={{ color: 'var(--text-muted)' }}>· {mp.gender}</span>}
                {mp.seat_type && mp.seat_type !== 'GEN' && (
                  <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.45rem', borderRadius: 10,
                                 background: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.30)', color: '#a78bfa' }}>
                    Reserved ({mp.seat_type})
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Story sentence */}
        <div style={{
          padding: '0.85rem 1rem', borderRadius: 8, marginBottom: '1.25rem',
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          fontSize: '0.92rem', lineHeight: 1.55,
        }}>
          {story}
        </div>

        {/* Side-by-side alliance breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <AllianceBreakdownColumn
            title="LS 2024 votes — by 2026 alliance lines"
            subtitle={`${fmt(ls24?.total_votes_ls2024 ?? 0)} valid votes · note: 2024 contestation was different (e.g. AIADMK was independent)`}
            breakdown={ls24Breakdown}
            accent={row.ls24_alliance_color}
            winnerId={null /* don't highlight by alliance-sum; the MP banner above is the real LS 2024 winner */}
          />
          <AllianceBreakdownColumn
            title="2026 projection — assembly votes"
            subtitle={`${fmt(p26?.total_votes ?? 0)} votes aggregated across ${p26?.total_segments ?? 0} segments`}
            breakdown={p26Breakdown}
            accent={row.p26_alliance_color}
            winnerId={p26?.projected_winning_alliance_id}
          />
        </div>

        <div style={{ marginTop: 14, fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic',
                      padding: '0.5rem 0.7rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
          The LS 2024 column re-totals those votes under today's alliance lines (supplementary context) — but the HOLD/FLIP status above uses the <strong>actual MP's party</strong>, mapped to its 2026 alliance. So even when the re-grouped sum looks different from the MP's win (because alliance composition changed between cycles), the headline status reflects what really happened on election day.
        </div>
      </div>
    </div>
  )
}


// Column used twice inside the modal — LS 2024 actual side and 2026 projection
// side. Renders an alliance ranking with member-party chips.
function AllianceBreakdownColumn({
  title, subtitle, breakdown, accent, winnerId,
}: {
  title: string; subtitle: string;
  breakdown: any[]; accent: string;
  winnerId?: string | null;
}) {
  const fmt = (n: number) => fmtIN(n)
  if (!breakdown.length) {
    return (
      <div className="card" style={{ borderLeft: `3px solid ${accent}`, padding: '0.85rem' }}>
        <div className="section-title" style={{ marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 10 }}>{subtitle}</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>
          No breakdown available.
        </div>
      </div>
    )
  }
  return (
    <div className="card" style={{ borderLeft: `3px solid ${accent}`, padding: '0.85rem' }}>
      <div className="section-title" style={{ marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 10 }}>{subtitle}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {breakdown.map((a: any) => {
          const isWinner = a.alliance_id === winnerId
          return (
            <div key={a.alliance_id}
              style={{
                padding: '0.6rem 0.7rem', borderRadius: 6,
                background: isWinner ? `${a.color}14` : 'var(--bg-secondary)',
                border: `1px solid ${isWinner ? `${a.color}55` : 'var(--border)'}`,
              }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 800, color: a.color }}>
                  {isWinner && '🏆 '}{a.alliance_name}
                </span>
                <span className="tabular" style={{ fontSize: '0.84rem' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{a.vote_share.toFixed(1)}%</strong>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}> · {fmt(a.votes)} votes</span>
                </span>
              </div>
              {/* Vote-share bar */}
              <div style={{ height: 6, background: 'var(--bg-card)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ width: `${a.vote_share}%`, height: '100%', background: a.color, borderRadius: 3 }} />
              </div>
              {/* Member parties */}
              {a.member_parties && a.member_parties.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {a.member_parties.slice(0, 8).map((m: any) => (
                    <span key={m.party} style={{
                      fontSize: '0.68rem', padding: '0.12rem 0.4rem', borderRadius: 10,
                      background: `${m.color}18`, color: m.color, border: `1px solid ${m.color}33`,
                      fontWeight: 700, whiteSpace: 'nowrap',
                    }}
                      title={`${m.party}: ${fmt(m.votes)} votes`}>
                      {m.party} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{fmt(m.votes)}</span>
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
