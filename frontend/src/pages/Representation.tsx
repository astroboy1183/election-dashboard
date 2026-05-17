import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useLokSabha } from '../lib/api'
import PartyLogo from '../components/PartyLogo'
import { fmtIN } from '../lib/format'

// "Your Representatives" — group every assembly MLA (Assembly 2026) under
// the Lok Sabha PC they sit in, and pair the PC with its sitting MP (LS
// 2024). This is the citizen-facing answer to "Who represents me at the
// state and at the centre?" — backed entirely by data the dashboard
// already loads (no new endpoint).
export default function Representation() {
  const { state } = useParams<{ state: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: lsData, isLoading } = useLokSabha(state!)

  // Deep-link: ConstituencyDetail's "Who Represents You" card sends users
  // here with #ls-N. Scroll the matching PC card into view + briefly flash
  // it so the user knows where their click landed.
  const [flashedId, setFlashedId] = useState<string | null>(null)
  useEffect(() => {
    if (!location.hash || !lsData) return
    const id = location.hash.replace(/^#/, '')
    // Defer one frame so the card is mounted before we measure
    requestAnimationFrame(() => {
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setFlashedId(id)
        setTimeout(() => setFlashedId(null), 1800)
      }
    })
  }, [location.hash, lsData])

  // Free-text filter applied to LS PC name, MP name, MLA name, AC name,
  // and party tokens. Lower-cased and stripped on each compare.
  const [query, setQuery] = useState('')
  // "Alignment" filter: all / aligned (every MLA shares the MP's party)
  //   / partly-aligned (some) / not-aligned (none)
  type AlignFilter = 'all' | 'fully' | 'partly' | 'none'
  const [align, setAlign] = useState<AlignFilter>('all')

  // Per-PC enriched rows
  const pcRows = useMemo(() => {
    if (!lsData?.seats) return []
    return (lsData.seats as any[]).map(seat => {
      const mp = seat.sitting_mp_2024
      const segments: any[] = seat.segments ?? []
      const decided = segments.filter(s => s.winner_party)
      const matched = mp
        ? decided.filter(s => s.winner_party === mp.party)
        : []
      const distinctParties = new Set(decided.map(s => s.winner_party)).size
      const allAligned = mp && decided.length > 0 && matched.length === decided.length
      const noneAligned = mp && decided.length > 0 && matched.length === 0
      return {
        ls_seat_id: seat.ls_seat_id,
        ls_number: seat.ls_number,
        ls_name: seat.ls_name,
        mp,
        segments,
        decided_count: decided.length,
        matched_count: matched.length,
        distinctParties,
        allAligned,
        noneAligned,
      }
    })
  }, [lsData])

  // Apply text + alignment filters
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pcRows.filter(r => {
      if (align === 'fully' && !r.allAligned) return false
      if (align === 'none' && !r.noneAligned) return false
      if (align === 'partly' && (r.allAligned || r.noneAligned || !r.mp)) return false
      if (!q) return true
      // Match against PC name, MP name, MP party, every MLA name+party+AC name
      const hay: string[] = [r.ls_name, String(r.ls_number)]
      if (r.mp) hay.push(r.mp.name, r.mp.party)
      r.segments.forEach(s => {
        hay.push(s.name ?? '', s.winner ?? '', s.winner_party ?? '', String(s.ac_number ?? ''))
      })
      return hay.some(h => h.toLowerCase().includes(q))
    })
  }, [pcRows, query, align])

  // Summary stats for the headline strip
  const summary = useMemo(() => {
    let totalMLAs = 0
    let mpPartyMLAs = 0
    let pcsFullyAligned = 0
    let pcsZeroAligned = 0
    pcRows.forEach(r => {
      totalMLAs += r.decided_count
      mpPartyMLAs += r.matched_count
      if (r.allAligned) pcsFullyAligned += 1
      if (r.noneAligned) pcsZeroAligned += 1
    })
    return {
      pcs: pcRows.length,
      totalMLAs,
      mpPartyMLAs,
      mpPartyPct: totalMLAs > 0 ? (mpPartyMLAs / totalMLAs) * 100 : 0,
      pcsFullyAligned,
      pcsZeroAligned,
    }
  }, [pcRows])

  if (isLoading) {
    return <div style={{ color: 'var(--text-secondary)', padding: '2rem' }}>Loading representation data…</div>
  }
  if (!lsData || pcRows.length === 0) {
    return <div style={{ color: 'var(--text-secondary)', padding: '2rem' }}>No data.</div>
  }

  return (
    <div>
      <div className="page-title">Your Representatives — MPs & MLAs</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', maxWidth: 760 }}>
        Every assembly constituency in {lsData.seats?.length ?? 0} Lok Sabha seats, grouped by parent PC.
        Each card pairs the sitting MP (from LS 2024) with the 2026 MLAs whose assembly segments make up that PC.
        Green border on a segment = MLA's party matches the MP's party.
      </div>

      {/* Headline strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem',
        marginBottom: '1.25rem',
      }}>
        <SummaryTile label="Lok Sabha seats" value={summary.pcs.toString()} hint={`${summary.totalMLAs} assembly segments`} accent="#a78bfa" />
        <SummaryTile
          label="MLAs aligned with their MP"
          value={`${summary.mpPartyMLAs}/${summary.totalMLAs}`}
          hint={`${summary.mpPartyPct.toFixed(0)}% share the MP's party`}
          accent={summary.mpPartyPct >= 50 ? '#22c55e' : '#f59e0b'}
        />
        <SummaryTile
          label="Fully-aligned PCs"
          value={summary.pcsFullyAligned.toString()}
          hint="every MLA shares the MP's party"
          accent="#22c55e"
        />
        <SummaryTile
          label="Cross-cycle splits"
          value={summary.pcsZeroAligned.toString()}
          hint="PCs where 0 MLAs share the MP's party"
          accent="#f97316"
        />
      </div>

      {/* Filter bar */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: 8,
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      }}>
        <input
          type="text"
          placeholder="Search PC / MP / MLA / AC / party…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            flex: '1 1 280px', minWidth: 200,
            padding: '0.45rem 0.65rem', borderRadius: 6,
            background: 'var(--bg-card)', color: 'var(--text-primary)',
            border: '1px solid var(--border)', fontSize: '0.88rem',
          }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            { id: 'all',    label: `All (${pcRows.length})` },
            { id: 'fully',  label: `🟢 Fully aligned (${summary.pcsFullyAligned})` },
            { id: 'partly', label: '🟡 Partly aligned' },
            { id: 'none',   label: `🟠 No alignment (${summary.pcsZeroAligned})` },
          ] as const).map(f => {
            const active = align === f.id
            return (
              <button key={f.id} onClick={() => setAlign(f.id)}
                style={{
                  padding: '0.4rem 0.7rem', borderRadius: 6, cursor: 'pointer',
                  fontSize: '0.78rem', fontWeight: 700,
                  background: active ? 'rgba(167,139,250,0.18)' : 'var(--bg-card)',
                  border: `1px solid ${active ? 'rgba(167,139,250,0.5)' : 'var(--border)'}`,
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                }}>
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* PC list */}
      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem', fontStyle: 'italic' }}>
          No Lok Sabha seats match the current filter.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filtered.map(pc => (
            <PcRepresentationCard
              key={pc.ls_seat_id}
              pc={pc}
              flashed={flashedId === `ls-${pc.ls_number}`}
              onAcClick={(ac: number) => navigate(`/${state}/constituencies/${ac}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}


function SummaryTile({ label, value, hint, accent }: { label: string; value: string; hint: string; accent: string }) {
  return (
    <div className="stat-card" style={{ borderLeft: `3px solid ${accent}` }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
        {label}
      </div>
      <div className="tabular" style={{ fontSize: '1.4rem', fontWeight: 800, color: accent }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4 }}>{hint}</div>
    </div>
  )
}


// One card per LS PC: MP block at top, AC-segment grid below.
function PcRepresentationCard({ pc, flashed, onAcClick }: { pc: any; flashed?: boolean; onAcClick: (ac: number) => void }) {
  const fmt = (n: number) => fmtIN(n)
  const mp = pc.mp
  const accent = mp?.party_color ?? '#94a3b8'
  return (
    <div
      id={`ls-${pc.ls_number}`}
      className="card"
      style={{
        borderLeft: `4px solid ${accent}`, padding: 0, overflow: 'hidden',
        scrollMarginTop: 16,
        boxShadow: flashed ? `0 0 0 3px ${accent}66, 0 0 24px -4px ${accent}88` : undefined,
        transition: 'box-shadow 0.4s ease',
      }}>
      {/* MP banner */}
      <div style={{
        padding: '0.9rem 1.15rem',
        background: mp ? `${mp.party_color}10` : 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Lok Sabha · #{pc.ls_number}
          </span>
          <span style={{ fontSize: '1.15rem', fontWeight: 800 }}>{pc.ls_name}</span>
          <span style={{
            marginLeft: 'auto', fontSize: '0.72rem', padding: '0.18rem 0.55rem',
            borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)',
            color: 'var(--text-secondary)', whiteSpace: 'nowrap',
          }}
            title="MLAs whose party matches their MP's party">
            {pc.matched_count}/{pc.decided_count} MLAs aligned
            {pc.allAligned && <span style={{ color: '#22c55e', fontWeight: 700 }}> · all aligned</span>}
            {pc.noneAligned && <span style={{ color: '#f97316', fontWeight: 700 }}> · none aligned</span>}
          </span>
        </div>
        {mp ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginRight: 4 }}>
              🪪 MP (LS 2024)
            </span>
            <PartyLogo party={mp.party} size={18} />
            <span style={{ fontSize: '0.98rem', fontWeight: 800 }}>{mp.name}</span>
            <span style={{ color: mp.party_color, fontWeight: 700, fontSize: '0.84rem' }}>{mp.party}</span>
            {mp.gender && <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>· {mp.gender}</span>}
            {mp.seat_type && mp.seat_type !== 'GEN' && (
              <span style={{ fontSize: '0.66rem', padding: '0.1rem 0.45rem', borderRadius: 10,
                             background: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.30)', color: '#a78bfa' }}>
                Reserved ({mp.seat_type})
              </span>
            )}
          </div>
        ) : (
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            No MP data linked for this PC.
          </div>
        )}
      </div>

      {/* Assembly segments grid */}
      <div style={{ padding: '0.85rem 1.15rem' }}>
        <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8 }}>
          🏛️ Assembly Segments ({pc.segments.length})
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 8,
        }}>
          {pc.segments.map((s: any) => {
            const aligned = mp && s.winner_party === mp.party
            const isPending = s.status === 'pending' || !s.winner_party
            return (
              <button
                key={s.ac_number}
                onClick={() => onAcClick(s.ac_number)}
                title={`Click to open ${s.name} (AC #${s.ac_number})`}
                style={{
                  textAlign: 'left', cursor: 'pointer',
                  padding: '0.6rem 0.75rem', borderRadius: 7,
                  background: 'var(--bg-card)',
                  border: `1px solid ${aligned ? '#22c55e55' : 'var(--border)'}`,
                  borderLeft: `3px solid ${aligned ? '#22c55e' : (s.winner_party_color ?? '#475569')}`,
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>AC #{s.ac_number}</span>
                  {s.district && (
                    <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{s.district}</span>
                  )}
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.86rem', lineHeight: 1.25 }}>{s.name}</div>
                {isPending ? (
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    ⏳ election pending
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                    <PartyLogo party={s.winner_party} size={14} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.winner}
                    </span>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 700,
                      color: s.winner_party_color ?? 'var(--text-secondary)',
                    }}
                      title={s.winner_party_full_name ?? s.winner_party}>
                      {s.winner_party}
                    </span>
                    {aligned && (
                      <span style={{
                        marginLeft: 'auto', fontSize: '0.62rem', padding: '0.1rem 0.4rem', borderRadius: 8,
                        background: 'rgba(34,197,94,0.12)', color: '#22c55e',
                        border: '1px solid rgba(34,197,94,0.30)', fontWeight: 700,
                      }}>
                        ✓ same as MP
                      </span>
                    )}
                  </div>
                )}
                <div style={{ fontSize: '0.62rem', color: 'var(--accent)', marginTop: 2 }}>
                  view details →
                </div>
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 10 }}>
          Total votes across this PC: {fmt(pc.segments.reduce((s: number, x: any) => {
            const winnerVotes = (x.segment_votes ?? []).find((v: any) => v.party === x.winner_party)?.votes ?? 0
            return s + winnerVotes
          }, 0))} (MLAs' party share only)
        </div>
      </div>
    </div>
  )
}
