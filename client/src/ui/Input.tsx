import type { InputHTMLAttributes } from 'react'
import { cn } from './cn'

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-black placeholder:text-black/40 outline-none',
        'focus:border-rose-500/40 focus:ring-2 focus:ring-rose-500/40',
        className,
      )}
      {...props}
    />
  )
}

