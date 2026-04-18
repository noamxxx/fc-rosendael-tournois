import type { PropsWithChildren } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { adminEntryPath } from '../lib/adminSessionRole'
import { cn } from './cn'

export function Layout({ children }: PropsWithChildren) {
  const loc = useLocation()
  const showLive = loc.pathname.startsWith('/t/')

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden text-black">
      <div className="relative w-full">
        <div className="relative w-full overflow-hidden">
          <img
            src="/banner-rosendael.png"
            alt="Bannière FC Rosendael"
            className="block w-full"
            // Avoid extra blur from forced fixed-height scaling.
            style={{
              height: 'auto',
              // If the source image is small, avoid blurry interpolation.
              // This keeps edges sharp (pixelated) rather than blurred.
              imageRendering: 'pixelated',
            }}
            loading="eager"
          />
        </div>
      </div>
      <div className="mx-auto min-w-0 max-w-6xl px-4 py-6 md:px-6">
        <header className="flex items-center justify-center">
          <Link to="/" className="flex flex-col items-center gap-3 text-center">
            <div
              className={cn(
                'relative h-24 w-24 rounded-[28px] p-[1px] md:h-28 md:w-28',
                'bg-gradient-to-br from-rose-500/45 via-white/10 to-emerald-500/45',
                'shadow-[0_26px_70px_rgba(0,0,0,0.18)]',
              )}
              style={{ transform: 'translateZ(0)' }}
            >
              <div
                className={cn(
                  'relative h-full w-full overflow-hidden rounded-[27px] border border-black/10 bg-white',
                  'shadow-[0_2px_0_rgba(255,255,255,0.9)_inset,0_-3px_0_rgba(0,0,0,0.06)_inset]',
                )}
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -left-10 -top-12 h-24 w-44 rotate-12 rounded-full bg-white/65 blur-xl"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -left-14 -top-14 h-44 w-44 rounded-full bg-rose-500/18 blur-2xl"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-emerald-500/18 blur-2xl"
                />

                <img
                  src="/logo-rosendael.png"
                  alt="Logo Football Club Rosendael"
                  className="relative h-full w-full object-contain p-2 drop-shadow-[0_10px_18px_rgba(0,0,0,0.22)]"
                  loading="lazy"
                />
              </div>
            </div>
            <div className="text-base font-semibold tracking-[0.18em] md:text-lg">
              <span className="bg-gradient-to-r from-rose-600 via-black/75 to-emerald-600 bg-clip-text text-transparent">
                TOURNOIS CLUB ROSENDAEL
              </span>
            </div>
            {showLive ? (
              <div className="-mt-1 flex items-center justify-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-[11px] font-extrabold tracking-[0.22em] text-emerald-900">
                  <span className="relative inline-flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </span>
                  TOURNOIS EN DIRECT
                </span>
              </div>
            ) : null}
          </Link>
        </header>

        <main className="mt-6 min-w-0">{children}</main>
      </div>

      <Link
        to={adminEntryPath()}
        aria-label="Accès administrateur"
        title="Connexion administrateur"
        className="fixed bottom-5 right-5 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white/80 text-black shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 21a9 9 0 1 0-9-9 9 9 0 0 0 9 9Z" />
          <path d="M12 3l3.2 2.3-.9 3.7H9.7L8.8 5.3 12 3Z" />
          <path d="M6.2 8.6l3.5 0.4 1.3 3.3-2.3 2.7-3.4-1.5 0.9-4.9Z" />
          <path d="M17.8 8.6l-3.5 0.4-1.3 3.3 2.3 2.7 3.4-1.5-0.9-4.9Z" />
          <path d="M9.9 17.7 12 15.6l2.1 2.1-0.8 3.2H10.7l-0.8-3.2Z" />
        </svg>
      </Link>
    </div>
  )
}

