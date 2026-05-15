import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { api, useConstituencies, useOverview, useLokSabha } from '../lib/api'
import PartyLogo from '../components/PartyLogo'
import InsightsCard, { type Insight } from '../components/InsightsCard'
import { fmtIN } from '../lib/format'

type ColorBy = 'party' | 'alliance'

const fmt = fmtIN

// Normalize AC names for fallback matching (case + extra suffixes like "(SC)" / "(ST)").
const norm = (s: string) => (s || '').toUpperCase().replace(/\s*\(.*?\)\s*/g, '').trim()

function FitBoundsToLayer({ geoData, focusKey }: { geoData: any; focusKey?: string }) {
  const map = useMap()
  useEffect(() => {
    if (!geoData) return
    const layer = L.geoJSON(geoData)
    try {
      map.fitBounds(layer.getBounds(), { padding: [20, 20] })
    } catch { /* ignore empty geometry */ }
    // `focusKey` is included so that whenever the active filter changes the
    // caller can pass a filtered geoData and we'll re-fit to that subset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoData, map, focusKey])
  return null
}

export default function MapView() {
  const { state } = useParams<{ state: string }>()
  const navigate = useNavigate()

  const { data: constituencies } = useConstituencies(state!)
  const { data: overview } = useOverview(state!)
  const { data: lsData } = useLokSabha(state!)
  const { data: geoData, isLoading: geoLoading, error: geoError } = useQuery<any>({
    queryKey: ['geojson', state],
    queryFn: () => api.get(`/${state}/geojson`).then(r => r.data),
    enabled: !!state,
    staleTime: Infinity,
  })

  const [hover, setHover] = useState<any | null>(null)
  const [colorBy, setColorBy] = useState<ColorBy>('party')
  // Active filter — one of party / alliance / district / ls. Mutually exclusive
  // so the UI stays simple; switching kinds replaces the prior one.
  const [filter, setFilter] = useState<
    | { kind: 'party';    value: string }
    | { kind: 'alliance'; value: string }
    | { kind: 'district'; value: string }
    | { kind: 'ls';       value: number; label: string }
    | null
  >(null)
  // Delay clearing the hover panel so the cursor can travel into it without
  // the panel vanishing first. Cancelled on entering another polygon or the panel.
  const clearTimer = useRef<number | null>(null)
  const cancelClear = () => {
    if (clearTimer.current != null) {
      window.clearTimeout(clearTimer.current)
      clearTimer.current = null
    }
  }
  const scheduleClear = () => {
    cancelClear()
    clearTimer.current = window.setTimeout(() => setHover(null), 180)
  }
  useEffect(() => () => cancelClear(), [])

  // Alliance metadata: alliance_id → { name, color }, plus party → alliance_id
  const allianceMeta = useMemo(() => {
    const byId = new Map<string, { name: string; color: string }>()
    ;(overview?.alliances ?? []).forEach((a: any) => {
      byId.set(a.alliance_id, { name: a.name, color: a.color })
    })
    return byId
  }, [overview])

  const partyAllianceId = useMemo(() => {
    const m = new Map<string, string>()
    ;(overview?.parties ?? []).forEach((p: any) => {
      if (p.party && p.alliance_id) m.set(p.party, p.alliance_id)
    })
    return m
  }, [overview])

  // Resolve a constituency's display color based on the current mode
  const colorFor = (c: any | null) => {
    if (!c) return null
    if (colorBy === 'party') return c.color || null
    const aid = partyAllianceId.get(c.party) ?? 'others'
    return allianceMeta.get(aid)?.color || null
  }

  // Lookup table from feature → constituency data (try AC# first, then normalized name)
  const lookup = useMemo(() => {
    const byAc = new Map<number, any>()
    const byName = new Map<string, any>()
    ;(constituencies ?? []).forEach((c: any) => {
      byAc.set(c.ac_number, c)
      byName.set(norm(c.name), c)
    })
    return { byAc, byName }
  }, [constituencies])

  const matchFeature = (props: any) =>
    lookup.byAc.get(props.ac_no) ?? lookup.byName.get(norm(props.ac_name)) ?? null

  // Coverage stats
  const stats = useMemo(() => {
    if (!geoData || !constituencies) return null
    let matched = 0, unmatched = 0
    geoData.features.forEach((f: any) => {
      if (matchFeature(f.properties)) matched++; else unmatched++
    })
    return { matched, unmatched, total: geoData.features.length }
  }, [geoData, constituencies])

  // ─────────────────────  KEY INSIGHTS  ─────────────────────
  // Geographic narrative — what the map reveals at a glance.
  const mapInsights: Insight[] = useMemo(() => {
    if (!constituencies || constituencies.length === 0) return []
    const out: Insight[] = []
    // Count seats by party and by district
    const byParty: Record<string, { color: string; n: number }> = {}
    const byDistrict: Record<string, { total: number; parties: Record<string, { color: string; n: number }> }> = {}
    let totalDecided = 0
    constituencies.forEach((c: any) => {
      if (!c.party) return
      totalDecided += 1
      byParty[c.party] = { color: c.color || '#94a3b8', n: (byParty[c.party]?.n ?? 0) + 1 }
      const d = c.district || 'Unknown'
      if (!byDistrict[d]) byDistrict[d] = { total: 0, parties: {} }
      byDistrict[d].total += 1
      byDistrict[d].parties[c.party] = { color: c.color, n: (byDistrict[d].parties[c.party]?.n ?? 0) + 1 }
    })
    // 1. Dominant party on the map
    const topParty = Object.entries(byParty).sort((a, b) => b[1].n - a[1].n)[0]
    if (topParty) {
      const [p, info] = topParty
      const pct = ((info.n / totalDecided) * 100).toFixed(0)
      out.push({
        emoji: '🗺️', accent: info.color,
        headline: `${p} colors the most ground.`,
        detail: `Won ${info.n} of ${totalDecided} constituencies on the map (${pct}%). The dominant color you see is theirs.`,
      })
    }
    // 2. Most fragmented district
    const fragmented = Object.entries(byDistrict)
      .filter(([_, d]) => d.total >= 3)
      .map(([name, d]) => ({ name, total: d.total, parties: Object.keys(d.parties).length }))
      .sort((a, b) => b.parties - a.parties)[0]
    if (fragmented && fragmented.parties >= 3) {
      out.push({
        emoji: '⚔️', accent: '#a78bfa',
        headline: `${fragmented.name} is the most patchwork district.`,
        detail: `${fragmented.parties} different parties won seats in this single district. Look for the multicolored cluster on the map.`,
      })
    }
    // 3. Sweep district
    const sweep = Object.entries(byDistrict)
      .filter(([_, d]) => d.total >= 3)
      .map(([name, d]) => {
        const top = Object.entries(d.parties).sort((a, b) => b[1].n - a[1].n)[0]
        return { name, total: d.total, top_party: top?.[0], top_n: top?.[1].n ?? 0, top_color: top?.[1].color || '#94a3b8' }
      })
      .filter(d => d.top_n / d.total >= 0.75)
      .sort((a, b) => b.total - a.total)[0]
    if (sweep) {
      const pct = ((sweep.top_n / sweep.total) * 100).toFixed(0)
      out.push({
        emoji: '🏆', accent: sweep.top_color,
        headline: `${sweep.top_party} sweeps ${sweep.name}.`,
        detail: `Won ${sweep.top_n} of ${sweep.total} seats in this district (${pct}%) — a contiguous block of one color on the map.`,
      })
    }
    // 4. Coverage caveat if any polygons don't match (e.g. pre-delimitation in Assam)
    if (stats && stats.unmatched > 0) {
      out.push({
        emoji: '⚠️', accent: '#f59e0b',
        headline: `${stats.unmatched} boundary polygons are pre-delimitation.`,
        detail: `Those polygons appear in grey — they don't map to a 2026 AC because the geographic source was last redrawn before 2023. The ${stats.matched} matched polygons reflect actual 2026 results.`,
      })
    }
    return out
  }, [constituencies, stats])

  // Party legend (always shown, independent of colorBy)
  const partyLegend = useMemo(() => {
    if (!constituencies) return []
    const m = new Map<string, { color: string; count: number }>()
    constituencies.forEach((c: any) => {
      if (!c.party) return
      const e = m.get(c.party) ?? { color: c.color || '#94a3b8', count: 0 }
      e.count += 1
      e.color = c.color || e.color
      m.set(c.party, e)
    })
    return Array.from(m.entries())
      .map(([party, info]) => ({ key: party, label: party, color: info.color, count: info.count }))
      .sort((a, b) => b.count - a.count)
  }, [constituencies])

  // Alliance legend (always shown)
  const allianceLegend = useMemo(() => {
    if (!constituencies) return []
    const m = new Map<string, { color: string; name: string; count: number }>()
    constituencies.forEach((c: any) => {
      if (!c.party) return
      const aid = partyAllianceId.get(c.party) ?? 'others'
      const meta = allianceMeta.get(aid) ?? { name: 'Others', color: '#94a3b8' }
      const e = m.get(aid) ?? { color: meta.color, name: meta.name, count: 0 }
      e.count += 1
      m.set(aid, e)
    })
    return Array.from(m.entries())
      .map(([aid, info]) => ({ key: aid, label: info.name.replace(/\s*\(.*\)/, '').trim(), color: info.color, count: info.count }))
      .sort((a, b) => b.count - a.count)
  }, [constituencies, partyAllianceId, allianceMeta])

  // Sorted list of unique districts (for the District selector).
  const districtList = useMemo(() => {
    const s = new Set<string>()
    ;(constituencies ?? []).forEach((c: any) => { if (c.district) s.add(c.district) })
    return Array.from(s).sort()
  }, [constituencies])

  // ac_number → ls_seat_id, built from useLokSabha. Lets us check whether a
  // constituency belongs to the currently-selected LS seat.
  const lsByAc = useMemo(() => {
    const m = new Map<number, number>()
    ;(lsData?.seats ?? []).forEach((seat: any) => {
      (seat.segments ?? []).forEach((seg: any) => {
        if (typeof seg.ac_number === 'number') m.set(seg.ac_number, seat.ls_seat_id)
      })
    })
    return m
  }, [lsData])

  // Does this constituency match the active filter? (true if no filter set)
  const matchesFilter = (c: any | null) => {
    if (!filter) return true
    if (!c) return false
    if (filter.kind === 'party')    return c.party === filter.value
    if (filter.kind === 'district') return (c.district ?? '') === filter.value
    if (filter.kind === 'ls')       return lsByAc.get(c.ac_number) === filter.value
    const aid = partyAllianceId.get(c.party) ?? 'others'
    return aid === filter.value
  }

  // GeoJSON subset matching the current filter — used for auto-fit bounds when
  // a district or LS is selected so the map zooms to those polygons.
  const focusGeo = useMemo(() => {
    if (!geoData || !filter || (filter.kind !== 'district' && filter.kind !== 'ls')) return geoData
    const filtered = (geoData.features ?? []).filter((f: any) => matchesFilter(matchFeature(f.properties)))
    if (filtered.length === 0) return geoData
    return { ...geoData, features: filtered }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoData, filter, lsByAc])

  // GeoJSON style — colors filtered seats normally, greys the rest.
  const styleFn = (feat: any) => {
    const c = matchFeature(feat.properties)
    const inFocus = matchesFilter(c)
    const baseColor = colorFor(c) || '#475569'
    if (!c) {
      // No 2026 match (e.g. pre-delimitation boundary): always faded
      return { fillColor: '#475569', fillOpacity: 0.18, color: '#0b1020', weight: 0.5, opacity: 1 }
    }
    if (filter && !inFocus) {
      // Filter active and this seat is NOT in focus → grey it out
      return { fillColor: '#475569', fillOpacity: 0.15, color: '#0b1020', weight: 0.4, opacity: 0.8 }
    }
    return {
      fillColor: baseColor,
      fillOpacity: 0.78,
      color: '#0b1020',
      weight: 0.5,
      opacity: 1,
    }
  }

  const onEachFeature = (feat: any, layer: any) => {
    const c = matchFeature(feat.properties)
    layer.on({
      mouseover: (e: any) => {
        cancelClear()
        setHover({ feature: feat, constituency: c })
        e.target.setStyle({ weight: 2.2, color: '#fff', fillOpacity: 0.92 })
        e.target.bringToFront()
      },
      mouseout: (e: any) => {
        // Defer the clear so the user can move into the floating panel.
        scheduleClear()
        e.target.setStyle(styleFn(feat) as any)
      },
      click: () => {
        if (c && c.ac_number) navigate(`/${state}/constituencies/${c.ac_number}`)
      },
    })
  }

  return (
    <div>
      <div className="page-title">Interactive Map</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', flex: 1, minWidth: 240 }}>
          Each constituency colored by its 2026 winning {colorBy === 'party' ? 'party' : 'alliance'}. Hover for details, click to drill into the constituency.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* District selector — narrows the map to ACs in one district */}
          <select
            value={filter?.kind === 'district' ? filter.value : ''}
            onChange={e => {
              const v = e.target.value
              setFilter(v ? { kind: 'district', value: v } : null)
            }}
            aria-label="Filter by district"
            style={selectStyle}
            disabled={districtList.length === 0}
          >
            <option value="">All districts</option>
            {districtList.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          {/* LS selector — narrows the map to ACs that belong to one Lok Sabha seat */}
          <select
            value={filter?.kind === 'ls' ? String(filter.value) : ''}
            onChange={e => {
              const v = e.target.value
              if (!v) return setFilter(null)
              const seat = (lsData?.seats ?? []).find((s: any) => String(s.ls_seat_id) === v)
              setFilter(seat ? { kind: 'ls', value: seat.ls_seat_id, label: seat.ls_name } : null)
            }}
            aria-label="Filter by Lok Sabha seat"
            style={selectStyle}
            disabled={!lsData?.seats?.length}
          >
            <option value="">All LS seats</option>
            {(lsData?.seats ?? []).slice().sort((a: any, b: any) => a.ls_number - b.ls_number).map((s: any) => (
              <option key={s.ls_seat_id} value={s.ls_seat_id}>
                LS {s.ls_number} — {s.ls_name}
              </option>
            ))}
          </select>

          {/* Party / Alliance toggle */}
          <div style={{ display: 'inline-flex', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg-card)' }}>
            {(['party', 'alliance'] as const).map(mode => {
              const active = colorBy === mode
              return (
                <button key={mode}
                  onClick={() => setColorBy(mode)}
                  style={{
                    padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: active ? 700 : 500,
                    border: 'none', cursor: 'pointer',
                    background: active ? 'rgba(99,102,241,0.18)' : 'transparent',
                    color: active ? '#818cf8' : 'var(--text-secondary)',
                  }}>
                  {mode === 'party' ? 'By Party' : 'By Alliance'}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <InsightsCard insights={mapInsights} subtitle="What the geographic picture reveals at a glance" />

      {/* Coverage banner */}
      {stats && stats.unmatched > 0 && (
        <div className="card" style={{ marginBottom: '1rem', padding: '0.6rem 0.9rem', fontSize: '0.78rem', color: 'var(--text-secondary)', borderLeft: '3px solid #f59e0b' }}>
          ⓘ Map shows <strong>{stats.total}</strong> boundary polygons; <strong>{stats.matched}</strong> matched to our results data,
          <strong> {stats.unmatched}</strong> shown in grey (likely pre-delimitation boundaries that no longer have a 2026 equivalent).
        </div>
      )}

      {geoError && (
        <div className="card" style={{ borderLeft: '3px solid #ef4444', padding: '0.9rem 1.1rem' }}>
          <strong style={{ color: '#ef4444' }}>Map data unavailable.</strong>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            Couldn't load GeoJSON for <code>{state}</code>. Make sure <code>data/geojson/{state}.geojson</code> exists.
          </div>
        </div>
      )}

      {/* The map */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative', marginBottom: '1rem' }}>
        <div style={{ height: '70vh', minHeight: 500, width: '100%' }}>
          {geoLoading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
              Loading boundaries…
            </div>
          )}
          {geoData && (
            <MapContainer
              center={[20, 78]}
              zoom={5}
              style={{ height: '100%', width: '100%', background: '#0b1020' }}
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
              />
              {/* Re-mount the layer when constituencies arrive so the hover/click
                  handlers close over a populated lookup. Without this, handlers bound
                  before /constituencies resolves keep referencing an empty Map. */}
              {/* Include colorBy + filter in key so style is fully re-applied on changes. */}
              <GeoJSON
                key={`${state}-${constituencies?.length ?? 0}-${colorBy}-${filter ? `${filter.kind}:${filter.value}` : 'all'}`}
                data={geoData}
                style={styleFn as any}
                onEachFeature={onEachFeature}
              />
              <FitBoundsToLayer
                geoData={focusGeo}
                focusKey={filter ? `${filter.kind}:${filter.value}` : 'all'}
              />
            </MapContainer>
          )}
        </div>

        {/* Floating hover panel */}
        {hover && (() => {
          const c = hover.constituency
          const aid = c ? (partyAllianceId.get(c.party) ?? 'others') : null
          const allianceColor = aid ? allianceMeta.get(aid)?.color : null
          const allianceName = aid ? allianceMeta.get(aid)?.name : null
          const accentColor = colorFor(c) || '#475569'
          return (
          <div
            onMouseEnter={cancelClear}
            onMouseLeave={() => setHover(null)}
            style={{
              position: 'absolute', top: 12, right: 12, zIndex: 1000,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '0.85rem 1rem', minWidth: 240, maxWidth: 320,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              borderLeft: `4px solid ${accentColor}`,
            }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              AC#{hover.feature.properties.ac_no} · {hover.feature.properties.district || '—'}
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, marginTop: 3 }}>
              {c?.name || hover.feature.properties.ac_name}
            </div>
            {c ? (
              c.status === 'pending' ? (
                <div style={{ marginTop: 6, fontSize: '0.8rem' }}>
                  <span className="badge badge-yellow" style={{ fontSize: '0.65rem' }}>⏳ Pending</span>
                </div>
              ) : (
                <>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PartyLogo party={c.party ?? ''} size={20} />
                    <div>
                      <div style={{ fontWeight: 700, color: c.color, fontSize: '0.92rem' }}>
                        {c.party}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{c.winner}</div>
                    </div>
                  </div>
                  {allianceName && (
                    <div style={{ marginTop: 6, fontSize: '0.75rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Alliance: </span>
                      <span style={{ color: allianceColor || 'var(--text-primary)', fontWeight: 700 }}>
                        {allianceName.replace(/\s*\(.*\)/, '').trim()}
                      </span>
                    </div>
                  )}
                  <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fmt(c.votes ?? 0)}</span> votes
                    {' · '}
                    <span style={{ color: c.margin < 5000 ? '#f59e0b' : '#22c55e', fontWeight: 600 }}>
                      +{fmt(c.margin ?? 0)} margin
                    </span>
                    <span style={{
                      marginLeft: 6, fontSize: '0.66rem', fontWeight: 700, padding: '1px 6px',
                      borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.04em',
                      color: c.margin < 5000 ? '#f59e0b' : '#22c55e',
                      background: c.margin < 5000 ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)',
                      border: `1px solid ${c.margin < 5000 ? '#f59e0b55' : '#22c55e55'}`,
                    }}>
                      {c.margin < 5000 ? 'Close' : 'Comfortable'}
                    </span>
                    <div style={{ marginTop: 3 }}>
                      {(c.vote_share ?? 0).toFixed(1)}% vote share
                    </div>
                  </div>
                  {c.runner_up && (
                    <div style={{
                      marginTop: 8, paddingTop: 8,
                      borderTop: '1px dashed var(--border)',
                      fontSize: '0.74rem', color: 'var(--text-secondary)',
                    }}>
                      <div style={{ fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3, opacity: 0.7 }}>
                        Runner-up
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <PartyLogo party={c.runner_up_party ?? ''} size={14} />
                        <span style={{ color: c.runner_up_color, fontWeight: 700 }}>{c.runner_up_party}</span>
                        <span style={{ color: 'var(--text-primary)' }}>· {c.runner_up}</span>
                      </div>
                      <div style={{ marginTop: 2 }}>
                        {fmt(c.runner_up_votes ?? 0)} votes
                      </div>
                    </div>
                  )}
                  <div
                    onClick={() => c.ac_number && navigate(`/${state}/constituencies/${c.ac_number}`)}
                    style={{ marginTop: 8, fontSize: '0.72rem', color: '#818cf8', fontWeight: 600, cursor: 'pointer' }}>
                    View full breakdown →
                  </div>
                </>
              )
            ) : (
              <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                No 2026 data — likely pre-delimitation boundary.
              </div>
            )}
          </div>
        )})()}
      </div>

      {/* Filter hint banner */}
      {filter && (() => {
        const kindLabel =
          filter.kind === 'party'    ? 'Party' :
          filter.kind === 'alliance' ? 'Alliance' :
          filter.kind === 'district' ? 'District' : 'LS seat'
        const valueLabel =
          filter.kind === 'party'    ? filter.value :
          filter.kind === 'alliance' ? (allianceMeta.get(filter.value)?.name?.replace(/\s*\(.*\)/, '').trim() ?? filter.value) :
          filter.kind === 'district' ? filter.value :
          /* ls */                     filter.label
        const matchCount = (constituencies ?? []).filter((c: any) => matchesFilter(c)).length
        return (
          <div className="card" style={{ marginBottom: '0.85rem', padding: '0.55rem 0.9rem', display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.82rem', borderLeft: '3px solid var(--accent)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Filtering map to {kindLabel.toLowerCase()}: <strong style={{ color: 'var(--text-primary)' }}>{valueLabel}</strong>
              <span style={{ marginLeft: 8, fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                ({matchCount} constituenc{matchCount === 1 ? 'y' : 'ies'})
              </span>
            </span>
            <button onClick={() => setFilter(null)}
              style={{ marginLeft: 'auto', padding: '0.3rem 0.7rem', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.78rem' }}>
              Clear filter ✕
            </button>
          </div>
        )
      })()}

      {/* Party legend — clickable */}
      {partyLegend.length > 0 && (
        <div className="card" style={{ marginBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Party Color Legend</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Click a party to highlight only its seats.</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: 8 }}>
            {partyLegend.map(p => {
              const active = filter?.kind === 'party' && filter.value === p.key
              const dim = filter && !active
              return (
                <button key={p.key}
                  onClick={() => setFilter(active ? null : { kind: 'party', value: p.key })}
                  title={active ? 'Click to clear filter' : `Show only ${p.label} seats`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem',
                    padding: '0.32rem 0.65rem', borderRadius: 6, cursor: 'pointer',
                    background: active ? `${p.color}30` : dim ? 'transparent' : `${p.color}15`,
                    border: `1px solid ${active ? p.color : p.color + '33'}`,
                    boxShadow: active ? `0 0 0 1px ${p.color}88 inset` : 'none',
                    opacity: dim ? 0.45 : 1,
                    transition: 'opacity 0.15s, background 0.15s',
                  }}>
                  <PartyLogo party={p.label} size={14} />
                  <span style={{ color: p.color, fontWeight: 700 }}>{p.label}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>({p.count})</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Alliance legend — clickable */}
      {allianceLegend.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Alliance Color Legend</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Click an alliance to highlight only its seats.</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: 8 }}>
            {allianceLegend.map(a => {
              const active = filter?.kind === 'alliance' && filter.value === a.key
              const dim = filter && !active
              return (
                <button key={a.key}
                  onClick={() => setFilter(active ? null : { kind: 'alliance', value: a.key })}
                  title={active ? 'Click to clear filter' : `Show only ${a.label} seats`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem',
                    padding: '0.4rem 0.75rem', borderRadius: 6, cursor: 'pointer',
                    background: active ? `${a.color}30` : dim ? 'transparent' : `${a.color}15`,
                    border: `1px solid ${active ? a.color : a.color + '33'}`,
                    boxShadow: active ? `0 0 0 1px ${a.color}88 inset` : 'none',
                    opacity: dim ? 0.45 : 1,
                    transition: 'opacity 0.15s, background 0.15s',
                  }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: a.color, flexShrink: 0 }} />
                  <span style={{ color: a.color, fontWeight: 700 }}>{a.label}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>({a.count})</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '0.45rem 0.65rem',
  borderRadius: 8,
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  fontSize: '0.82rem',
  fontWeight: 500,
  outline: 'none',
  cursor: 'pointer',
  minWidth: 0,
  maxWidth: 200,
}
