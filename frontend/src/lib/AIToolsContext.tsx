import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { CompareModal } from '../components/CompareModal'
import QuickAnswersPanel from '../components/QuickAnswersPanel'

/**
 * Lightweight shared state for the two AI-tool modals.
 * Lets Sidebar (or anywhere else) trigger them without prop-drilling.
 */
interface AIToolsCtx {
  openQuickAnswers: () => void
  openCompare: () => void
}

const Ctx = createContext<AIToolsCtx | null>(null)

export function AIToolsProvider({ children }: { children: ReactNode }) {
  const [qa, setQa] = useState(false)
  const [cmp, setCmp] = useState(false)

  // Keep the ⌘J shortcut globally — power users won't want to mouse over to
  // the sidebar every time.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setQa(o => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <Ctx.Provider value={{ openQuickAnswers: () => setQa(true), openCompare: () => setCmp(true) }}>
      {children}
      <QuickAnswersPanel open={qa} onClose={() => setQa(false)} />
      <CompareModal open={cmp} onClose={() => setCmp(false)} />
    </Ctx.Provider>
  )
}

export function useAITools(): AIToolsCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAITools must be used inside <AIToolsProvider>')
  return v
}
