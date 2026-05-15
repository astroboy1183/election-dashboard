import { useEffect } from 'react'

/**
 * Bind a callback to the Escape key while `enabled` is true.
 * Use in modal/drawer components so users can close them with ESC.
 *
 *   useEscapeKey(modalOpen, () => setModalOpen(false))
 */
export function useEscapeKey(enabled: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, onEscape])
}
