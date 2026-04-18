import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'
import { cn } from './cn'

type Props = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'ghost' | 'danger'
    size?: 'sm' | 'md'
  }
>

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold outline-none transition',
        'shadow-[0_14px_35px_rgba(0,0,0,0.10)]',
        'focus-visible:ring-2 focus-visible:ring-rose-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        variant === 'primary' &&
          'border-rose-500/30 bg-gradient-to-b from-rose-500 to-rose-600 text-white hover:from-rose-400 hover:to-rose-600 active:translate-y-px',
        variant === 'ghost' &&
          'border-black/10 bg-gradient-to-b from-white/85 to-white/55 text-black/85 backdrop-blur-xl hover:from-white/90 hover:to-white/65',
        variant === 'danger' &&
          'border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/15',
        props.disabled && 'cursor-not-allowed opacity-60 hover:bg-inherit',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

