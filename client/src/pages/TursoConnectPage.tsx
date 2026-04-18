import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { notifyAdminAuthChanged } from '../lib/adminAuth'
import { clearAdminSessionRole, getAdminSessionRole } from '../lib/adminSessionRole'
import {
  connectTursoRemote,
  deleteArchivedForCleanup,
  disconnectTursoLocalFile,
  getTursoStatus,
  listArchivedForCleanup,
  purgeAllArchivedForCleanup,
  vacuumTursoCleanup,
  type ArchivedForCleanup,
  type TursoConnectionStatus,
} from '../lib/api'
import { Button } from '../ui/Button'
import { Card, CardBody } from '../ui/Card'
import { Input } from '../ui/Input'
import { Layout } from '../ui/Layout'

export function TursoConnectPage() {
  const nav = useNavigate()
  const [status, setStatus] = useState<TursoConnectionStatus | null>(null)
  const [databaseUrl, setDatabaseUrl] = useState('')
  const [authToken, setAuthToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [archived, setArchived] = useState<ArchivedForCleanup[]>([])
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [cleanupError, setCleanupError] = useState<string | null>(null)
  const [purgeConfirm, setPurgeConfirm] = useState('')
  const [vacuumHint, setVacuumHint] = useState<string | null>(null)

  const refreshArchived = useCallback(async () => {
    setCleanupError(null)
    setCleanupLoading(true)
    try {
      const res = await listArchivedForCleanup()
      setArchived(res.tournaments ?? [])
    } catch (e) {
      setCleanupError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setCleanupLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!localStorage.getItem('adminToken')) {
      nav('/admin', { replace: true })
      return
    }
    if (getAdminSessionRole() !== 'turso') {
      nav('/admin', { replace: true })
      return
    }
    let alive = true
    void getTursoStatus()
      .then((s) => {
        if (alive) setStatus(s)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Erreur')
      })
    void refreshArchived()
    return () => {
      alive = false
    }
  }, [nav, refreshArchived])

  async function save() {
    setError(null)
    setBusy(true)
    try {
      const next = await connectTursoRemote(databaseUrl.trim(), authToken.trim())
      setStatus(next)
      setAuthToken('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function removeLocalFile() {
    if (!confirm('Retirer la config enregistrée sur ce serveur et utiliser les variables d’environnement ou le fichier SQLite local ?')) return
    setError(null)
    setBusy(true)
    try {
      const next = await disconnectTursoLocalFile()
      setStatus(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteArchivedRow(t: ArchivedForCleanup) {
    if (!confirm(`Supprimer définitivement le tournoi archivé « ${t.name} » ? Cette action ne peut pas être annulée.`))
      return
    setCleanupError(null)
    setBusy(true)
    try {
      await deleteArchivedForCleanup(t.slug)
      await refreshArchived()
    } catch (e) {
      setCleanupError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function onPurgeAllArchived() {
    if (purgeConfirm !== 'ARCHIVÉS') return
    if (!confirm('Supprimer TOUS les tournois archivés ? Irréversible.')) return
    setCleanupError(null)
    setBusy(true)
    try {
      const res = await purgeAllArchivedForCleanup('ARCHIVÉS')
      setPurgeConfirm('')
      await refreshArchived()
      setVacuumHint(`${res.deleted} tournoi(s) archivé(s) supprimé(s).`)
    } catch (e) {
      setCleanupError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function onVacuum() {
    setVacuumHint(null)
    setCleanupError(null)
    setBusy(true)
    try {
      const res = await vacuumTursoCleanup()
      if (res.ok && res.ran) {
        setVacuumHint('Optimisation VACUUM exécutée.')
      } else {
        setVacuumHint(
          res.message
            ? `VACUUM non appliqué (normal sur certaines bases Turso) : ${res.message}`
            : 'VACUUM non disponible ou sans effet sur cette base.',
        )
      }
    } catch (e) {
      setCleanupError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardBody className="space-y-4">
            <div>
              <div className="text-xs font-semibold tracking-wide text-black/55">ADMIN — BASE TURSO</div>
              <h1 className="mt-1 text-xl font-bold text-black/90">Connexion base distante</h1>
              <p className="mt-2 text-sm leading-relaxed text-black/60">
                Sur l’hébergement (ex. Render), la base se configure avec les variables{' '}
                <span className="font-mono text-xs">TURSO_DATABASE_URL</span> et{' '}
                <span className="font-mono text-xs">TURSO_AUTH_TOKEN</span>. En développement local uniquement, tu
                peux enregistrer une URL <span className="font-mono text-xs">libsql://…</span> et un jeton (voir{' '}
                <a
                  className="text-rose-700 underline underline-offset-2"
                  href="https://docs.turso.tech/quickstart"
                  target="_blank"
                  rel="noreferrer"
                >
                  Turso
                </a>
                ) dans le fichier <span className="font-mono text-xs">server/.turso-local.json</span>.
              </p>
            </div>

            {status ? (
              <div className="rounded-xl border border-black/10 bg-black/[0.03] px-3 py-2 text-sm text-black/75">
                <div>
                  Mode :{' '}
                  <span className="font-semibold text-black/85">
                    {status.source === 'file'
                      ? 'Fichier SQLite sur la machine du serveur'
                      : status.source === 'env'
                        ? 'Variables TURSO_* sur le serveur'
                        : 'Fichier server/.turso-local.json'}
                  </span>
                </div>
                <div className="mt-1">
                  Cible : <span className="font-mono text-xs">{status.displayHost}</span>
                  {status.isTursoRemote ? (
                    <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                      Turso (libsql)
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-black/55">URL base (libsql://…)</label>
              <Input
                className="font-mono text-xs"
                value={databaseUrl}
                onChange={(e) => setDatabaseUrl(e.target.value)}
                placeholder="libsql://ton-db-xxx.turso.io"
                autoComplete="off"
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-black/55">Jeton Turso</label>
              <Input
                className="font-mono text-xs"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="Colle le token (ne le partage pas)"
                autoComplete="off"
                type="password"
                disabled={busy}
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">{error}</div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || !databaseUrl.trim().startsWith('libsql://') || authToken.trim().length < 12}
                onClick={() => void save()}
              >
                Enregistrer et utiliser Turso
              </Button>
              <Button variant="ghost" disabled={busy || status?.source !== 'local_file'} onClick={() => void removeLocalFile()}>
                Oublier la config locale Turso
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  localStorage.removeItem('adminToken')
                  clearAdminSessionRole()
                  notifyAdminAuthChanged()
                  nav('/admin', { replace: true })
                }}
              >
                Déconnexion
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-semibold tracking-wide text-black/55">NETTOYAGE</div>
                <h2 className="mt-1 text-lg font-bold text-black/90">Libérer de l’espace sur la base</h2>
                <p className="mt-2 max-w-prose text-sm leading-relaxed text-black/60">
                  Seuls les <strong>tournois déjà archivés</strong> peuvent être supprimés ici (équipes, matchs,
                  inscriptions inclus). Les tournois en cours restent gérés par l’admin principal.
                </p>
              </div>
              <Button variant="ghost" disabled={busy || cleanupLoading} onClick={() => void refreshArchived()}>
                Actualiser la liste
              </Button>
            </div>

            {cleanupError ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
                {cleanupError}
              </div>
            ) : null}
            {vacuumHint && !cleanupError ? (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-900">
                {vacuumHint}
              </div>
            ) : null}

            {cleanupLoading ? (
              <div className="text-sm text-black/55">Chargement…</div>
            ) : archived.length === 0 ? (
              <div className="text-sm text-black/55">Aucun tournoi archivé à supprimer.</div>
            ) : (
              <ul className="divide-y divide-black/10 rounded-xl border border-black/10">
                {archived.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="font-semibold text-black/90">{t.name}</div>
                      <div className="mt-0.5 font-mono text-xs text-black/50">{t.slug}</div>
                      <div className="mt-1 text-xs text-black/45">
                        {t.teams} équipe(s) · {t.matches} match(s) · {t.registrations} inscription(s)
                      </div>
                    </div>
                    <Button
                      variant="danger"
                      disabled={busy}
                      className="shrink-0"
                      onClick={() => void onDeleteArchivedRow(t)}
                    >
                      Supprimer
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="text-xs font-semibold tracking-wide text-amber-950/80">TOUS LES ARCHIVÉS</div>
              <p className="mt-2 text-sm text-amber-950/85">
                Pour supprimer <strong>tous</strong> les tournois archivés d’un coup, tape{' '}
                <span className="font-mono font-bold">ARCHIVÉS</span> puis confirme.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <Input
                  className="max-w-xs font-mono text-sm"
                  value={purgeConfirm}
                  onChange={(e) => setPurgeConfirm(e.target.value)}
                  placeholder="ARCHIVÉS"
                  autoComplete="off"
                  disabled={busy}
                  aria-label="Confirmation suppression massive"
                />
                <Button
                  variant="danger"
                  disabled={busy || purgeConfirm !== 'ARCHIVÉS' || archived.length === 0}
                  onClick={() => void onPurgeAllArchived()}
                >
                  Tout supprimer (archivés)
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-black/10 pt-4">
              <Button variant="ghost" disabled={busy} onClick={() => void onVacuum()}>
                Optimiser la base (VACUUM)
              </Button>
              <span className="text-xs text-black/45">
                Peut être ignoré par Turso ; utile surtout après beaucoup de suppressions.
              </span>
            </div>
          </CardBody>
        </Card>
      </div>
    </Layout>
  )
}
