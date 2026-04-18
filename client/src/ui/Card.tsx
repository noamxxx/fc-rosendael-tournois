import type { PropsWithChildren } from 'react'
import { cn } from './cn'

export function Card({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        'rounded-2xl p-[1px]',
        // Stronger premium border (still subtle)
        'bg-gradient-to-br from-rose-500/45 via-black/0 to-emerald-500/45',
        'shadow-[0_26px_75px_rgba(0,0,0,0.14)]',
        className,
      )}
    >
      <div
        className="relative overflow-hidden rounded-[15px] border border-black/10 bg-white/82 backdrop-blur-xl"
        style={{
          boxShadow:
            '0 2px 0 rgba(255,255,255,0.70) inset, 0 -2px 0 rgba(0,0,0,0.04) inset',
          backgroundImage:
            // micro texture + gentle tint, stays readable
            'linear-gradient(180deg, rgba(255,255,255,0.90), rgba(255,255,255,0.74)), radial-gradient(900px 280px at 15% 0%, rgba(225,29,72,0.08) 0%, transparent 62%), radial-gradient(900px 280px at 85% 0%, rgba(34,197,94,0.08) 0%, transparent 62%)',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export function CardBody({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
  return <div className={cn('p-5 md:p-6', className)}>{children}</div>
}

