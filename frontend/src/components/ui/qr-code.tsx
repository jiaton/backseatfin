import QRCode from 'qrcode'
import { useMemo } from 'react'

import { cn } from '@/lib/utils'

/** Synchronous SVG QR code, always dark-on-light (fixed --qr-* tokens) regardless of theme. */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' })
    const n = modules.size
    let d = ''
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (modules.get(y, x)) d += `M${x + 4} ${y + 4}h1v1h-1z`
      }
    }
    return { size: n + 8, path: d }
  }, [value])

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={cn('bg-qr-light text-qr-dark', className)}
    >
      <path d={path} fill="currentColor" />
    </svg>
  )
}
