import { useNavigate, useLocation } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getOpenRegistration, listTournaments } from '../lib/api'
import { API_BASE_CONFIGURED } from '../lib/config'
import { getSocket } from '../lib/socket'
import type { TournamentPublic, TournamentSnapshot } from '../lib/types'
import { Card, CardBody } from '../ui/Card'
import { Layout } from '../ui/Layout'

function formatDate(iso: string | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

const HOME_TOURNAMENTS_CACHE_KEY = 'club-home-tournaments-v1'
const HOME_TOURNAMENTS_CACHE_MS = 60_000

function readTournamentsCache():
  | { active: TournamentPublic[]; archived: TournamentPublic[]; liveMode: 'auto' | 'none' | 'slug' }
  | null {
  try {
    const raw = sessionStorage.getItem(HOME_TOURNAMENTS_CACHE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as {
      t: number
      active?: TournamentPublic[]
      archived?: TournamentPublic[]
      liveMode?: string
    }
    if (typeof o.t !== 'number' || Date.now() - o.t > HOME_TOURNAMENTS_CACHE_MS) return null
    const lm = (o.liveMode === 'none' || o.liveMode === 'slug' || o.liveMode === 'auto' ? o.liveMode : 'auto') as
      | 'auto'
      | 'none'
      | 'slug'
    return { active: o.active ?? [], archived: o.archived ?? [], liveMode: lm }
  } catch {
    return null
  }
}

function writeTournamentsCache(payload: {
  active: TournamentPublic[]
  archived: TournamentPublic[]
  liveMode: 'auto' | 'none' | 'slug'
}) {
  try {
    sessionStorage.setItem(
      HOME_TOURNAMENTS_CACHE_KEY,
      JSON.stringify({ t: Date.now(), ...payload }),
    )
  } catch {
    /* quota / mode privé */
  }
}

export function HomePage() {
  const nav = useNavigate()
  const location = useLocation()
  const [active, setActive] = useState<TournamentPublic[]>([])
  const [archived, setArchived] = useState<TournamentPublic[]>([])
  const [liveMode, setLiveMode] = useState<'auto' | 'none' | 'slug'>('auto')
  const [tournamentsStatus, setTournamentsStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [slowLoadHint, setSlowLoadHint] = useState(false)
  const [reg, setReg] = useState<{
    open: boolean
    tournamentName?: string
    tournamentSlug?: string
  } | null>(null)

  const loadHome = useCallback(() => {
    const cached = API_BASE_CONFIGURED ? readTournamentsCache() : null
    if (cached) {
      setActive(cached.active)
      setArchived(cached.archived)
      setLiveMode(cached.liveMode)
      setTournamentsStatus('ready')
    } else {
      setTournamentsStatus('loading')
    }

    void listTournaments()
      .then((data) => {
        const nextActive = data.active ?? []
        const nextArchived = data.archived ?? []
        const nextLive = (data.liveMode as 'auto' | 'none' | 'slug') ?? 'auto'
        setActive(nextActive)
        setArchived(nextArchived)
        setLiveMode(nextLive)
        writeTournamentsCache({ active: nextActive, archived: nextArchived, liveMode: nextLive })
        setTournamentsStatus('ready')
      })
      .catch(() => {
        if (!cached) setTournamentsStatus('error')
      })

    void getOpenRegistration()
      .then((r) =>
        setReg(
          r.open
            ? { open: true, tournamentName: r.tournament.name, tournamentSlug: r.tournament.slug }
            : { open: false },
        ),
      )
      .catch(() => setReg({ open: false }))
  }, [])

  useEffect(() => {
    if (tournamentsStatus !== 'loading') {
      setSlowLoadHint(false)
      return
    }
    const id = window.setTimeout(() => setSlowLoadHint(true), 6500)
    return () => window.clearTimeout(id)
  }, [tournamentsStatus])

  useEffect(() => {
    void loadHome()
  }, [loadHome, location.pathname])

  useEffect(() => {
    function onVis() {
      if (document.visibilityState === 'visible') void loadHome()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [loadHome])

  const current = useMemo(() => {
    if (liveMode === 'none') return null
    const live = active.find((t) => Boolean(t.live)) ?? null
    if (liveMode === 'slug') return live
    return live ?? active[0] ?? null
  }, [active, liveMode])

  /** Mise à jour temps réel de la carte « vedette » (même canal Socket.io que /t/:slug). */
  useEffect(() => {
    if (!API_BASE_CONFIGURED) return
    const slug = current?.slug?.trim()
    if (!slug) return

    let alive = true
    const room = `tournament:${slug}`
    const socket = getSocket()
    const join = () => socket.emit('join', { room })

    const onSnapshot = (payload: { slug: string; snapshot: TournamentSnapshot }) => {
      if (!alive || payload.slug !== slug) return
      const next = payload.snapshot.tournament
      setActive((prev) =>
        prev.map((t) => (t.slug === slug ? { ...t, ...next } : t)),
      )
    }

    const onConnect = () => {
      join()
    }

    join()
    socket.on('tournament:snapshot', onSnapshot)
    socket.on('connect', onConnect)

    return () => {
      alive = false
      socket.off('tournament:snapshot', onSnapshot)
      socket.off('connect', onConnect)
      socket.emit('leave', { room })
    }
  }, [current?.slug])

  const directActif = Boolean(current?.liveMatchId)

  return (
    <Layout>
      <div className="mx-auto grid max-w-5xl gap-4">
        <section className="text-center">
          <div className="flex justify-center">
            <div
              className="inline-flex items-center rounded-full border border-black/10 bg-white/80 px-4 py-2 text-xs font-extrabold tracking-[0.34em] shadow-[0_16px_45px_rgba(0,0,0,0.10)] backdrop-blur-xl"
              style={{
                boxShadow:
                  '0 16px 45px rgba(0,0,0,0.10), 0 2px 0 rgba(255,255,255,0.65) inset, 0 -2px 0 rgba(0,0,0,0.04) inset',
              }}
            >
              <span className="bg-gradient-to-r from-rose-700 via-rose-600 to-emerald-600 bg-clip-text text-transparent">
                FC ROSENDAEL
              </span>
            </div>
          </div>
          <div className="mx-auto mt-3 h-px w-48 bg-gradient-to-r from-rose-500/40 via-black/10 to-emerald-500/40" />
          <div className="mt-2 text-balance text-3xl font-extrabold tracking-wide md:text-4xl">
            <span className="block leading-[1.05] drop-shadow-[0_10px_22px_rgba(0,0,0,0.10)]">
              <span className="bg-gradient-to-r from-rose-700 via-rose-600 to-rose-500 bg-clip-text text-transparent">
                UN CLUB
              </span>
            </span>
            <span className="block leading-[1.05] drop-shadow-[0_10px_22px_rgba(0,0,0,0.10)]">
              <span className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-500 bg-clip-text text-transparent">
                UN QUARTIER
              </span>
            </span>
          </div>
          <div className="mx-auto mt-3 h-px w-48 bg-gradient-to-r from-rose-500/40 via-black/10 to-emerald-500/40" />
          <div className="mt-3 text-sm font-semibold tracking-wide text-black/65">
            <span className="text-rose-600">ROUGE</span> &{' '}
            <span className="text-emerald-600">VERT</span> • FIERS DE NOS COULEURS
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
          {/* Left column (stacked cards) */}
          <div className="grid gap-4">
            {/* Registration card (optional) */}
            {reg?.open ? (
              <div className="rounded-2xl border border-black/10 bg-white/80 shadow-[0_10px_28px_rgba(0,0,0,0.08)] backdrop-blur-xl">
                <div className="p-5 md:p-6 text-center">
                  <div className="text-xs font-semibold tracking-[0.22em] text-black/55">
                    INSCRIPTION
                  </div>
                  <div className="mt-1 text-2xl font-semibold">Prochain tournoi</div>
                  <div className="mt-2 text-sm text-black/65">{reg.tournamentName}</div>
                  <div className="mt-5 flex justify-center">
                    <button
                      type="button"
                      className="group inline-flex items-center gap-3 rounded-full border border-rose-600/25 bg-gradient-to-b from-white to-rose-50 px-7 py-3 text-base font-extrabold tracking-wide text-rose-900 shadow-[0_18px_50px_rgba(225,29,72,0.14)] transition hover:from-white hover:to-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50"
                      onClick={() =>
                        nav(
                          reg.tournamentSlug
                            ? `/inscription?slug=${encodeURIComponent(reg.tournamentSlug)}`
                            : '/inscription',
                        )
                      }
                    >
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-rose-600/10 ring-1 ring-rose-600/20 transition group-hover:bg-rose-600/15">
                        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" aria-hidden="true">
                          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2-8 4v2h16v-2c0-2-3.58-4-8-4Z" />
                        </svg>
                      </span>
                      S’INSCRIRE
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Live tournament card */}
            <div className="rounded-2xl border border-black/10 bg-white/80 shadow-[0_10px_28px_rgba(0,0,0,0.08)] backdrop-blur-xl">
              <div className="p-5 md:p-6 text-center">
                {directActif ? (
                  <div className="flex items-center justify-center gap-2">
                    <span className="relative inline-flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </span>
                    <span className="text-xs font-semibold tracking-[0.22em] text-emerald-700">
                      MATCH EN DIRECT
                    </span>
                  </div>
                ) : null}
                {tournamentsStatus === 'loading' && (
                  <div className="mt-3 space-y-2 text-sm text-black/60">
                    <div>Chargement…</div>
                    {slowLoadHint ? (
                      <div className="text-xs leading-relaxed text-black/45">
                        Si ça reste long : l’API peut être en train de se réveiller (hébergement gratuit). Réessaie
                        dans quelques secondes.
                      </div>
                    ) : null}
                  </div>
                )}
                {tournamentsStatus === 'error' && (
                  <div className="mt-3 text-sm text-red-700">
                    Impossible de charger les tournois. Vérifie que le serveur tourne.
                  </div>
                )}
                {tournamentsStatus === 'ready' && !current && (
                  <>
                    <div className="mt-1 text-2xl font-semibold">
                      Pas de tournoi en ce moment
                    </div>
                    <div className="mt-2 text-sm text-black/60">
                      L’historique reste disponible juste en dessous.
                    </div>
                  </>
                )}
                {tournamentsStatus === 'ready' && current && (
                  <>
                    {directActif ? (
                      <>
                        <div className="mt-3 text-lg font-semibold text-black/85">{current.name}</div>
                        <div className="mt-5 flex justify-center gap-2">
                          <button
                            type="button"
                            className="group inline-flex items-center gap-3 rounded-full border border-emerald-600/25 bg-gradient-to-b from-white to-emerald-50 px-7 py-3 text-base font-extrabold tracking-wide text-emerald-900 shadow-[0_18px_50px_rgba(34,197,94,0.18)] transition hover:from-white hover:to-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                            onClick={() => nav(`/t/${current.slug}#live`)}
                          >
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600/10 ring-1 ring-emerald-600/20 transition group-hover:bg-emerald-600/15">
                              <svg
                                viewBox="0 0 24 24"
                                className="h-4.5 w-4.5 translate-x-[0.5px]"
                                fill="currentColor"
                                aria-hidden="true"
                              >
                                <path d="M8 5v14l11-7L8 5z" />
                              </svg>
                            </span>
                            REJOINDRE LE DIRECT
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 text-balance text-xl font-extrabold leading-snug tracking-tight text-black/88 md:text-2xl">
                        Pas de tournoi en direct pour le moment
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right column */}
          <Card className="lg:col-span-2">
          <CardBody className="text-center">
            <div className="text-xs font-semibold tracking-wide text-black/55">
              HISTORIQUE
            </div>
            <div className="mt-1 text-2xl font-semibold">Tournois précédents</div>
            <div className="mt-2 text-sm text-black/60">
              Classements et matchs restent consultables.
            </div>

            <div className="mt-5 grid gap-2 md:grid-cols-2">
              {archived.map((t) => (
                <button
                  key={t.id}
                  onClick={() => nav(`/t/${t.slug}`)}
                  className="text-left rounded-2xl border border-black/10 bg-white px-4 py-3 transition hover:bg-black/5"
                >
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="mt-1 text-xs text-black/55">
                    {t.archivedAt || t.createdAt ? (
                      <>
                        {formatDate(t.archivedAt ?? t.createdAt)}
                      </>
                    ) : null}
                  </div>
                </button>
              ))}
              {tournamentsStatus === 'ready' && archived.length === 0 && (
                <div className="md:col-span-2 flex items-center justify-center">
                  <div className="rounded-2xl border border-black/10 bg-white px-4 py-6 text-sm text-black/55">
                    Aucun tournoi archivé pour le moment.
                  </div>
                </div>
              )}
            </div>
          </CardBody>
          </Card>
        </div>
      </div>
    </Layout>
  )
}

