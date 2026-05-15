import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import {
  api, compareEntities, useStates,
  type CompareKind, type CompareResponse, type CompareSide,
} from '../lib/api'
import { useEscapeKey } from '../lib/useEscapeKey'
import { Skeleton } from './Skeleton'
import { fmtIN } from '../lib/format'

/**
 * "Compare anything" modal. Two parallel selector cards (Side A vs Side B),
 * a curated preset row to skip the picking when the user just wants quick
 * insight, and a live preview chip that summarises what's currently picked
 * before the user commits to a Compare call.
 */
export function CompareModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state: routeState } = useParams<{ state?: string }>()
  const { data: states } = useStates()

  const defaultState = routeState ?? states?.[0]?.slug ?? 'kerala'
  const [a, setA] = useState<CompareSide>({ kind: 'party', state: defaultState, value: '' })
  const [b, setB] = useState<CompareSide>({ kind: 'party', state: defaultState, value: '' })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CompareResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEscapeKey(open, onClose)

  async function run(sideA?: CompareSide, sideB?: CompareSide) {
    const A = sideA ?? a
    const B = sideB ?? b
    if (!A.value || !B.value || busy) return
    setBusy(true); setError(null); setResult(null)
    try {
      const res = await compareEntities(A, B)
      setResult(res)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? 'Unknown error')
    } finally {
      setBusy(false)
    }
  }

  function applyPreset(p: PresetPair) {
    const newA: CompareSide = { kind: p.kind, state: p.state, value: p.aValue }
    const newB: CompareSide = { kind: p.kind, state: p.state, value: p.bValue }
    setA(newA); setB(newB)
    run(newA, newB)
  }

  function swap() {
    setA(b); setB(a)
    if (result) {
      setResult({ ...result, a: result.b, b: result.a, rows: result.rows.map(r => ({ ...r, a: r.b, b: r.a })) })
    }
  }

  function reset() {
    setA({ kind: 'party', state: defaultState, value: '' })
    setB({ kind: 'party', state: defaultState, value: '' })
    setResult(null); setError(null)
  }

  const bothPicked = !!a.value && !!b.value
  const stateName = (slug: string) => states?.find(s => s.slug === slug)?.name ?? slug
  const presets = buildPresets(defaultState, stateName)

  if (!open) return null
  return (
    <div className="cmdk-backdrop" onClick={onClose} role="dialog" aria-label="Compare two entities">
      <div className="cmdk-shell" onClick={e => e.stopPropagation()} style={{ width: 'min(900px, 96vw)', maxHeight: '88vh', overflowY: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }}>
          <span style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem',
          }}>⚖️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Compare anything</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              Parties, districts, or constituencies — pick two and see them side by side. Computed from live data.
            </div>
          </div>
          {(a.value || b.value || result) && (
            <button onClick={reset} aria-label="Reset"
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                       borderRadius: 6, padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: '0.74rem', marginRight: 4 }}>
              Reset
            </button>
          )}
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                     borderRadius: 6, padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: '0.78rem' }}>✕</button>
        </div>

        <div style={{ padding: '1rem 1.1rem', overflowY: 'auto' }}>
          {/* Preset row — fast path */}
          {!result && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Quick picks
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {presets.map(p => (
                  <button key={p.label}
                    onClick={() => applyPreset(p)}
                    title={`Compare ${p.aValue} vs ${p.bValue}`}
                    style={{
                      padding: '0.4rem 0.8rem', borderRadius: 999,
                      background: 'rgba(245,158,11,0.10)', color: '#fbbf24',
                      border: '1px solid rgba(245,158,11,0.32)',
                      cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Two side-pickers with a centered VS divider */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 36px 1fr', gap: 10, alignItems: 'stretch', marginBottom: 12 }}>
            <SidePicker side={a} onChange={setA} states={states ?? []} label="A" accent="#f59e0b" />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{
                fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-secondary)',
                padding: '0.3rem 0.55rem', borderRadius: 999, background: 'var(--bg-secondary)',
                border: '1px solid var(--border)', letterSpacing: '0.04em',
              }}>vs</span>
              {bothPicked && (
                <button onClick={swap} title="Swap A and B" aria-label="Swap sides"
                  style={{
                    background: 'transparent', border: '1px solid var(--border)',
                    color: 'var(--text-secondary)', borderRadius: 6,
                    padding: '0.2rem 0.4rem', cursor: 'pointer', fontSize: '0.7rem',
                  }}>⇄</button>
              )}
            </div>
            <SidePicker side={b} onChange={setB} states={states ?? []} label="B" accent="#ef4444" />
          </div>

          {/* Live preview of the current pair (shown before Compare is clicked) */}
          {bothPicked && !busy && !result && (
            <div style={{
              padding: '0.7rem 0.85rem', borderRadius: 10, marginBottom: 12,
              background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
            }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                Ready to compare
                <strong style={{ color: '#fbbf24' }}>{prettyLabel(a, stateName)}</strong>
                <span style={{ color: 'var(--text-muted)' }}>vs</span>
                <strong style={{ color: '#fca5a5' }}>{prettyLabel(b, stateName)}</strong>
              </div>
            </div>
          )}

          {/* Compare button — full-width when both are picked */}
          <div style={{ display: 'flex', justifyContent: bothPicked ? 'stretch' : 'flex-end', marginBottom: 14 }}>
            <button
              onClick={() => run()}
              disabled={busy || !a.value || !b.value}
              style={{
                padding: bothPicked ? '0.7rem 1.4rem' : '0.55rem 1.1rem',
                borderRadius: 10,
                background: busy || !a.value || !b.value
                  ? 'rgba(245,158,11,0.25)'
                  : 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                color: '#fff', border: 'none',
                cursor: busy || !a.value || !b.value ? 'not-allowed' : 'pointer',
                fontWeight: 800, fontSize: bothPicked ? '0.95rem' : '0.85rem',
                flex: bothPicked ? 1 : 'none',
                boxShadow: bothPicked && !busy ? '0 8px 22px -8px rgba(245,158,11,0.6)' : 'none',
              }}>
              {busy ? 'Comparing…' : bothPicked ? '⚖️ Compare these two' : '⚖️ Compare'}
            </button>
          </div>

          {busy && (
            <div style={{ marginTop: 8 }}>
              <Skeleton height={14} width="80%" />
              <Skeleton height={14} width="92%" style={{ marginTop: 6 }} />
              <Skeleton height={14} width="70%" style={{ marginTop: 6 }} />
            </div>
          )}

          {error && (
            <div style={{ marginTop: 14, padding: '0.7rem 0.9rem', borderRadius: 8,
                          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                          fontSize: '0.85rem', color: '#fca5a5' }}>
              <strong>Couldn't compare.</strong> {error}
            </div>
          )}

          {result && <CompareResult result={result} />}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────  Curated preset comparisons  ─────────────────────

interface PresetPair {
  label: string
  state: string
  kind: CompareKind
  aValue: string
  bValue: string
}

function buildPresets(currentState: string, stateName: (slug: string) => string): PresetPair[] {
  // Hand-curated pairings most users would want to start with.
  // Surfaces a current-state pairing first when the user is inside a state context.
  const all: PresetPair[] = [
    { label: `INC vs CPI(M) in Kerala`,             state: 'kerala',     kind: 'party', aValue: 'INC',  bValue: 'CPI(M)' },
    { label: `BJP vs INC in Assam`,                 state: 'assam',      kind: 'party', aValue: 'BJP',  bValue: 'INC' },
    { label: `DMK vs AIADMK in Tamil Nadu`,         state: 'tamil-nadu', kind: 'party', aValue: 'DMK',  bValue: 'AIADMK' },
    { label: `AITC vs BJP in West Bengal`,          state: 'west-bengal',kind: 'party', aValue: 'AITC', bValue: 'BJP' },
    { label: `BJP vs TVK in Tamil Nadu`,            state: 'tamil-nadu', kind: 'party', aValue: 'BJP',  bValue: 'TVK' },
  ]
  // Bring the preset matching the current state to the front (if any)
  const sorted = all.sort((x, y) => (x.state === currentState ? -1 : y.state === currentState ? 1 : 0))
  // Hint label uses the cleaner state name where available
  return sorted.map(p => ({ ...p, label: p.label.replace(/in [A-Za-z ]+$/, `in ${stateName(p.state)}`) }))
}

// ─────────────────────  Per-side selector  ─────────────────────

function SidePicker({
  side, onChange, states, label, accent,
}: {
  side: CompareSide
  onChange: (s: CompareSide) => void
  states: { slug: string; name: string }[]
  label: string
  accent: string
}) {
  // Load values appropriate to the chosen kind.
  const overviewQ = useQueries({
    queries: [
      { queryKey: ['overview', side.state],
        queryFn: () => api.get(`/${side.state}/overview`).then(r => r.data),
        enabled: !!side.state },
      { queryKey: ['constituencies', side.state],
        queryFn: () => api.get(`/${side.state}/constituencies`).then(r => r.data),
        enabled: !!side.state },
    ],
  })
  const overview = overviewQ[0]?.data as any
  const constituencies = overviewQ[1]?.data as any[] | undefined

  const options = useMemo(() => {
    if (side.kind === 'party') {
      return (overview?.parties ?? [])
        .filter((p: any) => p.seats > 0)
        .sort((a: any, b: any) => b.seats - a.seats)
        .map((p: any) => ({ value: p.party, label: `${p.party} — ${p.seats} seat${p.seats === 1 ? '' : 's'}`, color: p.color }))
    }
    if (side.kind === 'district') {
      const set = new Map<string, number>()
      ;(constituencies ?? []).forEach((c: any) => {
        if (c.district) set.set(c.district, (set.get(c.district) ?? 0) + 1)
      })
      return Array.from(set.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([d, n]) => ({ value: d, label: `${d} — ${n} AC${n === 1 ? '' : 's'}` }))
    }
    return (constituencies ?? [])
      .slice()
      .sort((x: any, y: any) => x.ac_number - y.ac_number)
      .map((c: any) => ({ value: c.name, label: `AC ${c.ac_number} — ${c.name}`, color: c.color }))
  }, [side.kind, overview, constituencies])

  const placeholder = `— pick a ${side.kind === 'constituency' ? 'constituency (AC)' : side.kind} —`

  // Pulled-value preview: when the user has picked something, surface the
  // selected option's label as a chip so they can SEE what's selected without
  // re-opening the dropdown. Helps when scrolling away from the selector.
  const pickedOption = options.find((o: any) => o.value === side.value)

  return (
    <div style={{
      padding: '0.85rem',
      borderRadius: 12,
      background: side.value
        ? `linear-gradient(160deg, ${accent}22 0%, ${accent}0a 60%, transparent 100%)`
        : `linear-gradient(160deg, ${accent}10 0%, ${accent}05 100%)`,
      border: `1px solid ${side.value ? `${accent}66` : `${accent}33`}`,
      transition: 'background 0.2s ease, border-color 0.2s ease',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 24, height: 24, borderRadius: 6,
          background: accent, color: '#0e1226',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.82rem', fontWeight: 900,
        }}>{label}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Side {label}
          </div>
          {pickedOption && (pickedOption as any).color && (
            <div style={{ fontSize: '0.78rem', fontWeight: 700, marginTop: 2, color: (pickedOption as any).color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {pickedOption.label}
            </div>
          )}
          {pickedOption && !(pickedOption as any).color && (
            <div style={{ fontSize: '0.78rem', fontWeight: 700, marginTop: 2, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {pickedOption.label}
            </div>
          )}
          {!pickedOption && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Nothing picked yet
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 6 }}>
        <select value={side.kind} onChange={e => onChange({ ...side, kind: e.target.value as CompareKind, value: '' })} style={selectStyle} aria-label={`Side ${label} type`}>
          <option value="party">Party</option>
          <option value="district">District</option>
          <option value="constituency">Constituency</option>
        </select>
        <select value={side.state} onChange={e => onChange({ ...side, state: e.target.value, value: '' })} style={selectStyle} aria-label={`Side ${label} state`}>
          {states.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
        </select>
      </div>
      <select
        value={side.value}
        onChange={e => onChange({ ...side, value: e.target.value })}
        style={{ ...selectStyle, width: '100%', fontWeight: side.value ? 700 : 400 }}
        aria-label={`Side ${label} value`}
        disabled={options.length === 0}
      >
        <option value="">{options.length === 0 ? 'Loading…' : placeholder}</option>
        {options.map((o: any) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

// ─────────────────────  Result rendering  ─────────────────────

function CompareResult({ result }: { result: CompareResponse }) {
  return (
    <div style={{
      marginTop: 12,
      padding: '1rem 1.1rem',
      background: 'rgba(245,158,11,0.05)',
      border: '1px solid rgba(245,158,11,0.25)',
      borderRadius: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <Pill side="A" label={result.a.label} color={result.a.color} accent="#f59e0b" />
        <span style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>vs</span>
        <Pill side="B" label={result.b.label} color={result.b.color} accent="#ef4444" />
      </div>

      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, padding: '0.6rem 0.8rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
        💡 {result.verdict}
      </div>

      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              <th style={cellStyle}>Metric</th>
              <th style={{ ...cellStyle, color: result.a.color }}>{result.a.label}</th>
              <th style={{ ...cellStyle, color: result.b.color }}>{result.b.label}</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r, i) => {
              const aWins = numericGreater(r.a, r.b)
              const bWins = numericGreater(r.b, r.a)
              return (
                <tr key={i}>
                  <td style={{ ...cellStyle, color: 'var(--text-secondary)', fontWeight: 600 }}>{r.label}</td>
                  <td className="tabular" style={{ ...cellStyle, fontWeight: aWins ? 800 : 500, color: aWins ? '#22c55e' : 'var(--text-primary)' }}>
                    {renderValue(r.a)}
                  </td>
                  <td className="tabular" style={{ ...cellStyle, fontWeight: bWins ? 800 : 500, color: bWins ? '#22c55e' : 'var(--text-primary)' }}>
                    {renderValue(r.b)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, fontSize: '0.66rem', color: 'var(--text-muted)', textAlign: 'right' }}>
        Computed from live data · no external API used
      </div>
    </div>
  )
}

function Pill({ side, label, color, accent }: { side: string; label: string; color: string; accent: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '0.35rem 0.7rem', borderRadius: 999,
      background: `${color}1a`, border: `1px solid ${color}55`,
      maxWidth: '45%',
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: 4,
        background: accent, color: '#0e1226',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.65rem', fontWeight: 900,
      }}>{side}</span>
      <span style={{ color, fontWeight: 700, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
    </span>
  )
}

function prettyLabel(side: CompareSide, stateName: (slug: string) => string): string {
  if (!side.value) return '—'
  if (side.kind === 'party')       return `${side.value} (${stateName(side.state)})`
  if (side.kind === 'district')    return `${side.value} district`
  return `AC ${side.value}`
}

function renderValue(v: any): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'number') return fmtIN(v)
  return String(v)
}

function numericGreater(a: any, b: any): boolean {
  const an = parseNumeric(a), bn = parseNumeric(b)
  if (an === null || bn === null) return false
  return an > bn
}

function parseNumeric(v: any): number | null {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return null
  const m = v.replace(/[₹,%]/g, '').match(/-?\d+(\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

const selectStyle: React.CSSProperties = {
  padding: '0.45rem 0.6rem',
  borderRadius: 6,
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  fontSize: '0.82rem',
  outline: 'none',
  minWidth: 0,
  cursor: 'pointer',
}

const cellStyle: React.CSSProperties = {
  padding: '0.55rem 0.8rem',
  fontSize: '0.85rem',
  textAlign: 'left',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}
