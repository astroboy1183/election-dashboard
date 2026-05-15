import { useEffect, useRef, useState } from 'react'

interface CountUpProps {
  value: number
  duration?: number          // ms
  format?: (n: number) => string
  className?: string
  style?: React.CSSProperties
}

/**
 * Animated number that counts up to its target on mount and on value change.
 * Uses requestAnimationFrame so it stays smooth and respects prefers-reduced-motion.
 */
export function CountUp({ value, duration = 1100, format, className, style }: CountUpProps) {
  const [n, setN] = useState(value)
  const startRef = useRef<number | null>(null)
  const fromRef = useRef<number>(0)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || !Number.isFinite(value)) {
      setN(value)
      return
    }
    fromRef.current = n
    startRef.current = null
    let raf = 0
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const t = Math.min(1, elapsed / duration)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      setN(fromRef.current + (value - fromRef.current) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else setN(value)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  const display = format ? format(n) : Math.round(n).toLocaleString('en-IN')
  return <span className={`tabular ${className ?? ''}`} style={style}>{display}</span>
}
