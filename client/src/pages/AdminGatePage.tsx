import { GoogleLogin } from '@react-oauth/google'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ADMIN_AUTH_CHANGED_EVENT, notifyAdminAuthChanged } from '../lib/adminAuth'
import { clearAdminSessionRole, getAdminSessionRole } from '../lib/adminSessionRole'
import { adminLogin, adminLoginWithGoogle, deleteTournament, listTournaments, setLiveTournament } from '../lib/api'
import { API_BASE_CONFIGURED } from '../lib/config'
import type { TournamentPublic } from '../lib/types'
import { Card, CardBody } from '../ui/Card'
import { Layout } from '../ui/Layout'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

export function AdminGatePage() {
  const nav = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tournaments, setTournaments] = useState<{
    active: TournamentPublic[]
    archived: TournamentPublic[]
    liveMode: 'auto' | 'none' | 'slug'
  }>({ active: [], archived: [], liveMode: 'auto' })
  const [, authRevision] = useState(0)

  const isLoggedIn = Boolean(localStorage.getItem('adminToken') ?? '')

  useEffect(() => {
    const bump = () => authRevision((n) => n + 1)
    window.addEventListener(ADMIN_AUTH_CHANGED_EVENT, bump)
    return () => window.removeEventListener(ADMIN_AUTH_CHANGED_EVENT, bump)
  }, [])

  useEffect(() => {
    if (isLoggedIn && getAdminSessionRole() === 'turso') {
      nav('/admin/turso', { replace: true })
    }
  }, [isLoggedIn, authRevision, nav])

  useEffect(() => {
    let alive = true
    async function load() {
      if (getAdminSessionRole() === 'turso') return
      try {
        const data = await listTournaments()
        if (!alive) return
        setTournaments({
          active: data.active ?? [],
          archived: data.archived ?? [],
          liveMode: (data.liveMode as any) ?? 'auto',
        })
      } catch (e) {
        if (alive && e instanceof Error) setError(e.message)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [authRevision])

  async function go() {
    setError(null)
    setBusy(true)
    try {
      const { role } = await adminLogin(password.trim())
      nav(role === 'turso' ? '/admin/turso' : '/admin')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  function logout() {
    localStorage.removeItem('adminToken')
    clearAdminSessionRole()
    notifyAdminAuthChanged()
    nav('/admin')
  }

  async function setLive(mode: 'auto' | 'none' | 'slug', slug: string | null) {
    setError(null)
    try {
      await setLiveTournament(mode, slug)
      const data = await listTournaments()
      setTournaments({
        active: data.active ?? [],
        archived: data.archived ?? [],
        liveMode: (data.liveMode as any) ?? 'auto',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  async function removeArchived(slug: string) {
    if (!confirm('Supprimer définitivement ce tournoi archivé ?')) return
    setError(null)
    try {
      await deleteTournament(slug)
      const data = await listTournaments()
      setTournaments({
        active: data.active ?? [],
        archived: data.archived ?? [],
        liveMode: (data.liveMode as any) ?? 'auto',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-4xl space-y-4">
        {!API_BASE_CONFIGURED ? (
          <Card>
            <CardBody className="rounded-xl border border-amber-500/35 bg-amber-500/10 text-sm text-amber-950">
              <div className="font-semibold">API non configurée pour ce site</div>
              <p className="mt-2 leading-relaxed">
                Sur Cloudflare Pages : <strong>Settings</strong> → <strong>Environment variables</strong> →
                section <strong>Build</strong>, ajoute <span className="font-mono">VITE_API_URL</span> avec
                l’URL <strong>HTTPS</strong> de ton serveur Node (sans slash final), puis redeploie. Sinon le
                navigateur ne peut pas joindre l’API (erreur « failed to fetch »).
              </p>
            </CardBody>
          </Card>
        ) : null}
        {!isLoggedIn ? (
          <Card>
            <CardBody className="flex flex-col items-center py-10 md:py-14">
              {import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
                <div className="flex flex-col items-center gap-3">
                  <GoogleLogin
                    text="continue_with"
                    shape="rectangular"
                    size="large"
                    useOneTap={false}
                    onSuccess={async (cred) => {
                      if (!cred.credential) return
                      setError(null)
                      setBusy(true)
                      try {
                        await adminLoginWithGoogle(cred.credential)
                        nav('/admin')
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Erreur Google')
                      } finally {
                        setBusy(false)
                      }
                    }}
                    onError={() => setError('Connexion Google annulée ou indisponible.')}
                  />
                  <div className="text-xs text-black/45">ou mot de passe (tournois ou compte base Turso)</div>
                </div>
              ) : null}
              <Input
                autoFocus={!import.meta.env.VITE_GOOGLE_CLIENT_ID}
                aria-label="Mot de passe administrateur"
                autoComplete="current-password"
                className="max-w-xs"
                value={password}
                disabled={busy}
                aria-busy={busy}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && password.trim() && !busy) void go()
                }}
              />
              {error ? (
                <div className="mt-4 w-full max-w-xs rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
            </CardBody>
          </Card>
        ) : getAdminSessionRole() === 'turso' ? null : (
          <div className="grid gap-4">
            {error ? (
              <Card>
                <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-red-700">{error}</div>
                  <Button variant="ghost" onClick={() => setError(null)}>
                    Fermer
                  </Button>
                </CardBody>
              </Card>
            ) : null}
            <Card>
              <CardBody className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold tracking-wide text-black/55">
                    ESPACE ADMIN
                  </div>
                  <div className="mt-1 text-xl font-semibold">Tournois</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => nav('/admin/new')}>Créer un tournoi</Button>
                  <Button variant="ghost" onClick={logout}>Déconnexion</Button>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <div className="text-sm font-semibold text-black/85">En cours</div>
                <div className="mt-3 rounded-xl border border-black/10 bg-black/[0.03] p-3 md:p-4">
                  <div className="text-xs font-semibold tracking-wide text-black/55">Vedette sur l’accueil</div>
                  <p className="mt-1 text-xs text-black/50">
                    Tournoi affiché en premier sur la page d’accueil. Tu peux aussi utiliser le bouton VEDETTE sur
                    chaque carte.
                  </p>
                  <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                    <select
                      className="h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-black outline-none focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/30"
                      value={
                        tournaments.liveMode === 'none'
                          ? '__NONE__'
                          : tournaments.active.find((t) => Boolean((t as any).live))?.slug ?? ''
                      }
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === '__NONE__') setLive('none', null)
                        else if (!v) setLive('auto', null)
                        else setLive('slug', v)
                      }}
                      disabled={busy}
                    >
                      <option value="">Le plus récent (automatique)</option>
                      <option value="__NONE__">Aucun tournoi en vedette</option>
                      {tournaments.active.map((t) => (
                        <option key={t.id} value={t.slug}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <Button variant="ghost" disabled={busy} onClick={() => setLive('auto', null)}>
                      Remettre en automatique
                    </Button>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {tournaments.active.map((t) => (
                    <div
                      key={t.id}
                      role="link"
                      tabIndex={0}
                      className="cursor-pointer rounded-2xl border border-black/10 bg-white px-4 py-3 text-left transition hover:bg-black/5"
                      onClick={() => nav(`/admin/t/${t.slug}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          nav(`/admin/t/${t.slug}`)
                        }
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold">{t.name}</div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setLive(Boolean((t as any).live) ? 'auto' : 'slug', Boolean((t as any).live) ? null : t.slug)
                          }}
                          className={
                            'rounded-full border px-3 py-1 text-[10px] font-extrabold tracking-[0.22em] ' +
                            (Boolean((t as any).live)
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800'
                              : 'border-black/10 bg-white/70 text-black/60 hover:bg-black/5')
                          }
                          title="Définir comme tournoi en vedette sur l’accueil"
                        >
                          VEDETTE
                        </button>
                      </div>
                      <div className="mt-1 text-xs text-black/55">
                        <span className="font-mono">{t.slug}</span>
                      </div>
                    </div>
                  ))}
                  {tournaments.active.length === 0 ? (
                    <div className="text-sm text-black/55">Aucun tournoi en cours.</div>
                  ) : null}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <div className="text-sm font-semibold text-black/85">Archivés</div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {tournaments.archived.map((t) => (
                    <div
                      key={t.id}
                      role="link"
                      tabIndex={0}
                      className="cursor-pointer rounded-2xl border border-black/10 bg-white px-4 py-3 text-left transition hover:bg-black/5"
                      onClick={() => nav(`/admin/t/${t.slug}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          nav(`/admin/t/${t.slug}`)
                        }
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold">{t.name}</div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            void removeArchived(t.slug)
                          }}
                          className="rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-[10px] font-extrabold tracking-[0.22em] text-red-700 hover:bg-red-500/15"
                          title="Supprimer définitivement"
                        >
                          SUPPRIMER
                        </button>
                      </div>
                      <div className="mt-1 text-xs text-black/55">
                        <span className="font-mono">{t.slug}</span>
                      </div>
                    </div>
                  ))}
                  {tournaments.archived.length === 0 ? (
                    <div className="text-sm text-black/55">Aucun tournoi archivé.</div>
                  ) : null}
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  )
}

