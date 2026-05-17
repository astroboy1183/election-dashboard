import { useEffect, useState } from 'react'
import { NavLink, useLocation, useParams } from 'react-router-dom'
import { useAITools } from '../../lib/AIToolsContext'

// Sidebar nav grouped into logical sections to improve information architecture.
const NAV_SECTIONS: { heading: string; items: { to: string; label: string; icon: string }[] }[] = [
  {
    heading: 'Results',
    items: [
      { to: 'overview',       label: 'Overview',           icon: '🏛️' },
      { to: 'constituencies', label: 'Constituencies',      icon: '📋' },
      { to: 'results',        label: 'Full Results',        icon: '📑' },
    ],
  },
  {
    heading: 'Analysis',
    items: [
      { to: 'parties',        label: 'Party Analysis',      icon: '🎯' },
      { to: 'swing',          label: 'Swing & Trends',      icon: '📊' },
    ],
  },
  {
    heading: 'Geography',
    items: [
      { to: 'geography',      label: 'District & LS View',  icon: '🗺️' },
      { to: 'map',            label: 'Interactive Map',     icon: '🌐' },
    ],
  },
  {
    heading: 'Candidates',
    items: [
      { to: 'assets',         label: 'Criminality & Assets',icon: '⚖️' },
      { to: 'representation', label: 'MPs & MLAs',          icon: '🪪' },
    ],
  },
]

function SidebarBody() {
  const { state } = useParams()
  const { openQuickAnswers, openCompare } = useAITools()
  return (
    <>
      <div style={{ padding: '0 1.25rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
        <NavLink to="/" style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
            India Elections
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            2026 Dashboard
          </div>
        </NavLink>
        {state && (
          <NavLink to="/" style={{ textDecoration: 'none' }}>
            <div style={{
              marginTop: '0.75rem',
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: 8,
              padding: '0.5rem 0.75rem',
              fontSize: '0.8rem',
              color: '#818cf8',
              fontWeight: 600,
            }}>
              ← {state.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </div>
          </NavLink>
        )}
      </div>

      {state && (
        <nav style={{ padding: '0.75rem 0.75rem', flex: 1 }}>
          {NAV_SECTIONS.map((section, idx) => (
            <div key={section.heading} style={{ marginBottom: idx === NAV_SECTIONS.length - 1 ? 0 : 14 }}>
              <div style={{
                fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase',
                letterSpacing: '0.1em', fontWeight: 700, padding: '0.35rem 0.75rem 0.45rem',
              }}>
                {section.heading}
              </div>
              {section.items.map(item => (
                <NavLink
                  key={item.to}
                  to={`/${state}/${item.to}`}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 8,
                    marginBottom: 1,
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#818cf8' : 'var(--text-secondary)',
                    background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                    transition: 'all 0.15s',
                  })}
                >
                  <span style={{ fontSize: '1rem' }}>{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}

          {/* Tools — modal triggers, not routes. Visually distinct so they
              don't look like "pages" the user can navigate to. */}
          <div style={{ marginTop: 14 }}>
            <div style={{
              fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase',
              letterSpacing: '0.1em', fontWeight: 700, padding: '0.35rem 0.75rem 0.45rem',
            }}>
              Tools
            </div>
            <ToolButton emoji="💡" label="Quick Answers" onClick={openQuickAnswers} shortcut="⌘J" accent="#a78bfa" />
            <ToolButton emoji="⚖️" label="Compare"       onClick={openCompare}      accent="#f59e0b" />
          </div>
        </nav>
      )}

      <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          Data: ECI · Wikipedia · ADR
        </div>
        <div style={{ marginTop: 6, fontSize: '0.66rem', color: 'var(--text-muted)' }}>
          Tip: press <span className="kbd">⌘</span><span className="kbd">K</span> to jump anywhere.
        </div>
      </div>
    </>
  )
}

function ToolButton({
  emoji, label, onClick, shortcut, accent,
}: { emoji: string; label: string; onClick: () => void; shortcut?: string; accent: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        width: '100%',
        padding: '0.5rem 0.75rem',
        borderRadius: 8,
        marginBottom: 2,
        background: 'transparent',
        border: '1px solid transparent',
        fontSize: '0.875rem',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = `${accent}14`
        e.currentTarget.style.borderColor = `${accent}40`
        e.currentTarget.style.color = accent
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.borderColor = 'transparent'
        e.currentTarget.style.color = 'var(--text-secondary)'
      }}
    >
      <span style={{ fontSize: '1rem' }}>{emoji}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && (
        <span className="kbd" style={{ fontSize: '0.6rem' }}>{shortcut}</span>
      )}
    </button>
  )
}

export default function Sidebar() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // Close drawer on route change so navigating doesn't leave it stuck open.
  useEffect(() => { setOpen(false) }, [location.pathname])

  return (
    <>
      {/* Hamburger trigger — only visible at <=960px via CSS */}
      <button
        className="sidebar-mobile-trigger"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        ☰
      </button>

      {/* Desktop sidebar — hidden on small screens via CSS */}
      <aside
        className="sidebar-desktop"
        style={{
          width: 240,
          minHeight: '100vh',
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.25rem 0',
          position: 'sticky',
          top: 0,
          flexShrink: 0,
        }}
      >
        <SidebarBody />
      </aside>

      {/* Mobile drawer — animated in from the left */}
      {open && (
        <>
          <div className="sidebar-mobile-backdrop" onClick={() => setOpen(false)} />
          <aside
            className="sidebar-mobile-drawer"
            style={{ display: 'flex', flexDirection: 'column', padding: '1.25rem 0' }}
          >
            <SidebarBody />
          </aside>
        </>
      )}
    </>
  )
}
