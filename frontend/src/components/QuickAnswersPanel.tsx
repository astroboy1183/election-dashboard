import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { askAI, useQuickAnswers, useStates, type AskResponse } from '../lib/api'
import { useEscapeKey } from '../lib/useEscapeKey'
import { matchNavIntent } from '../lib/navIntent'
import { Skeleton } from './Skeleton'

/**
 * Modal that lists pre-computed quick answers for a state. Replaces the
 * earlier free-form chat UI — every answer is computed server-side from the
 * structured data, so it's fast, deterministic, and dependency-free.
 */
export default function QuickAnswersPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state: routeState } = useParams<{ state?: string }>()
  const { data: states } = useStates()
  const navigate = useNavigate()
  const [picked, setPicked] = useState<string | null>(null)

  useEffect(() => {
    if (routeState) setPicked(routeState)
  }, [routeState])

  const effectiveState = picked ?? routeState ?? states?.[0]?.slug ?? null
  const { data, isLoading, isError, error } = useQuickAnswers(open ? effectiveState : null)

  // ───── Ask (LLM-powered, dashboard-data only) ─────
  const [q, setQ] = useState('')
  const [asking, setAsking] = useState(false)
  const [askResult, setAskResult] = useState<AskResponse | null>(null)
  const [askError, setAskError] = useState<string | null>(null)
  const askInputRef = useRef<HTMLInputElement | null>(null)

  useEscapeKey(open, onClose)

  // Focus the Ask input when the panel opens.
  useEffect(() => {
    if (open) setTimeout(() => askInputRef.current?.focus(), 30)
  }, [open])

  async function submitAsk(e?: React.FormEvent) {
    e?.preventDefault()
    const question = q.trim()
    if (!question || asking) return

    // Short-circuit: if this is a navigation phrase ("take me to X", "open Y
    // map", etc.) resolve locally and route immediately. No need to spend an
    // LLM round-trip on a UI command.
    const navMatch = matchNavIntent(question, states ?? [], effectiveState)
    if (navMatch) {
      navigate(navMatch.to)
      onClose()
      return
    }

    setAsking(true); setAskError(null); setAskResult(null)
    try {
      const res = await askAI(question, effectiveState)
      setAskResult(res)
    } catch (e: any) {
      setAskError(e?.response?.data?.detail ?? e?.message ?? 'Unknown error')
    } finally {
      setAsking(false)
    }
  }

  function clearAsk() {
    setQ(''); setAskResult(null); setAskError(null)
  }

  if (!open) return null
  return (
    <div className="cmdk-backdrop" onClick={onClose} role="dialog" aria-label="Quick answers">
      <div className="cmdk-shell" onClick={e => e.stopPropagation()} style={{ width: 'min(720px, 94vw)', maxHeight: '80vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }}>
          <span style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.95rem',
          }}>💡</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Quick answers</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              Common questions, answered directly from the data — click any to see the answer.
            </div>
          </div>
          <select
            value={effectiveState ?? ''}
            onChange={e => setPicked(e.target.value)}
            aria-label="Pick a state"
            style={{
              padding: '0.35rem 0.55rem',
              borderRadius: 6,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
              outline: 'none',
            }}>
            {(states ?? []).map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                     borderRadius: 6, padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: '0.78rem' }}>
            ✕
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0.85rem 1rem' }}>
          {/* Ask box — LLM Q&A over dashboard data only */}
          <form onSubmit={submitAsk} style={{ marginBottom: 14 }}>
            <div style={{
              display: 'flex', alignItems: 'stretch', gap: 6,
              padding: 4,
              borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(139,92,246,0.10) 0%, rgba(6,182,212,0.06) 100%)',
              border: '1px solid rgba(139,92,246,0.35)',
            }}>
              <span style={{
                width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem', color: '#a78bfa',
              }}>✨</span>
              <input
                ref={askInputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={`Ask anything about ${effectiveState ? states?.find(s => s.slug === effectiveState)?.name ?? 'this dashboard' : 'this dashboard'}…`}
                disabled={asking}
                style={{
                  flex: 1,
                  padding: '0.5rem 0.6rem',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  outline: 'none',
                }}
              />
              {(askResult || askError) && !asking && (
                <button type="button" onClick={clearAsk}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)',
                           cursor: 'pointer', fontSize: '0.78rem', padding: '0 0.5rem' }}>
                  Clear
                </button>
              )}
              <button
                type="submit"
                disabled={asking || !q.trim()}
                style={{
                  padding: '0.5rem 0.9rem',
                  borderRadius: 7,
                  background: asking || !q.trim()
                    ? 'rgba(139,92,246,0.25)'
                    : 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
                  color: '#fff', border: 'none',
                  cursor: asking || !q.trim() ? 'not-allowed' : 'pointer',
                  fontWeight: 700, fontSize: '0.8rem',
                }}>
                {asking ? '…' : 'Ask ↵'}
              </button>
            </div>
            <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 4, paddingLeft: 38 }}>
              Powered by Claude, answers come only from this dashboard's data — no web search.
            </div>
          </form>

          {/* Ask result */}
          {(asking || askResult || askError) && (
            <div style={{ marginBottom: 14, padding: '0.85rem 1rem', borderRadius: 10,
                          background: askError ? 'rgba(239,68,68,0.06)' : 'rgba(139,92,246,0.06)',
                          border: `1px solid ${askError ? 'rgba(239,68,68,0.30)' : 'rgba(139,92,246,0.30)'}` }}>
              {asking && (
                <>
                  <Skeleton height={12} width="85%" />
                  <Skeleton height={12} width="92%" style={{ marginTop: 6 }} />
                  <Skeleton height={12} width="60%" style={{ marginTop: 6 }} />
                </>
              )}
              {askError && (
                <div style={{ fontSize: '0.85rem', color: '#fca5a5' }}>
                  <strong>Couldn't answer.</strong> {askError}
                </div>
              )}
              {askResult && (
                <>
                  <div style={{ fontSize: '0.9rem', lineHeight: 1.55, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                    {askResult.answer}
                  </div>
                  {askResult.trace?.length > 0 && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ fontSize: '0.66rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        {askResult.trace.length} data {askResult.trace.length === 1 ? 'lookup' : 'lookups'} · by {askResult.model}
                      </summary>
                      <div style={{ marginTop: 4, fontSize: '0.66rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {askResult.trace.map((t, i) => (
                          <div key={i} style={{ fontFamily: 'monospace' }}>
                            <span style={{ color: t.ok ? '#22c55e' : '#ef4444' }}>{t.ok ? '✓' : '✗'}</span>{' '}
                            <span style={{ color: 'var(--text-primary)' }}>{t.tool}</span>
                            {Object.keys(t.args).length > 0 && (
                              <span style={{ color: 'var(--text-muted)' }}> ({Object.entries(t.args).map(([k, v]) => `${k}=${v}`).join(', ')})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>
          )}

          {/* Divider between free-form Ask and the curated quick answers below */}
          <div style={{
            fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.1em',
            margin: '0.25rem 0 0.5rem 0.1rem',
          }}>
            Or pick a curated question
          </div>

          {isLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div key={i} style={{ padding: '0.7rem 0.85rem', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <Skeleton height={12} width="60%" />
                  <Skeleton height={12} width="92%" style={{ marginTop: 6 }} />
                </div>
              ))}
            </div>
          )}
          {isError && (
            <div style={{ padding: '0.8rem', color: '#fca5a5', fontSize: '0.85rem' }}>
              Couldn't load quick answers: {(error as any)?.message ?? 'unknown error'}
            </div>
          )}
          {data && data.answers.length === 0 && (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              No quick answers available for this state yet.
            </div>
          )}
          {data && data.answers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.answers.map((a, i) => (
                <AnswerRow key={i} {...a} onNavigate={onClose} />
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '0.45rem 0.85rem', fontSize: '0.66rem', color: 'var(--text-muted)', textAlign: 'right', borderTop: '1px solid var(--border)' }}>
          All answers computed directly from the live results · <span className="kbd">esc</span> close
        </div>
      </div>
    </div>
  )
}

function AnswerRow({
  emoji, label, answer, link, onNavigate,
}: { emoji: string; label: string; answer: string; link?: string; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  return (
    <div
      style={{
        borderRadius: 8,
        background: open ? 'rgba(167,139,250,0.10)' : 'rgba(167,139,250,0.04)',
        border: `1px solid ${open ? 'rgba(167,139,250,0.35)' : 'rgba(167,139,250,0.18)'}`,
        transition: 'background 0.15s, border-color 0.15s',
      }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          padding: '0.6rem 0.85rem',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: '0.85rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
        <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>{emoji}</span>
        <span style={{ flex: 1 }}>{label}</span>
        <span style={{ color: 'var(--accent)', fontSize: '0.78rem' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 0.85rem 0.7rem 2.2rem' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
            {answer}
          </div>
          {link && (
            <button
              onClick={() => { onNavigate?.(); navigate(link) }}
              style={{
                marginTop: 8,
                padding: '0.3rem 0.7rem',
                borderRadius: 6,
                background: 'rgba(167,139,250,0.12)',
                border: '1px solid rgba(167,139,250,0.35)',
                color: 'var(--accent)',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}>
              Open page →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
